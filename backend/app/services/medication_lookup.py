import csv
import html
import io
import logging
import re
import threading
import time
import unicodedata
from dataclasses import dataclass
from typing import Iterable, List
from urllib.parse import urljoin

import httpx

from app.config import settings


logger = logging.getLogger(__name__)


class MedicationLookupUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class CatalogProduct:
    active_ingredient: str
    product_name: str
    source_name: str
    source_url: str


_CACHE_TTL_SECONDS = 24 * 60 * 60
_veterinary_cache_lock = threading.Lock()
_veterinary_cache_expires_at = 0.0
_cached_veterinary_products: List[CatalogProduct] = []


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    without_accents = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", without_accents.lower()).split())


def _unique_labels(values: Iterable[str]) -> List[str]:
    labels = []
    seen = set()
    for value in values:
        label = value.strip()
        key = _normalize(label)
        if not key or key in seen:
            continue
        seen.add(key)
        labels.append(label)
    return labels


def _parse_aifa_products(payload: object) -> List[CatalogProduct]:
    if not isinstance(payload, dict):
        raise MedicationLookupUnavailable("AIFA ha restituito dati non leggibili")

    data = payload.get("data")
    content = data.get("content") if isinstance(data, dict) else None
    if not isinstance(content, list):
        raise MedicationLookupUnavailable("AIFA ha restituito dati non leggibili")

    products = []
    for item in content:
        if not isinstance(item, dict):
            continue
        medicine = item.get("medicinale")
        product_name = medicine.get("denominazioneMedicinale", "") if isinstance(medicine, dict) else ""
        ingredients = item.get("principiAttiviIt", [])
        if isinstance(ingredients, str):
            ingredients = [ingredients]
        if not isinstance(ingredients, list):
            ingredients = []

        ingredient_labels = _unique_labels(value for value in ingredients if isinstance(value, str))
        if not product_name or not ingredient_labels:
            continue
        products.append(
            CatalogProduct(
                active_ingredient=" / ".join(ingredient_labels),
                product_name=str(product_name).strip(),
                source_name="AIFA · uso umano",
                source_url=settings.aifa_source_url,
            )
        )
    return products


def _search_aifa(name: str) -> List[CatalogProduct]:
    headers = {"User-Agent": "MedTracker/1.0 (official medication lookup)"}
    try:
        response = httpx.get(
            settings.aifa_search_url,
            params={"query": name, "spellingCorrection": "true", "page": 0},
            timeout=15,
            follow_redirects=True,
            headers=headers,
        )
        response.raise_for_status()
        return _parse_aifa_products(response.json())
    except MedicationLookupUnavailable:
        raise
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise MedicationLookupUnavailable("Il servizio AIFA non è raggiungibile") from exc


def _find_veterinary_csv_url(page_html: str, page_url: str) -> str:
    hrefs = re.findall(r"href=[\"']([^\"']+)[\"']", page_html, flags=re.IGNORECASE)
    urls = []
    for href in hrefs:
        decoded = html.unescape(href)
        if re.search(r"FRM_VET_[^/?#]+\.csv(?:[?#].*)?$", decoded, flags=re.IGNORECASE):
            url = urljoin(page_url, decoded)
            if url not in urls:
                urls.append(url)
    if not urls:
        raise MedicationLookupUnavailable(
            "Il Ministero della Salute non espone attualmente l'archivio veterinario atteso"
        )
    return sorted(urls)[-1]


def _veterinary_active_ingredient(value: str) -> str:
    ingredients = []
    for raw_ingredient in value.split("|"):
        label = raw_ingredient.rsplit(" - ", 1)[0].strip()
        if label:
            ingredients.append(label)
    return " / ".join(_unique_labels(ingredients))


def _parse_veterinary_products(content: bytes) -> Iterable[CatalogProduct]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    for row in reader:
        product_name = (row.get("medicinale_veterinario") or "").strip()
        active_ingredient = _veterinary_active_ingredient(row.get("principio_attivo") or "")
        if not product_name or not active_ingredient:
            continue
        yield CatalogProduct(
            active_ingredient=active_ingredient,
            product_name=product_name,
            source_name="Ministero della Salute · veterinario",
            source_url=settings.veterinary_source_url,
        )


def _download_veterinary_products() -> List[CatalogProduct]:
    headers = {"User-Agent": "MedTracker/1.0 (official veterinary medication lookup)"}
    try:
        with httpx.Client(timeout=30, follow_redirects=True, headers=headers) as client:
            page_response = client.get(settings.veterinary_dataset_url)
            page_response.raise_for_status()
            csv_url = _find_veterinary_csv_url(page_response.text, str(page_response.url))
            csv_response = client.get(csv_url)
            csv_response.raise_for_status()
            products = list(_parse_veterinary_products(csv_response.content))
    except MedicationLookupUnavailable:
        raise
    except (httpx.HTTPError, UnicodeError, csv.Error) as exc:
        raise MedicationLookupUnavailable(
            "L'archivio veterinario del Ministero della Salute non è raggiungibile"
        ) from exc

    if not products:
        raise MedicationLookupUnavailable(
            "L'archivio veterinario del Ministero della Salute non contiene dati leggibili"
        )
    return products


def _get_veterinary_products() -> List[CatalogProduct]:
    global _cached_veterinary_products, _veterinary_cache_expires_at

    now = time.monotonic()
    if _cached_veterinary_products and now < _veterinary_cache_expires_at:
        return _cached_veterinary_products

    with _veterinary_cache_lock:
        now = time.monotonic()
        if _cached_veterinary_products and now < _veterinary_cache_expires_at:
            return _cached_veterinary_products
        _cached_veterinary_products = _download_veterinary_products()
        _veterinary_cache_expires_at = now + _CACHE_TTL_SECONDS
        return _cached_veterinary_products


def _rank_products(products: Iterable[CatalogProduct], query: str, limit: int) -> List[dict]:
    query_tokens = query.split()
    ranked = []
    for product in products:
        normalized_product = _normalize(product.product_name)
        if not all(token in normalized_product for token in query_tokens):
            continue

        if normalized_product == query:
            score = 0
        elif normalized_product.startswith(query):
            score = 1
        elif query in normalized_product:
            score = 2
        else:
            score = 3

        ranked.append((score, len(normalized_product), product))

    ranked.sort(key=lambda item: (item[0], item[1], item[2].product_name, item[2].source_name))
    results = []
    seen = set()
    for _, _, product in ranked:
        key = (_normalize(product.active_ingredient), _normalize(product.source_name))
        if key in seen:
            continue
        seen.add(key)
        results.append(
            {
                "active_ingredient": product.active_ingredient,
                "product_name": product.product_name,
                "source_name": product.source_name,
                "source_url": product.source_url,
            }
        )
        if len(results) >= limit:
            break
    return results


def lookup_active_ingredients(name: str, limit: int = 8) -> List[dict]:
    query = _normalize(name)
    if len(query) < 2:
        return []

    products: List[CatalogProduct] = []
    failures = []
    enabled_sources = 0

    if settings.aifa_lookup_enabled:
        enabled_sources += 1
        try:
            products.extend(_search_aifa(name))
        except MedicationLookupUnavailable as exc:
            failures.append(exc)
            logger.warning("AIFA medication lookup failed: %s", exc)

    if settings.veterinary_lookup_enabled:
        enabled_sources += 1
        try:
            products.extend(_get_veterinary_products())
        except MedicationLookupUnavailable as exc:
            failures.append(exc)
            logger.warning("Veterinary medication lookup failed: %s", exc)

    if not enabled_sources:
        raise MedicationLookupUnavailable("La ricerca negli archivi ufficiali è disabilitata")

    ranked = _rank_products(products, query, limit)
    if ranked:
        return ranked
    if failures:
        raise MedicationLookupUnavailable("Una o più fonti ufficiali non sono raggiungibili")
    return []

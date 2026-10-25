import csv
import html
import io
import re
import threading
import time
import unicodedata
from dataclasses import dataclass
from typing import Iterable, List
from urllib.parse import urljoin

import httpx

from app.config import settings


class AifaLookupUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class AifaProduct:
    active_ingredient: str
    product_name: str


_CACHE_TTL_SECONDS = 24 * 60 * 60
_cache_lock = threading.Lock()
_cache_expires_at = 0.0
_cached_products: List[AifaProduct] = []


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    without_accents = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", without_accents.lower()).split())


def _find_commercial_name_csv_urls(page_html: str, page_url: str) -> List[str]:
    hrefs = re.findall(r"href=[\"']([^\"']+)[\"']", page_html, flags=re.IGNORECASE)
    urls = []
    for href in hrefs:
        decoded = html.unescape(href)
        if re.search(
            r"Classe_[AH]_per_nome_commerciale_[^/?#]+\.csv(?:[?#].*)?$",
            decoded,
            flags=re.IGNORECASE,
        ):
            url = urljoin(page_url, decoded)
            if url not in urls:
                urls.append(url)
    return urls


def _decode_csv(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("cp1252")


def _parse_products(content: bytes) -> Iterable[AifaProduct]:
    reader = csv.DictReader(io.StringIO(_decode_csv(content)), delimiter=";")
    for raw_row in reader:
        row = {_normalize(key or ""): (value or "").strip() for key, value in raw_row.items()}
        active_ingredient = row.get("principio attivo", "")
        product_description = row.get("denominazione e confezione", "")
        if not active_ingredient or not product_description:
            continue
        commercial_name = product_description.split("*", 1)[0].strip()
        yield AifaProduct(
            active_ingredient=active_ingredient,
            product_name=commercial_name or product_description,
        )


def _download_products() -> List[AifaProduct]:
    headers = {"User-Agent": "MedTracker/1.0 (AIFA active ingredient lookup)"}
    try:
        with httpx.Client(timeout=15, follow_redirects=True, headers=headers) as client:
            page_response = client.get(settings.aifa_lists_url)
            page_response.raise_for_status()
            csv_urls = _find_commercial_name_csv_urls(
                page_response.text,
                str(page_response.url),
            )
            if not csv_urls:
                raise AifaLookupUnavailable("AIFA non espone attualmente gli elenchi CSV attesi")

            products: List[AifaProduct] = []
            for csv_url in csv_urls:
                csv_response = client.get(csv_url)
                csv_response.raise_for_status()
                products.extend(_parse_products(csv_response.content))
    except AifaLookupUnavailable:
        raise
    except (httpx.HTTPError, UnicodeError, csv.Error) as exc:
        raise AifaLookupUnavailable("Il servizio AIFA non è raggiungibile") from exc

    if not products:
        raise AifaLookupUnavailable("Gli elenchi AIFA non contengono dati leggibili")
    return products


def _get_products() -> List[AifaProduct]:
    global _cached_products, _cache_expires_at

    now = time.monotonic()
    if _cached_products and now < _cache_expires_at:
        return _cached_products

    with _cache_lock:
        now = time.monotonic()
        if _cached_products and now < _cache_expires_at:
            return _cached_products
        _cached_products = _download_products()
        _cache_expires_at = now + _CACHE_TTL_SECONDS
        return _cached_products


def lookup_active_ingredients(name: str, limit: int = 8) -> List[dict]:
    if not settings.aifa_lookup_enabled:
        raise AifaLookupUnavailable("La ricerca AIFA è disabilitata")

    query = _normalize(name)
    if len(query) < 2:
        return []
    query_tokens = query.split()

    ranked = []
    seen = set()
    for product in _get_products():
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

        key = (_normalize(product.active_ingredient), normalized_product)
        if key in seen:
            continue
        seen.add(key)
        ranked.append((score, len(normalized_product), product))

    ranked.sort(key=lambda item: (item[0], item[1], item[2].product_name))
    return [
        {
            "active_ingredient": product.active_ingredient,
            "product_name": product.product_name,
            "source_url": settings.aifa_lists_url,
        }
        for _, _, product in ranked[:limit]
    ]

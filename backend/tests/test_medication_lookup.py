import unittest
from unittest.mock import patch

from app.services.medication_lookup import (
    CatalogProduct,
    MedicationLookupUnavailable,
    _find_veterinary_csv_url,
    _parse_aifa_products,
    _parse_veterinary_products,
    _rank_products,
    lookup_active_ingredients,
)


AIFA_PRODUCT = CatalogProduct(
    active_ingredient="PARACETAMOLO",
    product_name="TACHIPIRINA",
    source_name="AIFA · uso umano",
    source_url="https://medicinali.aifa.gov.it/",
)
VETERINARY_PRODUCT = CatalogProduct(
    active_ingredient="pimobendan",
    product_name="VETMEDIN",
    source_name="Ministero della Salute · veterinario",
    source_url="https://www.dati.salute.gov.it/it/dataset/farmaci-veterinari/",
)


class MedicationLookupTests(unittest.TestCase):
    def test_parses_tachipirina_from_aifa_response(self):
        payload = {
            "data": {
                "content": [
                    {
                        "principiAttiviIt": ["PARACETAMOLO"],
                        "medicinale": {"denominazioneMedicinale": "TACHIPIRINA"},
                    }
                ]
            }
        }

        self.assertEqual(_parse_aifa_products(payload), [AIFA_PRODUCT])

    def test_finds_current_veterinary_csv(self):
        page = """
        <a href="/opendata/FRM_VET_2_90_20261022.json">JSON</a>
        <a href="/opendata/FRM_VET_2_90_20261023.csv">CSV</a>
        """

        self.assertEqual(
            _find_veterinary_csv_url(page, "https://www.dati.salute.gov.it/dataset"),
            "https://www.dati.salute.gov.it/opendata/FRM_VET_2_90_20261023.csv",
        )

    def test_parses_vetmedin_and_removes_dosage_from_ingredient(self):
        content = (
            "medicinale_veterinario;principio_attivo;descrizione_confezione\r\n"
            "VETMEDIN;pimobendan - 10 MILLIGRAMMO (I);100 compresse\r\n"
        ).encode("utf-8")

        self.assertEqual(list(_parse_veterinary_products(content)), [VETERINARY_PRODUCT])

    def test_ranks_exact_brand_and_removes_duplicate_ingredients(self):
        products = [
            CatalogProduct("PARACETAMOLO", "TACHIPIRINA OROSOLUBILE", "AIFA · uso umano", "aifa"),
            AIFA_PRODUCT,
            AIFA_PRODUCT,
        ]

        results = _rank_products(products, "tachipirina", 8)

        self.assertEqual(
            [item["product_name"] for item in results],
            ["TACHIPIRINA"],
        )

    @patch("app.services.medication_lookup.settings.veterinary_lookup_enabled", True)
    @patch("app.services.medication_lookup.settings.aifa_lookup_enabled", True)
    def test_lookup_covers_human_and_veterinary_products(self):
        def aifa_results(name):
            return [AIFA_PRODUCT] if name.lower() == "tachipirina" else []

        with (
            patch("app.services.medication_lookup._search_aifa", side_effect=aifa_results),
            patch("app.services.medication_lookup._get_veterinary_products", return_value=[VETERINARY_PRODUCT]),
        ):
            tachipirina = lookup_active_ingredients("Tachipirina")
            vetmedin = lookup_active_ingredients("Vetmedin")

        self.assertEqual(tachipirina[0]["active_ingredient"], "PARACETAMOLO")
        self.assertEqual(vetmedin[0]["active_ingredient"], "pimobendan")

    @patch("app.services.medication_lookup.settings.veterinary_lookup_enabled", True)
    @patch("app.services.medication_lookup.settings.aifa_lookup_enabled", True)
    def test_one_source_can_succeed_if_the_other_is_unavailable(self):
        with (
            patch(
                "app.services.medication_lookup._search_aifa",
                side_effect=MedicationLookupUnavailable("AIFA offline"),
            ),
            patch("app.services.medication_lookup._get_veterinary_products", return_value=[VETERINARY_PRODUCT]),
        ):
            results = lookup_active_ingredients("Vetmedin")

        self.assertEqual(results[0]["active_ingredient"], "pimobendan")

    @patch("app.services.medication_lookup.settings.veterinary_lookup_enabled", False)
    @patch("app.services.medication_lookup.settings.aifa_lookup_enabled", False)
    def test_lookup_reports_when_all_sources_are_disabled(self):
        with self.assertRaisesRegex(MedicationLookupUnavailable, "disabilitata"):
            lookup_active_ingredients("Tachipirina")


if __name__ == "__main__":
    unittest.main()

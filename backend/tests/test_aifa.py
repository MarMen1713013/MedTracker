import unittest
from unittest.mock import patch

from app.services.aifa import (
    AifaProduct,
    _find_commercial_name_csv_urls,
    _parse_products,
    lookup_active_ingredients,
)


class AifaLookupTests(unittest.TestCase):
    def test_finds_current_a_and_h_commercial_name_lists(self):
        page = """
        <a href="/files/Classe_A_per_nome_commerciale_31-05-2026.csv">A</a>
        <a href="https://example.test/Classe_H_per_nome_commerciale_31-05-2026.csv">H</a>
        <a href="/files/Classe_A_per_principio_attivo_31-05-2026.csv">ignored</a>
        """

        self.assertEqual(
            _find_commercial_name_csv_urls(page, "https://example.test/lists"),
            [
                "https://example.test/files/Classe_A_per_nome_commerciale_31-05-2026.csv",
                "https://example.test/Classe_H_per_nome_commerciale_31-05-2026.csv",
            ],
        )

    def test_parses_cp1252_aifa_csv(self):
        content = (
            "Principio attivo;Denominazione e Confezione;Prezzo €\r\n"
            "Paracetamolo;TACHIPIRINA*20 compresse 500 mg;5,00\r\n"
        ).encode("cp1252")

        self.assertEqual(
            list(_parse_products(content)),
            [AifaProduct(active_ingredient="Paracetamolo", product_name="TACHIPIRINA")],
        )

    @patch("app.services.aifa._get_products")
    @patch("app.services.aifa.settings.aifa_lookup_enabled", True)
    def test_lookup_ranks_exact_brand_and_removes_duplicates(self, get_products):
        get_products.return_value = [
            AifaProduct("Paracetamolo", "TACHIPIRINA OROSOLUBILE"),
            AifaProduct("Paracetamolo", "TACHIPIRINA"),
            AifaProduct("Paracetamolo", "TACHIPIRINA"),
        ]

        results = lookup_active_ingredients("tachipirina")

        self.assertEqual([item["product_name"] for item in results], ["TACHIPIRINA", "TACHIPIRINA OROSOLUBILE"])


if __name__ == "__main__":
    unittest.main()

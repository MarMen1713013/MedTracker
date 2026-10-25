import unittest

from pydantic import ValidationError

from app.schemas import MedicationCreate


class MedicationSchemaTests(unittest.TestCase):
    def test_accepts_textual_dosage(self):
        medication = MedicationCreate(
            name="Tachipirina",
            dosage="1000 mg",
            unit="compresse",
        )

        self.assertEqual(medication.dosage, "1000 mg")

    def test_rejects_dosage_longer_than_database_column(self):
        with self.assertRaises(ValidationError):
            MedicationCreate(
                name="Tachipirina",
                dosage="x" * 101,
                unit="compresse",
            )


if __name__ == "__main__":
    unittest.main()

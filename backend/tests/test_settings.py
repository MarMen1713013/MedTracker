import unittest

from fastapi import HTTPException

from app.routers.settings import _validate_setting_value


class SettingValidationTests(unittest.TestCase):
    def test_normalizes_valid_retention(self):
        self.assertEqual(_validate_setting_value("backup_retention_days", "030"), "30")

    def test_rejects_invalid_retention(self):
        with self.assertRaises(HTTPException):
            _validate_setting_value("backup_retention_days", "-1")
        with self.assertRaises(HTTPException):
            _validate_setting_value("backup_retention_days", "forever")


if __name__ == "__main__":
    unittest.main()

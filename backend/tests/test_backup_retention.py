import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from app.routers import backup


class BackupRetentionTests(unittest.TestCase):
    def setUp(self):
        self.original_backup_dir = backup.BACKUP_DIR
        self.temp_dir = tempfile.TemporaryDirectory()
        backup.BACKUP_DIR = Path(self.temp_dir.name)

    def tearDown(self):
        backup.BACKUP_DIR = self.original_backup_dir
        self.temp_dir.cleanup()

    def _create(self, filename: str):
        (backup.BACKUP_DIR / filename).write_bytes(b"backup")

    def test_deletes_expired_files_and_preserves_recent_one(self):
        self._create("medtracker_20260101_020000.sql.gz")
        self._create("medtracker_20261020_020000.sql.gz")

        deleted = backup.prune_expired_backups(
            30,
            now=datetime(2026, 10, 25, 3, tzinfo=ZoneInfo("Europe/Rome")),
        )

        self.assertEqual(deleted, ["medtracker_20260101_020000.sql.gz"])
        self.assertTrue((backup.BACKUP_DIR / "medtracker_20261020_020000.sql.gz").exists())

    def test_always_preserves_newest_backup(self):
        self._create("medtracker_20250101_020000.sql.gz")

        deleted = backup.prune_expired_backups(
            1,
            now=datetime(2026, 10, 25, 3, tzinfo=ZoneInfo("Europe/Rome")),
        )

        self.assertEqual(deleted, [])
        self.assertTrue((backup.BACKUP_DIR / "medtracker_20250101_020000.sql.gz").exists())

    def test_zero_disables_retention(self):
        self._create("medtracker_20250101_020000.sql.gz")

        self.assertEqual(backup.prune_expired_backups(0), [])

    def test_legacy_medication_copy_is_kept_for_restore(self):
        legacy_dump = """\
SET client_encoding = 'UTF8';
COPY public.medications (id, name, unit, notification_threshold_days, notes, created_at) FROM stdin;
1\tFarmaco legacy\tcompresse\t10\t\\N\t2025-01-01 00:00:00
\\.
COPY public.users (id, username) FROM stdin;
1\tignored
\\.
"""

        sanitized = backup._sanitize_restore_sql(legacy_dump).decode()

        self.assertIn(
            "COPY public.medications (id, name, unit, notification_threshold_days, notes, created_at) FROM stdin;",
            sanitized,
        )
        self.assertIn("Farmaco legacy", sanitized)
        self.assertNotIn("COPY public.users", sanitized)

    def test_medication_copy_with_dosage_is_kept_for_restore(self):
        current_dump = """\
COPY public.medications (id, name, unit, notification_threshold_days, notes, created_at, active_ingredient, dosage) FROM stdin;
1\tTachipirina\tcompresse\t10\t\\N\t2026-10-25 00:00:00\tParacetamolo\t1000 mg
\\.
"""

        sanitized = backup._sanitize_restore_sql(current_dump).decode()

        self.assertIn("active_ingredient, dosage", sanitized)
        self.assertIn("Paracetamolo\t1000 mg", sanitized)


if __name__ == "__main__":
    unittest.main()

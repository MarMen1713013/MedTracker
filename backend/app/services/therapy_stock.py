import logging
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal
from app.services.calculator import therapy_applies_on_date, therapy_daily_dose

logger = logging.getLogger(__name__)

AUTO_USAGE_NOTE_PREFIX = "uso per terapia del "


def therapy_usage_note(target_date: date) -> str:
    return f"{AUTO_USAGE_NOTE_PREFIX}{target_date.strftime('%Y%m%d')}"


def record_therapy_usage_for_date(target_date: date, db: Session) -> int:
    created_entries = 0
    note = therapy_usage_note(target_date)
    entry_created_at = datetime.combine(target_date + timedelta(days=1), time.min)

    medications = db.query(models.Medication).all()
    for medication in medications:
        daily_total = Decimal("0")

        for therapy in medication.therapies:
            if therapy_applies_on_date(therapy, target_date):
                daily_total += therapy_daily_dose(therapy)

        if daily_total <= 0:
            continue

        existing = (
            db.query(models.StockEntry)
            .filter(
                models.StockEntry.medication_id == medication.id,
                models.StockEntry.notes == note,
            )
            .first()
        )
        if existing:
            continue

        db.add(
            models.StockEntry(
                medication_id=medication.id,
                quantity=-daily_total,
                notes=note,
                created_at=entry_created_at,
            )
        )
        created_entries += 1

    if created_entries:
        db.commit()

    return created_entries


def backfill_therapy_usage_entries(up_to_date: date | None = None) -> int:
    target_end_date = up_to_date or (date.today() - timedelta(days=1))
    db = SessionLocal()

    try:
        therapies = (
            db.query(models.Therapy)
            .filter(models.Therapy.is_active.is_(True))
            .order_by(models.Therapy.start_date.asc())
            .all()
        )
        if not therapies:
            return 0

        start_date = min(therapy.start_date for therapy in therapies)
        if start_date > target_end_date:
            return 0

        created_entries = 0
        current_date = start_date
        while current_date <= target_end_date:
            created_entries += record_therapy_usage_for_date(current_date, db)
            current_date += timedelta(days=1)

        if created_entries:
            logger.info(
                "Backfilled %s therapy stock entries through %s",
                created_entries,
                target_end_date.isoformat(),
            )
        return created_entries
    except Exception as exc:
        db.rollback()
        logger.error("Error while backfilling therapy stock entries: %s", exc)
        return 0
    finally:
        db.close()


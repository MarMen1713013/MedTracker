from datetime import date
from decimal import Decimal
from typing import Optional
from app import models, schemas


def therapy_applies_on_date(therapy: models.Therapy, target_date: date) -> bool:
    if not therapy.is_active:
        return False
    if therapy.start_date > target_date:
        return False
    if therapy.end_date is not None and therapy.end_date < target_date:
        return False
    return True


def therapy_daily_dose(therapy: models.Therapy) -> Decimal:
    return Decimal(str(therapy.dose_per_intake)) * therapy.intakes_per_day


def compute_stock_level(medication: models.Medication) -> schemas.StockLevel:
    today = date.today()

    remaining = sum(
        Decimal(str(entry.quantity)) for entry in medication.stock_entries
    )

    daily_dose = Decimal("0")
    active_therapy_count = 0

    for therapy in medication.therapies:
        if therapy_applies_on_date(therapy, today):
            daily_dose += therapy_daily_dose(therapy)
            active_therapy_count += 1

    days_remaining: Optional[Decimal] = None
    if daily_dose > 0:
        days_remaining = remaining / daily_dose

    return schemas.StockLevel(
        medication=medication,
        remaining_quantity=remaining,
        days_remaining=days_remaining,
        daily_dose=daily_dose,
        therapies_active=active_therapy_count,
    )

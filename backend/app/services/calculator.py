from datetime import date
from decimal import Decimal
from typing import Optional
from app import models, schemas


def compute_stock_level(medication: models.Medication) -> schemas.StockLevel:
    today = date.today()

    total_added = sum(
        Decimal(str(entry.quantity)) for entry in medication.stock_entries
    )

    consumed_to_date = Decimal("0")
    daily_dose = Decimal("0")
    active_therapy_count = 0

    for therapy in medication.therapies:
        dose = Decimal(str(therapy.dose_per_intake))
        intakes = therapy.intakes_per_day
        daily = dose * intakes

        # Determine if therapy is currently active (started, not ended, is_active flag)
        therapy_started = therapy.start_date <= today
        therapy_ended = therapy.end_date is not None and therapy.end_date < today

        if therapy.is_active and therapy_started and not therapy_ended:
            daily_dose += daily
            active_therapy_count += 1

        # Consumption: only count when is_active=True
        if not therapy.is_active:
            continue

        # active_days = days between max(start_date, today_if_future_else_start_date)
        # and min(today, end_date if set)
        count_from = max(therapy.start_date, therapy.start_date)  # start_date (future therapies contribute 0)
        if therapy.start_date > today:
            # Therapy hasn't started yet — contributes nothing to consumed
            continue

        count_from = therapy.start_date
        count_to = min(today, therapy.end_date) if therapy.end_date else today

        active_days = max(0, (count_to - count_from).days)
        consumed_to_date += daily * active_days

    remaining = total_added - consumed_to_date

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

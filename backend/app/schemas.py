from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from decimal import Decimal


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=6)


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class LoginRequest(BaseModel):
    username: str
    password: str


# ── Medications ───────────────────────────────────────────────────────────────

class MedicationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    active_ingredient: Optional[str] = Field(None, max_length=500)
    dosage: Optional[str] = Field(None, max_length=100)
    unit: str = Field(..., min_length=1, max_length=50)
    notification_threshold_days: int = Field(default=10, ge=1)
    notes: Optional[str] = None


class MedicationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    active_ingredient: Optional[str] = Field(None, max_length=500)
    dosage: Optional[str] = Field(None, max_length=100)
    unit: Optional[str] = Field(None, min_length=1, max_length=50)
    notification_threshold_days: Optional[int] = Field(None, ge=1)
    notes: Optional[str] = None


class MedicationOut(BaseModel):
    id: int
    name: str
    active_ingredient: Optional[str]
    dosage: Optional[str]
    unit: str
    notification_threshold_days: int
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Therapies ─────────────────────────────────────────────────────────────────

class TherapyCreate(BaseModel):
    medication_id: int
    dose_per_intake: Decimal = Field(..., gt=0)
    intakes_per_day: int = Field(..., ge=1)
    start_date: date = Field(default_factory=date.today)
    end_date: Optional[date] = None
    is_active: bool = True
    notes: Optional[str] = None


class TherapyUpdate(BaseModel):
    dose_per_intake: Optional[Decimal] = Field(None, gt=0)
    intakes_per_day: Optional[int] = Field(None, ge=1)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class TherapyOut(BaseModel):
    id: int
    medication_id: int
    user_id: Optional[int]
    dose_per_intake: Decimal
    intakes_per_day: int
    start_date: date
    end_date: Optional[date]
    is_active: bool
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Stock ─────────────────────────────────────────────────────────────────────

class StockEntryCreate(BaseModel):
    medication_id: int
    quantity: Decimal = Field(..., ne=0)
    notes: Optional[str] = None


class StockEntryUpdate(BaseModel):
    quantity: Optional[Decimal] = Field(None)
    notes: Optional[str] = None


class StockEntryOut(BaseModel):
    id: int
    medication_id: int
    quantity: Decimal
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class StockLevel(BaseModel):
    medication: MedicationOut
    remaining_quantity: Decimal
    days_remaining: Optional[Decimal]
    daily_dose: Decimal
    therapies_active: int


# ── Settings ──────────────────────────────────────────────────────────────────

class SettingUpdate(BaseModel):
    value: Optional[str] = None


class SettingOut(BaseModel):
    key: str
    value: Optional[str]

    class Config:
        from_attributes = True


# ── Backup ────────────────────────────────────────────────────────────────────

class BackupFile(BaseModel):
    filename: str
    size_bytes: int
    created_at: datetime


class ActiveIngredientSuggestion(BaseModel):
    active_ingredient: str
    product_name: str
    source_name: str
    source_url: str

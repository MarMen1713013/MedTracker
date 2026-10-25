from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    database_url: str = "postgresql://medtracker:changeme@localhost:5432/medtracker"
    secret_key: str = "changeme-use-a-long-random-string"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    tz: str = "Europe/Rome"

    ntfy_url: Optional[str] = None
    ntfy_topic: str = "medtracker"
    ntfy_token: Optional[str] = None

    backup_cron_hour: int = 2
    backup_retention_days: int = 30
    notification_hour: int = 8

    aifa_lookup_enabled: bool = True
    aifa_search_url: str = "https://api.aifa.gov.it/aifa-bdf-eif-be/1.0.0/formadosaggio/ricerca"
    aifa_source_url: str = "https://medicinali.aifa.gov.it/"
    veterinary_lookup_enabled: bool = True
    veterinary_dataset_url: str = "https://www.dati.salute.gov.it/it/dataset/farmaci-veterinari/"
    veterinary_source_url: str = "https://www.dati.salute.gov.it/it/dataset/farmaci-veterinari/"

    postgres_db: str = "medtracker"
    postgres_user: str = "medtracker"
    postgres_password: str = "changeme"
    postgres_host: str = "db"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

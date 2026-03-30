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
    notification_hour: int = 8

    postgres_db: str = "medtracker"
    postgres_user: str = "medtracker"
    postgres_password: str = "changeme"
    postgres_host: str = "db"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

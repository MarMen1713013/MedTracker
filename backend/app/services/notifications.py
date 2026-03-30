import logging
from typing import Optional
from decimal import Decimal
import httpx
from sqlalchemy.orm import Session
from app.config import settings
from app.database import SessionLocal
from app import models
from app.services.calculator import compute_stock_level

logger = logging.getLogger(__name__)


def _get_ntfy_url(db: Session) -> Optional[str]:
    setting = db.query(models.Setting).filter(models.Setting.key == "ntfy_url").first()
    if setting and setting.value:
        return setting.value
    return settings.ntfy_url


def _get_ntfy_topic(db: Session) -> str:
    setting = db.query(models.Setting).filter(models.Setting.key == "ntfy_topic").first()
    if setting and setting.value:
        return setting.value
    return settings.ntfy_topic


def send_ntfy_notification(topic: str, title: str, message: str, ntfy_base_url: str) -> bool:
    url = f"{ntfy_base_url.rstrip('/')}/{topic}"
    headers = {"Title": title}
    if settings.ntfy_token:
        headers["Authorization"] = f"Bearer {settings.ntfy_token}"
    try:
        response = httpx.post(url, content=message.encode(), headers=headers, timeout=10)
        return response.status_code < 300
    except Exception as e:
        logger.error(f"Failed to send ntfy notification: {e}")
        return False


def check_and_notify():
    db = SessionLocal()
    try:
        ntfy_url = _get_ntfy_url(db)
        if not ntfy_url:
            logger.info("ntfy URL not configured, skipping notifications")
            return

        ntfy_topic = _get_ntfy_topic(db)
        medications = db.query(models.Medication).all()

        for med in medications:
            level = compute_stock_level(med)

            if level.days_remaining is None:
                continue  # No active therapy

            days = float(level.days_remaining)
            threshold = med.notification_threshold_days

            if days > threshold:
                continue  # Plenty of stock

            title = f"MedTracker: {med.name}"

            if days <= 0:
                elapsed = abs(int(days))
                if elapsed == 0:
                    message = f"Finisce oggi ({med.name})"
                else:
                    message = f"Finito da {elapsed} giorni ({med.name})"
            elif days <= 1:
                message = f"Finisce oggi — meno di 1 giorno rimasto ({med.name})"
            else:
                message = f"Scorte per {int(days)} giorni ({med.name})"

            sent = send_ntfy_notification(ntfy_topic, title, message, ntfy_url)
            if sent:
                logger.info(f"Notification sent for {med.name}: {message}")
            else:
                logger.warning(f"Failed to send notification for {med.name}")
    except Exception as e:
        logger.error(f"Error in check_and_notify: {e}")
    finally:
        db.close()

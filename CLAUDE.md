# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

MedTracker is a self-hosted web app for tracking medication stock levels. It calculates remaining supply automatically from therapy definitions (dose + frequency) and stock additions, and sends low-stock alerts via ntfy. Users share all data; authentication exists only to gate access.

## Running the project

```bash
cp .env.example .env       # fill in SECRET_KEY and POSTGRES_PASSWORD at minimum
docker compose up --build  # first run
docker compose up -d       # subsequent runs
```

Frontend: `http://localhost` | API docs: `http://localhost:8000/docs`

Alembic migrations run automatically on backend startup.

## Development without Docker

**Backend:**
```bash
cd backend
pip install -r requirements.txt
# Set DATABASE_URL env var pointing to a local Postgres instance
alembic upgrade head
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev        # dev server on :5173 with Vite proxy to backend
npm run build      # production build
npm run lint
```

## Architecture

```
docker-compose.yml
├── db          → PostgreSQL 16
├── backend     → FastAPI (uvicorn), port 8000
├── frontend    → nginx serving React build, port 80, proxies /api/* to backend
└── ntfy        → push notification server
```

### Stock calculation (core logic)

`backend/app/services/calculator.py` — the single source of truth for stock math:

- **`remaining`** = `sum(stock_entries.quantity)` − `consumed_to_date`
- **`consumed_to_date`** = for each active therapy: `dose_per_intake × intakes_per_day × active_days`
- **`active_days`** = `max(0, min(today, end_date ?? today) − max(start_date, today_if_future))`
- **`days_remaining`** = `remaining / daily_dose` (null if no active therapy)

A therapy contributes to consumption only when `is_active=True`, its `start_date` has passed, and it hasn't reached its `end_date`.

### Backend layout

```
backend/app/
├── main.py          # startup: runs migrations, starts APScheduler (notifications + backup cron)
├── config.py        # pydantic-settings; reads from .env
├── models.py        # SQLAlchemy ORM: User, Medication, Therapy, StockEntry, Setting
├── schemas.py       # Pydantic v2 request/response schemas
├── auth.py          # JWT creation/validation, bcrypt, get_current_user dependency
├── routers/
│   ├── auth.py      # POST /login, /register, GET /me
│   ├── medications.py
│   ├── therapies.py # includes POST /{id}/activate and /{id}/deactivate
│   ├── stock.py     # GET /levels (calls calculator), POST /entries
│   ├── backup.py    # pg_dump/restore via subprocess; files in /backups volume
│   └── settings.py  # key-value config (ntfy URL, notification hour, etc.)
└── services/
    ├── calculator.py
    └── notifications.py  # reads ntfy config from DB settings, sends Italian-language alerts
```

All routes require a valid JWT except `POST /api/auth/login` and `POST /api/auth/register`. The first registered user gets the admin flag.

### Frontend layout

```
frontend/src/
├── api/client.ts        # axios instance; all typed API calls; auto-logout on 401
├── components/
│   ├── DoseInput.tsx    # integer spinner + fraction select (¼ ⅓ ½ ⅔ ¾) → decimal
│   ├── MedicationCard.tsx  # color-coded by urgency: red/amber/green
│   └── Layout.tsx       # sidebar navigation
└── pages/
    ├── Dashboard.tsx        # sorted by urgency (least days remaining first)
    ├── Medications.tsx
    ├── MedicationDetail.tsx # therapies + stock history for one medication
    ├── Backup.tsx           # create / list / restore / delete backups
    └── Settings.tsx         # ntfy URL/topic, notification hour
```

shadcn/ui components live in `frontend/src/components/ui/`.

### Dose fractions

`DoseInput` converts between user-friendly input (whole + fraction) and the decimal stored in the DB. Supported fractions: ¼ (0.25), ⅓ (0.333…), ½ (0.5), ⅔ (0.666…), ¾ (0.75). When reconstructing from a stored decimal, it snaps to the closest fraction.

### Notifications

Daily cron (default 8:00, configurable via Settings page or `NOTIFICATION_HOUR` env var) calls `services/notifications.py`. For each medication: if `days_remaining ≤ threshold`, sends an ntfy push with Italian-language message. ntfy URL and topic are stored in the `settings` table and can be overridden by `NTFY_URL` / `NTFY_TOPIC` env vars.

### Backups

- Stored in `/backups/` (Docker volume `medtracker_backups`)
- Filename: `medtracker_YYYYMMDD_HHMMSS.sql.gz`
- Daily cron runs at 2:00 by default (hardcoded; not exposed in `.env`)
- API: `POST /api/backup/create`, `GET /api/backup/list`, `POST /api/backup/restore/{filename}`, `DELETE /api/backup/{filename}`

## Environment variables

See `.env.example`. Required: `POSTGRES_PASSWORD`, `SECRET_KEY`. The `DATABASE_URL` is assembled inside `docker-compose.yml` from the individual `POSTGRES_*` vars.

#!/bin/bash
set -e

DOCKER_USER="${1:-tuousername}"
IMAGE_NAME="medtracker"
TAG="${2:-latest}"
FULL_IMAGE="${DOCKER_USER}/${IMAGE_NAME}:${TAG}"

echo "==> Build immagine: ${FULL_IMAGE}"
docker build -t "${FULL_IMAGE}" .

echo "==> Login su Docker Hub"
docker login

echo "==> Push: ${FULL_IMAGE}"
docker push "${FULL_IMAGE}"

echo "==> Generazione docker-compose.release.yml"
cat > docker-compose.release.yml <<EOF
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-medtracker}
      POSTGRES_USER: \${POSTGRES_USER:-medtracker}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-changeme}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-medtracker} -d \${POSTGRES_DB:-medtracker}"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    image: ${FULL_IMAGE}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://\${POSTGRES_USER:-medtracker}:\${POSTGRES_PASSWORD:-changeme}@db:5432/\${POSTGRES_DB:-medtracker}
      SECRET_KEY: \${SECRET_KEY:-changeme-use-a-long-random-string}
      NTFY_URL: \${NTFY_URL:-}
      NTFY_TOPIC: \${NTFY_TOPIC:-medtracker}
      NTFY_TOKEN: \${NTFY_TOKEN:-}
      NOTIFICATION_HOUR: \${NOTIFICATION_HOUR:-8}
      POSTGRES_DB: \${POSTGRES_DB:-medtracker}
      POSTGRES_USER: \${POSTGRES_USER:-medtracker}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-changeme}
      POSTGRES_HOST: db
    volumes:
      - backups:/backups
    ports:
      - "8000:8000"

volumes:
  postgres_data:
  backups:
EOF

echo ""
echo "Fatto. Per distribuire, gli utenti scaricano:"
echo "  - docker-compose.release.yml"
echo "  - .env.example (rinominato in .env e compilato)"
echo "Poi lanciano: docker compose -f docker-compose.release.yml up -d"

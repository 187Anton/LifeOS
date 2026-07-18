#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

bash "$SCRIPT_DIR/check-local-environment.sh"
cd "$REPOSITORY_ROOT"

CONTAINER_ID="$(docker compose ps -q db)"
if [[ -z "$CONTAINER_ID" ]]; then
  printf "Fehler: Die LifeOS-Datenbank läuft nicht. Starte sie mit 'npm run db:start'.\n" >&2
  exit 1
fi

HEALTH_STATUS="$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_ID" 2>/dev/null || true)"
if [[ "$HEALTH_STATUS" != "healthy" ]]; then
  printf "Fehler: Die LifeOS-Datenbank ist nicht bereit (Status: %s). Prüfe 'docker compose logs db'.\n" "${HEALTH_STATUS:-unbekannt}" >&2
  exit 1
fi

if ! docker compose exec -T db sh -ec \
  'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null && psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" >/dev/null'; then
  printf "Fehler: PostgreSQL ist als Container gesund, aber die SQL-Verbindungsprüfung ist fehlgeschlagen. Prüfe Benutzer, Passwort und Datenbankname in .env.\n" >&2
  exit 1
fi

printf 'PostgreSQL ist gesund und eine SQL-Verbindung ist möglich.\n'

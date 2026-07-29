#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
suffix="$(date -u +%s)_$$"
source_database="lifeos_verify_${suffix}"
restored_database="lifeos_restore_${suffix}"
backup_file="$REPOSITORY_ROOT/backups/foundation-verification-${suffix}.dump"

cd "$REPOSITORY_ROOT"
bash "$SCRIPT_DIR/check-database.sh"

drop_verification_database() {
  local database_name="$1"
  docker compose exec -T db sh -ec \
    'dropdb --if-exists --force -U "$POSTGRES_USER" "$1"' \
    lifeos-cleanup "$database_name" >/dev/null 2>&1 || true
}

cleanup() {
  drop_verification_database "$source_database"
  drop_verification_database "$restored_database"
  rm -f "$backup_file" "${backup_file}.sha256"
}
trap cleanup EXIT

base_database_url="${DATABASE_URL:-}"
if [[ -z "$base_database_url" ]]; then
  base_database_url="$(node --input-type=module -e '
    import { config } from "dotenv";
    config({ path: ".env", quiet: true });
    process.stdout.write(process.env.DATABASE_URL ?? "");
  ')"
fi
if [[ -z "$base_database_url" ]]; then
  printf 'Fehler: DATABASE_URL fehlt in der Umgebung und in .env.\n' >&2
  exit 1
fi

database_url_for() {
  BASE_DATABASE_URL="$base_database_url" TARGET_DATABASE_NAME="$1" \
    node --input-type=module -e '
      const url = new URL(process.env.BASE_DATABASE_URL);
      url.pathname = `/${process.env.TARGET_DATABASE_NAME}`;
      process.stdout.write(url.toString());
    '
}

create_verification_database() {
  local database_name="$1"
  docker compose exec -T db sh -ec \
    'createdb -U "$POSTGRES_USER" "$1"' \
    lifeos-create "$database_name"
}

snapshot() {
  local database_name="$1"
  local query
  query="$(cat <<'SQL'
SELECT value
FROM (
  SELECT 1 AS ordinal, 'user|' || "externalId" || '|' || "displayName" AS value FROM "User"
  UNION ALL
  SELECT 2, 'settings|' || timezone || '|' || "currencyCode" || '|' || locale || '|' || "weekStartsOn"::text FROM "UserSettings"
  UNION ALL
  SELECT 3, 'credential|' || revision::text || '|' || length("passwordHash")::text FROM "UserCredential"
  UNION ALL
  SELECT 4, 'caldav|' || username || '|' || revision::text || '|' || length("passwordHash")::text FROM "CalDavCredential"
  UNION ALL
  SELECT 5, 'calendar|' || "externalId" || '|' || name || '|' || timezone || '|' || "isPrimary"::text || '|' || "syncToken"::text FROM "Calendar"
  UNION ALL
  SELECT 6, 'event|' || uid || '|' || title || '|' || timezone || '|' || "isAllDay"::text || '|' || coalesce("startsAt"::text, '') || '|' || coalesce("startDate"::text, '') || '|' || coalesce("recurrenceRule", '') || '|' || "reminderMinutes"::text || '|' || etag || '|' || sequence::text || '|' || "syncVersion"::text FROM "CalendarEvent"
  UNION ALL
  SELECT 7, 'audit-count|' || count(*)::text FROM "AuditEvent"
) AS stable_values
ORDER BY ordinal, value;
SQL
)"
  docker compose exec -T db sh -ec \
    'psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$1" -c "$2"' \
    lifeos-snapshot "$database_name" "$query"
}

create_verification_database "$source_database"
source_database_url="$(database_url_for "$source_database")"

DATABASE_URL="$source_database_url" npm run db:migrate
DATABASE_URL="$source_database_url" npm run db:seed
DATABASE_URL="$source_database_url" \
  LIFEOS_BOOTSTRAP_PASSWORD="foundation-verification-only-password" \
  npm run auth:bootstrap
DATABASE_URL="$source_database_url" \
  LIFEOS_CALDAV_PASSWORD="foundation-verification-only-caldav-password" \
  npm run caldav:bootstrap

snapshot_before="$(snapshot "$source_database")"
DATABASE_URL="$source_database_url" npm run db:migrate
DATABASE_URL="$source_database_url" npm run db:seed
snapshot_after="$(snapshot "$source_database")"
if [[ "$snapshot_before" != "$snapshot_after" ]]; then
  printf 'Fehler: Migration oder Seed hat bestehende synthetische Daten verändert.\n' >&2
  exit 1
fi

mkdir -p "$(dirname "$backup_file")"
docker compose exec -T db sh -ec \
  'pg_dump -U "$POSTGRES_USER" -d "$1" --format=custom --no-owner --no-acl' \
  lifeos-dump "$source_database" >"$backup_file"
if [[ ! -s "$backup_file" ]]; then
  printf 'Fehler: Das synthetische Verifikationsbackup ist leer.\n' >&2
  exit 1
fi
BACKUP_FILE="$backup_file" node --input-type=module -e '
  import { createHash } from "node:crypto";
  import { basename } from "node:path";
  import { readFileSync, writeFileSync } from "node:fs";
  const file = process.env.BACKUP_FILE;
  const checksum = createHash("sha256").update(readFileSync(file)).digest("hex");
  writeFileSync(`${file}.sha256`, `${checksum}  ${basename(file)}\n`, { mode: 0o600 });
'
docker compose exec -T db pg_restore --list <"$backup_file" >/dev/null

DATABASE_URL="$base_database_url" \
  bash "$SCRIPT_DIR/restore-database.sh" "$backup_file" "$restored_database"
snapshot_restored="$(snapshot "$restored_database")"
if [[ "$snapshot_before" != "$snapshot_restored" ]]; then
  printf 'Fehler: Das wiederhergestellte Datenbankabbild weicht von der Quelle ab.\n' >&2
  exit 1
fi

printf 'Leere Migration, bestehende Seed-Daten sowie Backup und Restore wurden erfolgreich geprüft.\n'

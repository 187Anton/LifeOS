#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
suffix="$(date -u +%s)_$$"
source_database="lifeos_verify_${suffix}"
restored_database="lifeos_restore_${suffix}"
missing_checksum_database="lifeos_restore_missing_${suffix}"
tampered_database="lifeos_restore_tampered_${suffix}"
corrupt_database="lifeos_restore_corrupt_${suffix}"
backup_file="$REPOSITORY_ROOT/backups/foundation-verification-${suffix}.dump"
missing_checksum_file="${backup_file}.missing-checksum"
tampered_file="${backup_file}.tampered"
corrupt_file="${backup_file}.corrupt"
symlink_target="${backup_file}.symlink-target"
symlink_backup="${backup_file}.symlink-backup"
symlink_checksum_backup="${backup_file}.symlink-checksum"

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
  drop_verification_database "$missing_checksum_database"
  drop_verification_database "$tampered_database"
  drop_verification_database "$corrupt_database"
  rm -f "$backup_file" "${backup_file}.sha256" \
    "$missing_checksum_file" "${missing_checksum_file}.sha256" \
    "$tampered_file" "${tampered_file}.sha256" \
    "$corrupt_file" "${corrupt_file}.sha256" \
    "$symlink_target" "$symlink_backup" "$symlink_checksum_backup" \
    "${symlink_checksum_backup}.sha256"
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
  SELECT 7, 'project|' || id::text || '|' || "userId"::text || '|' || title || '|' || coalesce("archivedAt"::text, '') FROM "Project"
  UNION ALL
  SELECT 8, 'task|' || id::text || '|' || "userId"::text || '|' || title || '|' || status::text || '|' || priority::text || '|' || coalesce("dueDate"::text, '') || '|' || coalesce("scheduledStartAt"::text, '') || '|' || coalesce("scheduledStartTimezone", '') || '|' || coalesce("estimatedDurationMinutes"::text, '') || '|' || tags::text || '|' || area::text || '|' || coalesce("projectId"::text, '') || '|' || coalesce("parentTaskId"::text, '') || '|' || coalesce("completedAt"::text, '') || '|' || coalesce("archivedAt"::text, '') || '|' || coalesce("deletedAt"::text, '') FROM "Task"
  UNION ALL
  SELECT 9, 'task-event-link|' || id::text || '|' || "userId"::text || '|' || "taskId"::text || '|' || "calendarEventId"::text FROM "TaskEventLink"
  UNION ALL
  SELECT 10, 'ai-interaction|' || id::text || '|' || "userId"::text || '|' || status || '|' || "processingMode" || '|' || "externalTransferOccurred"::text || '|' || "requestHash" || '|' || jsonb_array_length("sourceReferences")::text FROM "AiInteraction"
  UNION ALL
  SELECT 11, 'finance-category|' || id::text || '|' || "userId"::text || '|' || name || '|' || kind::text || '|' || coalesce("archivedAt"::text, '') FROM "FinanceCategory"
  UNION ALL
  SELECT 12, 'finance-transaction|' || id::text || '|' || "categoryId"::text || '|' || kind::text || '|' || "bookingDate"::text || '|' || "amountMinor"::text || '|' || "currencyCode" || '|' || coalesce("recurrenceFrequency"::text, '') FROM "FinanceTransaction"
  UNION ALL
  SELECT 13, 'finance-budget|' || id::text || '|' || coalesce("categoryId"::text, '') || '|' || period::text || '|' || "periodStart"::text || '|' || "amountMinor"::text || '|' || "warningThresholdPercent"::text FROM "FinanceBudget"
  UNION ALL
  SELECT 14, 'fitness-plan|' || id::text || '|' || "userId"::text || '|' || name || '|' || coalesce("archivedAt"::text, '') FROM "FitnessPlan"
  UNION ALL
  SELECT 15, 'fitness-exercise|' || id::text || '|' || "userId"::text || '|' || name || '|' || coalesce("archivedAt"::text, '') FROM "FitnessExercise"
  UNION ALL
  SELECT 16, 'fitness-session|' || id::text || '|' || "userId"::text || '|' || title || '|' || status::text || '|' || coalesce("calendarEventId"::text, '') || '|' || coalesce("performedAt"::text, '') FROM "FitnessSession"
  UNION ALL
  SELECT 17, 'fitness-set|' || id::text || '|' || "sessionId"::text || '|' || "exerciseId"::text || '|' || "setNumber"::text || '|' || coalesce(repetitions::text, '') || '|' || coalesce("weightGrams"::text, '') FROM "FitnessSet"
  UNION ALL
  SELECT 18, 'body-weight|' || id::text || '|' || "measuredDate"::text || '|' || "weightGrams"::text || '|' || coalesce("archivedAt"::text, '') FROM "BodyWeightEntry"
  UNION ALL
  SELECT 19, 'audit-count|' || count(*)::text FROM "AuditEvent"
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
printf 'unveränderter synthetischer Marker\n' >"$symlink_target"
ln -s "$symlink_target" "$symlink_backup"
if bash "$SCRIPT_DIR/backup-database.sh" "$symlink_backup" >/dev/null 2>&1; then
  printf 'Fehler: Ein symbolischer Link wurde als PostgreSQL-Backupziel akzeptiert.\n' >&2
  exit 1
fi
if [[ "$(<"$symlink_target")" != "unveränderter synthetischer Marker" ]]; then
  printf 'Fehler: Das Ziel eines Backup-Symlinks wurde verändert.\n' >&2
  exit 1
fi
rm -f "$symlink_backup"
ln -s "$symlink_target" "${symlink_checksum_backup}.sha256"
if bash "$SCRIPT_DIR/backup-database.sh" "$symlink_checksum_backup" >/dev/null 2>&1; then
  printf 'Fehler: Ein symbolischer Link wurde als PostgreSQL-Prüfsummenziel akzeptiert.\n' >&2
  exit 1
fi
if [[ "$(<"$symlink_target")" != "unveränderter synthetischer Marker" ]]; then
  printf 'Fehler: Das Ziel eines Prüfsummen-Symlinks wurde verändert.\n' >&2
  exit 1
fi

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

cp "$backup_file" "$missing_checksum_file"
if DATABASE_URL="$base_database_url" \
  bash "$SCRIPT_DIR/restore-database.sh" "$missing_checksum_file" \
    "$missing_checksum_database" >/dev/null 2>&1; then
  printf 'Fehler: Ein PostgreSQL-Backup ohne Prüfsumme wurde akzeptiert.\n' >&2
  exit 1
fi

cp "$backup_file" "$tampered_file"
cp "${backup_file}.sha256" "${tampered_file}.sha256"
printf 'manipuliert' >>"$tampered_file"
if DATABASE_URL="$base_database_url" \
  bash "$SCRIPT_DIR/restore-database.sh" "$tampered_file" \
    "$tampered_database" >/dev/null 2>&1; then
  printf 'Fehler: Ein manipuliertes PostgreSQL-Backup wurde akzeptiert.\n' >&2
  exit 1
fi

printf 'kein PostgreSQL-Archiv\n' >"$corrupt_file"
BACKUP_FILE="$corrupt_file" node --input-type=module -e '
  import { createHash } from "node:crypto";
  import { readFileSync, writeFileSync } from "node:fs";
  const file = process.env.BACKUP_FILE;
  const checksum = createHash("sha256").update(readFileSync(file)).digest("hex");
  writeFileSync(`${file}.sha256`, `${checksum}\n`, { mode: 0o600 });
'
if DATABASE_URL="$base_database_url" \
  bash "$SCRIPT_DIR/restore-database.sh" "$corrupt_file" \
    "$corrupt_database" >/dev/null 2>&1; then
  printf 'Fehler: Ein strukturell ungültiges PostgreSQL-Backup wurde akzeptiert.\n' >&2
  exit 1
fi

DATABASE_URL="$base_database_url" \
  bash "$SCRIPT_DIR/restore-database.sh" "$backup_file" "$restored_database"
snapshot_restored="$(snapshot "$restored_database")"
if [[ "$snapshot_before" != "$snapshot_restored" ]]; then
  printf 'Fehler: Das wiederhergestellte Datenbankabbild weicht von der Quelle ab.\n' >&2
  exit 1
fi
if DATABASE_URL="$base_database_url" \
  bash "$SCRIPT_DIR/restore-database.sh" "$backup_file" \
    "$restored_database" >/dev/null 2>&1; then
  printf 'Fehler: Ein bestehendes Restore-Ziel wurde überschrieben.\n' >&2
  exit 1
fi
if [[ "$snapshot_before" != "$(snapshot "$source_database")" ]] ||
  [[ "$snapshot_restored" != "$(snapshot "$restored_database")" ]]; then
  printf 'Fehler: Eine abgewiesene Wiederherstellung hat bestehende Daten verändert.\n' >&2
  exit 1
fi

printf 'Migration, Seed, Prüfsummen, beschädigte Backups sowie Restore in neue Ziele wurden erfolgreich geprüft.\n'

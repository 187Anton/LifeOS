#!/usr/bin/env bash

# Paket 3: Verbindlicher Backup-Schutz vor PostgreSQL-Migrationen.
#
# Bestehende Datenbanken werden nur migriert, wenn vorher ein geprüftes
# PostgreSQL-Backup samt SHA-256 vorliegt. Entweder wird ein bereits geprüfter
# Backup-Kontext ausdrücklich übergeben (LIFEOS_MIGRATION_BACKUP, etwa aus dem
# Restore- oder Stagingpfad) oder es wird automatisch ein neues Backup erzeugt.
# Frische, leere Ziele werden ohne unnötiges Backup migriert.

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
migration_directory="$REPOSITORY_ROOT/packages/database/prisma/migrations"

cd "$REPOSITORY_ROOT"
bash "$SCRIPT_DIR/check-database.sh"

database_url="${DATABASE_URL:-}"
if [[ -z "$database_url" ]]; then
  database_url="$(node --input-type=module -e '
    import { config } from "dotenv";
    config({ path: ".env", quiet: true });
    process.stdout.write(process.env.DATABASE_URL ?? "");
  ')"
fi
if [[ -z "$database_url" ]]; then
  printf 'Fehler: DATABASE_URL fehlt in der Umgebung und in .env.\n' >&2
  exit 1
fi

database_name="$(BASE_DATABASE_URL="$database_url" node --input-type=module -e '
  const url = new URL(process.env.BASE_DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL muss eine PostgreSQL-URL sein.");
  }
  process.stdout.write(decodeURIComponent(url.pathname.replace(/^\//, "")));
')"
if [[ -z "$database_name" ]]; then
  printf 'Fehler: DATABASE_URL enthält keinen Datenbanknamen.\n' >&2
  exit 1
fi

psql_query() {
  local query="$1"
  docker compose exec -T db sh -ec \
    'psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$1" -c "$2"' \
    lifeos-migrate-guard "$database_name" "$query"
}

verify_backup_file() {
  local backup_file="$1"
  if [[ "$backup_file" != /* ]]; then
    backup_file="$REPOSITORY_ROOT/$backup_file"
  fi
  if [[ ! -f "$backup_file" ]] || [[ -L "$backup_file" ]] || [[ ! -s "$backup_file" ]]; then
    printf 'Fehler: Das übergebene Backup fehlt oder ist leer.\n' >&2
    exit 1
  fi
  local checksum_file="${backup_file}.sha256"
  if [[ ! -f "$checksum_file" ]] || [[ -L "$checksum_file" ]] || [[ ! -s "$checksum_file" ]]; then
    printf 'Fehler: Die verpflichtende SHA-256-Datei des Backups fehlt oder ist leer.\n' >&2
    exit 1
  fi
  if ! BACKUP_FILE="$backup_file" CHECKSUM_FILE="$checksum_file" \
    node --input-type=module -e '
      import { createHash, timingSafeEqual } from "node:crypto";
      import { readFileSync } from "node:fs";
      const expected = readFileSync(process.env.CHECKSUM_FILE, "utf8").trim().split(/\s+/)[0];
      const actual = createHash("sha256").update(readFileSync(process.env.BACKUP_FILE)).digest("hex");
      if (!/^[0-9a-f]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
        process.exitCode = 1;
      }
    '; then
    printf 'Fehler: Die SHA-256-Prüfsumme stimmt nicht mit dem Backup überein.\n' >&2
    exit 1
  fi
  if ! docker compose exec -T db pg_restore --list <"$backup_file" >/dev/null; then
    printf 'Fehler: Das Backup ist kein gültiges PostgreSQL-Archiv.\n' >&2
    exit 1
  fi
}

tracking_table="$(psql_query "SELECT CASE WHEN to_regclass('public.\"_prisma_migrations\"') IS NULL THEN 'no' ELSE 'yes' END;")"
applied_migrations=""
if [[ "$tracking_table" == "yes" ]]; then
  applied_migrations="$(psql_query 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;')"
fi
application_tables="$(psql_query "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations';")"

pending_migrations=()
for directory in "$migration_directory"/*/; do
  name="$(basename "$directory")"
  [[ "$name" =~ ^[0-9]{14}_[a-z0-9_]+$ ]] || continue
  if ! grep -qxF "$name" <<<"$applied_migrations"; then
    pending_migrations+=("$name")
  fi
done

if [[ "${#pending_migrations[@]}" -eq 0 ]]; then
  printf 'Datenbank %s ist auf dem aktuellen Migrationsstand.\n' "$database_name"
else
  printf 'Offene Migrationen in %s: %s\n' "$database_name" "${pending_migrations[*]}"
fi

if [[ "${#pending_migrations[@]}" -gt 0 && "$application_tables" -gt 0 ]]; then
  provided_backup="${LIFEOS_MIGRATION_BACKUP:-}"
  if [[ -n "$provided_backup" ]]; then
    verify_backup_file "$provided_backup"
    printf 'Geprüfter Backup-Kontext wird ausdrücklich verwendet.\n'
  else
    backup_directory="${LIFEOS_MIGRATION_BACKUP_DIRECTORY:-$REPOSITORY_ROOT/backups}"
    mkdir -p "$backup_directory"
    backup_file="$backup_directory/lifeos-pre-migration-${database_name}-$(date -u +%Y%m%dT%H%M%SZ).dump"
    LIFEOS_BACKUP_DATABASE="$database_name" \
      bash "$SCRIPT_DIR/backup-database.sh" "$backup_file" >/dev/null
    verify_backup_file "$backup_file"
    printf 'Vor-Migrationsbackup erstellt und geprüft: %s\n' "$backup_file"
  fi
else
  printf 'Frische oder aktuelle Datenbank: kein Vor-Migrationsbackup nötig.\n'
fi

npm run db:migrate:deploy --workspace @lifeos/database

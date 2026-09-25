#!/usr/bin/env bash

# Paket 3: Nachweis der PostgreSQL-Finanzentfernung ausschließlich gegen
# isolierte synthetische Datenbanken. Der Ablauf
#   1. baut über die echten alten Migrationen einen Vor-Paket-3-Stand mit
#      Finanzdaten und einer Aufgabe mit area=finance auf,
#   2. weist nach, dass ohne geprüftes Backup nicht migriert wird,
#   3. migriert mit dem verpflichtenden Vor-Migrationsbackup,
#   4. prüft datenerhaltende Umwandlung und Entfernung der Finanzobjekte,
#   5. restauriert das Vor-Migrationsbackup in ein neues Ziel und migriert dort.
# Die konfigurierte Entwicklungsdatenbank wird nie verändert.

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
migration_directory="$REPOSITORY_ROOT/packages/database/prisma/migrations"
destructive_migration="20260925120000_remove_finance_module"

suffix="$(date -u +%s)_$$"
upgrade_database="lifeos_p3_upgrade_${suffix}"
restored_database="lifeos_restore_p3_${suffix}"
backup_directory="$REPOSITORY_ROOT/backups/verify-finance-removal-${suffix}"

synthetic_user_id="00000000-0000-4000-8000-000000000701"
finance_task_id="00000000-0000-4000-8000-000000000702"
work_task_id="00000000-0000-4000-8000-000000000703"
finance_category_id="00000000-0000-4000-8000-000000000704"
finance_transaction_id="00000000-0000-4000-8000-000000000705"
finance_budget_id="00000000-0000-4000-8000-000000000706"

fail() {
  printf 'Fehler: %s\n' "$1" >&2
  exit 1
}

cd "$REPOSITORY_ROOT"
bash "$SCRIPT_DIR/check-database.sh"

base_database_url="${DATABASE_URL:-}"
if [[ -z "$base_database_url" ]]; then
  base_database_url="$(node --input-type=module -e '
    import { config } from "dotenv";
    config({ path: ".env", quiet: true });
    process.stdout.write(process.env.DATABASE_URL ?? "");
  ')"
fi
if [[ -z "$base_database_url" ]]; then
  fail "DATABASE_URL fehlt in der Umgebung und in .env."
fi

database_url_for() {
  BASE_DATABASE_URL="$base_database_url" TARGET_DATABASE_NAME="$1" \
    node --input-type=module -e '
      const url = new URL(process.env.BASE_DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(url.protocol)) {
        throw new Error("DATABASE_URL muss eine PostgreSQL-URL sein.");
      }
      url.pathname = `/${process.env.TARGET_DATABASE_NAME}`;
      process.stdout.write(url.toString());
    '
}

drop_database() {
  docker compose exec -T db sh -ec \
    'dropdb --if-exists --force -U "$POSTGRES_USER" "$1"' \
    lifeos-p3-cleanup "$1" >/dev/null 2>&1 || true
}

cleanup() {
  drop_database "$upgrade_database"
  drop_database "$restored_database"
  rm -rf "$backup_directory"
}
trap cleanup EXIT

create_database() {
  docker compose exec -T db sh -ec \
    'createdb -U "$POSTGRES_USER" "$1"' lifeos-p3-create "$1"
}

psql_query() {
  docker compose exec -T db sh -ec \
    'psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$1" -c "$2"' \
    lifeos-p3-query "$1" "$2"
}

psql_replay() {
  docker compose exec -T db sh -ec \
    'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$1" -f -' \
    lifeos-p3-replay "$1" <"$2"
}

upgrade_url="$(database_url_for "$upgrade_database")"

create_database "$upgrade_database"

for directory in "$migration_directory"/*/; do
  name="$(basename "$directory")"
  [[ "$name" == "$destructive_migration" ]] && continue
  psql_replay "$upgrade_database" "$directory/migration.sql"
  (
    cd "$REPOSITORY_ROOT/packages/database"
    DATABASE_URL="$upgrade_url" npx prisma migrate resolve --applied "$name" >/dev/null
  )
done

if [[ "$(psql_query "$upgrade_database" "SELECT count(*) FROM \"_prisma_migrations\"")" -lt 20 ]]; then
  fail "Der synthetische Vor-Paket-3-Stand wurde nicht vollständig aufgebaut."
fi
if [[ "$(psql_query "$upgrade_database" "SELECT to_regclass('public.\"FinanceCategory\"') IS NULL")" != "f" ]]; then
  fail "Der synthetische Vor-Paket-3-Stand enthält keine Finanztabellen."
fi

mkdir -p "$backup_directory"
cat >"$backup_directory/pre-paket-3-daten.sql" <<SQL
INSERT INTO "User" ("id", "externalId", "displayName", "createdAt", "updatedAt")
  VALUES ('${synthetic_user_id}', 'synthetic-paket-3-upgrade', 'Synthetische Upgrade-Person', now(), now());
INSERT INTO "UserSettings" ("userId", "timezone", "currencyCode", "locale", "weekStartsOn", "updatedAt")
  VALUES ('${synthetic_user_id}', 'Europe/Berlin', 'CHF', 'de-DE', 0, now());
INSERT INTO "Task" ("id", "userId", "title", "description", "status", "priority", "dueDate", "area", "tags", "updatedAt")
  VALUES ('${finance_task_id}', '${synthetic_user_id}', 'Synthetische Finanzaufgabe', 'Rein synthetischer Datensatz', 'in_progress', 'high', DATE '2032-10-01', 'finance', ARRAY['synthetisch','finanz'], now());
INSERT INTO "Task" ("id", "userId", "title", "status", "priority", "area", "tags", "updatedAt")
  VALUES ('${work_task_id}', '${synthetic_user_id}', 'Synthetische Arbeitsaufgabe', 'open', 'medium', 'work', ARRAY['synthetisch'], now());
INSERT INTO "FinanceCategory" ("id", "userId", "name", "kind", "createdAt", "updatedAt")
  VALUES ('${finance_category_id}', '${synthetic_user_id}', 'Synthetische Kategorie', 'expense', now(), now());
INSERT INTO "FinanceTransaction" ("id", "userId", "categoryId", "kind", "bookingDate", "amountMinor", "currencyCode", "createdAt", "updatedAt")
  VALUES ('${finance_transaction_id}', '${synthetic_user_id}', '${finance_category_id}', 'expense', DATE '2032-09-30', 4321, 'CHF', now(), now());
INSERT INTO "FinanceBudget" ("id", "userId", "categoryId", "period", "periodStart", "amountMinor", "currencyCode", "warningThresholdPercent", "createdAt", "updatedAt")
  VALUES ('${finance_budget_id}', '${synthetic_user_id}', '${finance_category_id}', 'month', DATE '2032-09-01', 50000, 'CHF', 80, now(), now());
SQL
psql_replay "$upgrade_database" "$backup_directory/pre-paket-3-daten.sql"

task_row_without_area() {
  psql_query "$upgrade_database" \
    "SELECT \"title\" || '|' || \"status\" || '|' || \"priority\" || '|' || coalesce(\"description\", '') || '|' || coalesce(\"dueDate\"::text, '') || '|' || array_to_string(\"tags\", ',') || '|' || coalesce(\"projectId\"::text, '') || '|' || \"userId\"::text FROM \"Task\" WHERE \"id\" = '$1'"
}

preserved_snapshot() {
  psql_query "$upgrade_database" \
    "SELECT value FROM (
       SELECT 1 AS ordinal, 'user|' || \"externalId\" || '|' || \"displayName\" AS value FROM \"User\"
       UNION ALL SELECT 2, 'settings|' || timezone || '|' || locale || '|' || \"weekStartsOn\"::text FROM \"UserSettings\"
       UNION ALL SELECT 3, 'task|' || \"title\" || '|' || \"status\" || '|' || \"priority\" || '|' || \"area\"::text || '|' || array_to_string(\"tags\", ',') FROM \"Task\"
     ) AS stable_values ORDER BY ordinal, value"
}

finance_task_area_before="$(psql_query "$upgrade_database" "SELECT \"area\"::text FROM \"Task\" WHERE \"id\" = '${finance_task_id}'")"
finance_task_row_before="$(task_row_without_area "$finance_task_id")"
work_task_row_before="$(task_row_without_area "$work_task_id")"
settings_before="$(psql_query "$upgrade_database" "SELECT timezone || '|' || \"currencyCode\" || '|' || locale || '|' || \"weekStartsOn\"::text FROM \"UserSettings\"")"
preserved_before="$(preserved_snapshot)"

if [[ "$finance_task_area_before" != "finance" ]]; then
  fail "Die synthetische Finanzaufgabe wurde nicht als area=finance angelegt."
fi

if DATABASE_URL="$upgrade_url" \
  LIFEOS_MIGRATION_BACKUP="$backup_directory/fehlender-nachweis.dump" \
  LIFEOS_MIGRATION_BACKUP_DIRECTORY="$backup_directory" \
  npm run db:migrate >/dev/null 2>&1; then
  fail "Ohne geprüften Backup-Nachweis darf nicht migriert werden."
fi
if [[ "$(psql_query "$upgrade_database" "SELECT \"area\"::text FROM \"Task\" WHERE \"id\" = '${finance_task_id}'")" != "finance" ]]; then
  fail "Die abgewiesene Migration hat Daten verändert."
fi

DATABASE_URL="$upgrade_url" \
  LIFEOS_MIGRATION_BACKUP_DIRECTORY="$backup_directory" \
  npm run db:migrate >/dev/null

migration_backup="$(find "$backup_directory" -maxdepth 1 -name 'lifeos-pre-migration-*.dump' | head -1)"
if [[ -z "$migration_backup" ]]; then
  fail "Es wurde kein Vor-Migrationsbackup erzeugt."
fi
if [[ ! -s "${migration_backup}.sha256" ]]; then
  fail "Das Vor-Migrationsbackup hat keine Prüfsummendatei."
fi
BACKUP_FILE="$migration_backup" CHECKSUM_FILE="${migration_backup}.sha256" \
  node --input-type=module -e '
    import { createHash, timingSafeEqual } from "node:crypto";
    import { readFileSync } from "node:fs";
    const expected = readFileSync(process.env.CHECKSUM_FILE, "utf8").trim().split(/\s+/)[0];
    const actual = createHash("sha256").update(readFileSync(process.env.BACKUP_FILE)).digest("hex");
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) process.exitCode = 1;
  ' || fail "Die Prüfsumme des Vor-Migrationsbackups stimmt nicht."
if [[ "$(docker compose exec -T db pg_restore --list <"$migration_backup" | grep -c 'TABLE DATA public Finance')" -lt 3 ]]; then
  fail "Das Vor-Migrationsbackup enthält die synthetischen Finanzdaten nicht."
fi

finance_task_area_after="$(psql_query "$upgrade_database" "SELECT \"area\"::text FROM \"Task\" WHERE \"id\" = '${finance_task_id}'")"
if [[ "$finance_task_area_after" != "personal" ]]; then
  fail "Die Finanzaufgabe wurde nicht datenerhaltend zu personal überführt."
fi
if [[ "$(task_row_without_area "$finance_task_id")" != "$finance_task_row_before" ]]; then
  fail "Die Finanzaufgabe wurde außerhalb des Bereichs verändert."
fi
if [[ "$(task_row_without_area "$work_task_id")" != "$work_task_row_before" ]]; then
  fail "Eine unbeteiligte Aufgabe wurde verändert."
fi
settings_after="$(psql_query "$upgrade_database" "SELECT timezone || '|' || locale || '|' || \"weekStartsOn\"::text FROM \"UserSettings\"")"
expected_settings="$(printf '%s' "$settings_before" | awk -F'|' '{ print $1 "|" $3 "|" $4 }')"
if [[ "$settings_after" != "$expected_settings" ]]; then
  fail "Die Einstellungen wurden außerhalb des Währungsfelds verändert."
fi
if [[ "$(psql_query "$upgrade_database" "SELECT count(*) FROM information_schema.columns WHERE table_name = 'UserSettings' AND column_name = 'currencyCode'")" != "0" ]]; then
  fail "Das gespeicherte Währungsfeld wurde nicht entfernt."
fi
if [[ "$(psql_query "$upgrade_database" "SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema() AND table_name ILIKE '%finance%'")" != "0" ]]; then
  fail "Die Finanztabellen wurden nicht entfernt."
fi
if [[ "$(psql_query "$upgrade_database" "SELECT count(*) FROM pg_type WHERE typname ILIKE '%finance%'")" != "0" ]]; then
  fail "Die Finanz-Enums wurden nicht entfernt."
fi
if [[ "$(psql_query "$upgrade_database" "SELECT enum_range(NULL::\"TaskArea\")::text")" != "{study,work,projects,fitness,personal}" ]]; then
  fail "Der PostgreSQL-TaskArea-Typ wurde nicht sauber neu aufgebaut."
fi
preserved_after="$(preserved_snapshot)"
expected_preserved="$(printf '%s' "$preserved_before" | sed 's/|finance|/|personal|/')"
if [[ "$preserved_after" != "$expected_preserved" ]]; then
  fail "Nicht betroffene Fachobjekte wurden durch die Migration verändert."
fi

DATABASE_URL="$base_database_url" \
  bash "$SCRIPT_DIR/restore-database.sh" "$migration_backup" "$restored_database" >/dev/null

if [[ "$(psql_query "$restored_database" "SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema() AND table_name ILIKE '%finance%'")" != "0" ]]; then
  fail "Das wiederhergestellte Ziel enthält weiterhin Finanztabellen."
fi
if [[ "$(psql_query "$restored_database" "SELECT \"area\"::text FROM \"Task\" WHERE \"id\" = '${finance_task_id}'")" != "personal" ]]; then
  fail "Die Wiederherstellung hat die Aufgabe nicht korrekt migriert."
fi
if [[ "$(psql_query "$restored_database" "SELECT \"title\" FROM \"Task\" WHERE \"id\" = '${work_task_id}'")" != "Synthetische Arbeitsaufgabe" ]]; then
  fail "Das wiederhergestellte Ziel verliert unbeteiligte Aufgaben."
fi
if [[ "$(psql_query "$upgrade_database" "SELECT count(*) FROM \"User\" WHERE \"id\" = '${synthetic_user_id}'")" != "1" ]]; then
  fail "Die Wiederherstellung hat die Quellkopie verändert."
fi

printf 'PostgreSQL-Finanzentfernung wurde gegen isolierte synthetische Datenbanken geprüft.\n'
printf 'Nachgewiesen: Backup-Pflicht, datenerhaltende Überführung nach personal, Entfernung der Finanzobjekte,\n'
printf 'sauberer TaskArea-Umbau, Erhalt unbeteiligter Objekte sowie Restore und Migration in ein neues Ziel.\n'

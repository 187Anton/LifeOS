#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ $# -ne 2 ]]; then
  printf 'Verwendung: npm run db:restore -- <backup.dump> <lifeos_restore_zielname>\n' >&2
  exit 1
fi

backup_file="$1"
target_database="$2"
if [[ "$backup_file" != /* ]]; then
  backup_file="$REPOSITORY_ROOT/$backup_file"
fi
if [[ ! -s "$backup_file" ]]; then
  printf 'Fehler: Die Backup-Datei fehlt oder ist leer.\n' >&2
  exit 1
fi
if [[ ! "$target_database" =~ ^lifeos_restore_[a-z0-9_]+$ ]] ||
  [[ ${#target_database} -gt 63 ]]; then
  printf 'Fehler: Der Zielname muss mit lifeos_restore_ beginnen und nur Kleinbuchstaben, Zahlen oder Unterstriche enthalten.\n' >&2
  exit 1
fi

cd "$REPOSITORY_ROOT"
bash "$SCRIPT_DIR/check-database.sh"

checksum_file="${backup_file}.sha256"
if [[ -f "$checksum_file" ]]; then
  if ! BACKUP_FILE="$backup_file" CHECKSUM_FILE="$checksum_file" \
    node --input-type=module -e '
      import { createHash, timingSafeEqual } from "node:crypto";
      import { readFileSync } from "node:fs";
      const expected = readFileSync(process.env.CHECKSUM_FILE, "utf8").trim().split(/\s+/)[0];
      const actual = createHash("sha256").update(readFileSync(process.env.BACKUP_FILE)).digest("hex");
      if (!expected || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
        process.exitCode = 1;
      }
    '; then
    printf 'Fehler: Die SHA-256-Prüfsumme stimmt nicht mit dem Backup überein.\n' >&2
    exit 1
  fi
else
  printf 'Hinweis: Keine .sha256-Datei gefunden; die Archivstruktur wird dennoch geprüft.\n' >&2
fi

docker compose exec -T db pg_restore --list <"$backup_file" >/dev/null

created=0
completed=0
cleanup_failed_restore() {
  if [[ "$created" -eq 1 && "$completed" -eq 0 ]]; then
    docker compose exec -T db sh -ec \
      'dropdb --if-exists --force -U "$POSTGRES_USER" "$1"' \
      lifeos-restore-cleanup "$target_database" >/dev/null 2>&1 || true
  fi
}
trap cleanup_failed_restore EXIT

if ! docker compose exec -T db sh -ec \
  'createdb -U "$POSTGRES_USER" "$1"' \
  lifeos-restore-create "$target_database"; then
  printf 'Fehler: Die neue Zieldatenbank konnte nicht angelegt werden. Sie darf noch nicht existieren.\n' >&2
  exit 1
fi
created=1

docker compose exec -T db sh -ec \
  'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-acl --exit-on-error' \
  lifeos-restore "$target_database" <"$backup_file"

base_database_url="${DATABASE_URL:-}"
if [[ -z "$base_database_url" ]]; then
  base_database_url="$(node --input-type=module -e '
    import { config } from "dotenv";
    config({ path: ".env", quiet: true });
    process.stdout.write(process.env.DATABASE_URL ?? "");
  ')"
fi
if [[ -z "$base_database_url" ]]; then
  printf 'Fehler: DATABASE_URL fehlt; die wiederhergestellte Datenbank kann nicht migriert und geprüft werden.\n' >&2
  exit 1
fi
restored_database_url="$(
  BASE_DATABASE_URL="$base_database_url" TARGET_DATABASE_NAME="$target_database" \
    node --input-type=module -e '
      const url = new URL(process.env.BASE_DATABASE_URL);
      url.pathname = `/${process.env.TARGET_DATABASE_NAME}`;
      process.stdout.write(url.toString());
    '
)"
DATABASE_URL="$restored_database_url" npm run db:migrate

completed=1
printf 'Backup wurde in der neuen Datenbank %s wiederhergestellt und migriert.\n' "$target_database"
printf 'Die konfigurierte Quelldatenbank wurde nicht verändert. Prüfe die neue Datenbank, bevor du bewusst umstellst.\n'

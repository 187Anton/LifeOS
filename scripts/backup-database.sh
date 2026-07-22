#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

bash "$SCRIPT_DIR/check-database.sh"
cd "$REPOSITORY_ROOT"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="${1:-backups/lifeos-${timestamp}.dump}"
if [[ "$destination" != /* ]]; then
  destination="$REPOSITORY_ROOT/$destination"
fi

if [[ -e "$destination" ]]; then
  printf 'Fehler: Die Backup-Datei existiert bereits: %s\n' "$destination" >&2
  exit 1
fi

mkdir -p "$(dirname "$destination")"
if ! docker compose exec -T db sh -ec \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  >"$destination"; then
  rm -f "$destination"
  printf 'Fehler: Das PostgreSQL-Backup konnte nicht erstellt werden.\n' >&2
  exit 1
fi

if [[ ! -s "$destination" ]]; then
  rm -f "$destination"
  printf 'Fehler: PostgreSQL hat eine leere Backup-Datei erzeugt.\n' >&2
  exit 1
fi

chmod 600 "$destination"
BACKUP_FILE="$destination" BACKUP_NAME="$(basename "$destination")" \
  node --input-type=module -e '
  import { createHash } from "node:crypto";
  import { readFileSync } from "node:fs";
  const file = process.env.BACKUP_FILE;
  const checksum = createHash("sha256").update(readFileSync(file)).digest("hex");
  process.stdout.write(`${checksum}  ${process.env.BACKUP_NAME}\n`);
' >"${destination}.sha256"
chmod 600 "${destination}.sha256"

printf 'PostgreSQL-Backup erstellt: %s\n' "$destination"
printf 'Prüfsumme erstellt: %s.sha256\n' "$destination"

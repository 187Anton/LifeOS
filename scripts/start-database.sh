#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

bash "$SCRIPT_DIR/check-local-environment.sh"
cd "$REPOSITORY_ROOT"

if ! docker compose up -d --wait --wait-timeout 60 db; then
  printf "Fehler: PostgreSQL wurde nicht innerhalb von 60 Sekunden gesund. Prüfe 'docker compose logs db'.\n" >&2
  exit 1
fi

bash "$SCRIPT_DIR/check-database.sh"

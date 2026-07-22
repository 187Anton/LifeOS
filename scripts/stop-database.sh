#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

bash "$SCRIPT_DIR/check-local-environment.sh"
cd "$REPOSITORY_ROOT"

docker compose down
printf 'Lokale Dienste sind gestoppt. Das Volume lifeos-postgres bleibt erhalten.\n'

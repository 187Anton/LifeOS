#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

fail() {
  printf 'Fehler: %s\n' "$1" >&2
  exit 1
}

if ! command -v docker >/dev/null 2>&1; then
  fail "Docker wurde nicht gefunden. Installiere und starte Docker Desktop oder Docker Engine mit Compose."
fi

if ! docker info >/dev/null 2>&1; then
  fail "Docker ist installiert, aber der Docker-Dienst ist nicht erreichbar. Starte Docker Desktop bzw. den Docker-Daemon und führe 'npm run env:check' erneut aus."
fi

if ! docker compose version >/dev/null 2>&1; then
  fail "Docker Compose ist nicht verfügbar. Installiere das Compose-Plugin und führe 'npm run env:check' erneut aus."
fi

cd "$REPOSITORY_ROOT"

if [[ ! -f .env ]]; then
  printf "Hinweis: .env fehlt. Lege sie mit 'cp .env.example .env' an.\n" >&2
fi

if ! docker compose config --quiet; then
  fail "Die Compose-Konfiguration ist ungültig. Prüfe compose.yaml und die Werte in .env."
fi

printf 'Lokale Docker-Umgebung ist bereit.\n'

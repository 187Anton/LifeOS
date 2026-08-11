#!/usr/bin/env bash

set -euo pipefail

LIFEOS_SQLITE_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lifeos-sqlite-api.XXXXXX")"
trap 'rm -rf "$LIFEOS_SQLITE_TEST_DIR"' EXIT

export SQLITE_DATABASE_URL="file:${LIFEOS_SQLITE_TEST_DIR}/lifeos.sqlite"
export DATABASE_URL="$SQLITE_DATABASE_URL"

npm run db:sqlite:migrate
./node_modules/.bin/tsx --test --test-concurrency=1 apps/api/tests/*.test.ts

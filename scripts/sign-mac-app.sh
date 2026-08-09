#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_PATH="$REPOSITORY_ROOT/apps/desktop/src-tauri/target/release/bundle/macos/Anton Life OS.app"
SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:--}"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Die gebaute Mac-App fehlt: $APP_PATH" >&2
  exit 1
fi

if [[ "$SIGNING_IDENTITY" == "-" ]]; then
  SIGNING_OPTIONS=(--force --sign - --timestamp=none)
  echo "App wird für den lokalen Nachweis ad-hoc signiert."
else
  SIGNING_OPTIONS=(--force --sign "$SIGNING_IDENTITY" --options runtime --timestamp)
  echo "App wird mit der konfigurierten Apple-Signaturidentität signiert."
fi

codesign "${SIGNING_OPTIONS[@]}" \
  "$APP_PATH/Contents/Resources/build/Release/better_sqlite3.node"
codesign "${SIGNING_OPTIONS[@]}" "$APP_PATH/Contents/MacOS/lifeos-node"
codesign "${SIGNING_OPTIONS[@]}" "$APP_PATH/Contents/MacOS/lifeos-desktop"
codesign "${SIGNING_OPTIONS[@]}" "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

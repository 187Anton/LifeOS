#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_PATH="$REPOSITORY_ROOT/apps/desktop/src-tauri/target/release/bundle/macos/Anton Life OS.app"
OUTPUT_DIRECTORY="$REPOSITORY_ROOT/apps/desktop/src-tauri/target/release/bundle/dmg"
RELEASE_VERSION="$(node --input-type=module -e 'import packageJson from "./package.json" with { type: "json" }; process.stdout.write(packageJson.version)')"
RELEASE_ARCHITECTURE="$(node --input-type=module -e 'const names = { arm64: "aarch64", x64: "x64" }; const name = names[process.arch]; if (!name) process.exit(1); process.stdout.write(name)')"
OUTPUT_PATH="$OUTPUT_DIRECTORY/Anton Life OS_${RELEASE_VERSION}_${RELEASE_ARCHITECTURE}.dmg"
STAGING_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/lifeos-dmg.XXXXXX")"

cleanup() {
  rm -rf "$STAGING_DIRECTORY"
}
trap cleanup EXIT

if [[ ! -d "$APP_PATH" ]]; then
  echo "Die gebaute Mac-App fehlt: $APP_PATH" >&2
  echo "Führe zuerst npm run desktop:build:app aus." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIRECTORY"
ditto "$APP_PATH" "$STAGING_DIRECTORY/Anton Life OS.app"
ln -s /Applications "$STAGING_DIRECTORY/Applications"

hdiutil create \
  -volname "Anton Life OS" \
  -srcfolder "$STAGING_DIRECTORY" \
  -format UDZO \
  -ov \
  "$OUTPUT_PATH"

chmod 0644 "$OUTPUT_PATH"
(
  cd "$OUTPUT_DIRECTORY"
  shasum -a 256 "$(basename "$OUTPUT_PATH")" >"$(basename "$OUTPUT_PATH").sha256"
)
chmod 0644 "${OUTPUT_PATH}.sha256"
echo "DMG erstellt: $OUTPUT_PATH"
echo "Prüfsumme erstellt: ${OUTPUT_PATH}.sha256"
cat "${OUTPUT_PATH}.sha256"

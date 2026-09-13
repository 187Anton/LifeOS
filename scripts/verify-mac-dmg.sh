#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_VERSION="$(node --input-type=module -e 'import packageJson from "./package.json" with { type: "json" }; process.stdout.write(packageJson.version)')"
RELEASE_ARCHITECTURE="$(node --input-type=module -e 'const names = { arm64: "aarch64", x64: "x64" }; const name = names[process.arch]; if (!name) process.exit(1); process.stdout.write(name)')"
DMG_PATH="${1:-$REPOSITORY_ROOT/apps/desktop/src-tauri/target/release/bundle/dmg/Anton Life OS_${RELEASE_VERSION}_${RELEASE_ARCHITECTURE}.dmg}"
CHECKSUM_PATH="${DMG_PATH}.sha256"
NODE_BINARY="$(command -v node)"
WORK_DIRECTORY="$(mktemp -d "/private/tmp/lifeos-dmg-verify.XXXXXX")"
MOUNT_DIRECTORY="$WORK_DIRECTORY/mount"
INSTALLED_APP="$WORK_DIRECTORY/Applications/Anton Life OS.app"
MOUNTED=0

cleanup() {
  if [[ "$MOUNTED" -eq 1 ]]; then
    hdiutil detach "$MOUNT_DIRECTORY" -quiet || true
  fi
  rm -rf "$WORK_DIRECTORY"
}
trap cleanup EXIT

if [[ ! -f "$DMG_PATH" ]]; then
  echo "Das DMG fehlt: $DMG_PATH" >&2
  exit 1
fi
if [[ ! -f "$CHECKSUM_PATH" ]] || [[ -L "$CHECKSUM_PATH" ]]; then
  echo "Die verpflichtende DMG-Prüfsumme fehlt: $CHECKSUM_PATH" >&2
  exit 1
fi

(
  cd "$(dirname "$DMG_PATH")"
  shasum -a 256 -c "$(basename "$CHECKSUM_PATH")"
)

hdiutil verify "$DMG_PATH" >/dev/null
mkdir -p "$MOUNT_DIRECTORY" "$(dirname "$INSTALLED_APP")"
hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT_DIRECTORY" "$DMG_PATH" >/dev/null
MOUNTED=1

if [[ ! -d "$MOUNT_DIRECTORY/Anton Life OS.app" ]]; then
  echo "Das DMG enthält die erwartete App nicht." >&2
  exit 1
fi
if [[ "$(readlink "$MOUNT_DIRECTORY/Applications")" != "/Applications" ]]; then
  echo "Der Programme-Link im DMG fehlt oder zeigt auf ein falsches Ziel." >&2
  exit 1
fi

ditto "$MOUNT_DIRECTORY/Anton Life OS.app" "$INSTALLED_APP"
hdiutil detach "$MOUNT_DIRECTORY" -quiet
MOUNTED=0

codesign --verify --deep --strict "$INSTALLED_APP"
if [[ "$(defaults read "$INSTALLED_APP/Contents/Info" CFBundleIdentifier)" != "de.anton.lifeos" ]]; then
  echo "Der Bundle-Identifier der installierten App ist unerwartet." >&2
  exit 1
fi
if [[ "$(defaults read "$INSTALLED_APP/Contents/Info" CFBundleShortVersionString)" != "$RELEASE_VERSION" ]]; then
  echo "Die Bundle-Version stimmt nicht mit der zentralen Release-Version überein." >&2
  exit 1
fi

case "$RELEASE_ARCHITECTURE" in
  aarch64) EXPECTED_NATIVE_ARCHITECTURE="arm64" ;;
  x64) EXPECTED_NATIVE_ARCHITECTURE="x86_64" ;;
  *)
    echo "Die erwartete native Architektur ist unbekannt." >&2
    exit 1
    ;;
esac
for BINARY_PATH in \
  "$INSTALLED_APP/Contents/MacOS/lifeos-desktop" \
  "$INSTALLED_APP/Contents/MacOS/lifeos-node" \
  "$INSTALLED_APP/Contents/Resources/build/Release/better_sqlite3.node"; do
  ACTUAL_ARCHITECTURE="$(lipo -archs "$BINARY_PATH")"
  if [[ "$ACTUAL_ARCHITECTURE" != "$EXPECTED_NATIVE_ARCHITECTURE" ]]; then
    echo "Die Architektur von $BINARY_PATH ($ACTUAL_ARCHITECTURE) passt nicht zur DMG-Kennzeichnung ($EXPECTED_NATIVE_ARCHITECTURE)." >&2
    exit 1
  fi
done

FORBIDDEN_BUNDLE_FILE="$(find "$INSTALLED_APP" -type f \( \
  -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' \
  -o -name '*.p12' -o -name '*.sqlite' -o -name '*.sqlite3' \
  -o -name '*.db' -o -name '*.log' \) -print -quit)"
if [[ -n "$FORBIDDEN_BUNDLE_FILE" ]]; then
  echo "Das App-Bundle enthält eine verbotene Secret-, Datenbank- oder Protokolldatei: $FORBIDDEN_BUNDLE_FILE" >&2
  exit 1
fi
if find "$INSTALLED_APP" -type d -name '.git' -print -quit | grep -q .; then
  echo "Das App-Bundle enthält unerwartete Git-Metadaten." >&2
  exit 1
fi

bash "$REPOSITORY_ROOT/scripts/verify-installed-mac-app.sh" "$INSTALLED_APP"

env LIFEOS_DESKTOP_APP_PATH="$INSTALLED_APP" \
  PATH="/usr/bin:/bin" \
  "$NODE_BINARY" "$REPOSITORY_ROOT/scripts/verify-mac-desktop-sidecar.mjs"

echo "DMG, kopierte App, Version, Architektur, Bundle-Inhalt, Signaturstruktur und gebündelter Sidecar wurden geprüft."

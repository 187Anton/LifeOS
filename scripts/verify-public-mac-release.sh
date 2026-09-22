#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "$script_directory/.." && pwd)"
release_version="$(node --input-type=module -e 'import packageJson from "./package.json" with { type: "json" }; process.stdout.write(packageJson.version)')"
release_architecture="$(node --input-type=module -e 'const names = { arm64: "aarch64", x64: "x64" }; const name = names[process.arch]; if (!name) process.exit(1); process.stdout.write(name)')"
dmg_path="${1:-$repository_root/apps/desktop/src-tauri/target/release/bundle/dmg/Anton Life OS_${release_version}_${release_architecture}.dmg}"
checksum_path="${dmg_path}.sha256"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Die öffentliche Mac-Artefaktprüfung kann nur auf macOS ausgeführt werden." >&2
  exit 1
fi
if [[ "$dmg_path" != /* || ! -f "$dmg_path" || -L "$dmg_path" ]]; then
  echo "Erwartet wird ein absoluter Pfad zu einem regulären DMG ohne symbolischen Link." >&2
  exit 1
fi
if [[ ! -f "$checksum_path" || -L "$checksum_path" ]]; then
  echo "Die verpflichtende portable SHA-256-Datei fehlt: $checksum_path" >&2
  exit 1
fi
if [[ "${LIFEOS_REQUIRE_QUARANTINE:-0}" == "1" ]] &&
  ! xattr -p com.apple.quarantine "$dmg_path" >/dev/null 2>&1; then
  echo "Das DMG besitzt kein macOS-Quarantäneattribut und belegt deshalb keinen echten Download-Gatekeeper-Pfad." >&2
  exit 1
fi

case "$(basename "$dmg_path")" in
  *"_${release_version}_aarch64.dmg") expected_architecture="arm64" ;;
  *"_${release_version}_x64.dmg") expected_architecture="x86_64" ;;
  *)
    echo "DMG-Version oder Architekturkennzeichnung passen nicht zur Release-Metadatenquelle." >&2
    exit 1
    ;;
esac

(
  cd "$(dirname "$dmg_path")"
  shasum -a 256 -c "$(basename "$checksum_path")"
)
hdiutil verify "$dmg_path" >/dev/null
xcrun stapler validate "$dmg_path"
spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg_path"

work_directory="$(mktemp -d "/private/tmp/lifeos-public-release.XXXXXX")"
mount_directory="$work_directory/mount"
installed_app="$work_directory/Applications/Anton Life OS.app"
mounted=0

cleanup() {
  if [[ "$mounted" -eq 1 ]]; then
    hdiutil detach "$mount_directory" -quiet || true
  fi
  rm -rf "$work_directory"
}
trap cleanup EXIT

mkdir -p "$mount_directory" "$(dirname "$installed_app")"
hdiutil attach -readonly -nobrowse -mountpoint "$mount_directory" "$dmg_path" >/dev/null
mounted=1
ditto "$mount_directory/Anton Life OS.app" "$installed_app"
hdiutil detach "$mount_directory" -quiet
mounted=0

codesign --verify --deep --strict --verbose=2 "$installed_app"
signature_details="$(codesign -dv --verbose=4 "$installed_app" 2>&1)"
if [[ "$signature_details" != *"Authority=Developer ID Application:"* ]] ||
  [[ "$signature_details" == *"TeamIdentifier=not set"* ]]; then
  echo "Die App im DMG besitzt keine prüfbare Developer-ID-Application-Signatur." >&2
  exit 1
fi
spctl --assess --type execute --verbose=4 "$installed_app"

for binary in \
  "$installed_app/Contents/MacOS/lifeos-desktop" \
  "$installed_app/Contents/MacOS/lifeos-node" \
  "$installed_app/Contents/Resources/build/Release/better_sqlite3.node"; do
  architectures="$(lipo -archs "$binary")"
  if [[ "$architectures" != "$expected_architecture" ]]; then
    echo "Die Architektur von $binary ($architectures) passt nicht zur DMG-Kennzeichnung ($expected_architecture)." >&2
    exit 1
  fi
done

if [[ "$(defaults read "$installed_app/Contents/Info" CFBundleShortVersionString)" != "$release_version" ]]; then
  echo "Die Bundle-Version stimmt nicht mit der zentralen Release-Version überein." >&2
  exit 1
fi

bash "$repository_root/scripts/verify-mac-dmg.sh" "$dmg_path"
echo "Notarisiertes DMG, Developer-ID-Signatur, Gatekeeper, Architektur, SHA-256 und lokaler App-Lauf wurden geprüft."

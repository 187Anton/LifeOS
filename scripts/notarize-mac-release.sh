#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "$script_directory/.." && pwd)"
signing_identity="${APPLE_SIGNING_IDENTITY:-}"
notary_profile="${APPLE_NOTARY_KEYCHAIN_PROFILE:-}"
notary_result="$(mktemp "${TMPDIR:-/tmp}/lifeos-notary-result.XXXXXX")"

cleanup() {
  rm -f "$notary_result"
}
trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Der öffentliche Mac-Release-Pfad kann nur auf macOS ausgeführt werden." >&2
  exit 1
fi
if [[ -z "$signing_identity" || "$signing_identity" == "-" ]]; then
  echo "APPLE_SIGNING_IDENTITY muss eine gültige Developer-ID-Application-Identität benennen." >&2
  exit 1
fi
if [[ -z "$notary_profile" ]]; then
  echo "APPLE_NOTARY_KEYCHAIN_PROFILE muss auf ein lokal gespeichertes notarytool-Schlüsselbundprofil zeigen." >&2
  exit 1
fi
if ! security find-identity -v -p codesigning | grep -F -- "$signing_identity" >/dev/null; then
  echo "Die konfigurierte Apple-Signaturidentität ist im Schlüsselbund nicht verfügbar." >&2
  exit 1
fi

# Prüft das Schlüsselbundprofil früh, ohne Zugangsdaten als Argumente oder Ausgabe zu verwenden.
xcrun notarytool history --keychain-profile "$notary_profile" --output-format json >/dev/null

cd "$repository_root"
release_version="$(node --input-type=module -e 'import packageJson from "./package.json" with { type: "json" }; process.stdout.write(packageJson.version)')"
case "$(uname -m)" in
  arm64) release_architecture="aarch64" ;;
  x86_64) release_architecture="x64" ;;
  *)
    echo "Die aktuelle Mac-Architektur wird vom Release-Skript nicht unterstützt." >&2
    exit 1
    ;;
esac

app_path="$repository_root/apps/desktop/src-tauri/target/release/bundle/macos/Anton Life OS.app"
dmg_path="$repository_root/apps/desktop/src-tauri/target/release/bundle/dmg/Anton Life OS_${release_version}_${release_architecture}.dmg"
checksum_path="${dmg_path}.sha256"

npm run release:verify
npm run desktop:build:dmg

signature_details="$(codesign -dv --verbose=4 "$app_path" 2>&1)"
if [[ "$signature_details" != *"Authority=Developer ID Application:"* ]] ||
  [[ "$signature_details" == *"TeamIdentifier=not set"* ]]; then
  echo "Die gebaute App besitzt keine prüfbare Developer-ID-Application-Signatur." >&2
  exit 1
fi
codesign --verify --deep --strict --verbose=2 "$app_path"

xcrun notarytool submit "$dmg_path" \
  --keychain-profile "$notary_profile" \
  --wait \
  --output-format json >"$notary_result"
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const result = JSON.parse(readFileSync(process.argv[1], "utf8"));
  if (result.status !== "Accepted") {
    throw new Error(`Apple-Notarisierung nicht akzeptiert: ${result.status ?? "unbekannter Status"}`);
  }
' "$notary_result"
xcrun stapler staple "$dmg_path"
xcrun stapler validate "$dmg_path"

# Stapling verändert das DMG. Die portable Prüfsumme muss deshalb danach neu entstehen.
checksum_temporary="$(mktemp "$(dirname "$dmg_path")/.lifeos-checksum.XXXXXX")"
(
  cd "$(dirname "$dmg_path")"
  shasum -a 256 "$(basename "$dmg_path")" >"$checksum_temporary"
)
chmod 0644 "$checksum_temporary"
mv "$checksum_temporary" "$checksum_path"

bash "$repository_root/scripts/verify-public-mac-release.sh" "$dmg_path"
echo "Developer-ID-Signatur, Notarisierung, Stapling und lokale Gatekeeper-Prüfung sind für $dmg_path bestanden."

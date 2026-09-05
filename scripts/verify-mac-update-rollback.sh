#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
baseline_dmg="${1:-}"
update_dmg="${2:-}"

for candidate in "$baseline_dmg" "$update_dmg"; do
  if [[ -z "$candidate" || "$candidate" != /* || ! -f "$candidate" || -L "$candidate" ]]; then
    echo "Erwartet werden zwei absolute, reguläre DMG-Pfade ohne symbolische Links." >&2
    exit 1
  fi
done

test_root="$(mktemp -d "${TMPDIR:-/tmp}/lifeos-version-demo.XXXXXX")"
baseline_mount="$test_root/baseline-mount"
update_mount="$test_root/update-mount"
baseline_app="$test_root/Baseline.app"
update_app="$test_root/Update.app"
mkdir -p "$baseline_mount" "$update_mount"

cleanup() {
  hdiutil detach "$update_mount" >/dev/null 2>&1 || true
  hdiutil detach "$baseline_mount" >/dev/null 2>&1 || true
  rm -rf "$test_root"
}
trap cleanup EXIT

hdiutil verify "$baseline_dmg" >/dev/null
hdiutil verify "$update_dmg" >/dev/null
hdiutil attach -nobrowse -readonly -mountpoint "$baseline_mount" "$baseline_dmg" >/dev/null
hdiutil attach -nobrowse -readonly -mountpoint "$update_mount" "$update_dmg" >/dev/null
ditto "$baseline_mount/Anton Life OS.app" "$baseline_app"
ditto "$update_mount/Anton Life OS.app" "$update_app"
codesign --verify --deep --strict "$baseline_app"
codesign --verify --deep --strict "$update_app"

env \
  LIFEOS_BASELINE_APP_PATH="$baseline_app" \
  LIFEOS_UPDATE_APP_PATH="$update_app" \
  node --import tsx "$repository_root/scripts/verify-mac-update-rollback.mjs"

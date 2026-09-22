#!/usr/bin/env bash

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "Die lokale Sprachprüfung benötigt macOS auf ARM64." >&2
  exit 1
fi

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SWIFT_COMPILER="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc"
MACOS_SDK="/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk"

if [[ ! -x "$SWIFT_COMPILER" || ! -d "$MACOS_SDK" ]]; then
  echo "Die Prüfung benötigt eine vollständige Xcode-Installation unter /Applications/Xcode.app." >&2
  exit 1
fi

PROBE_ROOT="$(mktemp -d "/private/tmp/lifeos-speech-probe.XXXXXX")"
PROBE_APP="$PROBE_ROOT/LifeOS Speech Probe.app"
CONTENTS_DIR="$PROBE_APP/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
PROBE_OUTPUT="$PROBE_ROOT/result.json"
PROBE_ERROR="$PROBE_ROOT/stderr.log"

cleanup() {
  rm -rf "$PROBE_ROOT"
}
trap cleanup EXIT

mkdir -p "$MACOS_DIR"
cp "$REPOSITORY_ROOT/scripts/speech-probe/Info.plist" "$CONTENTS_DIR/Info.plist"

"$SWIFT_COMPILER" \
  -parse-as-library \
  -target arm64-apple-macosx12.0 \
  -sdk "$MACOS_SDK" \
  -module-cache-path "$PROBE_ROOT/ModuleCache" \
  "$REPOSITORY_ROOT/scripts/speech-probe/CapabilityProbe.swift" \
  -o "$MACOS_DIR/LifeOSSpeechProbe"

codesign --force --sign - "$PROBE_APP" >/dev/null
open -W -n -g -o "$PROBE_OUTPUT" --stderr "$PROBE_ERROR" -a "$PROBE_APP"

if [[ ! -s "$PROBE_OUTPUT" ]]; then
  echo "Die Sprachprüfung hat kein Ergebnis geliefert." >&2
  if [[ -s "$PROBE_ERROR" ]]; then
    cat "$PROBE_ERROR" >&2
  fi
  exit 1
fi

cat "$PROBE_OUTPUT"

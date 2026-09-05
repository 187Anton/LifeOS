#!/usr/bin/env bash
set -euo pipefail

app_path="${1:-}"
if [[ -z "$app_path" || "$app_path" != /* || ! -d "$app_path" || -L "$app_path" ]]; then
  echo "Erwartet wird ein absoluter Pfad zu einer regulären Anton-Life-OS-App." >&2
  exit 1
fi

app_binary="$app_path/Contents/MacOS/lifeos-desktop"
if [[ ! -x "$app_binary" ]]; then
  echo "Die ausführbare Desktop-App fehlt." >&2
  exit 1
fi

test_root="$(mktemp -d "${TMPDIR:-/tmp}/lifeos-native-start.XXXXXX")"
native_output="$test_root/native-output.log"
app_pid=""
sidecar_pid=""

cleanup() {
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" >/dev/null 2>&1; then
    kill -TERM "$app_pid" >/dev/null 2>&1 || true
    wait "$app_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$sidecar_pid" ]] && kill -0 "$sidecar_pid" >/dev/null 2>&1; then
    kill -TERM "$sidecar_pid" >/dev/null 2>&1 || true
  fi
  rm -rf "$test_root"
}
trap cleanup EXIT

env LIFEOS_TEST_ROOT="$test_root" RUST_BACKTRACE=1 "$app_binary" >"$native_output" 2>&1 &
app_pid=$!

database_path="$test_root/app-data/data/lifeos.sqlite"
log_path="$test_root/logs/lifeos-api.log"

for _attempt in $(seq 1 150); do
  if ! kill -0 "$app_pid" >/dev/null 2>&1; then
    echo "Die native App wurde vor der Readiness beendet." >&2
    tail -n 120 "$native_output" >&2
    exit 1
  fi
  sidecar_pid="$(pgrep -P "$app_pid" -f lifeos-node || true)"
  if [[ -f "$database_path" && -f "$log_path" && -n "$sidecar_pid" ]]; then
    break
  fi
  sleep 0.1
done

if [[ ! -f "$database_path" || ! -f "$log_path" || -z "$sidecar_pid" ]]; then
  echo "Die native App erreichte den isolierten lokalen Start nicht." >&2
  tail -n 120 "$native_output" >&2
  exit 1
fi

database_mode="$(stat -f '%Lp' "$database_path")"
log_mode="$(stat -f '%Lp' "$log_path")"
[[ "$database_mode" == "600" ]]
[[ "$log_mode" == "600" ]]

osascript -e 'tell application id "de.anton.lifeos" to quit'
wait "$app_pid" >/dev/null 2>&1 || true
app_pid=""
for _attempt in $(seq 1 50); do
  if ! kill -0 "$sidecar_pid" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
if kill -0 "$sidecar_pid" >/dev/null 2>&1; then
  echo "Der Sidecar lief nach dem Beenden der App weiter." >&2
  exit 1
fi
sidecar_pid=""

echo "Die installierbare native App startete isoliert, legte private SQLite-/Logdateien an und beendete ihren Sidecar."

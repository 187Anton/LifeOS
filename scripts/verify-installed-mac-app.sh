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
second_app_pid=""

cleanup() {
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" >/dev/null 2>&1; then
    kill -TERM "$app_pid" >/dev/null 2>&1 || true
    wait "$app_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$sidecar_pid" ]] && kill -0 "$sidecar_pid" >/dev/null 2>&1; then
    kill -TERM "$sidecar_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$second_app_pid" ]] && kill -0 "$second_app_pid" >/dev/null 2>&1; then
    kill -TERM "$second_app_pid" >/dev/null 2>&1 || true
  fi
  rm -rf "$test_root"
}
trap cleanup EXIT

env \
  LIFEOS_TEST_ROOT="$test_root" \
  INTEGRATION_SECRET_KEY="synthetic-parent-only-integration-secret" \
  LIFEOS_PARENT_ONLY_TOKEN="synthetic-parent-only-token" \
  RUST_BACKTRACE=1 \
  "$app_binary" >"$native_output" 2>&1 &
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

sidecar_environment="$(ps eww -p "$sidecar_pid")"
if [[ "$sidecar_environment" == *"INTEGRATION_SECRET_KEY="* ]] ||
  [[ "$sidecar_environment" == *"LIFEOS_PARENT_ONLY_TOKEN="* ]]; then
  echo "Der Sidecar hat nicht freigegebene Variablen der Elternumgebung geerbt." >&2
  exit 1
fi
unset sidecar_environment

second_output="$test_root/second-native-output.log"
env LIFEOS_TEST_ROOT="$test_root" RUST_BACKTRACE=1 \
  "$app_binary" >"$second_output" 2>&1 &
second_app_pid=$!
for _attempt in $(seq 1 50); do
  if ! kill -0 "$second_app_pid" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
if kill -0 "$second_app_pid" >/dev/null 2>&1; then
  echo "Eine zweite native Instanz blieb mit demselben SQLite-Datenbestand aktiv." >&2
  exit 1
fi
set +e
wait "$second_app_pid" >/dev/null 2>&1
second_app_status=$?
set -e
second_app_pid=""
if [[ "$second_app_status" -ne 0 ]]; then
  echo "Die abgewiesene zweite Instanz endete nicht kontrolliert (Status: $second_app_status)." >&2
  exit 1
fi
if [[ "$(pgrep -P "$app_pid" -f lifeos-node | wc -l | tr -d ' ')" != "1" ]]; then
  echo "Nach dem abgewiesenen Mehrfachstart lief nicht genau ein Sidecar." >&2
  exit 1
fi

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

echo "Die installierbare native App isolierte den Sidecar, wies einen Mehrfachstart ab, legte private SQLite-/Logdateien an und beendete ihren Sidecar."

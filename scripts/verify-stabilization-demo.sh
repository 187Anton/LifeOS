#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
baseline_dmg="${1:-}"
if [[ -z "$baseline_dmg" || "$baseline_dmg" != /* || ! -f "$baseline_dmg" || -L "$baseline_dmg" ]]; then
  echo "Für die Zwei-Versionen-Prüfung fehlt der absolute Pfad zum geprüften Baseline-DMG." >&2
  exit 1
fi

cd "$repository_root"
release_version="$(node --input-type=module -e 'import packageJson from "./package.json" with { type: "json" }; process.stdout.write(packageJson.version)')"
release_architecture="$(node --input-type=module -e 'const names = { arm64: "aarch64", x64: "x64" }; const name = names[process.arch]; if (!name) process.exit(1); process.stdout.write(name)')"
release_dmg="$repository_root/apps/desktop/src-tauri/target/release/bundle/dmg/Anton Life OS_${release_version}_${release_architecture}.dmg"

npm run format:check
npm run repo:check
npm run security:secrets
npm run typecheck
npm run lint
npm run build

npm run db:start
npm run db:migrate
npm run db:seed
npm run db:stop
npm run db:start
npm run db:check

npm test
npm run db:test
npm run db:sqlite:test
npm run test:sqlite:api
npm run verify:sqlite:api-runtime
npm run db:verify:recovery
npm run db:sqlite:verify:recovery

npm run desktop:test
npm run release:build:local
npm run release:verify:local
npm run desktop:verify:update-rollback -- "$baseline_dmg" "$release_dmg"
npm run security:secrets

echo "Roadmap 0.6: vollständige synthetische Stabilitäts- und Release-Demo erfolgreich."

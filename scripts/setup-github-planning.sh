#!/usr/bin/env bash

set -euo pipefail

OWNER="187Anton"
REPO="$OWNER/LifeOS"
PROJECT_TITLE="LifeOS – Entwicklung"

if ! command -v gh >/dev/null 2>&1; then
  echo "Fehler: GitHub CLI gh ist nicht installiert." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Fehler: jq ist nicht installiert und wird für die JSON-Auswertung benötigt." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Fehler: gh ist nicht gültig bei GitHub angemeldet." >&2
  echo "Bitte zuerst 'gh auth login -h github.com' ausführen." >&2
  exit 1
fi

echo "Richte GitHub-Planung für $REPO ein ..."

create_label() {
  local name="$1"
  local color="$2"
  local description="$3"

  gh label create "$name" \
    --repo "$REPO" \
    --color "$color" \
    --description "$description" \
    --force >/dev/null
  echo "Label vorhanden: $name"
}

create_label "type: feature" "1D76DB" "Neue Funktion oder Produktverhalten"
create_label "type: bug" "D73A4A" "Fehler oder unerwartetes Verhalten"
create_label "type: docs" "0075CA" "Dokumentation oder Leitfaden"
create_label "type: chore" "6F42C1" "Wartung, Repository oder Infrastruktur"
create_label "type: security" "B60205" "Sicherheits- oder Datenschutzthema"
create_label "type: decision" "5319E7" "Dokumentierte Architekturentscheidung"
create_label "area: api" "BFDADC" "Backend und API"
create_label "area: web" "A2EEEF" "Weboberfläche oder PWA"
create_label "area: database" "C5DEF5" "Datenbank und Migrationen"
create_label "area: caldav" "0E8A16" "Kalender und CalDAV"
create_label "area: ci" "FBCA04" "CI, GitHub oder Entwicklungsworkflow"
create_label "area: documentation" "0075CA" "README, AGENTS oder Projektdokumentation"
create_label "priority: high" "B60205" "Hohe Priorität"
create_label "priority: medium" "FBCA04" "Mittlere Priorität"
create_label "priority: low" "0E8A16" "Niedrige Priorität"
create_label "blocked" "D93F0B" "Arbeit kann aktuell nicht fortgesetzt werden"
create_label "needs-decision" "5319E7" "Nutzerentscheidung erforderlich"
create_label "privacy" "B60205" "Datenschutz oder sensible Daten betroffen"
create_label "breaking-change" "B60205" "Nicht rückwärtskompatible Änderung"

create_milestone() {
  local title="$1"
  local description="$2"
  local existing

  existing="$(gh api "repos/$REPO/milestones?state=all&per_page=100" \
    | jq -r --arg title "$title" '.[] | select(.title == $title) | .number')"

  if [[ -n "$existing" ]]; then
    echo "Milestone vorhanden: $title"
    return
  fi

  gh api --method POST "repos/$REPO/milestones" \
    --field "title=$title" \
    --field "description=$description" >/dev/null
  echo "Milestone erstellt: $title"
}

create_milestone "0.1 Fundament" "Repository, lokale Umgebung, Datenmodell und CalDAV-Grundlage."
create_milestone "0.2 Organisation" "Aufgaben, Kalender und Dashboard."
create_milestone "0.3 Studium" "Studienmodule, Prüfungen, Abgaben und Lernfortschritt."
create_milestone "0.4 Arbeit" "Praxisphasen, Arbeitstage und Tagesberichte."
create_milestone "0.5 Projekte" "Projekte, Meilensteine und erste Repository-Analyse."
create_milestone "0.6 Wissen und RAG" "Notizen, Dokumente, Suche und quellengestützte KI."
create_milestone "0.7 Finanzen und Fitness" "Buchungen, Budgets, Training und Gewicht."
create_milestone "0.8 Integrationen" "ICS, iCloud-CalDAV-Client und optionale GitHub-Integration."
create_milestone "0.9 KI-Planung" "Tagesplanung, Priorisierung und bestätigungspflichtige Automationen."
create_milestone "1.0 Stabilisierung" "Sicherheitsreview, Backups, Tests und produktionsnahe Demo."

PROJECT_NUMBER="$(gh project list --owner "$OWNER" --format json --limit 100 \
  | jq -r --arg title "$PROJECT_TITLE" '(.projects // .)[] | select(.title == $title) | .number' \
  | head -n 1)"

if [[ -z "$PROJECT_NUMBER" ]]; then
  PROJECT_NUMBER="$(gh project create \
    --owner "$OWNER" \
    --title "$PROJECT_TITLE" \
    --format json \
    | jq -r '.number')"
  echo "Project erstellt: $PROJECT_TITLE (#$PROJECT_NUMBER)"
else
  echo "Project vorhanden: $PROJECT_TITLE (#$PROJECT_NUMBER)"
fi

gh project link "$PROJECT_NUMBER" --owner "$OWNER" --repo "$REPO" >/dev/null 2>&1 || true

create_field() {
  local name="$1"
  local data_type="$2"
  local options="$3"
  local existing

  existing="$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json \
    | jq -r --arg name "$name" '(.fields // .)[] | select(.name == $name) | .id' \
    | head -n 1)"

  if [[ -n "$existing" ]]; then
    echo "Project-Feld vorhanden: $name"
    return
  fi

  if [[ -n "$options" ]]; then
    gh project field-create "$PROJECT_NUMBER" \
      --owner "$OWNER" \
      --name "$name" \
      --data-type "$data_type" \
      --single-select-options "$options" >/dev/null
  else
    gh project field-create "$PROJECT_NUMBER" \
      --owner "$OWNER" \
      --name "$name" \
      --data-type "$data_type" >/dev/null
  fi
  echo "Project-Feld erstellt: $name"
}

create_field "Priority" "SINGLE_SELECT" "High,Medium,Low"
create_field "Area" "SINGLE_SELECT" "API,Web,Database,CalDAV,CI,Documentation"
create_field "Target Date" "DATE" ""

USER_ID="$(gh api user --jq '.id')"
PROJECT_NODE_ID="$(gh api graphql \
  -f query='query($login:String!, $number:Int!) { user(login:$login) { projectV2(number:$number) { id } } }' \
  -f login="$OWNER" \
  -F number="$PROJECT_NUMBER" \
  | jq -r '.data.user.projectV2.id // empty')"

if [[ -z "$PROJECT_NODE_ID" ]]; then
  echo "Fehler: Die ID des GitHub-Projects konnte nicht ermittelt werden." >&2
  exit 1
fi

create_view() {
  local name="$1"
  local layout="$2"
  local filter="$3"
  local existing

  existing="$(gh api graphql \
    -f query='query($id:ID!) { node(id:$id) { ... on ProjectV2 { views(first:100) { nodes { number name } } } } }' \
    -f id="$PROJECT_NODE_ID" \
    | jq -r --arg name "$name" '.data.node.views.nodes[]? | select(.name == $name) | .number' \
    | head -n 1)"

  if [[ -n "$existing" ]]; then
    echo "Project-Ansicht vorhanden: $name"
    return
  fi

  gh api --method POST "users/$USER_ID/projectsV2/$PROJECT_NUMBER/views" \
    --field "name=$name" \
    --field "layout=$layout" \
    --field "filter=$filter" >/dev/null
  echo "Project-Ansicht erstellt: $name"
}

create_view "Backlog" "table" "is:issue is:open"
create_view "Kanban" "board" "is:issue is:open"
create_view "Roadmap" "roadmap" "is:issue is:open"

echo
echo "Einrichtung abgeschlossen."
echo "Project: https://github.com/users/$OWNER/projects/$PROJECT_NUMBER"

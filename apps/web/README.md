# Weboberfläche

Die Weboberfläche ist eine responsive React-/TypeScript-Anwendung für Desktop
und Smartphone. Sie verwendet dieselbe Kalender-REST-API wie CalDAV und bildet
aktuell folgende Abläufe ab:

- Anmeldung am lokalen persönlichen Profil,
- ruhige Startübersicht mit lokalem Kalenderstatus,
- Kalenderauswahl und Terminliste,
- Anlegen und Bearbeiten zeitgebundener sowie ganztägiger Termine,
- Zeitzone, Ort, Beschreibung, Erinnerung und einfache RRULE-Eingabe,
- verständliche Lade-, Leer-, Erfolgs- und Fehlerzustände.

## Lokal starten

API und Datenbank müssen entsprechend der Repository-README laufen. Danach:

```bash
npm run web:dev
```

Die Oberfläche ist unter `http://127.0.0.1:5173` erreichbar. Vite leitet
`/api` lokal an `http://127.0.0.1:3000` weiter. Für die gebaute Fassung gilt:

```bash
npm run build --workspace @lifeos/web
npm run web:preview
```

Die Vorschau läuft auf `http://127.0.0.1:4173` und verwendet denselben lokalen
API-Proxy. Der Proxy dient nur Entwicklung und Vorschau; bei einer späteren
Bereitstellung muss ein lokaler Webserver `/api` zur LifeOS-API weiterleiten.

## PWA und Datenschutz

`vite-plugin-pwa` erzeugt Manifest und Service Worker beim Produktions-Build.
Die statische App-Shell bleibt nach dem ersten Laden offline aufrufbar. API-
Antworten und persönliche Kalenderdaten werden bewusst nicht im Service-Worker,
`localStorage` oder `sessionStorage` gespeichert. Ohne erreichbare lokale API
kann die Shell deshalb keine Kalenderdaten laden. Die Sitzung bleibt in einem
vom Backend gesetzten `HttpOnly`-Cookie.

Die Oberfläche lädt keine externen Schriftarten oder anderen notwendigen
Assets. Manifest-Icons liegen versioniert unter `public/icons/`.

## Prüfungen

```bash
npm run lint --workspace @lifeos/web
npm run typecheck --workspace @lifeos/web
npm run test:unit --workspace @lifeos/web
npm run test:e2e --workspace @lifeos/web
npm run build --workspace @lifeos/web
```

Die Unit-Tests prüfen API-Client, Laden, Erfolg, Leerzustand und Fehlerfall. Die
Playwright-Tests laufen in Chrome für Desktop und Smartphone. Sie prüfen unter
anderem Termin-Erstellung und -Bearbeitung, fehlende Browserpersistenz,
horizontalen Überlauf sowie Manifest, Service Worker und Offline-App-Shell.

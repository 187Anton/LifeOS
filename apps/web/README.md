# Weboberfläche

Die Weboberfläche ist eine responsive React-/TypeScript-Anwendung für Desktop
und Smartphone. Sie verwendet dieselbe Kalender-REST-API wie CalDAV und bildet
aktuell folgende Abläufe ab:

- Anmeldung am lokalen persönlichen Profil,
- ruhige Startübersicht mit lokalem Kalenderstatus,
- responsive Aufgabenliste mit Suche sowie Status-, Prioritäts-, Bereichs- und
  Fälligkeitsfiltern,
- Aufgaben anlegen, bearbeiten, abschließen, wieder öffnen, archivieren,
  wiederherstellen und nach ausdrücklicher Bestätigung soft löschen,
- Kalenderauswahl sowie Tages-, Wochen-, Monats- und Agendaansicht,
- Zeitraum-Navigation und flüchtige Projektion einfacher RRULE-Serien,
- Anlegen, Bearbeiten und bestätigtes Löschen zeitgebundener sowie ganztägiger
  Termine,
- Zeitzone, Ort, Beschreibung, Erinnerung und einfache RRULE-Eingabe,
- verständliche ETag-Konflikte ohne stilles Überschreiben,
- Aufgaben und Termine in beiden Editoren verknüpfen und wieder trennen,
- nicht mehr verfügbare verknüpfte Objekte nachvollziehbar anzeigen,
- Organisations-Dashboard mit heutigen und nächsten Terminen, offenen,
  überfälligen und hoch priorisierten Aufgaben sowie Bereichen und Projekten,
- Hinweise auf Terminüberschneidungen und Aufgaben ohne Fälligkeit,
- Schnellaktionen für die bestehenden Aufgaben- und Termin-Formulare,
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
kann die Shell deshalb keine Aufgaben oder Kalenderdaten laden. Aufgabenfilter,
Suche und geöffnete Editoren sind ausschließlich flüchtiger React-Zustand. Die
Sitzung bleibt in einem vom Backend gesetzten `HttpOnly`-Cookie.

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

Die Unit-Tests prüfen API-Client, Kalenderzeiträume, Serienprojektion, Laden,
Aufgaben-CRUD, kombinierte Filter, Leerzustände und Fehlerfälle. Die
Playwright-Tests laufen in Chrome für Desktop und Smartphone. Sie prüfen
Aufgaben-Erstellung, Neuladen, Suche, Filter, Bearbeitung, Abschluss,
Wiederöffnung, Archivierung, Löschung, Kalenderansichten, Termin-CRUD,
Aufgaben-Termin-Verknüpfung und -Trennung, Dashboard-Schnellaktionen und
Aktualisierung, fehlende Browserpersistenz, horizontalen Überlauf sowie
Manifest, Service Worker und Offline-App-Shell.

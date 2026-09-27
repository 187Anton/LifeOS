/**
 * Auflösung von `.js`-Spezifizierern auf die TypeScript-Quelldateien.
 *
 * Nur im Quellbetrieb nötig: Der Entwicklungs-Starter (`tsx`) registriert seine
 * Auflösung im Hauptthread, Worker-Threads erben sie aber nicht – Node leitet
 * aus `.js`-Importen keine `.ts`-Datei ab. Diese Datei wird ausschließlich dann
 * geladen (siehe `ooxml-extractor-worker.ts`), wenn die Workerdatei eine
 * Quelldatei ist. Im gebündelten Laufzeitpaket liegen fertige `.js`-Dateien vor;
 * dort wird weder diese Datei geladen noch wird etwas umgeschrieben.
 *
 * Der Resolver wird nur bei fehlgeschlagener normaler Auflösung tätig und
 * betrifft ausschließlich relative `.js`-Spezifizierer. Alles andere – etwa
 * Bare-Spezifizierer wie `fast-xml-parser` – bleibt unverändert.
 */
export async function resolve(specifier, context, next) {
  if (/^\.{1,2}\//.test(specifier) && specifier.endsWith(".js")) {
    try {
      return await next(specifier, context);
    } catch {
      return next(specifier.slice(0, -3) + ".ts", context);
    }
  }
  return next(specifier, context);
}

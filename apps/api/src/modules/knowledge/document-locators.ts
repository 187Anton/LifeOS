import type { DocumentLocator } from "@lifeos/contracts";

/** `true`, wenn der Wert eine positive, ganze Fundstellennummer ist. */
const isUnit = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

/**
 * Liest die am Dokument gespeicherten Fundstellen aus dem JSON-Feld.
 *
 * Paket 7 hat `{ page, text }` gespeichert; Paket 8 ergänzt `{ slide, text }`
 * und `{ paragraph, section, text }`. Alle drei Formen bleiben gültig, es wird
 * deshalb **keine** Migration und kein zweiter Speicher benötigt. Übernommen
 * werden ausschließlich wohlgeformte Einträge; ein unerwarteter Wert führt zu
 * keiner stillen Falschzuordnung, sondern zum Auslassen des Eintrags.
 *
 * Diese Funktion ist die einzige Stelle, die die gespeicherte Form deutet.
 * Dokument- und Suchmodul lesen darüber dieselben Fundstellen; es entsteht kein
 * eigener Index.
 */
export const readStoredLocators = (value: unknown): DocumentLocator[] => {
  if (!Array.isArray(value)) return [];
  const locators: DocumentLocator[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      continue;
    const candidate = entry as {
      page?: unknown;
      slide?: unknown;
      paragraph?: unknown;
      section?: unknown;
      text?: unknown;
    };
    if (typeof candidate.text !== "string" || !candidate.text) continue;

    if (isUnit(candidate.page)) {
      locators.push({ page: candidate.page, text: candidate.text });
      continue;
    }
    if (isUnit(candidate.slide)) {
      locators.push({ slide: candidate.slide, text: candidate.text });
      continue;
    }
    if (isUnit(candidate.paragraph)) {
      locators.push({
        paragraph: candidate.paragraph,
        section:
          typeof candidate.section === "string" && candidate.section
            ? candidate.section
            : null,
        text: candidate.text,
      });
    }
  }
  return locators;
};

/** Die Einheit einer Fundstelle, sofern sie eine nennt. */
export const locatorUnit = (
  locator: DocumentLocator,
): { kind: "page" | "slide" | "paragraph"; number: number } => {
  if ("page" in locator) return { kind: "page", number: locator.page };
  if ("slide" in locator) return { kind: "slide", number: locator.slide };
  return { kind: "paragraph", number: locator.paragraph };
};

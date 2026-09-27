import type { DocumentLocator, DocumentLocatorKind } from "@lifeos/contracts";

import { MAX_EXTRACTED_TEXT_BYTES } from "./storage.js";

/**
 * Feste, reproduzierbare Grenzen der lokalen OOXML-Textextraktion (PPTX/DOCX).
 *
 * OOXML-Dateien sind ZIP-Archive. Eine hochgeladene Datei kann deshalb
 * zusätzlich zur reinen Dateigröße eine Dekompressionsbombe, Pfadtraversal,
 * doppelte Einträge, Symlinks oder manipulierte XML-Strukturen enthalten. Die
 * Grenzen greifen deshalb gestaffelt und **vor** dem Entpacken:
 *
 * 1. Eingabegröße: `MAX_DOCUMENT_BYTES` (25 MiB) aus `storage.ts`; größere
 *    Dateien erreichen den Extractor gar nicht erst.
 * 2. Archivgrenzen werden aus dem zentralen Verzeichnis gelesen, ohne einen
 *    einzigen Eintrag zu entpacken: Eintragsanzahl, Gesamtgröße komprimiert,
 *    Gesamtgröße entpackt, Einzelgröße entpackt und Kompressionsverhältnis.
 * 3. Erst danach werden ausschließlich die tatsächlich benötigten XML-Teile
 *    entpackt – jeweils mit einer harten Obergrenze für die Ausgabegröße.
 * 4. Für die entpackten Teile gelten zusätzlich eine Obergrenze je Teil, eine
 *    Obergrenze über alle Teile zusammen sowie die bestehende Textgrenze.
 * 5. Laufzeit: `OOXML_EXTRACTION_TIMEOUT_MS` je Verarbeitung. Die Frist wird im
 *    aufrufenden Prozess **hart** durchgesetzt: Der Lauf findet in einem
 *    eigenen Worker-Thread statt (`ooxml-extractor-thread.ts`), und bei Ablauf
 *    beendet der Aufrufer den Thread und meldet `timeout`. Zusätzlich prüft der
 *    Extractor dieselbe Frist kooperativ zwischen seinen Arbeitsschritten; eine
 *    blockierende Einzeloperation kann er dadurch aber nicht selbst abbrechen –
 *    dafür ist ausschließlich die harte Frist im Aufrufer zuständig.
 * 6. Speicher: `OOXML_EXTRACTION_MEMORY_LIMIT_MB` als harte V8-Obergrenze genau
 *    dieses Workers. Wird sie erreicht, endet der Lauf als
 *    `failed`/`memory_limit`; der API-Prozess bleibt unberührt.
 *
 * Es wird ausschließlich lokal gearbeitet: kein Netzwerkzugriff, keine
 * Makroausführung, keine externen Beziehungen.
 */

/** Höchstzahl verarbeiteter ZIP-Einträge je Dokument. */
export const MAX_OOXML_ENTRIES = 4_000;
/** Höchstgröße des gesamten komprimierten Archivs. */
export const MAX_OOXML_COMPRESSED_BYTES = 25 * 1024 * 1024;
/** Höchstgröße eines einzelnen Eintrags entpackt (Bombenschutz). */
export const MAX_OOXML_ENTRY_BYTES = 128 * 1024 * 1024;
/** Höchstgröße aller Einträge zusammen entpackt (Bombenschutz). */
export const MAX_OOXML_TOTAL_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
/** Zulässiges Verhältnis entpackt zu komprimiert je Eintrag und gesamt. */
export const MAX_OOXML_COMPRESSION_RATIO = 1_000;
/**
 * Höchstgröße eines einzelnen XML-Teils, der entpackt und geparst wird. Diese
 * Grenze greift zusätzlich zur Archivgrenze und ist bewusst deutlich kleiner:
 * sie begrenzt den tatsächlich entstehenden Speicher- und Zeitbedarf.
 */
export const MAX_OOXML_PART_BYTES = 16 * 1024 * 1024;
/** Höchstmenge aller geparsten XML-Teile zusammen. */
export const MAX_OOXML_XML_BYTES = 32 * 1024 * 1024;
/** Höchstzahl veröffentlichter Fundstellen (Folien beziehungsweise Absätze). */
export const MAX_OOXML_LOCATORS = 1_000;
/** Höchstmenge des veröffentlichten Textes; identisch zur bestehenden Grenze. */
export const MAX_OOXML_TEXT_BYTES = MAX_EXTRACTED_TEXT_BYTES;
/** Höchstlänge einer übernommenen Abschnittsüberschrift. */
export const MAX_OOXML_SECTION_LENGTH = 300;
/** Laufzeitgrenze je Verarbeitung; hart durchgesetzt im Aufrufer. */
export const OOXML_EXTRACTION_TIMEOUT_MS = 20_000;
/**
 * Harte V8-Obergrenze des OOXML-Workers.
 *
 * Die Grenze ist bewusst größer als die des PDF-Workers (256 MiB): OOXML
 * erzeugt im Worker zusätzlich zum Eingabepuffer die entpackten XML-Teile
 * (`maxPartBytes`, zusammen `maxXmlBytes`) und deren Objektbäume. Ein einzelner
 * Teil von 16 MiB wächst beim Parsen deutlich über seine Bytegröße hinaus, weil
 * je Element und Attribut eigene Objekte entstehen; hinzu kommt ein
 * Entpackpuffer von höchstens `maxEntryBytes`. Die genannten Archivgrenzen
 * greifen vor jedem Entpacken, sodass der Spitzenbedarf durch sie nach oben
 * begrenzt bleibt. Reicht die Grenze in einem Ausnahmefall dennoch nicht,
 * endet genau dieser Lauf als `failed`/`memory_limit` – nicht der API-Prozess.
 */
export const OOXML_EXTRACTION_MEMORY_LIMIT_MB = 512;

/**
 * Extraktionsversionen. Sie sind bewusst als feste Zeichenketten hinterlegt und
 * werden durch Tests gegen die tatsächliche Verarbeitung geprüft, damit
 * gespeicherte Ergebnisse nachvollziehbar bleiben.
 *
 * `ooxml-zip-v1` benennt den eigenen, streng validierenden ZIP-Leser ohne
 * zusätzliche Laufzeitabhängigkeit; die Formatkennung nennt das jeweilige
 * OOXML-Format und die Fundstelleneinheit.
 */
export const PPTX_EXTRACTION_VERSION = "ooxml-zip-v1/pptx-slides-v1";
export const DOCX_EXTRACTION_VERSION = "ooxml-zip-v1/docx-paragraphs-v1";

/** Prüfbereich für die ZIP-Kennung `PK` am Anfang des Inhalts. */
export const OOXML_HEADER_SCAN_BYTES = 64;

/** Statuswerte, die eine abgeschlossene OOXML-Extraktion annehmen kann. */
export type OoxmlExtractionOutcomeStatus =
  "available" | "no_text" | "protected" | "unsupported" | "failed";

/** Formatkennung des OOXML-Extraktors. */
export type OoxmlDocumentKind = "pptx" | "docx";

/**
 * Ergebnis einer lokalen OOXML-Extraktion. `locators` enthält ausschließlich
 * Fundstellen mit Text und ist auf die oben genannten Grenzen begrenzt.
 */
export interface OoxmlExtractionOutcome {
  readonly status: OoxmlExtractionOutcomeStatus;
  /**
   * Gesamtzahl der Einheiten des Formats (Folien beziehungsweise Absätze);
   * `null`, wenn sie nicht bestimmbar ist.
   */
  readonly locatorCount: number | null;
  readonly locators: DocumentLocator[];
  readonly truncated: boolean;
  readonly errorCode: string | null;
}

/**
 * Fehlercodes, die an der Quelle auf einen abgebrochenen Lauf hinweisen.
 *
 * `timeout` und `memory_limit` entstehen in der begrenzenden Schicht im
 * aufrufenden Prozess beziehungsweise aus der Speichergrenze des Workers;
 * `worker_unavailable` benennt eine fehlende oder nicht ladbare Workerdatei im
 * gebündelten Laufzeitpaket.
 */
export const OOXML_EXTRACTION_ERROR_CODES = [
  "invalid_zip",
  "unsupported_zip",
  "encrypted_zip",
  "zip_entry_limit",
  "zip_size_limit",
  "unsafe_zip_path",
  "duplicate_zip_entry",
  "damaged_zip",
  "invalid_xml",
  "dtd_rejected",
  "macro_present",
  "unexpected_content",
  "parser_error",
  "timeout",
  "memory_limit",
  "worker_unavailable",
] as const;

export type OoxmlExtractionErrorCode =
  (typeof OOXML_EXTRACTION_ERROR_CODES)[number];

/** Aufrufbare, testbare Grenzen des OOXML-Extraktors. */
export interface OoxmlExtractionLimits {
  maxEntries: number;
  maxCompressedBytes: number;
  maxEntryBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
  maxPartBytes: number;
  maxXmlBytes: number;
  maxLocators: number;
  maxTextBytes: number;
  maxSectionLength: number;
  timeoutMs: number;
}

/** Produktionsgrenzen; Tests können einzelne Werte gezielt verschärfen. */
export const defaultOoxmlExtractionLimits = (): OoxmlExtractionLimits => ({
  maxEntries: MAX_OOXML_ENTRIES,
  maxCompressedBytes: MAX_OOXML_COMPRESSED_BYTES,
  maxEntryBytes: MAX_OOXML_ENTRY_BYTES,
  maxTotalUncompressedBytes: MAX_OOXML_TOTAL_UNCOMPRESSED_BYTES,
  maxCompressionRatio: MAX_OOXML_COMPRESSION_RATIO,
  maxPartBytes: MAX_OOXML_PART_BYTES,
  maxXmlBytes: MAX_OOXML_XML_BYTES,
  maxLocators: MAX_OOXML_LOCATORS,
  maxTextBytes: MAX_OOXML_TEXT_BYTES,
  maxSectionLength: MAX_OOXML_SECTION_LENGTH,
  timeoutMs: OOXML_EXTRACTION_TIMEOUT_MS,
});

/** OOXML-MIME-Typen, für die ein lokaler Textpfad existiert. */
export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Makrofähige Formate. Sie werden nie ausgeführt und nie entpackt; das Dokument
 * bleibt gespeichert und herunterladbar, liefert aber bewusst keinen Inhalt.
 */
export const OOXML_MACRO_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  "application/vnd.ms-word.document.macroenabled.12",
  "application/vnd.ms-word.template.macroenabled.12",
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12",
]);

/** `true`, wenn der MIME-Typ einen lokalen OOXML-Pfad besitzt. */
export const isOoxmlMimeType = (mimeType: string): boolean =>
  mimeType === PPTX_MIME_TYPE || mimeType === DOCX_MIME_TYPE;

/** `true`, wenn der MIME-Typ ein makrofähiges Office-Format benennt. */
export const isMacroEnabledOoxmlMimeType = (mimeType: string): boolean =>
  OOXML_MACRO_MIME_TYPES.has(mimeType);

/** Formstart eines MIME-Typs beziehungsweise `null`. */
export const ooxmlKindForMimeType = (
  mimeType: string,
): OoxmlDocumentKind | null => {
  if (mimeType === PPTX_MIME_TYPE) return "pptx";
  if (mimeType === DOCX_MIME_TYPE) return "docx";
  return null;
};

/**
 * Art der Fundstellen eines Formats, unabhängig davon, ob bereits eine
 * Extraktion vorliegt. Sie wird aus dem MIME-Typ abgeleitet und ist damit auch
 * für ausstehende, fehlgeschlagene oder nicht unterstützte Dokumente korrekt.
 */
export const locatorKindForMimeType = (
  mimeType: string,
): DocumentLocatorKind | null => {
  if (mimeType === "application/pdf") return "page";
  if (mimeType === PPTX_MIME_TYPE) return "slide";
  if (mimeType === DOCX_MIME_TYPE) return "paragraph";
  return null;
};

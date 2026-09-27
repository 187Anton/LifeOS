import { XMLParser, XMLValidator } from "fast-xml-parser";

import type { DocumentLocator } from "@lifeos/contracts";

import {
  defaultOoxmlExtractionLimits,
  type OoxmlDocumentKind,
  type OoxmlExtractionLimits,
  type OoxmlExtractionOutcome,
} from "./ooxml-extraction-limits.js";
import {
  hasZipSignature,
  OoxmlZipArchive,
  OoxmlZipError,
  type ZipLimits,
} from "./ooxml-zip.js";

/**
 * Lokale OOXML-Textextraktion für PPTX und DOCX.
 *
 * Die Verarbeitung ist bewusst rein lokal und läuft im Serverprozess. Sie
 * berührt ausschließlich die Bytes der hochgeladenen Datei:
 *
 * - **Kein Netzwerk:** es gibt keinen Abruf-, Auflösungs- oder Folgepfad. Externe
 *   Beziehungen (`TargetMode="External"`, Zielschemata wie `http:`) werden
 *   erkannt und nie aufgelöst.
 * - **Keine Makroausführung:** ein `vbaProject.bin` oder ein als makrofähig
 *   deklarierter Inhaltstyp führt zum Abbruch; es wird nichts geladen oder
 *   ausgeführt.
 * - **Keine DTD/Entities:** jede Deklaration wird vor dem Parsen abgelehnt.
 *   Der Parser verarbeitet ausschließlich bekannte XML-Grundzeichen.
 * - **Sichtbare Folientexte:** PPTX-Folien werden ausschließlich aus dem
 *   eigentlichen Folienteil gelesen – nicht aus Notizfolien, Layouts oder
 *   Mastern. Die Foliennummer ergibt sich aus der Reihenfolge der
 *   Folienbeziehungen der Präsentation, nie aus Dateinamen.
 * - **DOCX-Haupttext:** nur die Absätze des Hauptdokumenttexts in
 *   Dokumentreihenfolge. Kopf- und Fußzeilen, Fußnoten, Endnoten und
 *   Kommentare sind eigene Teile und werden nicht gelesen. Für DOCX wird
 *   **nie** eine Seitenzahl erfunden; die Fundstelle ist die Absatznummer samt
 *   erkennbarer Abschnittsüberschrift.
 */

const relationshipsParser = new XMLParser({
  preserveOrder: true,
  removeNSPrefix: false,
  ignoreAttributes: false,
  processEntities: true,
  parseTagValue: false,
  parseAttributeValue: false,
  // Führende und folgende Leerzeichen in Textläufen bleiben erhalten: sie
  // trennen Wörter über Laufgrenzen hinweg.
  trimValues: false,
});

const NODE_ATTRIBUTES = ":@";
const NODE_TEXT = "#text";

type XmlRecord = Record<string, unknown>;

const localName = (qualified: string): string => {
  const index = qualified.indexOf(":");
  return index === -1 ? qualified : qualified.slice(index + 1);
};

/** Name des Elementknotens ohne Attribut- und Textknoten. */
const nameOf = (node: unknown): string | null => {
  if (typeof node !== "object" || node === null) return null;
  for (const key of Object.keys(node as XmlRecord)) {
    if (key === NODE_ATTRIBUTES || key === NODE_TEXT) continue;
    return key;
  }
  return null;
};

/** Kindknoten eines Elements. */
const childrenOf = (node: unknown): unknown[] => {
  if (typeof node !== "object" || node === null) return [];
  for (const [key, value] of Object.entries(node as XmlRecord)) {
    if (key === NODE_ATTRIBUTES || key === NODE_TEXT) continue;
    return Array.isArray(value) ? value : [];
  }
  return [];
};

const attributesOf = (node: unknown): XmlRecord => {
  if (typeof node !== "object" || node === null) return {};
  const value = (node as XmlRecord)[NODE_ATTRIBUTES];
  return typeof value === "object" && value !== null
    ? (value as XmlRecord)
    : {};
};

/** Attributwert über den lokalen Attributnamen, unabhängig vom Präfix. */
const attribute = (attributes: XmlRecord, wanted: string): string | null => {
  for (const [key, value] of Object.entries(attributes)) {
    if (!key.startsWith("@_")) continue;
    if (localName(key.slice(2)) !== wanted) continue;
    return typeof value === "string" ? value : null;
  }
  return null;
};

/**
 * Attributwert über lokalen Namen **mit** Namensraumpräfix. In OOXML wird eine
 * Beziehung immer über ein präfixiertes Attribut benannt (`r:id`); das
 * unpräfixierte `id` eines Elements ist eine eigene Kennung.
 */
const namespacedAttribute = (
  attributes: XmlRecord,
  wanted: string,
): string | null => {
  for (const [key, value] of Object.entries(attributes)) {
    if (!key.startsWith("@_")) continue;
    const qualified = key.slice(2);
    const index = qualified.indexOf(":");
    if (index === -1) continue;
    if (qualified.slice(index + 1) !== wanted) continue;
    return typeof value === "string" ? value : null;
  }
  return null;
};

interface XmlElement {
  name: string;
  attributes: XmlRecord;
  children: unknown[];
}

/** Durchläuft Elementknoten in Dokumentreihenfolge. */
const walk = (
  nodes: unknown[],
  visit: (element: XmlElement) => boolean | void,
): void => {
  for (const node of nodes) {
    const name = nameOf(node);
    if (name === null) continue;
    const children = childrenOf(node);
    const descend = visit({
      name,
      attributes: attributesOf(node),
      children,
    });
    if (descend === false) continue;
    walk(children, visit);
  }
};

/** Erster direkter Kindelement mit passendem lokalen Namen. */
const firstChild = (children: unknown[], wanted: string): XmlElement | null => {
  for (const node of children) {
    const name = nameOf(node);
    if (name === null || localName(name) !== wanted) continue;
    return {
      name,
      attributes: attributesOf(node),
      children: childrenOf(node),
    };
  }
  return null;
};

/** Verketteter Text aller Nachfahrenelemente mit passendem lokalen Namen. */
const descendantText = (
  children: unknown[],
  wanted: string,
  excluded: ReadonlySet<string>,
): string => {
  const parts: string[] = [];
  walk(children, (element) => {
    const name = localName(element.name);
    if (excluded.has(name)) return false;
    if (name === wanted) {
      for (const child of element.children) {
        if (typeof child !== "object" || child === null) continue;
        const value = (child as XmlRecord)[NODE_TEXT];
        if (typeof value === "string") parts.push(value);
      }
      return false;
    }
    return undefined;
  });
  return parts.join("");
};

/** Normalisiert extrahierten Text wie die bestehende lokale Textgrundlage. */
const normalizeText = (value: string): string =>
  value
    .replace(/\0/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const failure = (
  status: OoxmlExtractionOutcome["status"],
  errorCode: string | null,
): OoxmlExtractionOutcome => ({
  status,
  locatorCount: null,
  locators: [],
  truncated: false,
  errorCode,
});

/** Übersetzt einen ZIP-Fehler in einen dokumentgebundenen Zustand. */
const archiveFailure = (error: OoxmlZipError): OoxmlExtractionOutcome => {
  if (error.code === "encrypted_zip") return failure("protected", error.code);
  if (error.code === "unsupported_zip")
    return failure("unsupported", error.code);
  return failure("failed", error.code);
};

/**
 * Parst einen XML-Teil nach den Regeln aus dem Dateikopf dieser Datei: DTD- und
 * Entity-Deklarationen werden abgelehnt, die Eingabe wird validiert, und ein
 * ungültiges Dokument endet als klarer Fehlerzustand.
 */
class OoxmlXmlError extends Error {
  constructor(readonly errorCode: string) {
    super(errorCode);
  }
}

const parseXml = (xml: Buffer): unknown[] => {
  const source = xml.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new OoxmlXmlError("dtd_rejected");
  if (XMLValidator.validate(source, { allowBooleanAttributes: false }) !== true)
    throw new OoxmlXmlError("invalid_xml");
  let parsed: unknown;
  try {
    parsed = relationshipsParser.parse(source);
  } catch {
    throw new OoxmlXmlError("invalid_xml");
  }
  return Array.isArray(parsed) ? parsed : [];
};

/** Ein gelesener Beziehungsdatensatz eines `.rels`-Teils. */
interface PackageRelationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

const readRelationships = (parsed: unknown[]): PackageRelationship[] => {
  const relationships: PackageRelationship[] = [];
  walk(parsed, (element) => {
    if (localName(element.name) !== "Relationship") return undefined;
    const id = attribute(element.attributes, "Id");
    const type = attribute(element.attributes, "Type");
    const target = attribute(element.attributes, "Target");
    const mode = attribute(element.attributes, "TargetMode");
    if (!id || !type || !target) return false;
    relationships.push({
      id,
      type,
      target,
      external: mode === "External",
    });
    return false;
  });
  return relationships;
};

/**
 * Löst ein Beziehungsziel relativ zum Verzeichnis des zugehörigen Teils auf.
 * Externe Ziele (Schema wie `http:`) und Ziele, die das Paket verlassen,
 * ergeben `null` und werden nie verwendet.
 */
export const resolvePackageTarget = (
  base: string,
  target: string,
): string | null => {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)) return null;
  const combined = target.startsWith("/")
    ? target.slice(1)
    : `${base}${target}`;
  const segments: string[] = [];
  for (const segment of combined.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
};

const directoryOf = (part: string): string => {
  const index = part.lastIndexOf("/");
  return index === -1 ? "" : part.slice(0, index + 1);
};

const relationshipsPartOf = (part: string): string => {
  const directory = directoryOf(part);
  const fileName = part.slice(directory.length);
  return `${directory}_rels/${fileName}.rels`;
};

/** Der Hauptteil des Pakets, benannt über die Beziehung `officeDocument`. */
const officeDocumentPart = (
  archive: OoxmlZipArchive,
  readPart: (name: string) => unknown[],
): string | null => {
  if (!archive.has("_rels/.rels")) return null;
  const relationships = readRelationships(readPart("_rels/.rels"));
  const main = relationships.find(
    (entry) => !entry.external && entry.type.endsWith("/officeDocument"),
  );
  if (!main) return null;
  return resolvePackageTarget("", main.target);
};

/** `true`, wenn das Archiv ein Makroprojekt enthält. */
const hasMacroProject = (archive: OoxmlZipArchive): boolean =>
  archive.names().some((name) => name.toLowerCase().endsWith("vbaproject.bin"));

/**
 * `true`, wenn der Inhaltstypdeklaration ein makrofähiges Format zu entnehmen
 * ist. Das erkennt auch Dateien, deren Dateiendung nicht danach benannt ist.
 */
const declaresMacroContent = (contentTypes: Buffer): boolean => {
  const source = contentTypes.toString("utf8");
  return /macroenabled/i.test(source);
};

interface LocatorBudget {
  locators: DocumentLocator[];
  textBytes: number;
  truncated: boolean;
}

const addLocator = (
  budget: LocatorBudget,
  locator: DocumentLocator,
  limits: OoxmlExtractionLimits,
): boolean => {
  if (budget.locators.length >= limits.maxLocators) {
    budget.truncated = true;
    return false;
  }
  const bytes = Buffer.byteLength(locator.text, "utf8");
  if (budget.textBytes + bytes > limits.maxTextBytes) {
    budget.truncated = true;
    return false;
  }
  budget.textBytes += bytes;
  budget.locators.push(locator);
  return true;
};

class XmlBudget {
  private used = 0;
  constructor(private readonly limits: OoxmlExtractionLimits) {}
  claim(bytes: number): void {
    this.used += bytes;
    if (bytes > this.limits.maxPartBytes) {
      throw new OoxmlXmlError("zip_size_limit");
    }
    if (this.used > this.limits.maxXmlBytes) {
      throw new OoxmlXmlError("zip_size_limit");
    }
  }
}

const checkDeadline = (deadline: number): void => {
  if (Date.now() > deadline) throw new OoxmlZipError("timeout");
};

/** Liest und parst einen XML-Teil innerhalb aller Teil- und Mengengrenzen. */
const readXmlPart = (
  archive: OoxmlZipArchive,
  name: string,
  budget: XmlBudget,
  rawParts: Map<string, Buffer>,
): unknown[] => {
  const cached = rawParts.get(name);
  const raw = cached ?? archive.read(name);
  if (!cached) rawParts.set(name, raw);
  budget.claim(raw.byteLength);
  return parseXml(raw);
};

const pptx = (
  archive: OoxmlZipArchive,
  limits: OoxmlExtractionLimits,
  deadline: number,
  rawParts: Map<string, Buffer>,
  xmlBudget: XmlBudget,
): OoxmlExtractionOutcome => {
  const presentationPart = officeDocumentPart(archive, (name) =>
    readXmlPart(archive, name, xmlBudget, rawParts),
  );
  if (!presentationPart || !archive.has(presentationPart))
    throw new OoxmlXmlError("unexpected_content");

  const presentation = readXmlPart(
    archive,
    presentationPart,
    xmlBudget,
    rawParts,
  );
  const slideLists: XmlElement[] = [];
  walk(presentation, (element) => {
    if (slideLists.length) return false;
    if (localName(element.name) === "sldIdLst") {
      slideLists.push(element);
      return false;
    }
    return undefined;
  });
  const slideList = slideLists[0];
  if (!slideList) throw new OoxmlXmlError("unexpected_content");

  /**
   * Die Reihenfolge der Folien stammt ausschließlich aus `sldIdLst`; die
   * Zuordnung zur Datei ausschließlich aus der Beziehungstabelle. Dateinamen
   * wie `slide10.xml` und `slide2.xml` ändern die Reihenfolge dadurch nicht.
   */
  const relationships = readRelationships(
    readXmlPart(
      archive,
      relationshipsPartOf(presentationPart),
      xmlBudget,
      rawParts,
    ),
  );
  const byId = new Map(relationships.map((entry) => [entry.id, entry]));
  const base = directoryOf(presentationPart);

  const slideParts: string[] = [];
  for (const node of slideList.children) {
    const name = nameOf(node);
    if (name === null || localName(name) !== "sldId") continue;
    const relationshipId = namespacedAttribute(attributesOf(node), "id");
    const relationship = relationshipId ? byId.get(relationshipId) : undefined;
    if (!relationship || relationship.external)
      throw new OoxmlXmlError("unexpected_content");
    if (!relationship.type.endsWith("/slide"))
      throw new OoxmlXmlError("unexpected_content");
    const part = resolvePackageTarget(base, relationship.target);
    if (!part) throw new OoxmlXmlError("unexpected_content");
    slideParts.push(part);
  }

  const budget: LocatorBudget = {
    locators: [],
    textBytes: 0,
    truncated: false,
  };
  for (let index = 0; index < slideParts.length; index += 1) {
    if (budget.locators.length >= limits.maxLocators) {
      budget.truncated = true;
      break;
    }
    checkDeadline(deadline);
    const part = slideParts[index]!;
    if (!archive.has(part)) continue;
    const slide = readXmlPart(archive, part, xmlBudget, rawParts);
    // Sichtbare Texte: ausschließlich `a:p`-Absätze des Folienteils selbst.
    const paragraphs: string[] = [];
    walk(slide, (element) => {
      if (localName(element.name) !== "p") return undefined;
      const text = normalizeText(
        descendantText(element.children, "t", new Set<string>()),
      );
      if (text) paragraphs.push(text);
      return false;
    });
    const text = normalizeText(paragraphs.join("\n"));
    if (!text) continue;
    const added = addLocator(budget, { slide: index + 1, text }, limits);
    if (!added) break;
  }

  return {
    status: budget.locators.length ? "available" : "no_text",
    locatorCount: slideParts.length,
    locators: budget.locators,
    truncated: budget.truncated,
    errorCode: null,
  };
};

/** Erkennungsmuster für Überschriftabsätze in Dokumentreihenfolge. */
const headingStylePattern = /^(heading|berschrift|title|titel)/i;

const paragraphHeading = (paragraph: XmlElement): string | null => {
  const properties = firstChild(paragraph.children, "pPr");
  if (!properties) return null;
  const style = firstChild(properties.children, "pStyle");
  if (style) {
    const value = attribute(style.attributes, "val");
    if (value && headingStylePattern.test(value.replace(/[\s_-]/g, "")))
      return value;
  }
  const outline = firstChild(properties.children, "outlineLvl");
  if (outline) {
    const value = attribute(outline.attributes, "val");
    if (value !== null && /^\d+$/.test(value) && Number(value) <= 5)
      return `outline-${value}`;
  }
  return null;
};

const docx = (
  archive: OoxmlZipArchive,
  limits: OoxmlExtractionLimits,
  deadline: number,
  rawParts: Map<string, Buffer>,
  xmlBudget: XmlBudget,
): OoxmlExtractionOutcome => {
  const documentPart = officeDocumentPart(archive, (name) =>
    readXmlPart(archive, name, xmlBudget, rawParts),
  );
  if (!documentPart || !archive.has(documentPart))
    throw new OoxmlXmlError("unexpected_content");

  const document = readXmlPart(archive, documentPart, xmlBudget, rawParts);
  const bodies: XmlElement[] = [];
  walk(document, (element) => {
    if (bodies.length) return false;
    if (localName(element.name) === "body") {
      bodies.push(element);
      return false;
    }
    return undefined;
  });
  const body = bodies[0];
  if (!body) throw new OoxmlXmlError("unexpected_content");

  const budget: LocatorBudget = {
    locators: [],
    textBytes: 0,
    truncated: false,
  };
  let paragraphNumber = 0;
  let section: string | null = null;
  /** Nach der ersten gekürzten Fundstelle werden keine weiteren gesammelt. */
  let exhausted = false;

  walk(body.children, (element) => {
    if (localName(element.name) !== "p") return undefined;
    paragraphNumber += 1;
    if (exhausted) return false;
    checkDeadline(deadline);
    // Gelöschte Textläufe (`w:delText`) sind kein sichtbarer Haupttext.
    const text = normalizeText(
      descendantText(element.children, "t", new Set<string>(["delText"])),
    );
    const heading = paragraphHeading(element);
    if (heading && text) {
      section = text.slice(0, limits.maxSectionLength);
    }
    if (!text) return false;
    const added = addLocator(
      budget,
      {
        paragraph: paragraphNumber,
        section: section ? section : null,
        text,
      },
      limits,
    );
    if (!added) exhausted = true;
    return false;
  });

  return {
    status: budget.locators.length ? "available" : "no_text",
    locatorCount: paragraphNumber,
    locators: budget.locators,
    truncated: budget.truncated,
    errorCode: null,
  };
};

/**
 * Liest den lokal extrahierbaren Text eines OOXML-Dokuments.
 *
 * Diese Funktion ist synchron: alle Grenzen greifen vor oder während des
 * Entpackens, und es wird nie mehr entpackt als zuvor validiert wurde. Ein
 * unerwartetes Ergebnis wird zu einem klaren Fehlerzustand, damit nie
 * ungeprüfter Inhalt an die Suche gelangt.
 */
export const extractOoxmlDocumentText = (
  kind: OoxmlDocumentKind,
  bytes: Buffer,
  options: { limits?: Partial<OoxmlExtractionLimits> } = {},
): OoxmlExtractionOutcome => {
  const limits: OoxmlExtractionLimits = {
    ...defaultOoxmlExtractionLimits(),
    ...options.limits,
  };
  const deadline = Date.now() + limits.timeoutMs;
  const zipLimits: ZipLimits = {
    maxEntries: limits.maxEntries,
    maxCompressedBytes: limits.maxCompressedBytes,
    maxEntryBytes: limits.maxEntryBytes,
    maxTotalUncompressedBytes: limits.maxTotalUncompressedBytes,
    maxCompressionRatio: limits.maxCompressionRatio,
    deadline,
  };
  const rawParts = new Map<string, Buffer>();
  const xmlBudget = new XmlBudget(limits);

  try {
    if (!hasZipSignature(bytes)) return failure("failed", "invalid_zip");
    const archive = OoxmlZipArchive.open(bytes, zipLimits);
    // `[Content_Types].xml` ist das Mindestmerkmal eines OOXML-Pakets.
    if (!archive.has("[Content_Types].xml"))
      return failure("unsupported", "unexpected_content");
    if (hasMacroProject(archive))
      return failure("unsupported", "macro_present");
    const contentTypes = archive.read("[Content_Types].xml");
    if (contentTypes.byteLength > limits.maxPartBytes)
      return failure("failed", "zip_size_limit");
    if (declaresMacroContent(contentTypes))
      return failure("unsupported", "macro_present");

    return kind === "pptx"
      ? pptx(archive, limits, deadline, rawParts, xmlBudget)
      : docx(archive, limits, deadline, rawParts, xmlBudget);
  } catch (error) {
    if (error instanceof OoxmlZipError) return archiveFailure(error);
    if (error instanceof OoxmlXmlError) {
      if (error.errorCode === "dtd_rejected")
        return failure("failed", "dtd_rejected");
      if (error.errorCode === "invalid_xml")
        return failure("failed", "invalid_xml");
      if (error.errorCode === "zip_size_limit")
        return failure("failed", "zip_size_limit");
      return failure("failed", "unexpected_content");
    }
    return failure("failed", "parser_error");
  }
};

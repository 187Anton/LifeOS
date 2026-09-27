import { crc32, deflateRawSync } from "node:zlib";

/**
 * Deterministische OOXML-Testvorlagen für Paket 8.
 *
 * Die Vorlagen werden vollständig im Testcode erzeugt: es gibt keine binären
 * Testdateien, keinen Netzzugriff und keine externen Werkzeuge. Jede Vorlage
 * bildet genau den Fall ab, den der Test benennt – gültige Folien- und
 * Absatzinhalte, leere Inhalte, fehlerhaftes XML, Makroprojekte, externe
 * Beziehungen, DTD/Entities sowie manipulierte ZIP-Strukturen wie Traversal,
 * absolute Pfade, doppelte Einträge, Symlinks, Verschlüsselung, falsch
 * angegebene Größen und beschädigte Datenströme.
 */

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

/** Ein ZIP-Eintrag einer Testvorlage. */
export interface ZipFixtureEntry {
  name: string;
  data: Buffer;
  /** 0 = gespeichert, 8 = deflate; Standard ist abhängig vom Inhalt. */
  method?: 0 | 8;
  /** Flagbits des Eintrags, etwa `0x0001` für Verschlüsselung. */
  flags?: number;
  /** Externe Dateiattribute; `0xa1ff0000` kennzeichnet einen Symlink. */
  externalAttributes?: number;
  /** Gibt eine abweichende entpackte Größe an, ohne sie zu erzeugen. */
  declaredUncompressedSize?: number;
  /** Gibt eine abweichende Prüfsumme an. */
  declaredCrc?: number;
  /** Beschädigt den komprimierten Datenstrom nach dem Erzeugen. */
  corrupt?: boolean;
  /** Kennzeichnet einen Verzeichniseintrag. */
  directory?: boolean;
}

/** Erzeugt einen einfachen UTF-8-Eintrag für eigene Testfälle. */
export const entryText = (value: string): ZipFixtureEntry => ({
  name: value,
  data: Buffer.from(value, "utf8"),
});

const corruptStream = (value: Buffer): Buffer => {
  const copy = Buffer.from(value);
  if (!copy.byteLength) return copy;
  const index = Math.floor(copy.byteLength / 2);
  copy[index] = (copy[index]! ^ 0xff) & 0xff;
  return copy;
};

/**
 * Baut ein ZIP-Archiv nach Spezifikation. Die Vorlage erzeugt korrekte
 * lokale Dateiköpfe, ein korrektes zentrales Verzeichnis und einen korrekten
 * Enddatensatz; die Angriffsvarianten entstehen ausschließlich über die
 * ausdrücklich gesetzten Felder.
 */
export const buildZip = (entries: readonly ZipFixtureEntry[]): Buffer => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(
      entry.directory ? `${entry.name}/` : entry.name,
      "utf8",
    );
    const raw = entry.data;
    const method = entry.method ?? (raw.byteLength > 0 ? 8 : 0);
    const deflated = method === 8 ? deflateRawSync(raw) : Buffer.from(raw);
    const payload = entry.corrupt ? corruptStream(deflated) : deflated;
    const checksum = entry.declaredCrc ?? crc32(raw);
    const declaredUncompressed =
      entry.declaredUncompressedSize ?? raw.byteLength;
    const flags = entry.flags ?? 0;
    const externalAttributes = entry.externalAttributes ?? 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_FILE_HEADER, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(payload.byteLength, 18);
    local.writeUInt32LE(declaredUncompressed, 22);
    local.writeUInt16LE(name.byteLength, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_DIRECTORY_ENTRY, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.byteLength, 20);
    central.writeUInt32LE(declaredUncompressed, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(externalAttributes, 38);
    central.writeUInt32LE(offset, 42);

    localParts.push(local, name, payload);
    centralParts.push(central, name);
    offset += local.byteLength + name.byteLength + payload.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
};

/** Schreibt den Enddatensatz mit einer abweichenden Gesamteintragszahl. */
export const withDeclaredEntryCount = (
  archive: Buffer,
  declared: number,
): Buffer => {
  const copy = Buffer.from(archive);
  for (let offset = copy.byteLength - 22; offset >= 0; offset -= 1) {
    if (copy.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY) continue;
    copy.writeUInt16LE(declared, offset + 8);
    copy.writeUInt16LE(declared, offset + 10);
    return copy;
  }
  throw new Error("Kein Enddatensatz gefunden.");
};

/** Verstümmelt einen zentralen Verzeichniseintrag an einer festen Stelle. */
export const corruptCentralDirectory = (archive: Buffer): Buffer => {
  const copy = Buffer.from(archive);
  for (let offset = 0; offset + 4 <= copy.byteLength; offset += 1) {
    if (copy.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) continue;
    copy.writeUInt32LE(0xdeadbeef, offset + 42);
    return copy;
  }
  throw new Error("Kein zentraler Verzeichniseintrag gefunden.");
};

/** Felder des ersten zentralen Verzeichniseintrags, die gepatcht werden können. */
export type CentralDirectoryField =
  | "flags"
  | "method"
  | "crc"
  | "compressedSize"
  | "uncompressedSize"
  | "localHeaderOffset"
  | "externalAttributes";

const centralDirectoryFieldOffset: Record<CentralDirectoryField, number> = {
  flags: 8,
  method: 10,
  crc: 16,
  compressedSize: 20,
  uncompressedSize: 24,
  localHeaderOffset: 42,
  externalAttributes: 38,
};

/**
 * Überschreibt genau ein Feld des ersten zentralen Verzeichniseintrags. Damit
 * entstehen die Fälle, die sich mit einer spezifikationsgemäßen Vorlage nicht
 * ausdrücken lassen – etwa ein ZIP64-Marker oder ein unzulässiges Verfahren.
 */
export const patchFirstCentralDirectoryEntry = (
  archive: Buffer,
  field: CentralDirectoryField,
  value: number,
  width: 2 | 4,
): Buffer => {
  const copy = Buffer.from(archive);
  for (let offset = 0; offset + 4 <= copy.byteLength; offset += 1) {
    if (copy.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) continue;
    const target = offset + centralDirectoryFieldOffset[field];
    if (width === 2) copy.writeUInt16LE(value, target);
    else copy.writeUInt32LE(value >>> 0, target);
    return copy;
  }
  throw new Error("Kein zentraler Verzeichniseintrag gefunden.");
};

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const xmlDeclaration =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const contentTypesXml = (overrides: string[]): string =>
  `${xmlDeclaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  overrides.join("") +
  `</Types>`;

const packageRelationshipsXml = (target: string, type: string): string =>
  `${xmlDeclaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${type}" Target="${target}"/>` +
  `</Relationships>`;

const OFFICE_DOCUMENT_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";

/* ------------------------------------------------------------------ */
/* PPTX                                                                */
/* ------------------------------------------------------------------ */

/** Eine Folie einer PPTX-Testvorlage. */
export interface PptxSlideFixture {
  /** Dateiname des Folienteils, etwa `slide2.xml`. */
  fileName: string;
  /** Absätze der Folie; jeder Absatz ist ein eigener `a:p`. */
  paragraphs: string[];
}

export interface PptxFixtureOptions {
  /** Folien in der Reihenfolge der Präsentationsbeziehungen. */
  slides: PptxSlideFixture[];
  /** Zusätzliche ZIP-Einträge, etwa Makroprojekte. */
  extraEntries?: ZipFixtureEntry[];
  /** Ersetzt die Beziehungstabelle der Präsentation vollständig. */
  presentationRelationships?: string;
  /** Ersetzt `_rels/.rels` vollständig. */
  packageRelationships?: string;
  /** Ersetzt den Inhaltstypdatensatz vollständig. */
  contentTypes?: string;
  /** Setzt die Beziehung der Präsentation auf ein externes Ziel. */
  externalSlideRelationship?: boolean;
  /** Notizfolien, die nie als sichtbarer Folientext gelten dürfen. */
  notes?: Array<{ fileName: string; paragraphs: string[] }>;
}

const presentationPart = "ppt/presentation.xml";

const slidePartXml = (paragraphs: string[]): string =>
  `${xmlDeclaration}<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  `<p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Titel"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
  `<p:txBody><a:bodyPr/><a:lstStyle/>` +
  paragraphs
    .map(
      (paragraph) =>
        `<a:p><a:r><a:rPr lang="de-DE"/><a:t>${escapeXml(paragraph)}</a:t></a:r></a:p>`,
    )
    .join("") +
  `</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

/** Baut eine vollständige PPTX-Testvorlage. */
export const buildPptx = (options: PptxFixtureOptions): Buffer => {
  const slideOverrides = options.slides.map(
    (slide) =>
      `<Override PartName="/ppt/slides/${slide.fileName}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  );
  const notesOverrides = (options.notes ?? []).map(
    (note) =>
      `<Override PartName="/ppt/notesSlides/${note.fileName}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`,
  );
  const relationships =
    options.presentationRelationships ??
    `${xmlDeclaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      options.slides
        .map(
          (slide, index) =>
            `<Relationship Id="rId${index + 10}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${options.externalSlideRelationship ? "https://example.invalid/slide.xml" : `slides/${slide.fileName}`}"${options.externalSlideRelationship ? ' TargetMode="External"' : ""}/>`,
        )
        .join("") +
      `</Relationships>`;

  const presentation =
    `${xmlDeclaration}<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<p:sldIdLst>` +
    options.slides
      .map(
        (_slide, index) =>
          `<p:sldId id="${256 + index}" r:id="rId${index + 10}"/>`,
      )
      .join("") +
    `</p:sldIdLst></p:presentation>`;

  const entries: ZipFixtureEntry[] = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        options.contentTypes ??
          contentTypesXml([
            `<Override PartName="/${presentationPart}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
            ...slideOverrides,
            ...notesOverrides,
          ]),
        "utf8",
      ),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        options.packageRelationships ??
          packageRelationshipsXml(
            presentationPart,
            OFFICE_DOCUMENT_RELATIONSHIP,
          ),
        "utf8",
      ),
    },
    { name: presentationPart, data: Buffer.from(presentation, "utf8") },
    {
      name: "ppt/_rels/presentation.xml.rels",
      data: Buffer.from(relationships, "utf8"),
    },
    ...options.slides.map((slide) => ({
      name: `ppt/slides/${slide.fileName}`,
      data: Buffer.from(slidePartXml(slide.paragraphs), "utf8"),
    })),
    ...(options.notes ?? []).map((note) => ({
      name: `ppt/notesSlides/${note.fileName}`,
      data: Buffer.from(slidePartXml(note.paragraphs), "utf8"),
    })),
    ...(options.extraEntries ?? []),
  ];
  return buildZip(entries);
};

/* ------------------------------------------------------------------ */
/* DOCX                                                                */
/* ------------------------------------------------------------------ */

/** Ein Absatz einer DOCX-Testvorlage. */
export interface DocxParagraphFixture {
  text?: string;
  /** Setzt `w:pStyle` auf diesen Wert. */
  style?: string;
  /** Setzt `w:outlineLvl` auf diesen Wert. */
  outline?: number;
  /** Absatz ohne jeden Text; zählt trotzdem in der Reihenfolge mit. */
  empty?: boolean;
  /** Ersetzt den Absatz vollständig durch eigenen XML-Code. */
  raw?: string;
}

export interface DocxFixtureOptions {
  paragraphs: DocxParagraphFixture[];
  /** Zusätzliche ZIP-Einträge, etwa Makroprojekte. */
  extraEntries?: ZipFixtureEntry[];
  /** Ersetzt `word/document.xml` vollständig. */
  documentXml?: string;
  /** Ersetzt `_rels/.rels` vollständig. */
  packageRelationships?: string;
  /** Ersetzt den Inhaltstypdatensatz vollständig. */
  contentTypes?: string;
  /** Beschädigt den komprimierten Datenstrom von `word/document.xml`. */
  corruptDocument?: boolean;
}

const documentPart = "word/document.xml";

const paragraphXml = (paragraph: DocxParagraphFixture): string => {
  if (paragraph.raw) return paragraph.raw;
  if (paragraph.empty) return "<w:p/>";
  const properties = [
    paragraph.style ? `<w:pStyle w:val="${escapeXml(paragraph.style)}"/>` : "",
    paragraph.outline !== undefined
      ? `<w:outlineLvl w:val="${paragraph.outline}"/>`
      : "",
  ].join("");
  return (
    `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}` +
    `<w:r><w:t xml:space="preserve">${escapeXml(paragraph.text ?? "")}</w:t></w:r>` +
    `</w:p>`
  );
};

/** Baut eine vollständige DOCX-Testvorlage. */
export const buildDocx = (options: DocxFixtureOptions): Buffer => {
  const document =
    options.documentXml ??
    `${xmlDeclaration}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>` +
      options.paragraphs.map(paragraphXml).join("") +
      `<w:sectPr/></w:body></w:document>`;

  return buildZip([
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        options.contentTypes ??
          contentTypesXml([
            `<Override PartName="/${documentPart}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
          ]),
        "utf8",
      ),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        options.packageRelationships ??
          packageRelationshipsXml(documentPart, OFFICE_DOCUMENT_RELATIONSHIP),
        "utf8",
      ),
    },
    {
      name: documentPart,
      data: Buffer.from(document, "utf8"),
      corrupt: options.corruptDocument === true,
    },
    ...(options.extraEntries ?? []),
  ]);
};

/** Ein gültiges Makroprojekt, wie es in `.pptm`/`.docm` enthalten ist. */
export const vbaProjectEntry = (): ZipFixtureEntry => ({
  name: "ppt/vbaProject.bin",
  data: Buffer.from("synthetisches-makroprojekt", "utf8"),
});

/** `[Content_Types].xml` mit makrofähigem Hauptinhaltstyp. */
export const macroContentTypes = (): string =>
  contentTypesXml([
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml"/>`,
  ]);

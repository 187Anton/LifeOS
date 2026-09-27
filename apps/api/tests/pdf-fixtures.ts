import { createHash } from "node:crypto";

/**
 * Deterministische PDF-Testvorlagen für Paket 7.
 *
 * Die Vorlagen werden hier vollständig erzeugt, damit die PDF-Nachweise ohne
 * externe Werkzeuge, ohne Netzzugriff und ohne binäre Testdateien
 * reproduzierbar sind. Jede Vorlage bildet genau den Fall ab, den der Test
 * benennt: Textseiten, leere Seiten, reine Bildseiten, geschützte Dateien,
 * defekte Dateien, Anhänge, JavaScript-Aktionen und externe Verweise.
 *
 * Wichtig für eigene Vorlagen: Die Parserbibliothek gibt Text, der über den
 * rechten Rand der Seitenfläche hinausläuft, nicht aus. Testvorlagen halten
 * ihren Text deshalb innerhalb der MediaBox (kurze Zeilen, kleine Schrift oder
 * breite Seitenfläche); sonst entstehen scheinbar abgeschnittene Extraktionen.
 */

const latin1 = (value: string) => Buffer.from(value, "latin1");

const escapeText = (value: string) =>
  value.replace(/[\\()]/g, (match) => `\\${match}`).replace(/\r?\n/g, " ");

export interface PdfExtraObject {
  /** Objektkörper ohne `n 0 obj`/`endobj`. */
  body: string;
  /** Wird als Strom mit `/Length` und `stream … endstream` gesetzt. */
  stream?: Buffer | null;
}

export interface PdfBuildOptions {
  /** Seiteninhalte. Jede Seite ist eine Liste von Textzeilen. Leer = keine Aktion. */
  pages: string[][];
  /** Zusätzliche Einträge im Katalog, etwa `/OpenAction` oder `/Names`. */
  catalogEntries?: string;
  /** Zusätzliche Einträge in jeder Seite, etwa Anmerkungen. */
  pageEntries?: string;
  extraObjects?: PdfExtraObject[];
  /** Erzwingt eine Bildzeichnung statt eines leeren Seiteninhalts. */
  drawImageOnEmptyPages?: boolean;
  /** Kennung des Image-XObjects, falls gezeichnet wird. */
  imageObjectId?: number;
  /** Schriftgröße der Textzeilen in Punkt. */
  fontSize?: number;
  /** Seitenformat als MediaBox, Vorgabe `[0 0 612 792]`. */
  mediaBox?: string;
}

/** Erste freie Objekt-ID der Zusatzobjekte bei gegebener Seitenzahl. */
export const extraObjectBaseId = (pageCount: number) => 4 + pageCount * 2;

/**
 * Baut ein minimales, gültiges PDF mit Helvetica-Textseiten. Die xref-Tabelle
 * wird echt berechnet, damit auch die defekte Variante nur an genau der
 * beabsichtigten Stelle abweicht.
 */
export const buildPdf = (options: PdfBuildOptions): Buffer => {
  const {
    pages,
    catalogEntries = "",
    pageEntries = "",
    extraObjects = [],
  } = options;
  const fontSize = options.fontSize ?? 18;
  const lineHeight = fontSize + 6;
  const mediaBox = options.mediaBox ?? "[0 0 612 792]";
  const objects = new Map<number, Buffer>();
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    pageIds.push(4 + index * 2);
    contentIds.push(5 + index * 2);
  }
  const extraIds = extraObjects.map(
    (_, index) => extraObjectBaseId(pages.length) + index,
  );

  objects.set(1, latin1(`<< /Type /Catalog /Pages 2 0 R ${catalogEntries} >>`));
  objects.set(
    2,
    latin1(
      `<< /Type /Pages /Kids [${pageIds
        .map((id) => `${id} 0 R`)
        .join(" ")}] /Count ${pages.length} >>`,
    ),
  );
  objects.set(
    3,
    latin1(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ),
  );

  for (let index = 0; index < pages.length; index += 1) {
    const pageId = pageIds[index]!;
    const contentId = contentIds[index]!;
    const lines = pages[index]!;
    const commands: string[] = [];
    if (!lines.length && options.drawImageOnEmptyPages && options.imageObjectId)
      commands.push("q 200 0 0 200 72 500 cm /Im1 Do Q");
    lines.forEach((line, lineIndex) => {
      commands.push(
        `BT /F1 ${fontSize} Tf 72 ${720 - lineIndex * lineHeight} Td (${escapeText(line)}) Tj ET`,
      );
    });
    const stream = latin1(`${commands.join("\n")}\n`);
    const resources = `<< /Font << /F1 3 0 R >>${
      options.imageObjectId
        ? ` /XObject << /Im1 ${options.imageObjectId} 0 R >>`
        : ""
    } >>`;
    objects.set(
      pageId,
      latin1(
        `<< /Type /Page /Parent 2 0 R /MediaBox ${mediaBox} ` +
          `/Resources ${resources} /Contents ${contentId} 0 R ${pageEntries} >>`,
      ),
    );
    objects.set(
      contentId,
      Buffer.concat([
        latin1(`<< /Length ${stream.byteLength} >>\nstream\n`),
        stream,
        latin1("endstream"),
      ]),
    );
  }

  extraObjects.forEach((extra, index) => {
    const id = extraIds[index]!;
    if (extra.stream === undefined) {
      objects.set(id, latin1(extra.body));
      return;
    }
    const stream = extra.stream ?? Buffer.alloc(0);
    objects.set(
      id,
      Buffer.concat([
        latin1(
          `${extra.body.replace(/\/Length \d+/, `/Length ${stream.byteLength}`)}\nstream\n`,
        ),
        stream,
        latin1("\nendstream"),
      ]),
    );
  });

  return assemble(objects, 1);
};

/** Setzt Objekte, xref-Tabelle und Trailer zu einer Datei zusammen. */
export const assemble = (
  objects: Map<number, Buffer>,
  rootId: number,
  trailerEntries = "",
): Buffer => {
  const size = Math.max(...objects.keys()) + 1;
  const chunks: Buffer[] = [latin1("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")];
  let offset = chunks[0]!.byteLength;
  const offsets = new Map<number, number>();
  for (let id = 1; id < size; id += 1) {
    const body = objects.get(id);
    if (!body) continue;
    offsets.set(id, offset);
    const chunk = Buffer.concat([
      latin1(`${id} 0 obj\n`),
      body,
      latin1("\nendobj\n"),
    ]);
    chunks.push(chunk);
    offset += chunk.byteLength;
  }
  const xrefOffset = offset;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id += 1) {
    xref += `${String(offsets.get(id) ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  chunks.push(latin1(xref));
  chunks.push(
    latin1(
      `trailer\n<< /Size ${size} /Root ${rootId} 0 R ${trailerEntries} >>\n` +
        `startxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(chunks);
};

const IMAGE_OBJECT: PdfExtraObject = {
  body: "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>",
  stream: Buffer.from([0x80]),
};

/** Textseiten mit echtem, extrahierbarem Text. */
export const textPdf = (...lines: string[]) => buildPdf({ pages: [lines] });

/** Mehrseitiges PDF, jede Seite mit eigenem Text. */
export const multiPagePdf = (pages: string[]) =>
  buildPdf({ pages: pages.map((line) => (line ? [line] : [])) });

/** Seiten ohne jeden Text; die erste Seite zeichnet ein Bild. */
export const imageOnlyPdf = (pageCount = 2) => {
  const imageId = extraObjectBaseId(pageCount);
  return buildPdf({
    pages: Array.from({ length: pageCount }, () => []),
    drawImageOnEmptyPages: true,
    imageObjectId: imageId,
    extraObjects: [IMAGE_OBJECT],
  });
};

/** PDF mit eingebettetem Anhang und einem externen Dateiverweis. */
export const attachmentPdf = (text: string) => {
  const pageCount = 1;
  const attachmentId = extraObjectBaseId(pageCount);
  const filespecId = attachmentId + 1;
  return buildPdf({
    pages: [[text]],
    catalogEntries: `/Names << /EmbeddedFiles << /Names [(anhang.txt) ${filespecId} 0 R] >> >> /OpenAction << /S /Launch /F (http://example.invalid/extern.pdf) >>`,
    pageEntries: `/Annots [<< /Type /Annot /Subtype /Link /Rect [0 0 0 0] /A << /S /URI /URI (http:// beispiel.invalid/x) >> >>]`,
    extraObjects: [
      {
        body: "<< /Type /EmbeddedFile /Subtype /text#2Fplain /Length 0 >>",
        stream: Buffer.from("Eingebetteter Anhangsinhalt."),
      },
      {
        body: `<< /Type /Filespec /F (anhang.txt) /EF << /F ${attachmentId} 0 R >> >>`,
      },
      IMAGE_OBJECT,
    ],
  });
};

/** PDF mit JavaScript-Aktion im Katalog. */
export const javascriptPdf = (text: string, marker: string) =>
  buildPdf({
    pages: [[text]],
    catalogEntries: `/OpenAction << /S /JavaScript /JS (globalThis.${marker} = true;) >> /AA << /WC << /S /JavaScript /JS (globalThis.${marker} = true;) >> >>`,
  });

/** Seitenzahl ohne Text, um Seiten- und Laufzeitgrenzen zu prüfen. */
export const manyPagePdf = (pageCount: number) =>
  buildPdf({ pages: Array.from({ length: pageCount }, () => []) });

/** Einseitiges PDF mit sehr viel Text, der innerhalb der Seitenfläche bleibt. */
export const hugeTextPdf = (characters: number, linesPerPage = 40) => {
  const lineLength = 300;
  const pages: string[][] = [];
  let remaining = characters;
  while (remaining > 0) {
    const page: string[] = [];
    for (let index = 0; index < linesPerPage && remaining > 0; index += 1) {
      const slice = "Extratext "
        .repeat(Math.ceil(lineLength / 10))
        .slice(0, Math.min(lineLength, remaining));
      page.push(slice);
      remaining -= slice.length;
    }
    pages.push(page);
  }
  /** Breite Seitenfläche und kleine Schrift: Der Text läuft nicht über den Rand. */
  return buildPdf({ pages, fontSize: 8, mediaBox: "[0 0 3000 792]" });
};

/** Abgeschnittene Datei: gültige Kennung, aber unbrauchbare Struktur. */
export const truncatedPdf = () => {
  const valid = textPdf("Synthetischer Inhalt");
  return valid.subarray(0, Math.floor(valid.byteLength / 3));
};

/**
 * PDF-Kennung vorhanden, aber keinerlei auswertbare Struktur: kein Objekt,
 * keine Querverweistabelle, ein `startxref` hinter dem Dateiende.
 */
export const brokenStructurePdf = () =>
  Buffer.concat([
    latin1("%PDF-1.4\n"),
    Buffer.alloc(1_024, 0x20),
    latin1(
      "ohne objekte und ohne gueltige querverweise\nstartxref\n999999\n%%EOF\n",
    ),
  ]);

/** Datei ohne PDF-Kennung. */
export const notAPdf = () => Buffer.from("Dies ist kein PDF.\n");

// ---------------------------------------------------------------------------
// Geschützte Datei: Standard-Sicherheitshandler, Revision 2, 40-Bit-RC4.
// ---------------------------------------------------------------------------

const PASSWORD_PADDING = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff,
  0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c,
  0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

const md5 = (...chunks: Buffer[]) =>
  createHash("md5").update(Buffer.concat(chunks)).digest();

/** RC4 ist für die Reproduzierbarkeit der Vorlage lokal implementiert. */
export const rc4 = (key: Buffer, input: Buffer): Buffer => {
  const state = Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + state[i]! + key[i % key.length]!) & 0xff;
    [state[i], state[j]] = [state[j]!, state[i]!];
  }
  const output = Buffer.alloc(input.byteLength);
  let i = 0;
  j = 0;
  for (let index = 0; index < input.byteLength; index += 1) {
    i = (i + 1) & 0xff;
    j = (j + state[i]!) & 0xff;
    [state[i], state[j]] = [state[j]!, state[i]!];
    output[index] = input[index]! ^ state[(state[i]! + state[j]!) & 0xff]!;
  }
  return output;
};

const padded = (password: string) => {
  const raw = latin1(password);
  return raw.byteLength >= 32
    ? raw.subarray(0, 32)
    : Buffer.concat([raw, PASSWORD_PADDING.subarray(0, 32 - raw.byteLength)]);
};

const hexString = (value: Buffer) => `<${value.toString("hex").toUpperCase()}>`;

/**
 * Verschlüsseltes PDF (Standard-Sicherheitshandler, R2/V1, RC4 40 Bit). Ohne
 * das Nutzerpasswort liefert der Parser einen Passwortfehler; die Datei ist
 * damit ein echter "geschützt"-Fall und kein selbst gebauter Sonderfall.
 */
export const encryptedPdf = (
  text: string,
  userPassword: string,
  ownerPassword: string,
) => {
  const pageCount = 1;
  const encryptionId = extraObjectBaseId(pageCount);
  const documentId = md5(latin1("lifeos-paket-7-fixture"));
  const permissions = -1;
  const permissionsBytes = Buffer.alloc(4);
  permissionsBytes.writeInt32LE(permissions);

  const ownerKey = md5(padded(ownerPassword)).subarray(0, 5);
  const ownerEntry = rc4(ownerKey, padded(userPassword));
  const encryptionKey = md5(
    padded(userPassword),
    ownerEntry,
    permissionsBytes,
    documentId,
  ).subarray(0, 5);
  const userEntry = rc4(encryptionKey, PASSWORD_PADDING);

  const objectKey = (objectId: number) => {
    const extra = Buffer.alloc(5);
    extra.writeUIntLE(objectId, 0, 3);
    return md5(encryptionKey, extra).subarray(
      0,
      Math.min(encryptionKey.byteLength + 5, 16),
    );
  };

  const encryptString = (objectId: number, value: string) =>
    hexString(rc4(objectKey(objectId), latin1(value)));

  const objects = new Map<number, Buffer>();
  objects.set(1, latin1("<< /Type /Catalog /Pages 2 0 R >>"));
  objects.set(2, latin1("<< /Type /Pages /Kids [4 0 R] /Count 1 >>"));
  objects.set(
    3,
    latin1(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ),
  );
  objects.set(
    4,
    latin1(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
    ),
  );
  const stream = latin1(`BT /F1 18 Tf 72 720 Td (${escapeText(text)}) Tj ET\n`);
  const cipherStream = rc4(objectKey(5), stream);
  objects.set(
    5,
    Buffer.concat([
      latin1(`<< /Length ${stream.byteLength} >>\nstream\n`),
      cipherStream,
      latin1("\nendstream"),
    ]),
  );
  objects.set(
    encryptionId,
    latin1(
      `<< /Filter /Standard /V 1 /R 2 /O ${hexString(ownerEntry)} ` +
        `/U ${hexString(userEntry)} /P ${permissions} >>`,
    ),
  );
  // Der Katalog trägt einen tatsächlich verschlüsselten Zeichenkettenwert, um
  // die Stringentschlüsselung mitzprüfen.
  objects.set(
    1,
    latin1(
      `<< /Type /Catalog /Pages 2 0 R /Lang ${encryptString(1, "de-DE")} >>`,
    ),
  );

  return assemble(
    objects,
    1,
    `/Encrypt ${encryptionId} 0 R /ID [${hexString(documentId)} ${hexString(documentId)}]`,
  );
};

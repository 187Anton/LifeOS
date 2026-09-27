import assert from "node:assert/strict";
import test from "node:test";

import type {
  DocumentParagraphLocator,
  DocumentSlideLocator,
} from "@lifeos/contracts";

import { extractOoxmlDocumentText } from "../src/modules/knowledge/ooxml-extractor.js";
import {
  buildDocx,
  buildPptx,
  buildZip,
  corruptCentralDirectory,
  entryText,
  macroContentTypes,
  patchFirstCentralDirectoryEntry,
  vbaProjectEntry,
  withDeclaredEntryCount,
  type ZipFixtureEntry,
} from "./ooxml-fixtures.js";

/**
 * Paket 8: lokale OOXML-Extraktion.
 *
 * Geprüft werden gültige Fälle, Fundstellen und ihre Einheit, erkennbare
 * Abschnitte, leere Inhalte, fehlerhaftes XML, Makros, externe Beziehungen,
 * DTD/Entities sowie die Sicherheitsgrenzen des ZIP-Lesers – jeweils vor dem
 * Entpacken.
 */

const slides = (outcome: ReturnType<typeof extractOoxmlDocumentText>) =>
  outcome.locators as DocumentSlideLocator[];

const paragraphs = (outcome: ReturnType<typeof extractOoxmlDocumentText>) =>
  outcome.locators as DocumentParagraphLocator[];

test("liest PPTX-Folien in Beziehungsreihenfolge und nicht in Dateinamenreihenfolge", () => {
  const archive = buildPptx({
    slides: [
      { fileName: "slide9.xml", paragraphs: ["Erste Folie: Quantenplanung"] },
      { fileName: "slide2.xml", paragraphs: ["Zweite Folie: Nebenrechnung"] },
      { fileName: "slide10.xml", paragraphs: ["Dritte Folie: Abschluss"] },
    ],
  });
  const outcome = extractOoxmlDocumentText("pptx", archive);
  assert.equal(outcome.status, "available");
  assert.equal(outcome.errorCode, null);
  assert.equal(outcome.locatorCount, 3);
  assert.deepEqual(
    slides(outcome).map((locator) => locator.slide),
    [1, 2, 3],
  );
  assert.match(slides(outcome)[0]!.text, /Quantenplanung/);
  assert.match(slides(outcome)[2]!.text, /Abschluss/);
  // Eine Folie ist nie eine Seitenangabe.
  assert.equal(Object.hasOwn(slides(outcome)[0]!, "page"), false);
});

test("liefert bei etablierter Reihenfolge stabile Foliennummern über mehrere Läufe", () => {
  const archive = buildPptx({
    slides: [
      { fileName: "slide9.xml", paragraphs: ["A"] },
      { fileName: "slide2.xml", paragraphs: ["B"] },
    ],
  });
  const first = extractOoxmlDocumentText("pptx", archive);
  const second = extractOoxmlDocumentText("pptx", archive);
  assert.deepEqual(first.locators, second.locators);
});

test("nennt nur sichtbare Folientexte und nie Notizfolieninhalte", () => {
  const archive = buildPptx({
    slides: [{ fileName: "slide1.xml", paragraphs: ["Sichtbarer Titel"] }],
    notes: [
      {
        fileName: "notesSlide1.xml",
        paragraphs: ["Interne Dozentennotiz"],
      },
    ],
  });
  const outcome = extractOoxmlDocumentText("pptx", archive);
  const text = slides(outcome)
    .map((locator) => locator.text)
    .join("\n");
  assert.match(text, /Sichtbarer Titel/);
  assert.doesNotMatch(text, /Dozentennotiz/);
});

test("zählt leere Folien mit, veröffentlicht sie aber nicht", () => {
  const archive = buildPptx({
    slides: [
      { fileName: "slide1.xml", paragraphs: ["Inhalt"] },
      { fileName: "slide2.xml", paragraphs: [] },
      { fileName: "slide3.xml", paragraphs: ["Weiterer Inhalt"] },
    ],
  });
  const outcome = extractOoxmlDocumentText("pptx", archive);
  assert.equal(outcome.locatorCount, 3);
  assert.deepEqual(
    slides(outcome).map((locator) => locator.slide),
    [1, 3],
  );
});

test("meldet einen textfreien Foliensatz als no_text ohne Fundstellen", () => {
  const archive = buildPptx({
    slides: [{ fileName: "slide1.xml", paragraphs: [] }],
  });
  const outcome = extractOoxmlDocumentText("pptx", archive);
  assert.equal(outcome.status, "no_text");
  assert.equal(outcome.errorCode, null);
  assert.deepEqual(outcome.locators, []);
});

test("liest DOCX-Absätze in Dokumentreihenfolge mit stabiler Absatznummer", () => {
  const archive = buildDocx({
    paragraphs: [
      { text: "Einleitung" },
      { empty: true },
      { text: "Hauptteil" },
      { text: "Schluss" },
    ],
  });
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "available");
  // Auch der leere Absatz zählt, damit die Nummerierung stabil bleibt.
  assert.equal(outcome.locatorCount, 4);
  assert.deepEqual(
    paragraphs(outcome).map((locator) => locator.paragraph),
    [1, 3, 4],
  );
});

test("nennt für DOCX niemals eine Seitenzahl", () => {
  const archive = buildDocx({ paragraphs: [{ text: "Nur Absätze" }] });
  const outcome = extractOoxmlDocumentText("docx", archive);
  const locator = paragraphs(outcome)[0]!;
  assert.equal(Object.hasOwn(locator, "page"), false);
  assert.equal(Object.hasOwn(locator, "slide"), false);
  assert.deepEqual(Object.keys(locator).sort(), [
    "paragraph",
    "section",
    "text",
  ]);
});

test("erkennt Überschriftabsätze und ordnet Folgeabsätze dem Abschnitt zu", () => {
  const archive = buildDocx({
    paragraphs: [
      { text: "Kapitel Eins", style: "Heading1" },
      { text: "Absatz unter Kapitel Eins" },
      { text: "Unterkapitel", style: "berschrift2" },
      { text: "Absatz unter dem Unterkapitel" },
      { text: "Titelseite", style: "Title" },
      { text: "Weiterer Absatz" },
    ],
  });
  const outcome = extractOoxmlDocumentText("docx", archive);
  const found = paragraphs(outcome);
  assert.deepEqual(
    found.map((locator) => locator.section),
    [
      "Kapitel Eins",
      "Kapitel Eins",
      "Unterkapitel",
      "Unterkapitel",
      "Titelseite",
      "Titelseite",
    ],
  );
});

test("erkennt Abschnitte auch über die Gliederungsebene", () => {
  const archive = buildDocx({
    paragraphs: [
      { text: "Gliederungsüberschrift", outline: 0 },
      { text: "Gliederungsabsatz" },
    ],
  });
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(paragraphs(outcome)[1]!.section, "Gliederungsüberschrift");
});

test("übernimmt vor der ersten Überschrift keinen erfundenen Abschnitt", () => {
  const archive = buildDocx({
    paragraphs: [{ text: "Vorlauf" }, { text: "Absatz ohne Abschnitt" }],
  });
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.deepEqual(
    paragraphs(outcome).map((locator) => locator.section),
    [null, null],
  );
});

test("bläst Zeilenumbrüche und Leerraum im Absatztext auf eine lesbare Form", () => {
  const archive = buildDocx({
    paragraphs: [
      {
        raw: '<w:p><w:r><w:t>Erste Zeile</w:t></w:r><w:r><w:t xml:space="preserve"> Fortsetzung im selben Lauf</w:t></w:r></w:p>',
      },
      {
        raw: "<w:p><w:r><w:t>Zeile A</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>Zeile B</w:t></w:r></w:p>",
      },
    ],
  });
  const outcome = extractOoxmlDocumentText("docx", archive);
  const found = paragraphs(outcome);
  assert.equal(found[0]!.text, "Erste Zeile Fortsetzung im selben Lauf");
  assert.equal(found[1]!.text, "Zeile AZeile B");
});

test("lässt gelöschte Textläufe aus dem Haupttext heraus", () => {
  const archive = buildDocx({
    paragraphs: [
      {
        raw: "<w:p><w:del><w:r><w:delText>Entfernt</w:delText></w:r></w:del><w:ins><w:r><w:t>Eingefügt</w:t></w:r></w:ins></w:p>",
      },
    ],
  });
  const outcome = extractOoxmlDocumentText("docx", archive);
  const text = paragraphs(outcome)[0]!.text;
  assert.equal(text, "Eingefügt");
});

test("meldet ein dokument ohne Text als no_text", () => {
  const archive = buildDocx({ paragraphs: [{ empty: true }, { empty: true }] });
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "no_text");
  assert.equal(outcome.locatorCount, 2);
  assert.deepEqual(outcome.locators, []);
});

test("liest Kopf- und Fußzeilen sowie Fußnoten nicht mit", () => {
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:body>" +
    "<w:p><w:r><w:t>Haupttext</w:t></w:r></w:p>" +
    "<w:sectPr/></w:body></w:document>";
  const archive = buildDocx({
    paragraphs: [],
    documentXml: document,
    extraEntries: [
      entryText("word/footer1.xml"),
      entryText("word/footnotes.xml"),
      entryText("word/header1.xml"),
    ],
  });
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.locators.length, 1);
  assert.equal(paragraphs(outcome)[0]!.text, "Haupttext");
});

test("weist ein fehlerhaftes XML als invalid_xml aus", () => {
  const archive = buildDocx({
    paragraphs: [],
    documentXml:
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>',
  });
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "invalid_xml");
  assert.deepEqual(outcome.locators, []);
});

test("weist DTD- und Entity-Deklarationen ab", () => {
  const archive = buildDocx({
    paragraphs: [],
    documentXml:
      '<?xml version="1.0"?><!DOCTYPE w:document [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&xxe;</w:t></w:r></w:p></w:body></w:document>',
  });
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "dtd_rejected");
});

test("folgt externen Beziehungen nie und meldet sie nicht als Inhalt", () => {
  const archive = buildPptx({
    slides: [{ fileName: "slide1.xml", paragraphs: ["Sichtbar"] }],
    externalSlideRelationship: true,
  });
  const outcome = extractOoxmlDocumentText("pptx", archive);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "unexpected_content");
  assert.deepEqual(outcome.locators, []);
});

test("weist ein Makroprojekt im Archiv ab", () => {
  const archive = buildPptx({
    slides: [{ fileName: "slide1.xml", paragraphs: ["Inhalt"] }],
    extraEntries: [vbaProjectEntry()],
  });
  const outcome = extractOoxmlDocumentText("pptx", archive);
  assert.equal(outcome.status, "unsupported");
  assert.equal(outcome.errorCode, "macro_present");
});

test("weist einen makrofähigen Inhaltstyp ab, auch ohne Makroprojekt", () => {
  const archive = buildPptx({
    slides: [{ fileName: "slide1.xml", paragraphs: ["Inhalt"] }],
    contentTypes: macroContentTypes(),
  });
  const outcome = extractOoxmlDocumentText("pptx", archive);
  assert.equal(outcome.status, "unsupported");
  assert.equal(outcome.errorCode, "macro_present");
});

test("weist verschlüsselte Einträge als geschützt aus", () => {
  const archive = buildDocx({
    paragraphs: [{ text: "Geheim" }],
  });
  const encrypted = patchFirstCentralDirectoryEntry(
    archive,
    "flags",
    0x0001,
    2,
  );
  const outcome = extractOoxmlDocumentText("docx", encrypted);
  assert.equal(outcome.status, "protected");
  assert.equal(outcome.errorCode, "encrypted_zip");
});

test("weist ein beschädigtes Archiv ab, statt Text zu erfinden", () => {
  const damaged = buildDocx({
    paragraphs: [{ text: "Beschädigter Inhalt" }],
    corruptDocument: true,
  });
  const outcome = extractOoxmlDocumentText("docx", damaged);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "damaged_zip");
  assert.deepEqual(outcome.locators, []);
});

test("erkennt eine abweichende Prüfsumme als beschädigtes Archiv", () => {
  const archive = buildDocx({
    paragraphs: [],
    documentXml:
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Text</w:t></w:r></w:p></w:body></w:document>',
  });
  const patched = patchFirstCentralDirectoryEntry(
    archive,
    "crc",
    0x12345678,
    4,
  );
  const outcome = extractOoxmlDocumentText("docx", patched);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "damaged_zip");
});

test("erkennt eine kleinere angegebene Größe als Bombe", () => {
  const archive = buildDocx({
    paragraphs: [{ text: "y".repeat(20_000) }],
  });
  const patched = patchFirstCentralDirectoryEntry(
    archive,
    "uncompressedSize",
    8,
    4,
  );
  const outcome = extractOoxmlDocumentText("docx", patched);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "damaged_zip");
});

test("weist Pfadtraversal ab", () => {
  const archive = buildZip([
    entryText("[Content_Types].xml"),
    entryText("../ausserhalb.xml"),
  ]);
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "unsafe_zip_path");
});

test("weist absolute Pfade ab", () => {
  const archive = buildZip([
    entryText("[Content_Types].xml"),
    entryText("/absolut.xml"),
  ]);
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "unsafe_zip_path");
});

test("weist doppelte Einträge ab, auch bei abweichender Schreibweise", () => {
  const archive = buildZip([
    entryText("[Content_Types].xml"),
    entryText("word/document.xml"),
    entryText("Word/Document.xml"),
  ]);
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "duplicate_zip_entry");
});

test("weist Symlinks im Archiv ab", () => {
  const archive = buildZip([
    entryText("[Content_Types].xml"),
    {
      name: "word/document.xml",
      data: Buffer.from("../etc/passwd", "utf8"),
      externalAttributes: 0xa1ff0000,
    },
  ]);
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "unsafe_zip_path");
});

test("weist Backslash-Pfade ab", () => {
  const archive = buildZip([
    entryText("[Content_Types].xml"),
    entryText("word\\document.xml"),
  ]);
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "unsafe_zip_path");
});

test("weist ein unzulässiges Kompressionsverfahren ab", () => {
  const archive = buildDocx({ paragraphs: [{ text: "Inhalt" }] });
  const patched = patchFirstCentralDirectoryEntry(archive, "method", 14, 2);
  const outcome = extractOoxmlDocumentText("docx", patched);
  assert.equal(outcome.status, "unsupported");
  assert.equal(outcome.errorCode, "unsupported_zip");
});

test("weist ZIP64-Markierungen ab", () => {
  const archive = buildDocx({ paragraphs: [{ text: "Inhalt" }] });
  const patched = patchFirstCentralDirectoryEntry(
    archive,
    "localHeaderOffset",
    0xffffffff,
    4,
  );
  const outcome = extractOoxmlDocumentText("docx", patched);
  assert.equal(outcome.status, "unsupported");
  assert.equal(outcome.errorCode, "unsupported_zip");
});

test("weist einen verstümmelten Verzeichniseintrag ab", () => {
  const archive = buildDocx({ paragraphs: [{ text: "Inhalt" }] });
  const outcome = extractOoxmlDocumentText(
    "docx",
    corruptCentralDirectory(archive),
  );
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "invalid_zip");
});

test("weist eine abweichend angegebene Eintragszahl ab", () => {
  const archive = buildDocx({ paragraphs: [{ text: "Inhalt" }] });
  const outcome = extractOoxmlDocumentText(
    "docx",
    withDeclaredEntryCount(archive, 40),
  );
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "invalid_zip");
});

test("erzwingt das Eintragslimit vor dem Entpacken", () => {
  const archive = buildDocx({ paragraphs: [{ text: "Inhalt" }] });
  const outcome = extractOoxmlDocumentText("docx", archive, {
    limits: { maxEntries: 2 },
  });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "zip_entry_limit");
});

test("erzwingt die Grenze der komprimierten Gesamtgröße", () => {
  const archive = buildDocx({ paragraphs: [{ text: "Inhalt" }] });
  const outcome = extractOoxmlDocumentText("docx", archive, {
    limits: { maxCompressedBytes: 32 },
  });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "zip_size_limit");
});

test("erzwingt die Grenze eines einzelnen Eintrags", () => {
  const archive = buildDocx({ paragraphs: [{ text: "Inhalt" }] });
  const outcome = extractOoxmlDocumentText("docx", archive, {
    limits: { maxEntryBytes: 64 },
  });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "zip_size_limit");
});

test("erzwingt die Grenze der entpackten Gesamtgröße", () => {
  const archive = buildDocx({ paragraphs: [{ text: "Inhalt" }] });
  const outcome = extractOoxmlDocumentText("docx", archive, {
    limits: { maxTotalUncompressedBytes: 512 },
  });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "zip_size_limit");
});

test("erzwingt das Kompressionsverhältnis als Bombenschutz", () => {
  const archive = buildDocx({ paragraphs: [{ text: "z".repeat(5_000) }] });
  const outcome = extractOoxmlDocumentText("docx", archive, {
    limits: { maxCompressionRatio: 1 },
  });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "zip_size_limit");
});

test("erzwingt die Grenze eines einzelnen XML-Teils", () => {
  const archive = buildDocx({ paragraphs: [{ text: "Inhalt" }] });
  const outcome = extractOoxmlDocumentText("docx", archive, {
    limits: { maxPartBytes: 64 },
  });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "zip_size_limit");
});

test("erzwingt die Grenze der gesamten XML-Menge", () => {
  const archive = buildDocx({ paragraphs: [{ text: "Inhalt" }] });
  const outcome = extractOoxmlDocumentText("docx", archive, {
    limits: { maxXmlBytes: 100 },
  });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "zip_size_limit");
});

test("kürzt Folien oberhalb des Fundstellenlimits nachvollziehbar", () => {
  const archive = buildPptx({
    slides: [
      { fileName: "slide1.xml", paragraphs: ["Eins"] },
      { fileName: "slide2.xml", paragraphs: ["Zwei"] },
      { fileName: "slide3.xml", paragraphs: ["Drei"] },
    ],
  });
  const outcome = extractOoxmlDocumentText("pptx", archive, {
    limits: { maxLocators: 2 },
  });
  assert.equal(outcome.status, "available");
  assert.equal(outcome.truncated, true);
  assert.deepEqual(
    slides(outcome).map((locator) => locator.slide),
    [1, 2],
  );
  // Die Gesamtzahl der Folien bleibt trotz Kürzung nachvollziehbar.
  assert.equal(outcome.locatorCount, 3);
});

test("kürzt Absätze oberhalb der Textgrenze nachvollziehbar", () => {
  const archive = buildDocx({
    paragraphs: [
      { text: "a".repeat(600) },
      { text: "b".repeat(600) },
      { text: "c".repeat(600) },
    ],
  });
  const outcome = extractOoxmlDocumentText("docx", archive, {
    limits: { maxTextBytes: 1_000 },
  });
  assert.equal(outcome.truncated, true);
  assert.equal(outcome.locators.length, 1);
});

test("kürzt sehr lange Abschnittsüberschriften auf eine feste Länge", () => {
  const archive = buildDocx({
    paragraphs: [
      { text: "Ü".repeat(900), style: "Heading1" },
      { text: "Absatz" },
    ],
  });
  const outcome = extractOoxmlDocumentText("docx", archive, {
    limits: { maxSectionLength: 20 },
  });
  assert.equal(paragraphs(outcome)[1]!.section, "Ü".repeat(20));
});

test("weist einen Inhalt ohne ZIP-Kennung ab", () => {
  const outcome = extractOoxmlDocumentText(
    "docx",
    Buffer.from("kein Archiv", "utf8"),
  );
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "invalid_zip");
});

test("weist ein ZIP ohne OOXML-Kennung ab", () => {
  const archive = buildZip([entryText("notizen.txt")]);
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "unsupported");
  assert.equal(outcome.errorCode, "unexpected_content");
});

test("weist ein Archiv ohne Hauptteilbeziehung ab", () => {
  const archive = buildZip([
    entryText("[Content_Types].xml"),
    entryText("word/document.xml"),
  ]);
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "unexpected_content");
});

test("weist ein Archiv mit unbekannter Hauptteilbeziehung ab", () => {
  const archive = buildZip([
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
        "utf8",
      ),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/fehlt.xml"/></Relationships>',
        "utf8",
      ),
    },
  ] satisfies ZipFixtureEntry[]);
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "unexpected_content");
});

test("liest einen gespeicherten Eintrag ohne Kompression korrekt", () => {
  const archive = buildZip([
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        "utf8",
      ),
      method: 0,
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        "utf8",
      ),
      method: 0,
    },
    {
      name: "word/document.xml",
      data: Buffer.from(
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Gespeichert</w:t></w:r></w:p></w:body></w:document>',
        "utf8",
      ),
      method: 0,
    },
  ]);
  const outcome = extractOoxmlDocumentText("docx", archive);
  assert.equal(outcome.status, "available");
  assert.equal(paragraphs(outcome)[0]!.text, "Gespeichert");
});

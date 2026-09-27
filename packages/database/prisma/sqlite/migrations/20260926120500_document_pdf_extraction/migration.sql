-- Paket 7: Dokumentgebundener Extraktionsstatus für die lokale
-- PDF-Textextraktion. Es entsteht kein zweiter Dokumentenspeicher und kein
-- separater Suchindex: Status, Quellprüfsumme, Extraktionsversion, Fehlercode
-- und seitenbezogene Fundstellen hängen ausschließlich am Dokument selbst.
--
-- Alle neuen Spalten sind additiv; die Tabelle "Document" wird nicht neu
-- aufgebaut und keine abhängige Zeile wird angefasst. Bestehende Zeilen bleiben
-- vollständig erhalten und erhalten den Standardstatus 'pending'. Der Lauf
-- benötigt deshalb kein foreign_keys = OFF.
--
-- Bestehende Text-Extraktionen ('extractedText') werden datenerhaltend als
-- Legacy-Extraktionen gekennzeichnet. Alte PDFs und alle übrigen Dateien ohne
-- Text bleiben bis zur Verarbeitung ausstehend.

ALTER TABLE "Document" ADD COLUMN "extractionStatus" TEXT NOT NULL DEFAULT 'pending' CHECK ("extractionStatus" IN ('pending', 'available', 'no_text', 'protected', 'unsupported', 'failed'));
ALTER TABLE "Document" ADD COLUMN "extractionVersion" TEXT CHECK ("extractionVersion" IS NULL OR length("extractionVersion") BETWEEN 1 AND 50);
ALTER TABLE "Document" ADD COLUMN "extractionSha256" TEXT CHECK ("extractionSha256" IS NULL OR (length("extractionSha256") = 64 AND lower("extractionSha256") = "extractionSha256" AND "extractionSha256" NOT GLOB '*[^0-9a-f]*'));
ALTER TABLE "Document" ADD COLUMN "extractionErrorCode" TEXT CHECK ("extractionErrorCode" IS NULL OR (length("extractionErrorCode") BETWEEN 1 AND 50 AND "extractionErrorCode" NOT GLOB '*[^a-z0-9_]*'));
ALTER TABLE "Document" ADD COLUMN "extractionPageCount" INTEGER CHECK ("extractionPageCount" IS NULL OR "extractionPageCount" >= 0);
ALTER TABLE "Document" ADD COLUMN "extractionTruncated" BOOLEAN NOT NULL DEFAULT false CHECK ("extractionTruncated" IN (0, 1));
ALTER TABLE "Document" ADD COLUMN "extractionPages" JSONB NOT NULL DEFAULT '[]' CHECK (json_valid("extractionPages") AND json_type("extractionPages") = 'array');
ALTER TABLE "Document" ADD COLUMN "extractedAt" DATETIME;

-- Datenerhaltende Kennzeichnung der vorhandenen Text-Extraktionen.
UPDATE "Document"
SET "extractionStatus" = 'available',
    "extractionVersion" = 'legacy-text-v1',
    "extractionSha256" = "sha256",
    "extractedAt" = "updatedAt"
WHERE "extractedText" IS NOT NULL;

BEGIN;

-- Paket 7: Dokumentgebundener Extraktionsstatus für die lokale
-- PDF-Textextraktion. Es entsteht kein zweiter Dokumentenspeicher und kein
-- separater Suchindex: Status, Quellprüfsumme, Extraktionsversion, Fehlercode
-- und seitenbezogene Fundstellen hängen ausschließlich am Dokument selbst.
--
-- Alle neuen Spalten sind additiv und datenerhaltend. Bestehende Zeilen bleiben
-- vollständig erhalten und erhalten den Standardstatus 'pending'.
--
-- Bestehende Text-Extraktionen ('extractedText' aus Paket 5) werden
-- datenerhaltend als Legacy-Extraktionen gekennzeichnet: Der Inhalt bleibt
-- unverändert, die Prüfsumme wird auf die aktuelle Quelldatei bezogen und die
-- Version 'legacy-text-v1' macht die Herkunft nachvollziehbar. Alte PDFs und
-- alle übrigen Dateien ohne Text bleiben bis zur Verarbeitung ausstehend.

CREATE TYPE "DocumentExtractionStatus" AS ENUM ('pending', 'available', 'no_text', 'protected', 'unsupported', 'failed');

ALTER TABLE "Document" ADD COLUMN "extractionStatus" "DocumentExtractionStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "Document" ADD COLUMN "extractionVersion" VARCHAR(50);
ALTER TABLE "Document" ADD COLUMN "extractionSha256" CHAR(64);
ALTER TABLE "Document" ADD COLUMN "extractionErrorCode" VARCHAR(50);
ALTER TABLE "Document" ADD COLUMN "extractionPageCount" INTEGER;
ALTER TABLE "Document" ADD COLUMN "extractionTruncated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Document" ADD COLUMN "extractionPages" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Document" ADD COLUMN "extractedAt" TIMESTAMPTZ(3);

-- Die Datenbank sichert die Grenzen der neuen Felder selbst ab.
ALTER TABLE "Document" ADD CONSTRAINT "Document_extraction_sha_check" CHECK ("extractionSha256" IS NULL OR "extractionSha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "Document" ADD CONSTRAINT "Document_extraction_error_code_check" CHECK ("extractionErrorCode" IS NULL OR "extractionErrorCode" ~ '^[a-z0-9_]{1,50}$');
ALTER TABLE "Document" ADD CONSTRAINT "Document_extraction_page_count_check" CHECK ("extractionPageCount" IS NULL OR "extractionPageCount" >= 0);
ALTER TABLE "Document" ADD CONSTRAINT "Document_extraction_pages_check" CHECK (jsonb_typeof("extractionPages") = 'array');
ALTER TABLE "Document" ADD CONSTRAINT "Document_extraction_available_check" CHECK ("extractionStatus" <> 'available' OR "extractionVersion" IS NOT NULL);

-- Datenerhaltende Kennzeichnung der vorhandenen Text-Extraktionen.
UPDATE "Document"
SET "extractionStatus" = 'available',
    "extractionVersion" = 'legacy-text-v1',
    "extractionSha256" = "sha256",
    "extractedAt" = "updatedAt"
WHERE "extractedText" IS NOT NULL;

COMMIT;

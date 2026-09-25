BEGIN;

-- Paket 4: Optionaler, besitzgebundener Studienmodulbezug an der Aufgabe.
-- Bestehende Aufgaben bleiben unverändert gültig und behalten den Wert NULL.
-- Der zusammengesetzte Fremdschlüssel (studyModuleId, userId) erzwingt denselben
-- Besitzer in der Datenbank; ein Projektbezug darf zusätzlich bestehen.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "studyModuleId" UUID;

-- CreateIndex
CREATE INDEX "Task_studyModuleId_idx" ON "Task"("studyModuleId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_studyModuleId_userId_fkey" FOREIGN KEY ("studyModuleId", "userId") REFERENCES "StudyModule"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;

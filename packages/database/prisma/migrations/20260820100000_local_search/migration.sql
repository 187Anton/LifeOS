ALTER TABLE "Project" ADD COLUMN "searchEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StudyModule" ADD COLUMN "searchEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkProject" ADD COLUMN "searchEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Document" ADD COLUMN "extractedText" TEXT;

CREATE INDEX "Project_userId_searchEnabled_idx" ON "Project"("userId", "searchEnabled")
  WHERE "deletedAt" IS NULL AND "archivedAt" IS NULL;
CREATE INDEX "StudyModule_userId_searchEnabled_idx" ON "StudyModule"("userId", "searchEnabled")
  WHERE "archivedAt" IS NULL;
CREATE INDEX "WorkProject_userId_searchEnabled_idx" ON "WorkProject"("userId", "searchEnabled")
  WHERE "archivedAt" IS NULL;
CREATE INDEX "Note_userId_searchEnabled_idx" ON "Note"("userId", "searchEnabled")
  WHERE "deletedAt" IS NULL AND "archivedAt" IS NULL;
CREATE INDEX "Document_userId_searchEnabled_idx" ON "Document"("userId", "searchEnabled")
  WHERE "deletedAt" IS NULL AND "archivedAt" IS NULL;

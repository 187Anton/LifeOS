ALTER TABLE "Project" ADD COLUMN "searchEnabled" INTEGER NOT NULL DEFAULT 0 CHECK ("searchEnabled" IN (0, 1));
ALTER TABLE "StudyModule" ADD COLUMN "searchEnabled" INTEGER NOT NULL DEFAULT 0 CHECK ("searchEnabled" IN (0, 1));
ALTER TABLE "WorkProject" ADD COLUMN "searchEnabled" INTEGER NOT NULL DEFAULT 0 CHECK ("searchEnabled" IN (0, 1));
ALTER TABLE "Document" ADD COLUMN "extractedText" TEXT;

CREATE INDEX "Project_userId_searchEnabled_idx" ON "Project"("userId", "searchEnabled") WHERE "deletedAt" IS NULL AND "archivedAt" IS NULL;
CREATE INDEX "StudyModule_userId_searchEnabled_idx" ON "StudyModule"("userId", "searchEnabled") WHERE "archivedAt" IS NULL;
CREATE INDEX "WorkProject_userId_searchEnabled_idx" ON "WorkProject"("userId", "searchEnabled") WHERE "archivedAt" IS NULL;
CREATE INDEX "Note_userId_searchEnabled_idx" ON "Note"("userId", "searchEnabled") WHERE "deletedAt" IS NULL AND "archivedAt" IS NULL;
CREATE INDEX "Document_userId_searchEnabled_idx" ON "Document"("userId", "searchEnabled") WHERE "deletedAt" IS NULL AND "archivedAt" IS NULL;

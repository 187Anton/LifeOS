CREATE TABLE "Note" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "projectId" UUID,
  "studyModuleId" UUID,
  "title" VARCHAR(500) NOT NULL,
  "content" TEXT NOT NULL,
  "format" VARCHAR(20) NOT NULL DEFAULT 'markdown',
  "category" VARCHAR(200),
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "version" INTEGER NOT NULL DEFAULT 1,
  "searchEnabled" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMPTZ(3),
  "deletedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Note_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Note_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "Note_format_check" CHECK ("format" = 'markdown'),
  CONSTRAINT "Note_tags_check" CHECK (cardinality("tags") <= 20 AND array_position("tags", '') IS NULL),
  CONSTRAINT "Note_version_check" CHECK ("version" > 0),
  CONSTRAINT "Note_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "Note_delete_check" CHECK ("deletedAt" IS NULL OR "deletedAt" >= "createdAt")
);

CREATE TABLE "NoteVersion" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "noteId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "title" VARCHAR(500) NOT NULL,
  "content" TEXT NOT NULL,
  "category" VARCHAR(200),
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoteVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NoteVersion_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "NoteVersion_tags_check" CHECK (cardinality("tags") <= 20 AND array_position("tags", '') IS NULL),
  CONSTRAINT "NoteVersion_version_check" CHECK ("version" > 0)
);

CREATE TABLE "Document" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "projectId" UUID,
  "studyModuleId" UUID,
  "storageKey" VARCHAR(255) NOT NULL,
  "fileName" VARCHAR(500) NOT NULL,
  "mimeType" VARCHAR(255) NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "modifiedAt" TIMESTAMPTZ(3) NOT NULL,
  "searchEnabled" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMPTZ(3),
  "deletedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Document_storage_key_check" CHECK ("storageKey" ~ '^[0-9a-f-]{36}[.][a-z0-9]{1,16}$'),
  CONSTRAINT "Document_file_name_check" CHECK (length(btrim("fileName")) > 0),
  CONSTRAINT "Document_mime_check" CHECK (length(btrim("mimeType")) > 0),
  CONSTRAINT "Document_size_check" CHECK ("byteSize" >= 0 AND "byteSize" <= 26214400),
  CONSTRAINT "Document_sha_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "Document_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "Document_delete_check" CHECK ("deletedAt" IS NULL OR "deletedAt" >= "createdAt")
);

CREATE UNIQUE INDEX "Note_id_userId_key" ON "Note"("id", "userId");
CREATE INDEX "Note_userId_deletedAt_archivedAt_idx" ON "Note"("userId", "deletedAt", "archivedAt");
CREATE INDEX "Note_projectId_idx" ON "Note"("projectId");
CREATE INDEX "Note_studyModuleId_idx" ON "Note"("studyModuleId");
CREATE UNIQUE INDEX "NoteVersion_noteId_version_key" ON "NoteVersion"("noteId", "version");
CREATE INDEX "NoteVersion_userId_noteId_idx" ON "NoteVersion"("userId", "noteId");
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");
CREATE UNIQUE INDEX "Document_id_userId_key" ON "Document"("id", "userId");
CREATE INDEX "Document_userId_deletedAt_archivedAt_idx" ON "Document"("userId", "deletedAt", "archivedAt");
CREATE INDEX "Document_projectId_idx" ON "Document"("projectId");
CREATE INDEX "Document_studyModuleId_idx" ON "Document"("studyModuleId");

ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "Project"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_studyModuleId_userId_fkey" FOREIGN KEY ("studyModuleId", "userId") REFERENCES "StudyModule"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_noteId_userId_fkey" FOREIGN KEY ("noteId", "userId") REFERENCES "Note"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "Project"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_studyModuleId_userId_fkey" FOREIGN KEY ("studyModuleId", "userId") REFERENCES "StudyModule"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Project_title_check" CHECK (length(btrim("title")) > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_id_userId_key" ON "Project"("id", "userId");

-- CreateIndex
CREATE INDEX "Project_userId_archivedAt_idx"
ON "Project"("userId", "archivedAt");

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- The composite relation prevents a task from using another user's project.
ALTER TABLE "Task"
ADD CONSTRAINT "Task_projectId_userId_fkey"
FOREIGN KEY ("projectId", "userId") REFERENCES "Project"("id", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddColumn: status to StudentGuardian for soft-delete support
ALTER TABLE "StudentGuardian" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- Index for efficient active guardian lookups per student
CREATE INDEX "StudentGuardian_studentId_status_idx" ON "StudentGuardian"("studentId", "status");

-- AddColumn: StudentAttendance.isVoided for soft-delete support
ALTER TABLE "StudentAttendance" ADD COLUMN "isVoided" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "StudentAttendance_isVoided_idx" ON "StudentAttendance"("isVoided");

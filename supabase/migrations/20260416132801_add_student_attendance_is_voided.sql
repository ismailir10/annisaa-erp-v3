ALTER TABLE "StudentAttendance" ADD COLUMN IF NOT EXISTS "isVoided" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'StudentAttendance') THEN
    CREATE INDEX IF NOT EXISTS "StudentAttendance_isVoided_idx" ON "StudentAttendance"("isVoided");
  END IF;
END $$;

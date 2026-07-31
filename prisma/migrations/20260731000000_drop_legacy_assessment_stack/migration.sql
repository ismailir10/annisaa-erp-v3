-- Retire the legacy 4-level (BB/MB/BSH/BSB) assessment stack.
--
-- Decision: 2026-05-20 curriculum-cutover-prep cycle, AC7 = ABANDON —
-- fresh-start cutover, no carry-over data, no backfill script. The
-- deletion was scheduled for a `feat/jul-2026-cutover` cycle that never
-- ran; this migration executes it.
--
-- Superseded by:
--   AssessmentTemplate/Category/Indicator -> curriculum spine
--     (LearningObjective -> AchievementIndicator -> IndicatorThemeLink)
--   StudentAssessment/Score              -> AssessmentEntry (3-level) and
--                                           ReportCardEntry (raport)
--
-- The last parent-facing read of these tables was dropped in the
-- 2026-06-16 parent-raport fix; the last write path (POST
-- /api/assessments/student/[id]) is deleted in this same commit.
--
-- Data note: production holds ZERO rows in all five tables (never seeded
-- with real content — see the 2026-07-27 prod journal seed). Staging holds
-- only demo rows created by prisma/seed.ts, whose "(Demo)" template is
-- removed in this commit. Nothing of record value is lost.
--
-- Drop order follows the FK graph leaves-first so no CASCADE is needed.

DROP TABLE IF EXISTS "StudentAssessmentScore";
DROP TABLE IF EXISTS "StudentAssessment";
DROP TABLE IF EXISTS "AssessmentIndicator";
DROP TABLE IF EXISTS "AssessmentCategory";
DROP TABLE IF EXISTS "AssessmentTemplate";

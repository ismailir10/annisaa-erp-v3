-- Deduplicate AssessmentTemplate rows and enforce composite uniqueness.
-- Bug: POST /api/assessments/templates had no uniqueness check; reseeds and
-- double-submits could create N copies of the same (tenant, program, name, type).
-- This migration (a) picks a survivor per group, (b) reparents or drops dependent
-- rows, (c) deletes duplicate templates, and (d) adds the unique index.
--
-- Survivor selection: template with the most StudentAssessment rows wins;
-- tiebreak on lowest id (cuid is lex-ordered by creation time ≈ oldest).

-- Step 1: Identify survivors.
CREATE TEMP TABLE _assessment_template_survivors AS
SELECT DISTINCT ON ("tenantId", "programId", "name", "type")
  t.id AS survivor_id,
  t."tenantId",
  t."programId",
  t."name",
  t."type"
FROM "AssessmentTemplate" t
LEFT JOIN (
  SELECT "templateId", COUNT(*)::bigint AS cnt
  FROM "StudentAssessment"
  GROUP BY "templateId"
) sa ON sa."templateId" = t.id
ORDER BY
  t."tenantId", t."programId", t."name", t."type",
  COALESCE(sa.cnt, 0) DESC,
  t.id ASC;

-- Step 2: Map each duplicate row to its survivor.
CREATE TEMP TABLE _assessment_template_dupes AS
SELECT t.id AS dup_id, s.survivor_id
FROM "AssessmentTemplate" t
JOIN _assessment_template_survivors s
  ON s."tenantId"  = t."tenantId"
 AND s."programId" = t."programId"
 AND s."name"      = t."name"
 AND s."type"      = t."type"
WHERE t.id <> s.survivor_id;

-- Step 3a: Drop scores belonging to StudentAssessment rows that would collide
-- with the survivor on (studentId, templateId, period) after reparenting.
DELETE FROM "StudentAssessmentScore"
WHERE "assessmentId" IN (
  SELECT dsa.id
  FROM "StudentAssessment" dsa
  JOIN _assessment_template_dupes d ON d.dup_id = dsa."templateId"
  WHERE EXISTS (
    SELECT 1 FROM "StudentAssessment" ssa
    WHERE ssa."templateId" = d.survivor_id
      AND ssa."studentId"  = dsa."studentId"
      AND ssa."period"     = dsa."period"
  )
);

-- Step 3b: Drop the colliding StudentAssessment rows themselves.
DELETE FROM "StudentAssessment" dsa
USING _assessment_template_dupes d
WHERE dsa."templateId" = d.dup_id
  AND EXISTS (
    SELECT 1 FROM "StudentAssessment" ssa
    WHERE ssa."templateId" = d.survivor_id
      AND ssa."studentId"  = dsa."studentId"
      AND ssa."period"     = dsa."period"
  );

-- Step 3c: Reparent the remaining StudentAssessment rows to the survivor.
UPDATE "StudentAssessment" sa
SET "templateId" = d.survivor_id
FROM _assessment_template_dupes d
WHERE sa."templateId" = d.dup_id;

-- Step 4a: Drop scores under indicators under categories that would collide
-- with the survivor on (templateId, name).
DELETE FROM "StudentAssessmentScore"
WHERE "indicatorId" IN (
  SELECT ind.id
  FROM "AssessmentIndicator" ind
  WHERE ind."categoryId" IN (
    SELECT dcat.id
    FROM "AssessmentCategory" dcat
    JOIN _assessment_template_dupes d ON d.dup_id = dcat."templateId"
    WHERE EXISTS (
      SELECT 1 FROM "AssessmentCategory" scat
      WHERE scat."templateId" = d.survivor_id
        AND scat."name"       = dcat."name"
    )
  )
);

-- Step 4b: Drop the indicators of the colliding categories.
DELETE FROM "AssessmentIndicator"
WHERE "categoryId" IN (
  SELECT dcat.id
  FROM "AssessmentCategory" dcat
  JOIN _assessment_template_dupes d ON d.dup_id = dcat."templateId"
  WHERE EXISTS (
    SELECT 1 FROM "AssessmentCategory" scat
    WHERE scat."templateId" = d.survivor_id
      AND scat."name"       = dcat."name"
  )
);

-- Step 4c: Drop the colliding categories themselves.
DELETE FROM "AssessmentCategory" dcat
USING _assessment_template_dupes d
WHERE dcat."templateId" = d.dup_id
  AND EXISTS (
    SELECT 1 FROM "AssessmentCategory" scat
    WHERE scat."templateId" = d.survivor_id
      AND scat."name"       = dcat."name"
  );

-- Step 4d: Reparent the remaining categories to the survivor.
UPDATE "AssessmentCategory" c
SET "templateId" = d.survivor_id
FROM _assessment_template_dupes d
WHERE c."templateId" = d.dup_id;

-- Step 5: Delete duplicate AssessmentTemplate rows. By now they have no
-- StudentAssessment or AssessmentCategory children pointing at them.
DELETE FROM "AssessmentTemplate" t
USING _assessment_template_dupes d
WHERE t.id = d.dup_id;

-- Step 6: Enforce composite uniqueness.
CREATE UNIQUE INDEX "AssessmentTemplate_tenantId_programId_name_type_key"
  ON "AssessmentTemplate" ("tenantId", "programId", "name", "type");

-- Cleanup temp tables (explicit even though they are session-scoped).
DROP TABLE _assessment_template_survivors;
DROP TABLE _assessment_template_dupes;

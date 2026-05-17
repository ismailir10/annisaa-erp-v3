-- Cycle 2.1 — Admission Lifecycle Simplification (drop REGISTERED state).
-- See docs/cycles/2026-05-12-admission-lifecycle-simplification.md
--
-- Collapse the redundant ADMITTED ↔ REGISTERED distinction. Post-migration:
--   * status="ADMITTED" + studentId IS NULL → school said yes, no student yet
--   * status="ADMITTED" + studentId IS NOT NULL → converted (was REGISTERED)
-- The Admission.status column is TEXT (no Postgres enum); no DDL required.
-- Idempotent: re-running on a post-backfill DB matches 0 rows.
-- Demo DB: 1 row affected. Production: 0 rows (untouched since rollback).

UPDATE "Admission" SET status = 'ADMITTED' WHERE status = 'REGISTERED';

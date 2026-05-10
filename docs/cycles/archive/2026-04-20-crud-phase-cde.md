# CRUD Completion Phase 2 — Carry-forward (Phase C + D + E)

## Context

Parent cycle [2026-04-20-crud-completion-phase2.md](2026-04-20-crud-completion-phase2.md) (on `claude/zen-pare-06c941`) was split after staging diverged. The bug-fix portion (A2, A3, B3, B4) was rebuilt in [2026-04-20-assessment-bug-fix.md](2026-04-20-assessment-bug-fix.md) and shipped on its own branch. This stub carries forward the remaining phases:

- **Phase C** — close CRUD gaps on partial entities (missing `/[id]` routes for Holiday/LeaveRequest/AttendanceRecord/StudentAttendance/ProgramFeeStructure/TeachingAssignment; detail pages + row actions for top-level entities; nested-entity row actions; OrgConfig singleton; EmailLog read-only view).
- **Phase D** — vitest validator coverage sweep + Playwright smoke extensions.
- **Phase E** — README CRUD accounting repair, de-duplicate workflow content, update ADR + CI + trailer examples, **fix stale `/ship` skill (E3)** to reflect current PR-based-for-all-roles model.

The audit matrix (28 in-schema entities × 7 checks) from the parent cycle's Context section is the authoritative starting point. Most rows shifted since then (PR #71 closed several Phase C items implicitly for AssessmentTemplate; PR #72, #73, #74 may have touched doc hygiene). Before starting `/build` on this cycle, re-run the audit to get a fresh matrix — do not trust the pre-PR-#71 snapshot.

## Spec

To be written by a future `/spec` invocation once the bug-fix cycle has shipped and the audit matrix is refreshed. Copy-paste starting points from the parent cycle:

- Phase C spec: lines 76–97 of `2026-04-20-crud-completion-phase2.md`
- Phase D spec: lines 98–102
- Phase E spec: lines 103–105

## Tasks

To be written by a future `/spec` invocation. Starting points from the parent cycle:

- Phase C tasks: C1–C5 (lines 203–269)
- Phase D tasks: D1–D2 (lines 273–296)
- Phase E tasks: E1–E3 (lines 300–333)

**Explicit carry:** E3 must also fix `.claude/skills/ship/SKILL.md` to drop "cto pushes to staging directly" language. The current CLAUDE.md already states all roles use PR-based `/ship`; the skill file is the last stale surface.

## Implementation

<!-- Filled by /build when this cycle is activated -->

## Verification

<!-- Filled by /build when this cycle is activated -->

## Ship Notes

<!-- Filled by /ship when this cycle is activated -->

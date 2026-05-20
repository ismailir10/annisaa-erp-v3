# Slim ship gate — cut kesiswaan upload e2e bullshit

## Context

Yesterday's `/ship --to-staging` (PR #299 / cycle `2026-05-20-slim-ship-gate`) added Step 1c — a soft-skip delta gate against `origin/staging` — to catch new vacuous-green tests landing on the ship gate. Post-merge audit of `feat/kesiswaan-storage-supabase` (PR #298, merged as commit `1226bc26`) found two e2e specs that 100%-skip in CI via `test.skip(!SUPABASE_ENV_READY, ...)`: `e2e/admin-student-photo-upload.spec.ts` (new in #298) and `e2e/admin-guardian-document-upload.spec.ts` (PR #298 added the skip-guard to a pre-existing file). CI workflow at `.github/workflows/ci.yml` does NOT set `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`, so the gate fires 100% in CI — same anti-pattern as the 4 DEMO_MODE-gated admin.spec tests that yesterday's cycle deleted. Step 1c's regex missed it: it matches `test.skip(true,` and `process.env.DEMO_MODE === "true"` literals only, NOT dynamic env-conditional skips. Author intent was clear (skip message: *"preview-verify covers this surface"*) — they accepted that CI wouldn't run these. Coverage of the upload behaviour still lives in 4 vitest files (`storage.test`, `supabase.test`, photo `route.test`, ktp `route.test`). This cycle deletes the two vacuous-green e2e specs and widens Step 1c so the next env-conditional skip cannot slip through.

## Spec

### Acceptance criteria

- [ ] **e2e/admin-student-photo-upload.spec.ts**: DELETE. 146-LOC Playwright spec that 100%-skips in CI per `test.skip(!SUPABASE_ENV_READY, ...)` at line 61. Photo-upload route coverage retained via vitest at `app/api/students/[id]/photo/__tests__/route.test.ts`.
- [ ] **e2e/admin-guardian-document-upload.spec.ts**: DELETE. PR #298 added the same SUPABASE_ENV_READY skip-guard to this pre-existing spec; in CI it now skips 100%. KTP route coverage retained via vitest at `app/api/parents/[id]/ktp/__tests__/route.test.ts`.
- [ ] **.claude/skills/ship/SKILL.md Step 1c**: widen the `SKIP_REGEX` to also match dynamic env-conditional skips. Patterns to add:
  - `test\.skip\(\s*![A-Z_]+` — catches `test.skip(!SUPABASE_ENV_READY, …)` and similar `!ALL_CAPS` env flags.
  - `test\.skip\(.*process\.env\.` — catches inline `test.skip(process.env.FOO !== "bar", …)` patterns.
- [ ] **CLAUDE.md**: bump e2e count `29 → 27` in the File Structure block and remove `admin-student-photo-upload` + `admin-guardian-document-upload` from the alphabetical list so `/audit-docs` Check 4 stays green.
- [ ] **End-of-cycle gate**: `npm run build && npx vitest run` green (Playwright skipped — pure test-file deletions, no new behaviour to verify locally; CI runs full Playwright against fresh DB). New Step 1c regex self-check passes with delta ≤ 0 against the post-#298 `origin/staging` baseline.

### Non-goals

- Wiring `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` into CI to actually run upload e2e — author already delegated to preview-verify per the skip message; that's a separate scope (new Supabase secret + rotation policy) and not what this cycle exists to solve.
- Touching the 4 vitest test files PR #298 introduced — they're clean (no skips, no DEMO_MODE-equivalent gates, route tests mock `@/lib/storage` correctly).
- Tier-3 soft-skip epidemic (`test.skip(true, "No X seeded")` patterns across `admin.spec.ts`, `teacher.spec.ts`, etc.) — still grandfathered per yesterday's spec, not converting this cycle.

### Assumptions

1. Deleting these two e2e specs loses no CI signal — they 100%-skip in current CI. Verified: `.github/workflows/ci.yml` has zero `SUPABASE_*` env entries in the `e2e` job's `env:` block (lines 124-131).
2. Preview-verify (Chrome MCP) is the canonical surface for storage upload coverage — author of PR #298 already documented this intent in the skip message.
3. The 4 vitest route+adapter tests (storage, supabase, photo route, ktp route) cover the storage adapter and route handlers end-to-end against mocks. Spot-check: `lib/storage/__tests__/supabase.test.ts` exercises all 4 primitives with explicit env-var manipulation in `beforeAll`/`afterAll`.
4. Widening Step 1c's regex with `!ALL_CAPS` + `process.env.` patterns won't false-positive on legitimate test code — there's no existing test file that calls `test.skip(!SOME_FLAG, ...)` with non-bullshit intent in this repo (verified by running the new regex against current staging).
5. CLAUDE.md spec count 29 → 27 is correct after both deletes (29 - 2 = 27).

→ Correct any of these now or `/build` proceeds with them locked.

## Tasks

1. [x] **Delete `e2e/admin-student-photo-upload.spec.ts`**.
   - Acceptance: file removed; `find e2e -name "*.spec.ts" | wc -l` returns 28; CI workflow unaffected.
   - Independent.

2. [ ] **Delete `e2e/admin-guardian-document-upload.spec.ts`**.
   - Acceptance: file removed; `find e2e -name "*.spec.ts" | wc -l` returns 27; CI workflow unaffected.
   - Independent.

3. [ ] **Widen `.claude/skills/ship/SKILL.md` Step 1c SKIP_REGEX**.
   - Acceptance: regex matches `test.skip(!ALL_CAPS,` AND `test.skip(...process.env.,`; self-validation against current branch shows delta ≤ 0 vs `origin/staging` baseline.
   - Independent.

4. [ ] **Bump CLAUDE.md e2e count `29 → 27` + remove deleted file names from the list**.
   - Acceptance: `/audit-docs` Check 4 returns `claimed=27 actual=27 OK` post-edit.
   - Sequential after Tasks 1, 2.

5. [ ] **End-of-cycle gate + cycle-doc Verification + Ship Notes**.
   - Acceptance: `npm run build && npx vitest run` green; new Step 1c regex self-check passes; cycle doc Verification + Ship Notes filled.
   - Sequential after Tasks 1-4.

## Implementation

- Execution plan: 5 tasks sequential in this session (controller-driven, same pattern as yesterday's `slim-ship-gate` cycle); per-task `feature-dev:code-reviewer` agent pass required before each commit per CLAUDE.md /build rule 8. No `app/api/**` / `lib/auth*` / `middleware.ts` changes → no `superpowers:code-reviewer` security pass required.
- Task 1: deleted `e2e/admin-student-photo-upload.spec.ts` (146 LOC, single describe block, 100%-skipped in CI via `test.skip(!SUPABASE_ENV_READY, "...preview-verify covers this surface")` at line 61). Spec count: 29 → 28.

## Verification

- Task 1: between-task gate green. `npm run build` ok. `npx vitest run` → 189 passed | 2 skipped | 1874 tests | 42 todo | 31.68s. Vitest unaffected by Playwright-only delete (expected — `vitest.config.ts` excludes `e2e/**`).

## Ship Notes

<filled by /ship — migrations, env vars, manual steps, rollback plan>

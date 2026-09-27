# Teacher write rate limits — per user, sized for tap-per-student

## Context
Owner report (screenshot, staging): on **Absensi kelas**, tapping students to mark Hadir fails after about ten children with "Absensi belum tersimpan. Terlalu banyak permintaan" plus a toast, row by row. The page saves **one POST per tap** to `/api/student-attendance/mark`, but that route was limited to **10 requests/min per IP** — a budget sized for the old "submit the whole class" flow. A class of 15–30 children fails from the 11th tap. Worse, the bucket is keyed on IP: every teacher on the school Wi-Fi shares one NAT address, so two teachers marking at 07:30 throttle each other.

The same IP-keyed pattern sits on the other teacher write paths: `/api/teacher/sessions/[id]/attendance` (10/min/IP, one POST per Simpan) and the Penilaian writes `/api/teacher/assessment-entries{,/center}` (60/min/IP, one POST per tap).

## Spec
- [x] `/api/student-attendance/mark` authenticates first, then limits per signed-in user (`session.id`) at `ATTENDANCE_TAP_BUDGET` = 180/min. Unauthenticated requests still 401 before any DB write.
- [x] `/api/teacher/sessions/[id]/attendance` authenticates first, then limits per user at `SESSION_ATTENDANCE_SAVE_BUDGET` = 30/min.
- [x] `/api/teacher/assessment-entries` and `/center` key their existing 60/min budget on `session.id` instead of IP (they already authenticate first).
- [x] Budgets live in `lib/api/rate-limit-budgets.ts` with the reasoning.
- [x] Vitest with the **real** limiter: two teachers on one IP each tap a 30-child class → all 200; one user past the budget → 429; no session → 401.

### Non-goals
- Replacing the in-memory limiter with a shared store.
- Batching taps client-side or changing the attendance page UI/copy.
- Other IP-keyed routes (admin, public, payment) — IP is the right key where there is no session.

### Assumptions
1. 180 taps/min per user covers the largest class plus status corrections; a runaway client is still stopped.
2. The owner's "investigate and fix it" in chat is the Spec approval for this cycle (urgent staging bug), including self-merge to `staging` and verification on the staging URL.

## Tasks
- [x] **T1 — Per-user teacher write limits.** Budgets, four routes, regression test. *Accept:* new test fails on HEAD (tap 11 → 429) and passes after; gates green. *Depends on:* none.

## Implementation
- Subagent plan: driver=claude-opus-5-5, no subagents — one task, five files; fan-out costs more than it saves.
- Task 1: `lib/api/rate-limit-budgets.ts` gains `ATTENDANCE_TAP_BUDGET` (180/min) and `SESSION_ATTENDANCE_SAVE_BUDGET` (30/min) with the shared-Wi-Fi reasoning. `student-attendance/mark` and `teacher/sessions/[id]/attendance` now call `getSession()` first and key the bucket `…:${session.id}`; the two assessment-entry routes swap `getClientIp(req)` for `session.id`. New `app/api/__tests__/teacher-write-rate-limit.test.ts` uses the real in-memory limiter; on HEAD it fails with "bu-ani tap 11: expected 429 to be 200" — the reported bug.

## Verification
- Task 1: `npm run build` exit 0; `npx vitest run` 412 files passed / 2 skipped, 3816 tests passed; eslint clean on touched files. Regression test red on HEAD route (tap 11 → 429), green after.

- Playwright: local run deferred to CI (env cannot execute it — no local Postgres or Docker on this machine; `.env` points at hosted Supabase, which the e2e guard refuses).
  Required CI check `Playwright E2E` gates the merge; CTO will not merge on red.
- `bash scripts/audit-docs.sh` 13 ok / 1 warn (pre-existing ADR window) / 0 fail after `--write` refreshed the counts block (new test file).
- Soft-skip delta vs origin/staging: 0.
- Route: signed-in preview (local route unavailable — no local Postgres). Source SHA 03e59acb.
  - Baseline on staging (`annisaa-erp-v3-git-staging-…`, teacher account, DCARE, 2026-09-27): 14 idempotent re-saves of one Hadir row → `200×10, 429×4` — the reported bug.
  - Preview (`annisaa-erp-v3-git-feat-teache-4e2998-…`), signed in as the teacher account: tapped the six unmarked DCARE children in the UI → six "Absensi tersimpan", zero errors, all 8 rows PRESENT via `GET /api/student-attendance`; then 40 idempotent re-saves → all 200. No console errors. blockers=0, minors=0.

- Behaviour change: teachers are throttled per account, not per school IP. Marking a whole class by tapping no longer hits "Terlalu banyak permintaan".
- Rate-limit check moved after `getSession()` on the two attendance routes, so an unauthenticated request now 401s instead of 429ing; the limiter is no longer a pre-auth DoS shield there (auth is a cookie read; every other teacher route already works this way).
- No schema, dependency or UI change.

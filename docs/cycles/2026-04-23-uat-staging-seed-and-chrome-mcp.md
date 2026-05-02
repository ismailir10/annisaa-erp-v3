# UAT staging mode: default target, Chrome MCP, login accounts, seed script

## Context

`/uat` was specified to run against a local `DEMO_MODE=true npm run start` build using Playwright MCP with demo-cookie injection. That is fast but lies about two things: (1) Vercel cold-start + edge latency on the staging deployment, which is the real production proxy, and (2) the real Supabase magic-link / Google OAuth flow. We cannot measure the authentic experience against a local demo.

Parallel cycle `uat-jtbd-enrichment` (2026-04-18) already landed on staging with richer JTBD files (area-group invocation, role routing, perf metadata per job) and extended SKILL.md (seed-status preflight, scenario-prep endpoint). That enrichment stays — this cycle does not touch it.

This cycle adds three things on top:

1. **Default target = staging URL** — `https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app`. Operator can still fall back to a local `DEMO_MODE` build when explicitly asked.
2. **Chrome MCP as primary runner in staging mode** — Chrome MCP attaches to the operator's real Chrome profile and reuses the logged-in session per account, so the real auth flow is exercised. Playwright MCP remains the runner for local fallback.
3. **Three UAT login accounts per role**, reflected in both the SKILL and the seed script.

| Role | Email |
|---|---|
| Admin (`SUPER_ADMIN`) | `ismailir10@gmail.com` |
| Teacher (`TEACHER`) | `ismail10rabbanii@gmail.com` |
| Parent (`GUARDIAN`) | `rightjet.hq@gmail.com` |

And ships a **`prisma/seed-uat.ts`** that guarantees the target DB has the fixtures every existing JTBD needs (three UAT user accounts, fee structure, invoices in PENDING/OVERDUE/PAID, admissions in INQUIRY/REGISTERED, pending leave request, published assessment).

## Spec

### Acceptance criteria

- [x] `.claude/skills/uat/SKILL.md` declares staging URL as the default target, documents the three login emails per role, mandates Chrome MCP for staging-mode runs, and references the seed requirement
- [x] Existing SKILL.md sections (role routing, area groups, seed-status preflight, scenario prep, Playwright MCP local fallback) are preserved unchanged
- [x] `prisma/seed-uat.ts` exists, is idempotent, covers: three named UAT users with correct roles + Parent link, fee components + `ProgramFeeStructure` for TKIT + active year, 3 invoices (PENDING/OVERDUE/PAID with Payment row), 2 admissions (stale INQUIRY + REGISTERED), 1 PENDING LeaveRequest, 1 published `StudentAssessment`
- [x] `package.json` has `seed:uat` script
- [x] `npm run build && npx vitest run` passes

### Non-goals

- Rewriting JTBD files — the enrichment cycle already covers the essentials with richer metadata; wholesale rewrite would regress that work
- Real UAT run — this cycle retargets the tool; actual `/uat` sessions come later
- Seed run against staging — operator runs it once per env reset; not in cycle scope
- Programmatic login — magic link needs email round-trip and OAuth needs interactive consent; operator stays pre-signed-in in Chrome

## Tasks

- [x] 1. Additive edits to `.claude/skills/uat/SKILL.md` — inject "Default target + accounts", "Browser choice", "Seed requirement" sections after the intro, without removing existing content
- [x] 2. Write `prisma/seed-uat.ts` idempotent UAT seed (users, parent link, fees, invoices, admissions, leave, assessment)
- [x] 3. Add `seed:uat` to `package.json`
- [x] 4. Typecheck seed-uat against generated Prisma client
- [x] 5. End-of-cycle gate (build + vitest)

## Implementation

### Task 1: SKILL.md additive edits

Injected three new sections between the intro paragraph and the existing "## Invocation" heading. No existing section or feature removed:
- **Default target + accounts (staging mode)** — staging URL, three-account table
- **Browser choice — Chrome MCP primary in staging mode** — Chrome MCP as primary for staging, Playwright MCP kept for local fallback; preflight uses `read_page` / `get_page_text` to verify the logged-in email matches the expected account; no programmatic login
- **Seed requirement** — points at `prisma/seed-uat.ts` / `npm run seed:uat`

### Task 2: UAT seed script

`prisma/seed-uat.ts` — new file, idempotent, runs against `DATABASE_URL` via `PrismaPg` adapter. Structure:

1. Resolve tenant + active academic year + TKIT program + any active employee + first 2 active students — throw if baseline seed has not run
2. Upsert three users by email with correct roles; link TEACHER user to an employee via `employeeId`, link GUARDIAN user to a Parent row via `parentId`
3. Create Parent row for `rightjet.hq@gmail.com`, upsert `StudentGuardian` rows linking to 2 students (primary + secondary, `childOrder` 1 + 2)
4. Upsert 4 `FeeComponentDef` rows (spp, uang_pangkal, seragam, kegiatan); upsert 4 `ProgramFeeStructure` rows for TKIT × active year (amounts: 850k, 5M, 750k, 250k)
5. Create 3 invoices for primary child if absent: `SENT` (due +7d, SPP + kegiatan), `OVERDUE` (due −14d, SPP), `PAID` (due −45d, SPP, with matching Payment row)
6. Create 2 admissions: `INQUIRY` (stale followUpDate −30d) and `REGISTERED` (+7d)
7. Create 1 PENDING `LeaveRequest` for the teacher employee
8. Create `AssessmentTemplate` with 2 categories × 2 indicators, then create one `StudentAssessment` in `PUBLISHED` status for the guardian's primary child

Uses Prisma upserts + existence guards so re-running is safe. Tenant narrowing handled via a captured `tenantId: string` to avoid TS null narrowing inside closures.

### Task 3: package.json

Added `"seed:uat": "tsx prisma/seed-uat.ts"` alongside existing scripts.

### Task 4: Typecheck

`next build` TypeScript pass — clean.

## Verification

- **Build + unit:** `npm run build && npx vitest run` — passes.
- **Playwright smoke:** skipped for this cycle. The changes touch only: (a) skill definition markdown, (b) cycle-doc markdown, (c) a new seed script not imported by the app runtime, (d) `package.json` scripts stanza. No route handlers, React components, API schemas, or middleware modified.
- **Manual review:** SKILL.md diff confirms additive-only (no lines removed from enrichment-cycle content); seed-uat.ts runs through `tsx` at import time during typecheck without schema errors.

Gate run at end of cycle:

```
npm run build && npx vitest run
```

## Ship Notes

### Migrations

None. Schema unchanged. Seed script uses existing tables only.

### New env vars

None. `seed:uat` consumes existing `DATABASE_URL`.

### Operator actions on merge

1. Run the UAT seed once against the staging DB:
   ```bash
   DATABASE_URL="<staging postgres url>" npm run seed:uat
   ```
   Idempotent — safe to re-run.

2. Sign in to each of the three UAT accounts in Chrome (separate profiles if possible):
   - Admin: `ismailir10@gmail.com`
   - Teacher: `ismail10rabbanii@gmail.com`
   - Parent: `rightjet.hq@gmail.com`

3. First `/uat` run should spot-check the account-match preflight — it must stop if the wrong account is logged in rather than silently running as the wrong persona.

### Rollback

Revert the merge commit. Seed rows created by `prisma/seed-uat.ts` are tagged with "UAT" substrings (user names "(UAT)", admission `childName: Calon Murid UAT`, leave reason contains "UAT seed") so they can be cleaned up with a targeted SQL query if needed. No destructive DB ops.

### Risk

Low. The skill changes are additive markdown read by humans or by `/uat` at invocation time. The seed script is a one-off operator tool, never imported by the app.

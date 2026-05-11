# Public Repo Prep — Owner Email Scrub + Synthetic-Data Header

## Context

User flipped the repo public on 2026-05-11 so GitHub Actions billing limits stop blocking CI on Phase 1 + Phase 2 PRs. Before exposing source, an audit pass on tracked content surfaced two things worth scrubbing at the tip:

1. **Personal Google email `ismailir10@gmail.com`** (the owner / SUPER_ADMIN auth address) appears in `prisma/seed.ts` (line 165 + console log at line 170), `scripts/reseed/users.ts` (`PRESERVED_USERS[0]`), and five reseed consumer files that look up the seeded SUPER_ADMIN by literal email (`scripts/reseed/{assessments,extras,invoices,operations,payroll}.ts`). Plus the unit-test fixture in `scripts/reseed/__tests__/users.test.ts`. Auth itself stays safe — Google OAuth is unaffected — but the literal address ends up in public-clone source. Same risk applies to past-history copies (migration SQL, archived cycle docs), which we accept as historical exposure.

2. **`prisma/data/students.ts` (464 lines)** contains realistic-shape Indonesian student + parent records (names, DOBs, phone numbers, addresses tied to the Bekasi campus). The sibling `employees.ts` has an explicit "synthetic demo dataset" header; students.ts has none. Confirmed with user: fabricated, not real — but missing header could mislead readers into thinking these are PII-loaded.

Audit also surfaced (out of scope for this cycle):
- Other real-shape emails in `scripts/reseed/users.ts` (`wirarajaisme@gmail.com`, `wirarajaism@gmail.com`, `ismail10rabbanii@gmail.com`, `rightjet.hq@gmail.com`, `commandprompt.adhan@gmail.com`) and `prisma/seed.ts:176` (`commandprompt.adhan@gmail.com`). Flagged for follow-up; this cycle covers only the owner address per explicit user scope.
- `prisma/migrations/20260425000000_promote_owner_to_super_admin/migration.sql` hardcodes the owner email in both comments and the UPDATE WHERE clause. Editing the SQL changes a checksum-tracked migration → drift risk. Left as-is (historical record).
- `docs/**` historical references — not scrubbed (history baseline; tip-only edit would not remove past commits anyway).
- `.env`, `.env.local`, `.env.staging` confirmed never committed (history filter clean). No real Resend / Xendit / Supabase service-role / NextAuth / JWT secrets in tracked source. CI uses a local docker dummy Postgres URL.

Cycle ships as `chore:` (not `feat:`) — touches `prisma/**` + `scripts/**` + `.env.example` only; no `app/**` or `lib/**` runtime code.

## Spec

- [x] `OWNER_EMAIL` env var documented in `.env.example` (default `owner@example.test`).
- [x] `prisma/seed.ts` owner user creation reads `process.env.OWNER_EMAIL ?? "owner@example.test"`; console log echoes the resolved value.
- [x] `scripts/reseed/users.ts` exports `OWNER_EMAIL` and uses it in `PRESERVED_USERS[0].email`.
- [x] `scripts/reseed/{assessments,extras,invoices,operations,payroll}.ts` import `OWNER_EMAIL` and replace literal `"ismailir10@gmail.com"` lookups.
- [x] `scripts/reseed/__tests__/users.test.ts` imports `OWNER_EMAIL` and replaces all literal fixture references (including the case-insensitive test, now `OWNER_EMAIL.toUpperCase()`).
- [x] `prisma/data/students.ts` gets a synthetic-data header matching the tone of `prisma/data/employees.ts`.
- [x] README ADR table gets a 2026-05-11 row (≤ 400 chars).
- [x] Final `git grep -nE "ismailir10@gmail\.com" -- ':!docs/' ':!.claude/' ':!prisma/migrations/'` returns empty (verified — exit 1 = no matches).
- [x] `npm run build` green.
- [x] `npx vitest run` green (1144 passed, 0 failed, 2 skipped, 42 todo).

### Non-goals
- Scrub other real-shape emails from source (separate follow-up).
- Scrub email from migration SQL or archived cycle docs (historical exposure accepted).
- Git history rewrite via `git filter-repo` (destructive; invalidates clones).
- Set `OWNER_EMAIL` on Vercel staging + prod environments — manual user action; see Ship Notes.

## Tasks

1. [x] Add `OWNER_EMAIL` block to `.env.example`.
2. [x] Patch `prisma/seed.ts` owner block to use env-driven email.
3. [x] Export `OWNER_EMAIL` from `scripts/reseed/users.ts`; swap `PRESERVED_USERS[0].email`.
4. [x] Import + use `OWNER_EMAIL` in `scripts/reseed/{assessments,extras,invoices,operations,payroll}.ts`.
5. [x] Update `scripts/reseed/__tests__/users.test.ts` to use `OWNER_EMAIL` (incl. the `toUpperCase()` case-insensitive variant).
6. [x] Add synthetic-data header to `prisma/data/students.ts`.
7. [x] README ADR row + cycle doc (this file).

## Implementation

- `.env.example` — appended `OWNER_EMAIL` block with default + staging/prod usage note.
- `prisma/seed.ts:160-171` — single `ownerEmail` const reused in both `prisma.user.create` and the console log; `name` field genericised to `"Owner"`.
- `scripts/reseed/users.ts:3-5` — added `OWNER_EMAIL` export with env fallback; `PRESERVED_USERS[0]` slot now references the constant and `name` is `"Owner (Super Admin)"`.
- `scripts/reseed/assessments.ts`, `extras.ts`, `invoices.ts`, `operations.ts`, `payroll.ts` — each picked up an `import { OWNER_EMAIL } from "./users"` line and replaced the literal lookup. `operations.ts` keeps the literal teacher fallback `"ismail10rabbanii@gmail.com"` (out of this cycle's scope; flagged in Context).
- `scripts/reseed/__tests__/users.test.ts` — `OWNER_EMAIL` imported; `replace_all` swept every owner-email literal; the case-insensitive fixture now derives from `OWNER_EMAIL.toUpperCase()`.
- `prisma/data/students.ts:1-8` — 7-line synthetic-data header above the `type Student` declaration, mirroring `prisma/data/employees.ts`'s tone (synthetic, real records kept locally, shape matches production).

## Verification

- `git grep -nE "ismailir10@gmail\.com" -- ':!docs/' ':!.claude/' ':!prisma/migrations/'` → exit 1 (no matches). Tip-source clean.
- `npx prisma generate` → Prisma Client 7.6.0 emitted to `lib/generated/prisma`.
- `npx vitest run` → `Test Files  136 passed | 2 skipped (138)` / `Tests  1144 passed | 42 todo (1186)`. Duration 60.95s.
- `npm run build` → completes with full route manifest (no compile error; output truncated at route table).
- Manual sanity: `scripts/reseed/__tests__/users.test.ts` standalone → 9/9 passed.
- Playwright not run (lib-layer scope; no UI surface affected; user-facing pages unchanged).

## Ship Notes

- **BEFORE merging:** set `OWNER_EMAIL=ismailir10@gmail.com` on **Vercel staging** (Production + Preview) and **Vercel production** environments. Without it, reseed runs against staging will look up `owner@example.test` and fail because the live `User` row still holds the original email. Same for local `.env` if a contributor reseeds against a staging DB.
- **No DB migration required.** The live `User.email` value on staging + prod stays as it is (`ismailir10@gmail.com`); only the *source code* that creates / references the seed user changed.
- **Rollback:** revert the commit. No data implications.
- **Carry-over for follow-up cycles:**
  - Scrub remaining real-shape emails (`wirarajaisme@gmail.com`, `wirarajaism@gmail.com`, `ismail10rabbanii@gmail.com`, `rightjet.hq@gmail.com`, `commandprompt.adhan@gmail.com`) from `PRESERVED_USERS` + `prisma/seed.ts:176`. Same env-var pattern; new vars `SCHOOL_ADMIN_EMAIL`, `TEACHER_EMAIL`, `PARENT_EMAIL_PRIMARY`, etc.
  - Decide on migration SQL email exposure (`prisma/migrations/20260425000000_promote_owner_to_super_admin/migration.sql`) — accept as historical OR rewrite to use a session-var placeholder + add operator instructions to the migration runbook.
  - Decide on `docs/**` historical references (lower priority — same baseline as git history).
- **Branch policy follow-up (separate from this PR):** after PRs #241 + #245 + this PR all land on staging, prune all non-`staging` / non-`main` branches; set `main` as default branch on the public repo.

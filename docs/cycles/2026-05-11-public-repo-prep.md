# Public Repo Prep — Light-Touch Hygiene

## Context

User flipped the repo public on 2026-05-11 so GitHub Actions billing limits stop blocking CI on Phase 1 + Phase 2 PRs. Before exposing source, an audit pass surfaced two real issues + one cosmetic-only finding worth scoping out.

**Genuine cleanup (in scope):**

1. **`prisma/data/students.ts` (464 lines)** contains realistic-shape Indonesian student + parent records (names, DOBs, phone numbers, addresses tied to the Bekasi campus). The sibling `employees.ts` has an explicit "synthetic demo dataset" header; students.ts had none. Confirmed with user: fabricated, not real — but missing header could mislead readers into thinking these are PII-loaded.

2. **Doc drift** caught by an audit pass against current code:
   - `README.md` tech-stack table claimed `Next.js 15`; `package.json` pins `16.2.3`.
   - `CLAUDE.md` file-structure block listed `19 / 5 / 5 portal pages`, `128 API routes`, `68 Shadcn components`, `7 e2e specs`. Real counts: `34 / 11 / 6`, `135`, `69`, `14`.
   - `.env.example` was out of sync with the README env-vars table: wrong Xendit var name (`XENDIT_SECRET_API_KEY` instead of `XENDIT_SECRET_KEY` — and the wrong name isn't referenced anywhere in source); missing `SUPABASE_SERVICE_ROLE_KEY`, `STAGING_EMAIL_OVERRIDE`, `CRON_SECRET`.

**Cosmetic-only (rejected):**

3. **Personal Google email `ismailir10@gmail.com`** appears in `prisma/seed.ts` (owner User row), `scripts/reseed/*.ts` (PRESERVED_USERS + 5 consumer files), unit-test fixtures, the `20260425000000_promote_owner_to_super_admin` migration SQL, and ~25 archived cycle docs. An initial scrub commit replaced source-tip refs with an `OWNER_EMAIL` env var (default `owner@example.test`). User rejected the env-var approach: the same email is **already** in the migration SQL (checksum-tracked, can't safely edit) and lives in git history forever — every clone of the public repo recovers it via `git log -S` or `git grep` on the migration file. Source-tip scrub buys near-zero security benefit and introduces operational burden (must set `OWNER_EMAIL` on Vercel staging × 2 + prod, forgotten env breaks reseed runs). Reverted in the same PR.

The only real path to remove the email from public exposure is `git filter-repo` — destructive (rewrites all commit SHAs, invalidates clones, breaks PR refs #241/#245). Out of scope.

**Pre-existing exposure confirmed safe:**

- `.env`, `.env.local`, `.env.staging` never committed (history filter clean).
- No real Resend / Xendit / Supabase service-role / NextAuth / JWT secrets in tracked source.
- CI uses a local docker dummy Postgres URL.
- All `xnd_*`/`re_*`/`eyJ*` strings in tests are obvious placeholders.

Cycle ships as `chore:`/`docs:` (no `app/**` or `lib/**` runtime code touched).

## Spec

- [x] `prisma/data/students.ts` gets a synthetic-data header matching the tone of `prisma/data/employees.ts`.
- [x] `README.md` ADR table gets a 2026-05-11 row (≤ 400 chars).
- [x] `README.md` line 15 tech-stack table reads "Next.js 16" (was 15).
- [x] `CLAUDE.md` file-structure block reflects real counts (34/11/6 portal pages, 135 API routes, 69 components, 14 e2e specs; full spec list updated).
- [x] `.env.example` aligned with README env-vars table:
  - `XENDIT_SECRET_KEY` (was `XENDIT_SECRET_API_KEY` — wrong; not referenced in source).
  - `SUPABASE_SERVICE_ROLE_KEY` documented.
  - `STAGING_EMAIL_OVERRIDE` documented.
  - `CRON_SECRET` documented.
- [x] `npm run build` green.
- [x] `npx vitest run` green (1144 passed, 0 failed, 2 skipped, 42 todo).

### Non-goals
- Owner-email source-tip scrub (cosmetic; see Context #3).
- Scrub other real-shape emails (`wirarajaisme@gmail.com`, `wirarajaism@gmail.com`, `ismail10rabbanii@gmail.com`, `rightjet.hq@gmail.com`, `commandprompt.adhan@gmail.com`) — same cosmetic-only argument.
- Migration SQL edit or `docs/cycles/archive/**` scrub — historical exposure baseline.
- Git history rewrite via `git filter-repo` (destructive).

## Tasks

1. [x] Add synthetic-data header to `prisma/data/students.ts`.
2. [x] README + CLAUDE.md drift fixes.
3. [x] `.env.example` alignment with README env-vars table.
4. [x] README ADR row + cycle doc (this file).

## Implementation

- `prisma/data/students.ts:1-8` — 7-line synthetic-data header above the `type Student` declaration, mirroring `prisma/data/employees.ts`'s tone (synthetic, real records kept locally, shape matches production).
- `README.md:15` — `Next.js 15` → `Next.js 16`.
- `CLAUDE.md:207-213` — file-structure block updated to real counts + full e2e spec list (admin, admin-dashboard, admin-dialogs, admin-hydration, admin-school-admin, branding, daftar-public, design-system, parent, parent-attendance-scoping, parent-signout-bfcache, payment, perf-budget, teacher).
- `.env.example:8-31` — Database/Supabase/Xendit/Resend/App/Cron sections re-grouped with inline comments documenting each variable's role (pooler vs direct, server-only, omit-to-simulate, openssl rand -hex 32, etc.).

## Verification

- `git grep -nE "Next\.js 15"` → no matches in README/CLAUDE.md.
- `find app/api -name route.ts | wc -l` → 135 (matches CLAUDE.md).
- `find app/{admin,teacher,parent} -name page.tsx` → 34/11/6 (matches CLAUDE.md).
- `find components/ui -name '*.tsx' | wc -l` → 69 (matches CLAUDE.md).
- `find e2e -name '*.spec.ts' | wc -l` → 14 (matches CLAUDE.md).
- `grep "process.env.XENDIT_SECRET_KEY" lib/ -r` → 11 hits (canonical name verified).
- `grep "process.env.XENDIT_SECRET_API_KEY" -r .` → no source matches (`.env.example` was the lone holdout).
- `npx prisma generate` → Prisma Client 7.6.0 emitted.
- `npx vitest run` → 136 files / 1144 tests passed, 0 failed.
- `npm run build` green.
- Playwright not run (no UI surface affected).

## Ship Notes

- **No DB migration, no env-var change.** Staging + prod runtime behaviour unchanged.
- **Rollback:** revert the commit. No data implications.
- **Carry-over for follow-up cycles:** none. Cosmetic scrub deferred indefinitely; revisit only if the threat model changes (e.g. if real customer PII enters the seed dataset and warrants `git filter-repo`).
- **Branch policy follow-up (separate from this PR):** after PRs #241 + #245 + this PR all land on staging, prune all non-`staging` / non-`main` branches. `main` already set as default.

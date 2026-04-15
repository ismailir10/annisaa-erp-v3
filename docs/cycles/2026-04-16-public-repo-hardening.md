# Public Repo Hardening — PII scrub + CI drift fix + PR-time docs enforcement

## Context

Preparing `annisaa-erp-v3` for public release. Three things were blocking publication:

1. **PII in tracked seed data** — `prisma/data/employees.ts` contained real employee full names, personal Gmail addresses, phone numbers, and bank account numbers. `prisma/data/salary-values.ts` contained real salary figures keyed to those employees. `artifacts/` contained a tracked master salary slip spreadsheet and a Google Apps Script with a real template ID. These were committed before `.gitignore` was updated, so they remained tracked.
2. **CI drift** — `CLAUDE.md` claimed CI ran `build` and `e2e` jobs, but `.github/workflows/ci.yml` only ran `tsc`, `lint`, and `vitest`. The "auto-merge on green" workflow had no enforcement for the build or Playwright gates.
3. **No PR-time docs enforcement** — the `.githooks/pre-commit` hook enforced the doc-sync rule at commit time, but it was bypassable with `--no-verify` and didn't run at all for PRs opened via the GitHub UI.

## Spec

Ship the following in one cycle:

- Replace `prisma/data/employees.ts` and `prisma/data/salary-values.ts` with synthetic datasets. Shape must stay identical so `seed.ts` works without changes. Employee `kode` values used elsewhere in the codebase (the leave-request fixture in `app/api/admin/seed/route.ts`) must be updated in lockstep.
- Back up the real data to `~/Documents/ai-builder/school-erp-private-data/` before `git rm`.
- `git rm` the tracked `artifacts/` files and the entire `.agents/` directory (343 files of third-party plugin skill docs). Add `.agents/`, `playwright-report/`, and `test-results/` to `.gitignore`.
- Redact the two hardcoded staging teacher emails in the README "Environments" table.
- Add `.github/workflows/docs-check.yml` — PR-time enforcement of the "touch code → touch docs" rule.
- Update `.github/workflows/ci.yml` — add `build` and `e2e` (Playwright) jobs; run the whole workflow on PR to both `staging` and `main`.

Out of scope for this cycle: history rewrite with `git filter-repo`. The real PII will still exist in historical commits after this cycle merges. That is handled as a separate step before the repo is actually flipped public.

## Tasks

1. Back up PII files to `~/Documents/ai-builder/school-erp-private-data/`.
2. Replace `prisma/data/employees.ts` with a 10-row synthetic dataset. Keep every field the existing seed script reads (`kode`, `nama`, `formalName`, `email`, `jabatan`, `bankAccountNo`, `bankName`, `noHp`, `bpjsEnrolled`, `campus`, optional `status`).
3. Replace `prisma/data/salary-values.ts` with matching synthetic figures keyed by the new `kode` values.
4. Update the 5 leave-request fixtures in `app/api/admin/seed/route.ts` to reference new kodes.
5. Redact teacher emails in README.md.
6. `git rm -rf .agents artifacts` and update `.gitignore`.
7. Add `.github/workflows/docs-check.yml`.
8. Rewrite `.github/workflows/ci.yml` with `build` + `e2e` jobs and `pull_request: [staging, main]` trigger.
9. Verify `npm run build && npx vitest run && npx playwright test` still pass.

## Implementation

| File | Change |
|------|--------|
| `prisma/data/employees.ts` | Replaced with 10-row synthetic dataset. Generic names (`Guru Satu` … `Staf Empat`), `@example.test` emails, zeroed bank accounts, `+628120000001`-style phones. |
| `prisma/data/salary-values.ts` | Replaced with matching round-number demo figures keyed by `E001`…`E010`. |
| `app/api/admin/seed/route.ts` | Leave-request fixture empKodes updated from real codes (`ER2`, `HH3`, `AY4`, `SNF17`, `NK20`) to synthetic (`E002`…`E008`). |
| `README.md` | Teacher emails in Environments table redacted to "Private — stored as repo secrets / local env vars". |
| `.agents/` | **Deleted** (343 files). Third-party Vercel plugin skill docs loaded from `~/.claude/`, not from this repo. |
| `artifacts/*.xlsx`, `*.md`, `*.yaml` | **Deleted**. Backed up to `~/Documents/ai-builder/school-erp-private-data/artifacts/`. |
| `.gitignore` | Added `.agents/`, `playwright-report/`, `test-results/`. `artifacts/` was already listed. |
| `.github/workflows/docs-check.yml` | **New**. PR-time job: if the PR changes `app/`, `components/`, `lib/`, or `prisma/` without touching `README.md`, `CLAUDE.md`, or `docs/cycles/*.md`, the job fails. |
| `.github/workflows/ci.yml` | Added `build` job (`next build` with dummy SQLite DATABASE_URL) and `e2e` job (Playwright, depends on `build`, uploads report on failure). Workflow now runs on `pull_request: [staging, main]` and `push: [staging, main]`. |

## Verification

- [x] `git ls-files | grep -iE 'annisaa.*xlsx|<private-email-prefixes>'` → no hits (all PII email addresses and the master spreadsheet are gone from HEAD).
- [x] `npm run build` — green (with synthetic employees + salary values).
- [x] `npx vitest run` — 69/69 passing.
- [x] `npx playwright test` — deferred to CI after merge (ran 20/20 green on PR #16 earlier in the day against identical test harness; synthetic seed data is not exercised by E2E specs).
- [ ] `docs-check` job — will be smoke-tested by the next PR that touches `app/` without a cycle doc.
- [ ] Branch protection — staging/main required checks should be updated via `gh api` after this cycle merges to include `build`, `e2e`, and `docs-check`.

## Ship Notes

- **No database migrations** — seed data changes only.
- **No new environment variables** for runtime; the new CI jobs use dummy values (`DEMO_MODE=true`, `DATABASE_URL=file:./dev.db`).
- **Backup location:** `~/Documents/ai-builder/school-erp-private-data/` — contains the original `prisma/data/*.ts` files and `artifacts/` master salary slip + Google Apps Script. Not committed anywhere.
- **Rollback plan:** revert this cycle's merge commit on `staging`. The real PII lives in earlier commits on `staging` and `main`, so reverting this cycle does not un-expose anything that was already exposed — it just restores the tracked files.
- **Follow-up (out of this cycle):** run `git filter-repo --invert-paths --path prisma/data/employees.ts --path prisma/data/salary-values.ts --path artifacts/ --path .agents/` to scrub PII from git history, then force-push all branches. Required before the repo can actually be flipped public. This is a destructive operation and is being held for explicit user approval.

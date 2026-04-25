# Reseed Staging — Env Friction Hotfix

## Context

The reseed-staging cycle landed yesterday (PR #134) with a six-variable env-var checklist that operators must set on every run. Four of those six already exist in `.env` / `.env.local` because Next.js dev/build commands need them — the operator was being asked to redundantly re-paste them on the command line. Two of the four (`STAGING_SUPABASE_REF`) can be derived from `NEXT_PUBLIC_SUPABASE_URL` programmatically. The only var that genuinely requires manual operator input is `STAGING_CONFIRM=yes` (the destructive-op gate).

Outcome: reduce the operator command from a six-var prefix to `STAGING_CONFIRM=yes npm run reseed:staging`, with an optional `XENDIT_SECRET_KEY=...` only when the operator hasn't already pulled the sandbox key into `.env.local`.

**Consulted:** none.

## Spec

### Acceptance criteria

- [ ] `npm run reseed:staging` auto-loads `.env` + `.env.local` via `tsx --env-file*` flags so anything Next.js already sees is visible to the script too.
- [ ] `STAGING_SUPABASE_REF` is auto-derived from `NEXT_PUBLIC_SUPABASE_URL` host (`<ref>.supabase.co`) if not explicitly set. Explicit override still wins.
- [ ] Guard error messages list only the vars actually missing, not the auto-derivable ones.
- [ ] README "Reseeding staging" section updated to reflect the simpler flow:
  - Required (always): `STAGING_CONFIRM=yes`
  - Required if absent from `.env.local`: `XENDIT_SECRET_KEY=xnd_development_*`
  - Auto-loaded from `.env*`: `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - Auto-derived: `STAGING_SUPABASE_REF`
- [ ] Existing 87 unit tests still pass; new tests cover the auto-derive logic and the .env-file flag.

### Non-goals

- No change to the destructive logic, Xendit caller, or seeded data shape.
- No removal of any guard — auto-derivation strengthens, not weakens, them.
- No automatic Vercel env pull — operator pulls once via `npx vercel env pull` if they want and the key persists in `.env.local`.

### Assumptions

1. Node ≥ 20.6 supports `--env-file`. CI + Vercel use compatible versions.
2. `tsx 4.21` passes `--env-file*` through to the underlying node process.
3. `.env.local` may or may not contain `XENDIT_SECRET_KEY`; if absent, operator passes it inline. If both inline and file-set, inline wins (Node behavior).

## Tasks

- [x] **T1 — Auto-derive `STAGING_SUPABASE_REF` in guards.** When `STAGING_SUPABASE_REF` is unset but `NEXT_PUBLIC_SUPABASE_URL` is a valid `<ref>.supabase.co` URL, derive the ref. Explicit env still wins. Update guards.ts + add 3 vitest cases (derive happy path, override wins, non-supabase host fails clearly).

- [x] **T2 — Auto-load `.env` + `.env.local` via tsx env-file flags.** Update `package.json` `reseed:staging` script to `tsx --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/reseed-staging.ts`. Verify both files load and inline vars still override.

- [x] **T3 — README rewrite.** Replace the env-var block in the "Reseeding staging" section with the simpler 1-line command + a small "what's auto-loaded" table.

## Implementation

- T1: `scripts/reseed/guards.ts` — moved `STAGING_SUPABASE_REF` resolution AFTER Supabase URL parse; auto-derive ref from `<ref>.supabase.co|in` host pattern when env var is unset; explicit env still takes precedence. Updated `scripts/reseed/__tests__/guards.test.ts` (replaced "rejects missing STAGING_SUPABASE_REF" with auto-derive happy path + non-Supabase-host failure case).
- T2: `package.json` — `reseed:staging` now runs as `tsx --env-file-if-exists=.env.staging scripts/reseed-staging.ts`. Added `.env.staging` to `.gitignore` (already covered by glob but explicit for clarity).
- T3: README "Reseeding staging" section rewritten — operator pulls staging env once via `npx vercel env pull .env.staging --environment=preview`, then runs `STAGING_CONFIRM=yes npm run reseed:staging`. Removed the six-line env-var prefix.

## Verification

- `npx vitest run scripts/reseed` — 88/88 passing across 8 files.
- `npm run build` — clean.
- `npx playwright test` — 43/45 passing, 2 skipped (unchanged from prior cycle).
- Cross-checked design-system.html: not applicable — infrastructure cycle, no frontend changes.

## Ship Notes

**Migrations:** none.

**Operator step (one-time per Vercel env change):**
```bash
npx vercel link            # if not yet linked
npx vercel env pull .env.staging --environment=preview
```

That populates `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `XENDIT_SECRET_KEY` (sandbox) into a gitignored `.env.staging`.

**Reseed command (every run):**
```bash
STAGING_CONFIRM=yes npm run reseed:staging
```

That's it — `STAGING_SUPABASE_REF` auto-derives from the Supabase URL host. Take the manual Supabase snapshot before running per the prior cycle.

**Rollback plan:** unchanged. Restore the manual Supabase snapshot via dashboard.

# Phase 0 — Hard Delete Domain Code: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-delete v1 domain code (admin/teacher/parent UI, domain API routes, seeds, validators, e2e) to prepare greenfield for v2 rebuild. Schema kept intact (reset happens in p1 cycle 1). Single revertable PR.

**Architecture:** Surgical deletion. Preserve mature `lib/` (xendit, payroll, finance, hijri, api helpers, webhook, auth). Preserve schema.prisma + migrations until p1. Replace homepage with rebuild notice. Update README + CLAUDE.md minimally.

**Tech Stack:** git, Next.js 16, Prisma 7.6, Postgres, Vitest, Playwright. No new tools introduced.

**Reference spec:** [Foundation design §18.0](../specs/2026-05-04-erp-rebuild-foundation-design.md)

---

## File Structure

### DELETE (entire directories)

```
app/admin/                    — 28 admin pages (per existing audit)
app/teacher/                  — 10 teacher pages
app/parent/                   — 6 parent pages
app/payment/                  — Xendit redirect handler (rebuild in p3)
app/api/admin/                — admin API routes
app/api/admissions/
app/api/assessments/
app/api/attendance/
app/api/class-sections/
app/api/config/
app/api/employees/
app/api/enrollments/
app/api/fee-components/
app/api/fee-structure/
app/api/guardian/
app/api/guardians/
app/api/invoices/
app/api/leave/
app/api/parent/
app/api/payroll/
app/api/programs/
app/api/promotions/
app/api/roles/
app/api/salary-components/
app/api/slips/
app/api/student-attendance/
app/api/student-journal/
app/api/students/
app/api/teacher/
app/api/academic-years/
prisma/seed.ts                — 1421 lines
lib/validations/              — 19 ad-hoc Zod files
e2e/admin.spec.ts             — 6 specs (rewrite per cycle later)
e2e/admin-school-admin.spec.ts
e2e/parent.spec.ts
e2e/teacher.spec.ts
e2e/payment.spec.ts
e2e/design-system.spec.ts
```

### KEEP (preserve as-is)

```
app/auth/                     — Supabase Auth callback
app/api/auth/                 — login/logout/me/users
app/api/cron/finance-maintenance/  — keeps existing cron pattern
app/api/health/xendit/        — health probe
app/api/xendit/               — create-session + webhook
app/api/__tests__/            — keep test infra
app/layout.tsx
app/globals.css
app/favicon.ico

lib/xendit/*
lib/payroll/*
lib/finance/*
lib/hijri.ts
lib/api/*
lib/webhook/*
lib/auth*.ts                  — refactor in p1
lib/db.ts
lib/audit.ts
lib/supabase/*
lib/email/*
lib/pdf/*
lib/__tests__/                — keep, may need pruning
lib/generated/                — Prisma client output
lib/utils.ts
lib/format.ts
lib/permissions.ts
lib/rate-limit.ts
lib/constants/*
lib/uat/                      — keep UAT helpers

prisma/schema.prisma          — KEEP (reset happens in p1 cycle 1)
prisma/migrations/*           — KEEP (reset happens in p1)

components/ui/*               — Shadcn library
.claude/standards/design-system.html  — canonical visual ref
.claude/skills/uat/           — UAT mechanism preserved
.claude/personas/             — fixed personas preserved
docs/uat/jobs/*               — JTBD library evolves per cycle

proxy.ts                      — refactor in p1, keep for now
```

### MOVE / ARCHIVE

```
docs/uat/reports/2026-04-*.md   → docs/uat/reports/_archive/v1/
docs/uat/reports/2026-05-*.md   → docs/uat/reports/_archive/v1/
```

### REPLACE

```
app/page.tsx                  — minimal "v2 rebuild in progress" placeholder
README.md                     — add rebuild notice + link to spec (top)
CLAUDE.md                     — minimal pointer to spec (top), full rewrite later
```

### CREATE

```
docs/runbooks/disaster-recovery.md   — STUB only, fleshed out in W7
```

---

## Pre-flight Checks (before starting Task 1)

🔴 **Manual blocking checks** — confirm before starting any task:

- [ ] Confirm no active v1 admin sessions (check Vercel dashboard last 24h logs)
- [ ] Confirm no in-flight v1 PRs targeting staging
- [ ] Confirm Vercel deploy outside school hours (school admin uses staging)
- [ ] Local DB backup: `pg_dump $LOCAL_DATABASE_URL > /tmp/v1-local-backup-2026-05-04.sql`
- [ ] Staging DB backup (if access): note Supabase dashboard manual backup taken
- [ ] Rollback plan rehearsed locally: tested `git revert` + `prisma migrate reset` + restore pg_dump

When all confirmed, proceed.

---

## Task 1: Tag v1 backup

**Files:**
- N/A (git only)

- [ ] **Step 1: Verify on staging branch w/ clean tree**

```bash
git status
git branch --show-current
```

Expected: working tree clean, on `staging` branch. If not, abort.

- [ ] **Step 2: Tag v1 final state**

```bash
git tag v1-final-2026-05-04 -m "v1 final state before phase 0 rebuild"
```

- [ ] **Step 3: Push tag to origin**

```bash
git push origin v1-final-2026-05-04
```

Expected output: `* [new tag] v1-final-2026-05-04 -> v1-final-2026-05-04`

- [ ] **Step 4: Verify tag on remote**

```bash
git ls-remote --tags origin | grep v1-final-2026-05-04
```

Expected: tag SHA returned.

- [ ] **Step 5: Set up worktree for phase 0 cycle**

```bash
bash scripts/setup-worktree.sh p0-hard-delete-domain-code
```

This creates `.worktrees/p0-hard-delete-domain-code` on branch `feat/p0-hard-delete-domain-code` from `origin/staging`, symlinks .env + node_modules.

- [ ] **Step 6: Enter worktree (subsequent tasks run inside it)**

All subsequent tasks operate inside `.worktrees/p0-hard-delete-domain-code/`.

```bash
cd .worktrees/p0-hard-delete-domain-code
pwd
```

Expected: `.../school-erp/.worktrees/p0-hard-delete-domain-code`

- [ ] **Step 7: Commit cycle doc skeleton**

Create `docs/cycles/2026-05-04-p0-hard-delete-domain-code.md`:

```markdown
# Phase 0 — Hard Delete Domain Code

**Type:** docs + service (no schema, no UI)
**Phase:** p0
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §18.0

## Context

Hard-delete v1 domain code (admin/teacher/parent UI + domain API routes + seeds + validators + e2e) to prepare greenfield for v2 rebuild. Schema preserved until p1 cycle 1. Single revertable PR.

## Spec

Acceptance criteria:
- All deletions per `docs/superpowers/plans/2026-05-04-p0-hard-delete-domain-code.md`
- `npm run build` passes (no orphan imports)
- Dev server boots — homepage shows rebuild placeholder
- `/admin`, `/teacher`, `/parent` return 404
- Auth callback still works (`/auth/callback`)
- Xendit webhook + create-session API still works
- v1 UAT reports archived to `_archive/v1/`
- README + CLAUDE.md updated minimally

## Tasks

(Per plan doc tasks 1-16.)

## Implementation

(Filled by /build per task.)

## Verification

(Filled by /build.)

## Ship Notes

(Filled by /ship.)
```

```bash
git add docs/cycles/2026-05-04-p0-hard-delete-domain-code.md
git commit -m "docs(p0): cycle doc skeleton

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Archive v1 UAT reports

**Files:**
- Create: `docs/uat/reports/_archive/v1/` (directory)
- Move: `docs/uat/reports/2026-04-*.md` → `_archive/v1/`
- Move: `docs/uat/reports/2026-05-*.md` → `_archive/v1/`

- [ ] **Step 1: Create archive directory**

```bash
mkdir -p docs/uat/reports/_archive/v1
```

- [ ] **Step 2: List existing UAT reports to archive**

```bash
ls docs/uat/reports/2026-*.md
```

Expected: 8 files (2026-04-18-admin, 2026-04-24-admin, 2026-04-25-parent, 2026-04-25-teacher, 2026-05-01-cross-actor, 2026-05-02-admin, 2026-05-03-parent, 2026-05-03-teacher).

- [ ] **Step 3: Move all v1 reports to archive**

```bash
mv docs/uat/reports/2026-04-*.md docs/uat/reports/_archive/v1/
mv docs/uat/reports/2026-05-*.md docs/uat/reports/_archive/v1/
```

- [ ] **Step 4: Verify reports moved**

```bash
ls docs/uat/reports/_archive/v1/ | wc -l
ls docs/uat/reports/2026-*.md 2>&1 | head -1
```

Expected: 8 in archive; second command returns "No such file or directory".

- [ ] **Step 5: Add archive README**

Create `docs/uat/reports/_archive/v1/README.md`:

```markdown
# v1 UAT Reports — Archived 2026-05-04

Reports captured against v1 ERP staging build before phase 0 hard-delete (foundation rebuild). Preserved for historical reference + post-launch baseline comparison.

v2 UAT reports land back in `docs/uat/reports/<YYYY-MM-DD>-<area>.md` once phase 6 ships.
```

- [ ] **Step 6: Commit**

```bash
git add docs/uat/reports/_archive/
git commit -m "chore(p0): archive v1 UAT reports

8 reports from 2026-04 through 2026-05-03 moved to _archive/v1/.
Mechanism (skill + personas + jobs library) preserved.
v2 reports will resume at phase 6 ship.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Delete admin pages

**Files:**
- Delete: `app/admin/` (entire directory)

- [ ] **Step 1: Verify admin directory exists w/ expected count**

```bash
find app/admin -name "page.tsx" | wc -l
```

Expected: ≥ 19 (per existing audit, actually 28).

- [ ] **Step 2: Delete app/admin recursively**

```bash
rm -rf app/admin
```

- [ ] **Step 3: Verify deletion**

```bash
ls app/admin 2>&1 | head -1
```

Expected: "No such file or directory".

- [ ] **Step 4: Build check (homepage may break — fix in later task)**

```bash
npm run build 2>&1 | tail -20
```

Expected: build error referencing deleted admin imports OR success. Either fine — fix in subsequent tasks.

- [ ] **Step 5: Commit (don't wait for build green — chain of deletes follows)**

```bash
git add -A app/admin
git commit -m "feat(p0)!: delete app/admin pages

28 admin pages removed. Foundation rebuild on scaffold engine
will produce these via lib/entities/<name>/ pattern in p2-p3.

BREAKING: admin UI temporarily unavailable until p2 ships.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Delete teacher pages

**Files:**
- Delete: `app/teacher/` (entire directory)

- [ ] **Step 1: Verify count**

```bash
find app/teacher -name "page.tsx" | wc -l
```

Expected: ≥ 5 (per CLAUDE.md, actually 10).

- [ ] **Step 2: Delete recursively**

```bash
rm -rf app/teacher
```

- [ ] **Step 3: Verify**

```bash
ls app/teacher 2>&1 | head -1
```

Expected: "No such file or directory".

- [ ] **Step 4: Commit**

```bash
git add -A app/teacher
git commit -m "feat(p0)!: delete app/teacher pages

10 teacher pages removed. Rebuild via scaffold engine in p5.

BREAKING: teacher UI unavailable until p5 ships.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Delete parent pages

**Files:**
- Delete: `app/parent/` (entire directory)

- [ ] **Step 1: Verify count**

```bash
find app/parent -name "page.tsx" | wc -l
```

Expected: ≥ 5 (actually 6).

- [ ] **Step 2: Delete recursively**

```bash
rm -rf app/parent
```

- [ ] **Step 3: Verify**

```bash
ls app/parent 2>&1 | head -1
```

Expected: "No such file or directory".

- [ ] **Step 4: Commit**

```bash
git add -A app/parent
git commit -m "feat(p0)!: delete app/parent pages

6 parent pages removed. Rebuild via scaffold engine in p6.

BREAKING: parent portal unavailable until p6 ships.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Delete app/payment

**Files:**
- Delete: `app/payment/` (Xendit redirect handler)

- [ ] **Step 1: Verify directory exists**

```bash
ls app/payment
```

Expected: subdirectories present.

- [ ] **Step 2: Delete recursively**

```bash
rm -rf app/payment
```

- [ ] **Step 3: Verify**

```bash
ls app/payment 2>&1 | head -1
```

Expected: "No such file or directory".

- [ ] **Step 4: Commit**

```bash
git add -A app/payment
git commit -m "feat(p0)!: delete app/payment redirect handler

Xendit redirect rebuilt in p3-cash-payment-flow cycle alongside
new invoice flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Delete domain API routes

**Files:**
- Delete: 27 directories under `app/api/`
- Keep: `app/api/auth/`, `app/api/cron/finance-maintenance/`, `app/api/health/xendit/`, `app/api/xendit/`, `app/api/__tests__/`

- [ ] **Step 1: List API routes to delete**

```bash
ls app/api/
```

Output should include the deletion targets listed below.

- [ ] **Step 2: Delete domain API routes (single command)**

```bash
rm -rf \
  app/api/admin \
  app/api/admissions \
  app/api/assessments \
  app/api/attendance \
  app/api/class-sections \
  app/api/config \
  app/api/employees \
  app/api/enrollments \
  app/api/fee-components \
  app/api/fee-structure \
  app/api/guardian \
  app/api/guardians \
  app/api/invoices \
  app/api/leave \
  app/api/parent \
  app/api/payroll \
  app/api/programs \
  app/api/promotions \
  app/api/roles \
  app/api/salary-components \
  app/api/slips \
  app/api/student-attendance \
  app/api/student-journal \
  app/api/students \
  app/api/teacher \
  app/api/academic-years \
  app/api/teaching-assignments
```

- [ ] **Step 3: Verify only essential API routes remain**

```bash
ls app/api/
```

Expected (4-5 entries): `__tests__ auth cron health xendit`. If more remain (e.g. orphan routes from deleted modules), delete them too.

- [ ] **Step 4: Build check — surface broken imports**

```bash
npm run build 2>&1 | tail -30
```

Expected: errors referencing deleted modules from places we haven't deleted yet (e.g. lib/validations references — fixed in Task 9).

- [ ] **Step 5: Commit**

```bash
git add -A app/api
git commit -m "feat(p0)!: delete domain API routes

26 domain API route directories removed. Auth, Xendit, cron,
health endpoints preserved. Domain APIs rebuild via scaffold
engine in p2-p6.

BREAKING: REST endpoints under /api/{admin,students,etc} return 404.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Replace homepage with rebuild placeholder

**Files:**
- Replace: `app/page.tsx`

- [ ] **Step 1: Read current page.tsx (just to confirm structure)**

```bash
head -20 app/page.tsx
```

- [ ] **Step 2: Replace app/page.tsx with rebuild notice**

```tsx
// app/page.tsx
import Link from 'next/link'

export const metadata = {
  title: 'An Nisaa Sekolahku — v2 Rebuild In Progress',
  description: 'School ERP v2 under active development. Launch July 2026.',
}

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl text-center space-y-6">
        <h1 className="text-3xl font-semibold">An Nisaa Sekolahku</h1>
        <p className="text-base text-muted-foreground">
          Sistem versi 2 sedang dalam pengembangan. Peluncuran direncanakan Juli 2026.
        </p>
        <p className="text-sm text-muted-foreground">
          Untuk pendaftaran atau pertanyaan, hubungi kami via{' '}
          <a className="underline" href="https://wa.me/6287742646815">
            WhatsApp 0877-4264-6815
          </a>
        </p>
        <p className="text-xs text-muted-foreground">
          School ERP v2 rebuild — see{' '}
          <Link className="underline" href="https://github.com/ismailir10/school-erp">
            project repo
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: build green OR remaining errors only from lib/validations (fixed Task 9). If errors mention `lib/validations`, proceed to Task 9.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(p0): rebuild placeholder homepage

Minimal landing during v2 rebuild. Bahasa Indonesia copy +
WA contact link. Replaces v1 marketing-style homepage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Delete lib/validations

**Files:**
- Delete: `lib/validations/` (19 files)

- [ ] **Step 1: Confirm count**

```bash
ls lib/validations/ | wc -l
```

Expected: ~20 files.

- [ ] **Step 2: Search for remaining import references (sanity)**

```bash
grep -rn "from '@/lib/validations" app/ lib/ 2>&1 | grep -v "^lib/validations" | head
```

Expected: only references from `lib/__tests__` or auth route (verify next).

- [ ] **Step 3: Delete recursively**

```bash
rm -rf lib/validations
```

- [ ] **Step 4: Build check — fix any remaining import errors**

```bash
npm run build 2>&1 | tail -30
```

Expected: build green. If errors reference `lib/validations` from `lib/__tests__`, delete affected test files too:

```bash
# If __tests__ break:
find lib/__tests__ -name "*.test.ts" | xargs grep -l "lib/validations" | xargs rm -f
```

- [ ] **Step 5: Commit**

```bash
git add -A lib/validations lib/__tests__
git commit -m "feat(p0)!: delete lib/validations

19 ad-hoc Zod validators removed. New validation pattern in p1
will derive Zod schemas from per-entity registry
(lib/entities/<name>/schema.ts).

BREAKING: ad-hoc Zod imports broken. All consumers already
removed in tasks 3-7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Delete prisma/seed.ts

**Files:**
- Delete: `prisma/seed.ts`
- Keep: `prisma/schema.prisma` (reset in p1 cycle 1)
- Keep: `prisma/migrations/*` (reset in p1 cycle 1)

- [ ] **Step 1: Confirm size**

```bash
wc -l prisma/seed.ts
```

Expected: ~1421 lines.

- [ ] **Step 2: Delete**

```bash
rm prisma/seed.ts
```

- [ ] **Step 3: Update package.json — remove seed script reference if present**

```bash
grep -A2 '"prisma":' package.json
```

Expected output may include `"seed": "tsx prisma/seed.ts"`.

If present, edit `package.json` to remove the seed line. Use Edit tool to find and remove the entry, OR if removing the entire `prisma` block:

```bash
# Verify what to edit
cat package.json | grep -A5 '"prisma"'
```

Use `npm pkg delete prisma.seed` to remove just the seed script:

```bash
npm pkg delete prisma.seed
```

Verify:

```bash
grep -A2 '"prisma":' package.json
```

Expected: prisma block reduced or absent.

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -10
```

Expected: pass (seed.ts not imported by app code).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "feat(p0)!: delete prisma/seed.ts

1421-line monolithic seed removed. p1 introduces modular
prisma/seed/ directory (00-tenant.ts, 01-regions.sql, etc).

BREAKING: \`prisma db seed\` no longer functional until p1 cycle 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Delete e2e/ specs

**Files:**
- Delete: 6 spec files in `e2e/`
- Keep: `playwright.config.ts` + any e2e fixtures/helpers

- [ ] **Step 1: List specs**

```bash
ls e2e/
```

Expected: `admin.spec.ts admin-school-admin.spec.ts design-system.spec.ts parent.spec.ts payment.spec.ts teacher.spec.ts` plus possibly fixtures.

- [ ] **Step 2: Delete spec files only (keep fixtures + config)**

```bash
rm e2e/admin.spec.ts \
   e2e/admin-school-admin.spec.ts \
   e2e/parent.spec.ts \
   e2e/teacher.spec.ts \
   e2e/payment.spec.ts \
   e2e/design-system.spec.ts
```

- [ ] **Step 3: Verify Playwright config still loads**

```bash
npx playwright test --list 2>&1 | head -10
```

Expected: "No tests found" or similar — config valid, no specs.

- [ ] **Step 4: Commit**

```bash
git add -A e2e
git commit -m "feat(p0)!: delete v1 e2e specs

6 specs removed. New specs land per cycle (p2-p6) covering
the corresponding scaffold-generated pages. Playwright config
preserved.

BREAKING: \`npx playwright test\` runs no tests until cycle-by-cycle
specs land.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Update README.md (minimal v2 notice)

**Files:**
- Modify: `README.md` (top portion only)

- [ ] **Step 1: Read existing README intro**

```bash
head -20 README.md
```

- [ ] **Step 2: Insert v2 rebuild notice at top**

Use Edit tool to add this block immediately after the existing main title (top of file):

```markdown
> **🚧 v2 Rebuild In Progress (May–July 2026)**
>
> This codebase is undergoing a foundation rebuild. v1 domain code (admin/teacher/parent UI, domain API routes, seeds, validators, e2e specs) was hard-deleted on 2026-05-04. v1 final state preserved at git tag `v1-final-2026-05-04`.
>
> **Active design specs:**
> - [Foundation & MVP Architecture](docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md)
>
> **Field research:**
> - [Teacher insights](docs/research/2026-05-04-nisaa-teacher-insights.md)
> - [v1 ERP audit](docs/research/2026-05-04-existing-erp-audit.md)
>
> Sections below describe v1 architecture and remain valid for the preserved `lib/` (xendit, payroll, finance, hijri, api, webhook). UI / schema sections may be stale — consult foundation spec for v2 design.

```

- [ ] **Step 3: Verify markdown renders**

```bash
head -25 README.md
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(p0): add v2 rebuild notice to README

Surfaces foundation spec + research links at top.
Preserves v1 sections (mark as historical for now).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Update CLAUDE.md (minimal v2 pointer)

**Files:**
- Modify: `CLAUDE.md` (top portion only)

- [ ] **Step 1: Insert v2 pointer after main title**

Use Edit tool to add this block immediately after `# School ERP — Operating Manual` line:

```markdown
> **🚧 v2 Rebuild Active (May–July 2026)**
>
> Foundation rebuild in progress. v1 domain code hard-deleted on 2026-05-04 (commit per phase 0 plan).
>
> **Read first** before any work:
> - [Foundation Design Spec](docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) — covers schema, scaffold engine, sprint plan, cycle decomposition (~33 cycles / 8 phases / 8 weeks)
> - [Phase 0 Plan](docs/superpowers/plans/2026-05-04-p0-hard-delete-domain-code.md) — current cycle implementation plan
> - [Research insights](docs/research/2026-05-04-nisaa-teacher-insights.md)
> - [v1 audit](docs/research/2026-05-04-existing-erp-audit.md)
>
> **3-step workflow** (`/spec` → `/build` → `/ship`) below remains canonical. Per-cycle adjustments per foundation spec §18.12. Marathon mode: cycles deriving from foundation spec skip full brainstorm; reference spec by section in cycle Context.
>
> Standards file additions (post p1): `scaffold.md`, `entity-registry.md`, `permission-scope.md`, `audit-pii.md`, `workflow.md`, `migration.md`. Existing standards remain valid for preserved `lib/` code; UI / patterns standards evolve alongside scaffold engine cycles.

```

- [ ] **Step 2: Verify**

```bash
head -25 CLAUDE.md
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(p0): add v2 rebuild pointer to CLAUDE.md

Surfaces foundation spec + phase 0 plan + research at top.
Existing 3-step workflow + standards table preserved (full
rewrite happens incrementally per cycle).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Create DR runbook stub

**Files:**
- Create: `docs/runbooks/disaster-recovery.md`

- [ ] **Step 1: Verify runbooks directory exists**

```bash
ls docs/runbooks/ 2>/dev/null || mkdir -p docs/runbooks
```

- [ ] **Step 2: Write DR runbook stub**

Create `docs/runbooks/disaster-recovery.md` with content:

```markdown
# Disaster Recovery Runbook

> **Status:** STUB (drafted phase 0). Full content fleshed out W7 polish phase.
>
> Tested before W8 production cutover.

## Scope

Recovery procedures for An Nisaa Sekolahku ERP under operational failure scenarios.

## Tier-aware

| Phase | Backup | PITR | Runbook applicability |
|---|---|---|---|
| W1-W7 (free tier) | Weekly manual `pg_dump` | None | Local dev recovery only |
| W8+ (Pro tier) | Daily managed backup | 7 days PITR | Full production runbook |

## Scenarios

### S1: Local dev DB corruption (W1-W7)

**Symptom:** Prisma queries fail, schema drift errors locally.

**Recovery:**

```bash
# 1. Reset local DB
npx prisma migrate reset --skip-seed

# 2. Re-apply seeds (when phase 1 ships)
npx tsx prisma/seed/index.ts

# 3. Verify
npx prisma studio
```

### S2: Staging DB corruption (W8+)

**Symptom:** Production users report data missing or queries fail.

**Recovery (Pro tier PITR):**

1. Open Supabase dashboard → Project → Database → Backups
2. Identify last-known-good timestamp (parent reports / audit log scan)
3. Click "Point-in-time recovery" → restore to timestamp
4. Verify via smoke test queries
5. Communicate to admin + Kepsek via WA: "System restored to [time]. Latest changes since [time] need re-entry."

### S3: Vercel deploy bad release

**Symptom:** App returns 500 / wrong UI after deploy.

**Recovery:**

1. Open Vercel dashboard → Deployments
2. Identify last-known-good deployment (timestamp before issue)
3. Click "..." → "Promote to Production"
4. Verify via smoke test
5. Investigate bad commit + revert in git, ship fix forward

### S4: Sentry incident response

(TODO — flesh out W7)

### S5: pg-boss queue stuck

(TODO — flesh out W7)

### S6: Xendit webhook delivery failure

(TODO — flesh out W7)

### S7: Total Supabase project loss

(TODO — flesh out W7. Will require: pg_dump restore to fresh project + Storage backup bucket import + DNS update. ~4 hours target RTO.)

## Test cadence

- [ ] Pre-W8: rehearse S1 + S3 manually
- [ ] W8: rehearse S2 (PITR) on staging clone
- [ ] Quarterly: full S7 drill on isolated test project

## Contact

- Solo dev: Ismail (ismailir10)
- Backup dev: TBD
- School Kepsek: Kepala TKIT / Kepala RA An Nisaa

## Last reviewed

2026-05-04 (stub created phase 0)

```

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/disaster-recovery.md
git commit -m "docs(p0): DR runbook stub

S1 (local dev), S2 (PITR), S3 (Vercel rollback) drafted.
S4-S7 placeholders for W7 polish phase. Test cadence noted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Final verification

**Files:**
- N/A (verification only)

- [ ] **Step 1: Build passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds. If failures remain, fix before proceeding (likely orphan imports — search + delete).

- [ ] **Step 2: Vitest unit tests**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: passes OR test file references deleted code (delete those tests). Acceptable to have fewer tests post phase 0 — full suite rebuilds per cycle.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: no errors. If errors reference deleted code paths, fix.

- [ ] **Step 4: Dev server boots**

```bash
npm run dev &
DEV_PID=$!
sleep 10
curl -s http://localhost:3000/ | grep -i "rebuild" && echo "homepage OK"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/teacher
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/parent
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/students
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/auth/me
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health/xendit
kill $DEV_PID
```

Expected:
- `homepage OK` (rebuild placeholder rendered)
- `/admin`, `/teacher`, `/parent` → `404`
- `/api/students` → `404`
- `/api/auth/me` → `200` or `401` (auth route preserved)
- `/api/health/xendit` → `200` or related (route preserved)

- [ ] **Step 5: Prisma still works**

```bash
npx prisma validate
npx prisma generate
```

Expected: schema valid, client regenerated.

(Schema reset happens in p1 cycle 1, NOT here.)

- [ ] **Step 6: Update cycle doc Verification section**

Edit `docs/cycles/2026-05-04-p0-hard-delete-domain-code.md`, fill Verification section with results above.

- [ ] **Step 7: Commit verification update**

```bash
git add docs/cycles/2026-05-04-p0-hard-delete-domain-code.md
git commit -m "docs(p0): cycle doc verification — phase 0 green

All gates passed: build + vitest + tsc + dev server smoke.
Homepage shows rebuild notice. /admin, /teacher, /parent 404.
Auth + Xendit + cron preserved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Open PR via /ship workflow

**Files:**
- N/A (PR + cycle ship notes)

- [ ] **Step 1: Sync staging via existing tool**

```bash
bash scripts/sync-staging.sh 2>&1 | tail -5
```

Expected: up-to-date or fast-forward to latest.

- [ ] **Step 2: Verify branch state**

```bash
git status
git log --oneline staging..HEAD | wc -l
```

Expected: clean tree, ~14 commits ahead of staging (one per task).

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/p0-hard-delete-domain-code
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --base staging --title "feat(p0)!: hard delete v1 domain code, prepare greenfield" --body "$(cat <<'EOF'
## Summary

Phase 0 of v2 rebuild. Hard-delete v1 domain code (admin/teacher/parent UI, domain API routes, seeds, validators, e2e specs) to prepare clean slate for foundation rebuild.

**Schema preserved** — reset happens in p1 cycle 1.

## Scope per [foundation spec §18.0](docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md#180-phase-0)

### Deleted
- \`app/admin/\` (28 pages)
- \`app/teacher/\` (10 pages)
- \`app/parent/\` (6 pages)
- \`app/payment/\`
- \`app/api/{admin,students,admissions,...}\` (26 domain route dirs)
- \`prisma/seed.ts\` (1421 lines)
- \`lib/validations/\` (19 files)
- 6 e2e specs

### Kept
- \`lib/{xendit,payroll,finance,hijri,api,webhook,auth,db,...}\`
- \`app/{auth,api/auth,api/cron/finance-maintenance,api/health,api/xendit}\`
- \`prisma/schema.prisma\` + migrations (reset in p1)
- \`components/ui/*\` (Shadcn)
- \`.claude/standards/design-system.html\`
- UAT mechanism (skill + personas + jobs library)

### Archived
- 8 v1 UAT reports → \`docs/uat/reports/_archive/v1/\`

### Replaced
- \`app/page.tsx\` → minimal "v2 rebuild in progress" notice
- \`README.md\` + \`CLAUDE.md\` updated w/ v2 rebuild banner

### Created
- \`docs/runbooks/disaster-recovery.md\` (stub, fleshed out W7)
- \`docs/cycles/2026-05-04-p0-hard-delete-domain-code.md\`

## v1 backup

Tagged at \`v1-final-2026-05-04\`. Full restore = \`git revert\` PR + \`prisma migrate reset\` + restore pg_dump.

## Test plan

- [x] \`npm run build\` passes
- [x] \`npx vitest run\` passes
- [x] \`npx tsc --noEmit\` clean
- [x] Dev server boots
- [x] Homepage shows rebuild placeholder
- [x] \`/admin\`, \`/teacher\`, \`/parent\` return 404
- [x] \`/api/auth/me\` works
- [x] \`/api/health/xendit\` works
- [x] \`npx prisma validate\` clean

## Breaking changes

⚠️ Domain UI + APIs unavailable until p2-p6 ship rebuilt versions on scaffold engine. v1 still accessible at \`v1-final-2026-05-04\` tag if needed.

## Next

p1-extensions-tenancy cycle = schema reset (drop all migrations + models, rebuild Tenant + finance subset fresh) + RLS + JWT hook + scaffold engine skeleton.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL returned.

- [ ] **Step 5: Watch CI**

```bash
gh pr checks $(gh pr view --json number -q .number) --watch
```

Expected: all 3 checks (Lint+Typecheck+Test, Build, Playwright E2E) pass. Playwright may have 0 specs (acceptable — record skip in cycle Ship Notes).

If Playwright fails because zero specs:
- Acceptable for phase 0 since e2e cycle adds specs back per cycle
- Update cycle Ship Notes: "Playwright skipped — no specs in repo until p2"

- [ ] **Step 6: Fill cycle doc Ship Notes**

Edit `docs/cycles/2026-05-04-p0-hard-delete-domain-code.md` Ship Notes:

```markdown
## Ship Notes

- PR: <URL from step 4>
- Migrations: NONE (schema preserved until p1 cycle 1)
- Env vars: no changes
- Rollback: `git revert <PR-merge-SHA>` then `prisma migrate reset` if any prisma client churn (none here, but tag `v1-final-2026-05-04` is the canonical fallback)
- BREAKING: domain UI + APIs unavailable. Communicated upstream — no active v1 users at cutover.
- Playwright suite empty post-cycle — specs land per p2-p6 cycles.
- Pre-launch checklist run: phase 0 backup checks (pg_dump, git tag, no active sessions, rollback rehearsed) ✅
```

```bash
git add docs/cycles/2026-05-04-p0-hard-delete-domain-code.md
git commit -m "docs(p0): ship notes filled

PR opened, CI green expected. v1 backup tagged. No migrations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push
```

- [ ] **Step 7: Manual merge when CI green**

```bash
gh pr merge $(gh pr view --json number -q .number) --squash --delete-branch
```

- [ ] **Step 8: Cleanup worktree**

```bash
cd ../..
git worktree remove .worktrees/p0-hard-delete-domain-code
git branch -D feat/p0-hard-delete-domain-code 2>/dev/null || true
```

---

## Final acceptance checklist

After Task 16 merge to staging:

- [ ] All 16 tasks committed individually (one per logical step)
- [ ] PR merged to `staging` w/ 3 CI checks green (Playwright "0 specs" acceptable)
- [ ] `v1-final-2026-05-04` tag visible on origin
- [ ] Local checkout `git pull origin staging` reflects deletions
- [ ] Homepage on prod (Vercel auto-deploy after merge) shows rebuild placeholder
- [ ] `/admin`, `/teacher`, `/parent` return 404 on production
- [ ] Cycle doc `docs/cycles/2026-05-04-p0-hard-delete-domain-code.md` complete (Implementation, Verification, Ship Notes filled)
- [ ] DR runbook stub committed at `docs/runbooks/disaster-recovery.md`
- [ ] No active v1 users disrupted (no support tickets)
- [ ] Worktree cleaned up locally

When all checked → phase 0 done. Ready to start phase 1 with `p1-extensions-tenancy` cycle (schema reset + tenancy + RLS + JWT hook).

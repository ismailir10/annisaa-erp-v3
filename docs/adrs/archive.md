# Architecture Decisions — Archive

ADRs older than 60 days OR whose constraint is now codified elsewhere (in `CLAUDE.md` operating manual or `.claude/standards/*.md`) live here. The active table in `README.md` keeps only decisions still actively constraining day-to-day work in the last 60 days. New cycles append to README; cycles that age out roll into this file chronologically.

Archive policy: when a row in `README.md`'s Architecture Decisions table is older than 60 days, OR when the decision it records has been absorbed into the operating manual / a standard file (so the table cell would just duplicate that source), move the row here verbatim — byte-equal to the README cell text. Do not edit during the move.

## Pre-2026 baseline

| Date | Decision | Why |
|---|---|---|
| 2025 | Next.js App Router + Server Components by default | Supabase SSR integration, streaming, and route-handler co-location |
| 2025 | Prisma over direct Supabase client for business logic | Type safety, migration history, easier local SQLite dev |
| 2025 | Soft-delete everywhere (`status=INACTIVE`) | Audit trail, undo, no data loss |
| 2025 | Shadcn-first UI (62 components installed) | Consistency, accessibility, avoids bespoke drift |

## Process-meta (now codified in CLAUDE.md)

| Date | Decision | Why |
|---|---|---|
| 2026-04-15 | 3-command workflow (`/spec`, `/build`, `/ship`) over upstream 7 | Lower friction for small cycles; every upstream skill is still mapped into one of the three |
| 2026-04-15 | One markdown file per cycle, enforced by pre-commit hook | Stop scratch-file proliferation from non-Opus sessions |
| 2026-04-15 | `prd.md` retired; README.md becomes single source of truth for status/roadmap/ADRs | Eliminate three-way doc drift |
| 2026-04-18 | Unified PR-based `/ship`: all roles open a PR to `staging` and merge manually when CI is green — no direct pushes to `staging` or `main` | GitHub free plan doesn't support branch protection / auto-merge; manual merge + pre-push hook + CTO discipline is the enforcement layer (supersedes 2026-04-15 role-gated push) |

## Aged out of README's 60-day window (moved 2026-06-17)

Rows below dropped from README's active ADR table when they passed the 60-day cutoff. Verbatim — see the linked cycles for context.

| Date | Decision | Why |
|---|---|---|
| 2025-04 | Bundle perf phase 2: analyzer + dynamic imports | Initial bundle was >400KB — see [cycle](docs/cycles/archive/2025-04-15-performance-optimization-phase2.md) |
| 2026-04 | Xendit over Midtrans for parent payments | Cleaner Checkout Session API + webhook semantics |
| 2026-04-21 | Single `StudentJournalTemplate` with `scope` enum (SCHOOL/HOME) | One admin page + shared `<WeekGrid>`; one audit table — see [cycle](docs/cycles/archive/2026-04-21-student-journal.md) |
| 2026-04-24 | Teachers use `/api/teacher/students?classId=…`, not admin `/api/students` | Closes PII enumeration leak — see [cycle](docs/cycles/archive/2026-04-24-critical-money-and-auth-hotfix.md) |
| 2026-04-24 | `ConfirmDialog` rebuilt on AlertDialog (Base UI), stays open on `onConfirm` reject | Caller toasts and user retries — see [cycle](docs/cycles/archive/2026-04-24-alertdialog-jakarta-schema-alignment.md) |
| 2026-04-24 | Date helpers use `getYmdInTimezone(d, "Asia/Jakarta")` not `toISOString()` | UTC fallback returned yesterday's data 00:00–06:59 WIB on Vercel — see [cycle](docs/cycles/archive/2026-04-24-alertdialog-jakarta-schema-alignment.md) |
| 2026-04-24 | Capacity check inside `$transaction` with `SELECT … FOR UPDATE OF cs` | Closes over-enrollment race on concurrent promote |
| 2026-04-24 | Prisma: `@@unique([tenantId, email])`, explicit `onDelete` everywhere | Schema matches multi-tenant intent — see [cycle](docs/cycles/archive/2026-04-24-alertdialog-jakarta-schema-alignment.md) |
| 2026-04-24 | RLS = tenant-scoped SELECT only; writes via `service_role` | App-layer `tenantId` filter is real write isolation; CI guard `verify-rls-coverage.sh` — see [cycle](docs/cycles/archive/2026-04-24-stress-review-followups.md) |
| 2026-04-24 | Accept prefix collision on `20260424000000_*` migrations | Already applied; rename would break Prisma `_migrations` state. Future migrations must avoid `YYYYMMDD000000` when one exists |
| 2026-04-24 | `Content-Security-Policy-Report-Only` added; `@libsql/*` removed | Logs without blocking — graduate after console clean — see [cycle](docs/cycles/archive/2026-04-24-outstanding-findings-audit.md) |
| 2026-04-25 | Parent kuitansi PDF route `GET /api/guardian/invoices/[id]/pdf` | Detail-sheet link previously 404'd — see [cycle](docs/cycles/archive/2026-04-25-parent-portal-design-fixes.md) |
| 2026-04-25 | Permission-based RBAC for HR replaces role-string checks | `hasPermission()` from `session.permissions`; `SCHOOL_ADMIN` excludes `hr.*` — see [cycle](docs/cycles/archive/2026-04-25-super-admin-rbac-sidebar-fix.md) |
| 2026-04-25 | Tagihan async pipeline: `PENDING_PAYMENT_LINK` status, chunked bulk-gen, retry endpoint, manual single-student create | Vercel free 60s ceiling forces ≤25-row chunks + `pLimit(5)`; durable failure state — see [cycle](docs/cycles/archive/2026-04-25-tagihan-fixes-async-bulk-manual-create.md) |
| 2026-04-26 | Finance Robustness: `InvoiceNumberSequence` allocator, two-phase webhook, bulk retry orchestrator, parent allow-list | Eliminates P2002 race on `POST /api/invoices`; new `CRON_SECRET` env — see [cycle](docs/cycles/archive/2026-04-26-finance-robustness-a-b-c.md) + [follow-ups](docs/cycles/archive/2026-04-26-finance-followup-fixes.md) |
| 2026-04-27 | Invoice creation auto-retry: typed `XenditApiError` + `withXenditRetry` (3 attempts, honors `Retry-After`) | Transient 5xx/408/429/network retried inline before persisting failure — see [cycle](docs/cycles/archive/2026-04-27-invoice-create-auto-retry.md) |
| 2026-04-28 | Bulk fan-out throttled: concurrency=2, 1s inter-chunk pacing, 2-attempt 429 budget | Rate-limit storm fits 60s function ceiling — see [cycle](docs/cycles/archive/2026-04-28-finance-bulk-throttle.md) |

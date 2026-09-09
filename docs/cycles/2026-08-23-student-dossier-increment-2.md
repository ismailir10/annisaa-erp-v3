# Student Dossier — Increment 2 (Keuangan, Keringanan, Buku Penghubung)

## Context

Increment 1 (#516, `docs/cycles/2026-08-22-student-dossier.md`) rebuilt `/admin/students/[id]` as the approved Direction A dossier: anchor nav, collapsible sections, sticky summary rail. It was deliberately scoped to payload-only and client work — it added no route and no query, so it could be reviewed on staging before anything new was aggregated.

The owner approved it and gated increment 2 on that review. Its follow-up note names this increment exactly:

> increment 2 — Keuangan / keringanan / Buku Penghubung sections over the routes that already accept `studentId`.

Three modules already answer "what about *this* child" through a `studentId` filter, and none of them is reachable from the student record:

| Module | Route that already filters by student | Where an admin has to go today |
|---|---|---|
| Tagihan | `GET /api/invoices?studentId=` | `/admin/invoices`, then search the child's name |
| Keringanan | `GET /api/student-fee-adjustments?studentId=` | `/admin/fees` → Keringanan tab, then search |
| Buku Penghubung | `GET /api/student-journal/admin/students/[id]/week` | `/admin/student-journal/students/[id]` |

So the same question — "is this family behind on payments, do they hold a discount, how has the child been this week" — costs three navigations away from the record and three searches back. This increment renders all three inline, read-only, with a deep link out to the module that owns the write.

**No new routes.** Every fetch here is an existing admin-guarded route called with a `studentId` it already accepts. Increment 3 is still the one that adds aggregate endpoints.

## Spec

1. **Keuangan** section: summary (total ditagih, sudah dibayar, sisa tagihan, jumlah belum lunas) over `GET /api/invoices?studentId=`, plus the invoice list. Each row deep-links to `/admin/invoices/[id]`.
2. Outstanding is computed with the **same rule the parent portal uses** — statuses `SENT` / `PARTIALLY_PAID` / `OVERDUE`, post-filtered on `remaining > 0`. Admin and parent must never disagree about what a family owes.
3. **Keringanan** section: the student's fee adjustments, read-only, with type/mode/value, validity window, reason and status. Deep-links to `/admin/fees` **on the Keringanan tab**.
4. **Buku Penghubung** section: the admin week route for this student, rendered read-only via the existing `WeekGrid`, with week nav and this week's notes. Deep-links to `/admin/student-journal/students/[id]?weekStart=`.
5. The rail gains a **Tunggakan** tile with the real outstanding figure. No tile is added for attendance or raport — those still need increment 3's aggregate route, and a permanently blank tile reads as broken.
6. Keringanan and Buku Penghubung are **lazy** — opening the section is what pays for the fetch, matching Kehadiran from increment 1. Keuangan is eager because the rail tile depends on it.
7. Mobile: the three sections join the accordion; only Data Anak stays open by default. The Tunggakan tile joins the mobile stat grid.
8. No schema change, no migration, no new API route.

## Tasks

- T1 — `lib/finance/student-invoice-summary.ts`: the unpaid-status allow-list and a pure `summarizeStudentInvoices`. Point `lib/parent-helpers.ts` at the shared constant so the two surfaces cannot drift. Unit tests.
- T2 — `lib/student/journal-week.ts`: pure week-summary helpers (checked-per-day counts, indicator totals) so the section renders without duplicating the journal page's logic. Unit tests.
- T3 — Keuangan section + eager invoice fetch + the Tunggakan rail tile.
- T4 — Keringanan section (lazy).
- T5 — Buku Penghubung section (lazy) over `WeekGrid`.
- T6 — `/admin/fees` honours `?tab=`, so the Keringanan deep link lands on the right tab instead of the default one.

## Implementation

| File | Change |
|---|---|
| `lib/finance/student-invoice-summary.ts` *(new)* | `UNPAID_INVOICE_STATUSES` + pure `summarizeStudentInvoices`. Excludes `CANCELLED` from billed/paid so the section's own arithmetic agrees with the outstanding figure beside it; post-filters `remaining > 0`; clamps at zero on overpayment; reads `Decimal`-as-string and treats an unparseable amount as 0 rather than `NaN`. |
| `lib/parent-helpers.ts` | `getParentOutstandingForStudents` now imports that constant instead of repeating the literal. One list, two surfaces. |
| `lib/student/journal-week.ts` *(new)* | `summarizeJournalWeek` (per-day checked counts, filled days, totals — ignoring entries against indicators no longer in the template) and `shiftWeek`. |
| `components/admin/student-finance-block.tsx` *(new)* | Presentational. Four summary figures, then the invoice list, each row a link to `/admin/invoices/[id]`. Loading skeleton, and a stated failure with a retry rather than an empty state. |
| `components/admin/student-keringanan-block.tsx` *(new)* | Owns its lazy fetch. Type/mode/value, validity window, reason, status; link to `/admin/fees?tab=keringanan`. |
| `components/admin/student-journal-block.tsx` *(new)* | Owns its lazy fetch and week cursor. Read-only `WeekGrid` (passing no `onToggle` is the whole of read-only), prev/next week, this week's notes, link to the full journal page on the same week. |
| `components/admin/detail-rail.tsx` | `RailTile` gains `wide` — the currency tile needs the width, and it keeps an odd tile count from leaving a hole in the 2-column grid. |
| `components/admin/dossier-section.tsx` | `DossierSection` gains opt-in `keepMounted`; `DossierNav` wraps from `lg` instead of scrolling. Both explained under Verification. |
| `app/admin/students/[id]/page.tsx` | Three sections after Kehadiran, the eager invoice fetch, the Tunggakan rail tile, and the guardian-advisory focus fix. |
| `components/admin/student-enroll-dialog.tsx` | Same focus fix as the guardian advisory. |
| `app/admin/fees/page.tsx` | Honours `?tab=`, falling back to `components` on an unrecognised value. Without it the Keringanan deep link landed on Komponen Biaya. |
| `app/admin/students/[id]/__tests__/dossier-sections.test.tsx` *(new)* | 7 tests: the eager fetch and its `studentId` scoping, outstanding by the shared rule, "Lunas semua", the failure case, and that neither lazy section requests anything until opened (or twice when re-opened). |
| `README.md` | students module line notes the three sections and the balance tile. |

**Why Keuangan is eager and the other two are not.** The rail's Tunggakan tile is the page's money answer and sits above the fold; a tile that only fills once an admin opens a section below it would read as `Rp 0` — indistinguishable from "paid up". So invoices are fetched with the student. Keringanan and Buku Penghubung have no rail consumer, so they follow Kehadiran's rule from increment 1: opening the section is what pays for the fetch.

**One outstanding rule, not two.** `lib/parent-helpers.ts` already owned "what does this family owe" for the parent portal, and the UAT-2026-05-03 INV-01 finding was two surfaces disagreeing about exactly that. Rather than write a second sum, the status allow-list moved into `lib/finance/student-invoice-summary.ts` and the parent helper imports it.

**Failure never renders as zero.** Both the tile and the section distinguish "not loaded" from "nothing owed": the tile shows `Memuat…` then a dash on failure, and the section states the failure with a retry. The invoice fetch also deliberately does not toast — the student record still renders, and a page-load side fetch firing a toast on every offline hiccup is noise.

## Verification

**Gates** — all run in `.worktrees/dossier-increment-2` after merging `origin/staging` at `16ef3f81` (which is #517):

- `npm run build` — ✅ `✓ Compiled successfully in 5.6s`.
- `npx vitest run` — ✅ `Test Files 324 passed | 2 skipped (326)` · `Tests 3163 passed | 42 todo (3205)`, 61.55s. Zero failures, full suite, not per-file.
- `npx tsc --noEmit` — ✅ exit 0.
- `npm run lint` — ✅ `61 problems (0 errors, 61 warnings)`; all 61 pre-existing, none on a file this cycle touched.
- `bash scripts/verify-api-auth.sh` — ✅ `191 / 191 routes have session helper or @public sentinel`.
- `bash scripts/verify-rls-coverage.sh` — ✅ `41 / 41 tenant-scoped models have ENABLE + policy`.
- `bash scripts/audit-docs.sh` — ✅ `10 ok, 1 warn, 0 fail` (the warn is the pre-existing 61-day ADR row).
- **Playwright** — deferred to the required CI `Playwright E2E` check. Not runnable locally: `playwright.config.ts` refuses a non-local `DATABASE_URL` and this worktree's `.env` points at shared staging, where the specs would write real rows.

- [x] Cross-checked `design-system.html`: Shadcn primitives throughout (`Card`, `Badge`, `Skeleton`, `EmptyState`, `StatusBadge`, `Collapsible`), `p-card` / `space-y-field` spacing, `font-currency` + `tabular-nums` on every money figure, and `-text` colour variants (`text-destructive`, `text-status-absent-text`) rather than raw fills — the same contrast rule increment 1 recorded for the rail.

**Manual smoke** — local `DEMO_MODE=true npm run start` on port 3210 against the staging DB, demo cookie, student `cms5estyz0000iwx789l3b0k7` (Hafizh Umar Ramadhan: 6 SENT invoices totalling Rp 4.262.500 unpaid, 2 keringanan rows — one ACTIVE, one INACTIVE). Screenshots at 1440 and 390 in `~/Documents/ai-builder/talib-screenshots/2026-08-23-dossier-increment-2/`.

Three defects were found in that smoke and fixed before this doc was written:

1. **Collapsing a lazy section re-requested it.** `CollapsibleContent` unmounts its children, so `StudentKeringananBlock` lost its rows and re-fetched on every re-open — and `StudentJournalBlock` also lost the week the admin had navigated to, silently snapping back to the current one. Fixed with an opt-in `keepMounted` on `DossierSection`, set only on these two. Deliberately not global: unmounting closed sections is what keeps the mobile accordion cheap, and increment 1's other seven sections should keep that. Pinned by the "does not re-request on a second open" test.
2. **The Keuangan header truncated to "Keuan…" at 390px.** The `Modul Tagihan →` header action plus the `6 belum lunas` badge left no room for the title. The link moved to the foot of the block, where Keringanan already puts its own.
3. **The anchor nav dropped two sections at 1440.** Increment 1's nav is a single scrolling row, which fitted 8 items; 11 pushed Dokumen and Informasi Tambahan off the right edge with no scrollbar to hint they existed. It now wraps from `lg` and still scrolls below that. Verified: 10 nav buttons render across two rows.

Also fixed in passing, and the reason `Lint, Typecheck & Test` had been red on #517: the enroll and guardian 409 advisories moved focus with `setTimeout(() => ref.current?.focus(), 0)`, which can run before React commits the banner — ref null, focus silently dropped, nothing retries. Both are now effects. #517 carries the same fix for `app/admin/classes/[id]/client.tsx`; see `docs/cycles/2026-08-22-vitest-flake-fix.md` for the evidence and its limits.

**Not verified this cycle.**

- **Buku Penghubung with real ticks.** Staging holds zero journal entries — `GET /api/student-journal/admin/classes` reports `checkedCount: 0` and `lastFilledAt: null` for all 8 classes — so every student's week renders as the template with no ticks, which is what the screenshot shows. The populated path (`1/5 hari terisi · 1 centang`, a note rendered with its author) is covered by unit test instead. No rows were written to shared staging to make a screenshot look better.
- **Preview-verify on Vercel** — runs after the PR opens.
- The Keuangan empty state, and the finance summary against a `PARTIALLY_PAID` or `CANCELLED` row: no staging student has that mix, so those are unit-tested only.

## Ship Notes

- **Migrations:** none. No schema change.
- **Env vars:** none.
- **New routes:** none. All three sections call routes that already accepted `studentId`.
- **Data:** none written. Every fetch this cycle adds is a GET.
- **Performance:** one extra request per student-detail view (`GET /api/invoices?studentId=…&pageSize=100`, an indexed single-student query — the table carries `@@index([studentId, status])`). Keringanan and the journal add nothing until their section is opened.
- **Rollback:** revert the merge commit. `?tab=` on `/admin/fees` falls back to the previous default, and the shared `UNPAID_INVOICE_STATUSES` constant reverts to the inline literal it replaced — no persisted state changes shape.
- **Follow-ups (owner-gated, not in this cycle):** increment 3 — `GET /api/students/[id]/overview` for the attendance and raport rail tiles, plus `/enrollment-application` and `/academics`. Those tiles are still deliberately absent rather than shipped blank.

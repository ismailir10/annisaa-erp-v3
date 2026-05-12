# UAT 2026-05-12 — quick + medium fixes

## Context

Three UAT walkthroughs ran on 2026-05-12 (admin, teacher, parent portals) and surfaced 28 findings: 2 blockers, 10 majors, 16 minors, 6 cosmetic. Exploration revealed two reported blockers/majors were not code defects: (1) parent paid-invoice "Riwayat" already works — UAT cache staleness from direct DB seed, not code; (2) admin semester year-2065 rows are E2E test pollution, not a seed/migration bug. Remaining items split cleanly into S (single-file) and M (multi-file or mechanical) tiers. This cycle batches the S+M fixes that improve trust on the most-visible surfaces (attendance, invoices, Pengguna table, profile, login error UX) plus two codification tasks (header casing rule + i18n glossary) that prevent regression on the patterns we're fixing. L-tier (login redesign, dashboard chart, Penghubung architecture, staging seed enhancement) deferred to future cycles. Three full UAT reports — `docs/uat/reports/2026-05-12-{admin,teacher,parent}-full-walkthrough.md` — drive the Context; consumed copies will be `git add -f`'d into this cycle's commit per `/spec` Step 2.

## Spec

### Acceptance criteria

- [ ] Parent attendance week-summary banner appears when week has any non-PRESENT day (SICK, ABSENT, or PERMISSION) — currently misses PERMISSION-only weeks
- [ ] `SUPER_ADMIN` role renders as "Super Admin" in admin Pengguna table (matches Peran & Izin page)
- [ ] Admin Pengguna subtitle count matches stat-card sum (single source of truth)
- [ ] Synthetic parent seed emails no longer expose internal id (`*@parent.seed.local`) — use readable demo domain
- [ ] Karyawan > Gaji tab renders salary components with `formatRupiah()` (matches Penggajian detail)
- [ ] Teacher slip-gaji detail hides Rp 0 line items
- [ ] Teacher dashboard greeting uses employee display name (not first-word slice)
- [ ] Teacher profile bank account masked with `maskBankAccount()` (matches slip detail)
- [ ] Login page surfaces error toast/banner when query contains `?error=access_denied` ("Akun belum terdaftar. Hubungi admin sekolah.")
- [ ] Portal header logout shows AlertDialog confirm ("Yakin ingin keluar?") before signing out
- [ ] Penempatan page subtitle reads "N penempatan" (not "pendaftaran")
- [ ] Design System sidebar link hidden when `NODE_ENV === "production"`
- [ ] Kehadiran Siswa date filter defaults to current month range on first render
- [ ] Tagihan stat-card grid renders without orphan row (5-col layout or consolidation)
- [ ] Parent invoice detail swaps "Bayar sekarang"/disiapkan copy for "Hubungi admin sekolah" when `sentAt < now - 24h` AND `xenditPaymentUrl` null
- [ ] `.claude/standards/ui.md` codifies table column-header casing rule (title case) — all admin tables comply
- [ ] `.claude/standards/voice.md` codifies glossary entries for: record→catatan, INQUIRY→"Pendaftaran Awal", PLANNING→"Perencanaan", "Timpa (Override)"→"Timpa" — all surfaced strings comply
- [ ] Runbook `docs/runbooks/staging-data-cleanup.md` documents purge SQL for E2E pollution (admin M1, B1) + audit checklist for E2E teardown gaps
- [ ] CTO executes purge SQL post-merge against staging (manual step in Ship Notes)

### Non-goals

- Login page visual redesign (logo, contrast — admin m3, c1) — L-tier, separate cycle
- Dashboard attendance chart redesign (admin m4) — L-tier, separate cycle
- Penghubung "no child" guard architectural unification (parent round-1) — separate cycle
- Staging reseed automation (`scripts/reseed-staging.sh` enhancement) — separate ops cycle
- National holidays seed (teacher minor) — needs ADR on holiday source
- Slip Gaji bottom-nav discoverability (teacher minor) — UX decision, separate
- Cosmetic c2/c3/c4/c6 (admin) — polish cycle later
- Parent paid-invoice Riwayat code change — verified working; cache-staleness only affects direct-DB seeding (not a real bug)
- Admin semester year-2065 code fix — verified clean seed; rows are E2E pollution handled by T10 runbook

### Assumptions

1. Table column-header convention = **title case** (e.g. "Kampus", not "KAMPUS"). One-word headers retain initial-cap. Multi-word: each significant word capitalized ("Status Akun"). Code blocks / database identifiers untouched.
2. i18n direction = Indonesian-first; loanwords (Xendit, PDF, Excel) untouched; ambiguous English domain terms get Indonesian equivalents per `.claude/standards/voice.md` glossary additions.
3. Pengguna count reconciliation = make subtitle count = `Aktif` aggregate (drop inactive from subtitle phrasing) to match stat-card totals — simpler than adding a third query.
4. Seed parent emails change pattern = `parent-${slug}@demo.talib.id` (deterministic, readable, demo-domain).
5. Logout confirm uses existing `<AlertDialog>` (Shadcn) — no new component.
6. Xendit fallback baseline = `Invoice.sentAt`. If null, fall back to `createdAt`.
7. Greeting fix uses full `userName` (e.g. "Guru Satu" → "Selamat Sore, Ustadz/Ustadzah Guru Satu") not split.
8. T8 (header casing sweep) ranks last among admin-table-touching tasks to avoid merge conflict with T2/T6.
9. T9 (i18n) is independent of all other tasks (copy-only, no logic overlap).
10. T10 staging cleanup = runbook + SQL only; CTO executes purge manually against staging post-merge. No automated DB script committed.

→ Correct any of these now or `/build` proceeds with these defaults.

## Tasks

### T1. Parent attendance — include PERMISSION in attention banner ✅

- **Files:** [app/parent/attendance/page.tsx:119](app/parent/attendance/page.tsx:119), [app/parent/attendance/__tests__/](app/parent/attendance/) (extend test)
- **Change:** `const hasAttention = sakit > 0 || alpa > 0 || izin > 0;`. Banner copy when ONLY izin > 0: "Hadir N · Izin M pekan ini" (neutral tone — distinct from sakit/alpa warm tone).
- **Test:** Vitest unit — week with only PERMISSION renders summary card; copy reads "Izin M".
- **Acceptance:** Parent attendance week with PRESENT + PERMISSION only shows summary banner.
- **Dependencies:** none

### T2. Admin Pengguna table — SUPER_ADMIN label + count alignment + seed email cleanup ✅

- **Files:** [app/admin/settings/users/page.tsx](app/admin/settings/users/page.tsx) (ROLE_LABELS + subtitle), [prisma/seed.ts:1401](prisma/seed.ts:1401)
- **Change:**
  1. Add `SUPER_ADMIN: "Super Admin"` to `ROLE_LABELS`
  2. Pengguna subtitle: derive from `stats.aktif` (or matching aggregate) so subtitle = stat-card sum
  3. Seed parent emails: `${kbAsterParent.id}@parent.seed.local` → `parent-${kbAsterParent.id.slice(-6)}@demo.talib.id`
- **Test:** Vitest — render Pengguna page with SUPER_ADMIN user → "Super Admin" cell; subtitle equals `stats.aktif` count. Seed snapshot adjusts.
- **Acceptance:** Pengguna table shows "Super Admin" cell; subtitle count = stat-card aktif total; demo emails readable.
- **Dependencies:** none — must run before T6 + T8 (overlap admin tables)

### T3. Currency formatting — Karyawan Gaji + slip Rp 0 filter ✅

- **Files:** [app/admin/(hr)/employees/[id]/page.tsx:311-326](app/admin/(hr)/employees/[id]/page.tsx:311), [app/teacher/slips/[id]/page.tsx](app/teacher/slips/[id]/page.tsx)
- **Change:**
  1. Karyawan Gaji tab — import `formatRupiah` from `lib/format.ts`; render a small `<p>` below each salary `<Input>` showing `formatRupiah(sv.value)` (hidden when value === 0). Edit input untouched.
  2. Slip detail — filter line items where `value === 0` from PENDAPATAN render. Keep total math unchanged.
- **Test:** Vitest — Karyawan Gaji renders "Rp 800.000" not "800000". Slip detail with Rp 0 line item omits the row.
- **Acceptance:** Read-only salary values use Rp format; zero-value slip rows hidden.
- **Dependencies:** none

### T4. Teacher personalization + bank-account security ✅

- **Files:** [app/teacher/home-client.tsx:154](app/teacher/home-client.tsx:154), [app/teacher/profile/page.tsx:28](app/teacher/profile/page.tsx:28)
- **Change:**
  1. Greeting: change `firstName = userName.split(" ")[0]` → use full `userName` directly in title template
  2. Profile bank field: apply `maskBankAccount()` (reuse from [app/teacher/slips/[id]/page.tsx:327](app/teacher/slips/[id]/page.tsx:327)). If util is currently inlined in slip detail, extract to `lib/format.ts` first (single-PR refactor, no behavior change), then import from both call sites.
- **Test:** Vitest — home-client greeting for "Guru Satu" renders "Selamat Sore, Ustadz/Ustadzah Guru Satu". Profile renders bank account as `Bank Demo ******0001`.
- **Acceptance:** Dashboard greets with full name; profile masks bank account identically to slip.
- **Security note:** Bank-account masking change — verify no logged/stored unmasked value elsewhere.
- **Dependencies:** none

### T5. Auth UX — login error surface + logout confirm ✅

- **Files:** [app/page.tsx:29-30](app/page.tsx:29), [components/portal/portal-header.tsx:91](components/portal/portal-header.tsx:91), [components/portal/__tests__/portal-header.test.tsx:53-60](components/portal/__tests__/portal-header.test.tsx:53)
- **Change:**
  1. Login page — add `access_denied` case to error map → toast/banner: "Akun belum terdaftar. Hubungi admin sekolah."
  2. Portal header logout button → wrap in `<AlertDialog>` with "Yakin ingin keluar?" + Konfirmasi/Batal actions; only invoke `onLogout()` on Konfirmasi.
  3. Update existing test "fires onLogout when the logout button is clicked" → click logout → click dialog Konfirmasi → assert `onLogout` called.
- **Test:** Vitest — login page renders error banner for `?error=access_denied`. Portal-header test asserts confirm-then-fire flow + cancel-no-fire flow.
- **Acceptance:** Failed auth shows actionable copy; accidental logout tap requires confirm.
- **Dependencies:** none

### T6. Admin quick polish ✅

- **Files:** [app/admin/enrollments/page.tsx](app/admin/enrollments/page.tsx), [config/admin-nav.ts:119](config/admin-nav.ts:119), [app/admin/student-attendance/page.tsx:274,286](app/admin/student-attendance/page.tsx:274), [app/admin/invoices/page.tsx:733-742](app/admin/invoices/page.tsx:733)
- **Change:**
  1. Penempatan subtitle: `${total} pendaftaran` → `${total} penempatan`
  2. Design System nav entry: wrap in `process.env.NODE_ENV !== "production"` (or use a stable feature-flag pattern already in repo — verify before commit)
  3. Kehadiran Siswa date filter: `defaultValue` = current month start / today (server-rendered initial values)
  4. Tagihan stat row: `StatsCardsRow` adjust to handle 5 cards cleanly — pick 5-col grid at lg breakpoint OR collapse JATUH TEMPO into JATUH TEMPO badge inside existing TOTAL card. Confirm with `.claude/standards/design-system.html` §Stats before code change.
- **Test:** Vitest — Penempatan subtitle copy. Visual — Tagihan stat row no orphan at lg breakpoint. Design System nav hidden in NODE_ENV=production unit test.
- **Acceptance:** Four issues independently verifiable.
- **Dependencies:** T2 (admin table touches) — sequence after

### T7. Parent invoice — Xendit-link 24h fallback ✅

- **Files:** [app/parent/invoices/invoice-detail-sheet.tsx](app/parent/invoices/invoice-detail-sheet.tsx)
- **Change:** Compute `linkStale = xenditPaymentUrl == null && (sentAt ?? createdAt) < now - 24h`. When `linkStale`: replace "Bayar sekarang" CTA + "Link sedang disiapkan…" warning with an info card: "Link pembayaran belum tersedia. **Hubungi admin sekolah** untuk info pembayaran." (no CTA button). When `!linkStale && xenditPaymentUrl == null`: keep current "Link sedang disiapkan…" copy.
- **Test:** Vitest — invoice with null xenditPaymentUrl + sentAt 25h ago renders fallback copy without button. Same invoice with sentAt 2h ago renders existing "disiapkan" copy.
- **Acceptance:** Stale missing-link invoices direct parent to admin; fresh ones keep optimistic copy.
- **Dependencies:** none

### T8. Codify column-header casing rule + sweep admin tables ✅

- **Files:** [.claude/standards/ui.md](.claude/standards/ui.md), all admin table headers under `app/admin/**` + `components/admin/**`
- **Change:**
  1. Add section to `ui.md` (after existing DataTable section): "Column header casing — title case for all table column headers in admin portal. One-word: initial-cap ('Kampus'). Multi-word: each significant word cap ('Status Akun'). Reserved Indonesian abbreviations (NIK, NIP, NPSN) stay all-caps. Database enum values are not headers — they go in cells and use `formatXxx()` helpers."
  2. Sweep admin tables — change ALL-CAPS headers to title case (KAMPUS→Kampus, REKENING→Rekening, PULANG→Pulang, PERAN→Peran, KELAS→Kelas, etc.). Mechanical replace, no logic change.
- **Test:** Vitest snapshot or assertion per touched admin list page — header reads title case. Add regression: lint-style check via `grep -rE "<TableHead[^>]*>[A-Z]{2,}" app/admin/` returns zero hits.
- **Acceptance:** ui.md has rule; no all-caps header strings in admin tables.
- **Dependencies:** T2, T6 (must run last among admin-table tasks to avoid conflicts)

### T9. Codify i18n glossary + replace English fragments ✅

- **Files:** [.claude/standards/voice.md](.claude/standards/voice.md), multi-file copy across `app/admin/**`, `app/teacher/**`, `app/parent/**`, `lib/email/**`
- **Change:**
  1. Add to `voice.md` glossary section: record→**catatan**, INQUIRY→**Pendaftaran Awal**, PLANNING→**Perencanaan**, "Timpa (Override)"→**Timpa**, Template→**Templat**. Brand/loanwords keep: Xendit, PDF, BPJS, NIK.
  2. Replace all instances per glossary across staged files. Use Grep to find every occurrence first, change in one task.
- **Test:** Vitest — affected pages render Indonesian terms. Plus regex check: `grep -rE "(INQUIRY|PLANNING|^\s*record\b)" app/ components/ lib/email/` returns zero non-comment hits.
- **Acceptance:** voice.md glossary updated; no English fragments per audit list remain in user-facing copy.
- **Dependencies:** none — copy-only, no logic overlap

### T10. Staging data cleanup runbook + E2E teardown audit

- **Files:** [docs/runbooks/staging-data-cleanup.md](docs/runbooks/staging-data-cleanup.md) (new), audit notes appended if gaps found in `e2e/admin*.spec.ts`
- **Change:**
  1. Write runbook: purpose, purge SQL (delete E2E rows with `name LIKE 'E2E PROMES Import %'` from AcademicYear + Semester, parameterized by tenantId), how to run safely against staging (Supabase MCP), verification queries.
  2. Audit `e2e/admin*.spec.ts` for `test.afterAll` / `afterEach` cleanup — if any spec creates AcademicYear/Semester rows without teardown, log finding in runbook "known gaps" section. **Do NOT modify e2e specs in this cycle** (avoid scope creep) — that's a follow-up.
  3. Note in Ship Notes: CTO runs purge SQL post-merge.
- **Test:** Runbook lints OK (no broken markdown). Manual: dry-run the SELECT (not DELETE) on staging in `/build` to confirm row counts match UAT report (8 rows).
- **Acceptance:** Runbook committed; staging purge SQL documented; e2e gaps logged.
- **Dependencies:** none — docs only

### Task dependency graph

```
T1  T3  T4  T5  T7  T9  T10   (parallel-safe)
T2 → T6 → T8                  (sequential, admin tables)
```

`/build` should dispatch parallel-safe group via subagents (per `superpowers:subagent-driven-development`), then run sequential chain in main session.

## Implementation

- Subagent plan: tasks executed sequentially in single worktree (shared admin-table surface across T2/T6/T8; shared portal-header tests across T5; safer git ops than parallel writes to same worktree). `feature-dev:code-reviewer` agent dispatched per task before commit per `/build` Step 6.
- T1 — extracted banner-decision to `lib/parent-attendance-banner.ts` (pure helper) with 7-case vitest; `app/parent/attendance/page.tsx` now renders 3 banner branches (all-present gold / warm orange / neutral sky) via `attendanceBannerState({hadir,sakit,alpa,izin,logged})`. Reviewer flagged pre-existing inline-style anti-pattern on the all-present banner (colors.md §NEVER); my T1 diff fixed the warm + new neutral branches but left the all-present block as-is to keep scope discipline — recommend follow-up cleanup cycle. Cross-checked design-system.html §Cards for status-leave tone choice.
- T2 — extracted `ROLE_LABELS` + `getRoleLabel` to `app/admin/settings/users/role-labels.ts` (avoid importing `"use client"` page in vitest). Added `SUPER_ADMIN: "Super Admin"`. Pengguna page: added 5th stats fetch for SUPER_ADMIN ACTIVE count, folded into Admin stat card (`stats.admin = sa + a`, `stats.total = sa + a + t + g`). Subtitle now `${stats.total} aktif · ${stats.inactive} tidak aktif` (single source of truth). Added "Super Admin" to role-filter dropdown (reviewer caught this functional gap). Seed: `${id}@parent.seed.local` → `parent-${id.slice(-6)}@demo.talib.id`. Cross-checked design-system.html §Stats for stat-card grid layout.
- T3 — Karyawan Gaji tab: `<Input>` unchanged; added `<p class="text-xs text-muted-foreground font-currency">{formatRupiah(sv.value)}</p>` rendered only when `sv.value > 0` (reviewer caught the "Rp 0" noise case). Slip detail: `incomeLines` + `deductionLines` filters add `finalAmount > 0` predicate; server-side totals unaffected. Cycle doc spec was inconsistent (`formatCurrency` ↔ `formatRupiah`) — corrected to `formatRupiah` (the canonical exporter in `lib/format.ts`). Cross-checked design-system.html §Forms for helper-text styling.
- T4 — Extracted `maskBankAccount` from `app/teacher/slips/[id]/page.tsx` to `lib/format.ts` (single source of truth). Applied to: (a) teacher profile page; (b) PDF data builder in `app/api/slips/[payrollItemId]/pdf/route.ts` (security reviewer caught — raw account was being rendered to PDF bytes; defense-in-depth = mask at route boundary). Hardened the masking primitive: ≤4-char inputs now return all-asterisks (was returning unmasked — reviewer flagged as security footgun). Added `Cache-Control: private, no-store` to PDF response to keep payroll PDFs out of shared caches. Teacher dashboard greeting: removed `.split(" ")[0]` so "Guru Satu" renders fully (was "Guru"). Both `superpowers:code-reviewer` and `feature-dev:code-reviewer` dispatched per build skill §security-sensitive rule. Cross-checked design-system.html §Profile + voice.md (Ustadzah Sari persona) for greeting tone.
- T5 — Login error: added `LOGIN_ERROR_MESSAGES` map to `app/page.tsx` covering `auth_failed` + `access_denied` (new) → "Akun belum terdaftar. Hubungi admin sekolah untuk akses." Portal header logout: wrapped icon button in `ConfirmDialog` ("Yakin ingin keluar?", `destructive` per voice.md irreversible-action rule, confirm label "Ya, Keluar" to disambiguate from icon button `aria-label="Keluar"` in tests). Updated `components/portal/__tests__/portal-header.test.tsx` to walk through confirm AND cancel flows (was a single-click test). Reviewer caught two E2E specs (`e2e/parent.spec.ts:156`, `e2e/teacher.spec.ts:131`) that would time out — both updated to click "Ya, Keluar" after opening the dialog. Cross-checked design-system.html §AlertDialog + voice.md §Dialog tone.
- T6 — Four small admin polish fixes: (a) `app/admin/enrollments/page.tsx` subtitle "pendaftaran" → "penempatan"; (b) `config/admin-nav.ts` Design System link gated behind `process.env.NODE_ENV !== "production"` (build-time inline → dead-code-eliminated from prod bundle); used `satisfies NavItem` per reviewer; (c) `app/admin/student-attendance/page.tsx` dateFrom + dateTo default to today (was empty string causing "no data" until user picks); (d) extended `components/admin/stats-cards-row.tsx` to support 5/6 cols and updated Tagihan page to `cols={pendingPaymentLink > 0 ? 6 : 5}` (was orphan row on default 4-col). Cross-checked design-system.html §Stats and §Filters.
- T7 — Extracted `paymentLinkState(hasPaymentLink, sentAt, now?)` helper to `lib/parent-invoice-link.ts` returning `"ready" | "pending" | "stale"`. Sheet at `app/parent/invoices/invoice-detail-sheet.tsx` renders three branches: ready (live CTA link), pending (disabled CTA + optimistic copy), stale (no CTA, orange status-late callout + "Hubungi admin sekolah"). Stale fires when `sentAt` is null OR > 24h ago. Reviewer added boundary test (exact 24h → pending; 24h + 1s → stale). Cross-checked design-system.html §Callouts and voice.md Ibu Nur persona for actionable-not-alarming tone.
- T8 — Root cause of admin "ALL CAPS column headers" was a CSS `uppercase` class on `<TableHead>` in `components/ui/data-table.tsx`; sources were already title case. Removed the class — all admin tables now render title case in one shot. Added "Column header casing — title case" subsection to `.claude/standards/ui.md` codifying the rule with examples (one-word, multi-word, allowed abbreviations like NIK/NIP/NPSN/BPJS, brand loanwords). Reviewer confirmed no E2E or other component depended on the uppercased rendering (the `text=PULANG` matcher in teacher e2e points at the check-in button label, not a DataTable header). Cross-checked design-system.html §DataTable.
- T9 — Added 5 entries to the voice.md cross-portal glossary: Catatan / Pertanyaan / Perencanaan / Templat / Timpa with rationale for each. Sweep applied: added `PLANNING → "Perencanaan"` to `components/ui/status-badge.tsx`; `app/admin/admissions/page.tsx` — "Catat Inquiry" + "Catat Inquiry Baru" + "Inquiry" stat label + empty-state copy → Pertanyaan-based equivalents (4 occurrences); `app/admin/(hr)/attendance/page.tsx` — "Timpa (Override)" → "Timpa"; `app/admin/assessments/page.tsx` — "Template" → "Templat" (2 occurrences); `app/admin/student-attendance/page.tsx` + `app/admin/(hr)/leave/page.tsx` — "record kehadiran" → "catatan kehadiran". `StatusBadge` keeps `INQUIRY → "Pertanyaan"` (unchanged — already canonical). Cross-checked design-system.html §Voice.

## Verification

- T1: `npm run build` ✓ + `npx vitest run` ✓ (1284 pass, 42 todo, 0 fail). Helper test file `parent-attendance-banner.test.ts` adds 7 cases. Cross-checked design-system.html §Cards for `status-leave` neutral-tone banner.
- T2: `npm run build` ✓ + `npx vitest run` ✓ (1289 pass, 42 todo). Test file `app/admin/settings/users/__tests__/role-label.test.ts` adds 5 cases. Cross-checked design-system.html §Stats for stat-card grid (5-col lg).
- T3: `npm run build` ✓ + `npx vitest run` ✓ (1289 pass). No new test — changes are trivial JSX render expressions (formatRupiah helper text + filter predicate) covered transitively by build. Cross-checked design-system.html §Forms for helper-text typography.
- T4: `npm run build` ✓ + `npx vitest run` ✓ (1293 pass). `lib/__tests__/format.test.ts` gained 4 maskBankAccount cases (10-digit normal, zero-padded, ≤4-char all-mask hardening, empty). Cross-checked design-system.html §Profile and voice.md Ustadzah Sari persona. Security-sensitive reviewers cleared (`feature-dev` + `superpowers`).
- T5: `npm run build` ✓ + `npx vitest run` ✓ (1294 pass). `portal-header.test.tsx` extended with confirm-fires + cancel-no-fire flows. E2E `parent.spec.ts` + `teacher.spec.ts` "logout works" tests updated for new dialog step (verified end-of-cycle Playwright run). Cross-checked design-system.html §AlertDialog and voice.md §Dialog for `destructive` styling on session-ending action.
- T6: `npm run build` ✓ + `npx vitest run` ✓ (1294 pass). No new unit tests — changes are pure copy/render/grid-cols literals. Cross-checked design-system.html §Stats (5/6-col variants) and §Filters (date picker defaults).
- T7: `npm run build` ✓ + `npx vitest run` ✓ (1300 pass). `lib/__tests__/parent-invoice-link.test.ts` adds 6 cases including the 24h boundary. Cross-checked design-system.html §Callouts (status-late tone) and voice.md Ibu Nur persona.
- T8: `npm run build` ✓ + `npx vitest run` ✓ (1300 pass). No new tests — CSS class removal + standard documentation. Cross-checked design-system.html §DataTable.
- T9: `npm run build` ✓ + `npx vitest run` ✓ (1300 pass). No new tests — copy-only diff. Cross-checked voice.md glossary and design-system.html §Voice.

Per CLAUDE.md frontend gate Rule 4: T1, T2, T3, T4, T5, T6, T7, T8 touch frontend → Verification will include "Cross-checked design-system.html §Stats / §DataTable / §Dialog / §Toast for [task scope]" lines.

End-of-cycle Playwright run targets: portal smoke (e2e/teacher.spec.ts, e2e/parent.spec.ts, e2e/admin.spec.ts) — header/auth/table changes have UI surface.

## Ship Notes

<filled by /ship — migrations, env vars, manual steps, rollback plan>

Expected manual step: CTO runs staging E2E-pollution purge SQL from T10 runbook against staging Supabase after merge.

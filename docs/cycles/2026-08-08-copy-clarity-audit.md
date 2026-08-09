# Cross-Portal Copy Clarity Audit

## Context

Seven parallel auditors swept every user-facing string across admin (41 pages), teacher (13), parent (8), plus the shared `lib/` + `components/ui/` layer that all three portals inherit. **~120 findings, 13 blockers.**

Copy discipline is broadly good. The parent portal's Empty State Contract compliance is near-perfect, the 3-level assessment skala (`Mampu`/`Belum`/`Perlu`) is well-worded for teachers, and `Hadir`/`Alpa`/`Sakit`/`Izin` is consistent everywhere. Failures cluster in three places the style guide never reached:

1. **Caught-error paths.** Modules build a clean Indonesian prefix, then splice raw `err.message` / vendor text in verbatim. Raw Supabase, Xendit, DOKU, Prisma, and Zod strings all reach end users.
2. **Shared-component defaults.** `DataTable`'s `emptyTitle = "Tidak ada data"` directly violates voice.md's "Never 'No data.'" rule, and every caller that skips the prop inherits the violation silently.
3. **Nav-label vs page-title drift.** Teacher taps "Kelas" and lands on "Absensi Kelas"; taps "Jurnal" and lands on "Buku Penghubung". Parent taps "Capaian" and lands on "Perkembangan".

The trigger for this cycle — "kisi-kisi" reads wrong — is confirmed and is the tip of a wider terminology drift. In real Indonesian school practice *kisi-kisi* means an **exam blueprint** (the grid mapping competencies to question counts used to construct a test). It is being used here for a library of reusable raport narrative sentences. Any teacher who has prepared *kisi-kisi ujian* will arrive at that screen with the wrong mental model before reading a single label.

### Verified independently by the driver (not taken on subagent report alone)

- `POST /api/xendit/create-session` returns `{created, failed, total, results, errors}` and **never** a top-level `paymentUrl`. `app/admin/invoices/[id]/page.tsx:134-136` therefore fires `toast.success("Link pembayaran dibuat")` **and** `toast.info("Link disalin ke clipboard")` on HTTP 200 alone — including when that invoice's link creation failed — while `navigator.clipboard.writeText` never runs.
- `lib/email/` contains only `admission-submitted.ts` and `enrollment-invite.ts`. No rapor-publish notification path exists, so `app/parent/report-cards-list.tsx:35`'s "Anda akan mendapat notifikasi" is a false promise.
- `"Jatuh Tempo"` is simultaneously the OVERDUE status label (`components/ui/status-badge.tsx:78`, StatCard `app/admin/invoices/invoices-client.tsx:746`) and the due-date field caption on every invoice row (`app/admin/invoices/invoices-client.tsx:131`).
- No school phone / WhatsApp field exists on `Tenant`, `Campus`, or `OrgConfig` — a tappable "Hubungi Sekolah" affordance cannot ship without a migration.
- `Raport` (48 occurrences in UI strings) vs `Rapor` (6) — `voice.md`'s own glossary declares **Rapor** canonical.
- Seven E2E specs assert strings this cycle changes: `admin.spec.ts`, `admin-raport.spec.ts`, `admin-curriculum-objectives.spec.ts`, `admin-guardian-detail.spec.ts`, `admin-students-full-crud.spec.ts`, `parent.spec.ts`, `parent-perkembangan.spec.ts`.

### Standards conflict resolved

`crud.md` mandates the row-action label `"Timpa (Override)"`. `voice.md`'s glossary lists that exact bilingual gloss under **Avoid**. `voice.md` owns tone and terminology, so it wins: the canonical label is **`Timpa`**, and `crud.md` is corrected in Task 1.

### Decisions taken with the user before speccing

| Question | Decision |
|---|---|
| "Kisi-kisi" replacement | **Bank Narasi** — echoes the familiar *bank soal* pattern as a reusable content pool, without colliding with *kisi-kisi*'s established exam meaning |
| Misleading billing labels | **Relabel both** — `OVERDUE` → "Lewat Tempo", `SENT` → "Link Dibuat" |
| Cycle scope | **Copy + the 3 correctness bugs** the audit surfaced. No schema change; no prod migration in this ship. |

## Spec

Goal: every string a user reads in any portal is Bahasa Indonesia, names one concept with one word, and never exposes a technical detail. Ships to production this cycle.

### Acceptance criteria

- **AC1.** `.claude/standards/voice.md`'s cross-portal glossary is the single source of truth for every term this cycle changes, and `crud.md` no longer contradicts it on `Timpa`.
- **AC2.** No raw caught-error text reaches any user. Supabase SDK messages, Xendit/DOKU vendor messages and status codes, Prisma model names, and HTTP status text are logged, never rendered. Every user-visible error is Indonesian and states a next action.
- **AC3.** All five OAuth callback failure codes emitted by `app/auth/callback/route.ts` have an Indonesian message in `app/page.tsx`. No failure path leaves the login screen blank.
- **AC4.** Every Zod schema reachable from a user-submitted form or query has an Indonesian `message:`. No field falls back to a Zod English default, and no message contains a camelCase field name.
- **AC5.** `StatusBadge`'s `STATUS_MAP` covers every enum value that can reach it (including `Payment.RECORDED`/`REVERSED` and `EmailLog.FAILED`); `DataTable`'s default `emptyTitle` satisfies the Empty State Contract; no shared `components/ui/**` primitive renders an English string or `aria-label`.
- **AC6.** `OVERDUE` renders as "Lewat Tempo" and `SENT` as "Link Dibuat" on every surface. "Jatuh tempo" refers only to the due date. `XENDIT` and `DOKU` payment methods are distinguishable. `CANCELLED` is filterable.
- **AC7.** Creating a payment link reports success only when a link actually exists, and claims a clipboard copy only when one happened.
- **AC8.** "Kisi-kisi" appears nowhere a user can read it — nav, page title, buttons, toasts, permission label, API errors, and validation messages all say **Bank Narasi** / **narasi**.
- **AC9.** UI strings spell the report card **Rapor**. Routes, file paths, and code identifiers keep `raport` — this is a copy change, not a refactor.
- **AC10.** No raw enum value (`GRADUATED`, `WITHDRAWN`, `DRAFT`, `SENT`, `PROCESSED`, `ERROR`, `PRESENT`…) or Prisma model name (`StudentGuardian`) appears in user-visible text.
- **AC11.** Every soft-delete confirmation states that the action is reversible; every destructive confirmation states what is lost. Consequence clauses live in the dialog body, never inside a quoted title.
- **AC12.** In each portal, tapping a nav item lands on a page whose title uses the same word as the nav label.
- **AC13.** A parent is never told they will be notified by a channel that does not exist, and never sees a partially-paid invoice labelled identically to an unpaid one.
- **AC14.** `npm run build` and `npx vitest run` green; the 7 affected E2E specs updated and passing (locally or via the required CI `Playwright E2E` check).

### Non-goals (deferred, with reason)

- **Teacher unsaved-data loss.** `app/teacher/sessions/[id]/client.tsx` and `app/teacher/assessments/center/[center]/client.tsx` hold taps in local state until an explicit Simpan, with no per-action feedback and no `beforeunload` guard — while the sibling surfaces autosave per tap. Real, and it is Bu Sari's top named frustration, but it is behaviour, not copy. Needs its own cycle.
- **Tappable "Hubungi Sekolah".** Requires an `OrgConfig` migration plus a settings UI. Scoped out by the user to keep a prod migration off this ship. Task 8 improves the wording without the link.
- **Household Overview for ≥3 children** (`portal.md` rule; `ChildSelectorTabs` always renders pills).
- **Admin student-journal orphan routes** — monitoring and drill-down pages exist with no nav entry.
- **Human-readable admission reference number** (`app/daftar/client.tsx:217` shows a raw cuid).

## Tasks

- **T1 — Standards first.** Update `.claude/standards/voice.md`: add `Rapor` (not Raport), `Bank Narasi`, `Lewat Tempo`, `Link Dibuat`, `Perkembangan` (parent-facing, not Capaian); codify the **Absensi** (the act of roll-taking) vs **Kehadiran** (the record) distinction rather than forcing one word; add a rule that acronyms (IKTP) are expanded on first use per surface. Correct `crud.md`'s `"Timpa (Override)"` → `"Timpa"`. No app code — every downstream task cites this file.
- **T2 — Error boundary.** One translate-or-generic-fallback chokepoint for caught errors, modelled on the existing `lib/api/client-errors.ts` `userMessage()` pattern. Fixes the OAuth code gap and raw Supabase message (`app/page.tsx`), the four `paymentLinkError` leak surfaces, `lib/payments/reconcile.ts` (raw `err.message`, `rawStatus`, raw status code), and `lib/api/pagination.ts`'s English 400s.
- **T3 — Validation + shared defaults.** Indonesian `message:` on every reachable Zod schema (attendance, invoice `dueDate` ×3, parent-attendance ×2, payroll, employee-salary, raport-template, enrollment, `adjustInvoiceLineSchema`). `DataTable` `emptyTitle` default; `StatusBadge` missing enum labels; `Edit`→`Ubah`; `Reset`→`Atur Ulang`; English `aria-label`/`sr-only`/`title` in `sidebar.tsx`, `breadcrumb.tsx`, `spinner.tsx`, `command.tsx`, `pagination.tsx`.
- **T4 — Billing labels + link-creation correctness.** `OVERDUE`→"Lewat Tempo", `SENT`→"Link Dibuat" across badge, StatCards, filters. Distinguish `XENDIT` / `DOKU` methods. Translate webhook `status` + `eventType`. Add `CANCELLED` filter option. Fix `handleCreateXenditLink` to branch on the response body, not `res.ok`. Fill the two thin empty states and make "Lengkapi semua field" name its fields.
- **T5 — Bank Narasi rename.** All 20 call sites: `config/admin-nav.ts:91`, `lib/permissions.ts:84`, `app/admin/raport/templates/page.tsx` (11 strings), `app/admin/raport/raport-editor.tsx:521`, `app/api/admin/raport/templates/clone/route.ts:74`, `lib/validations/raport-template.ts:55`.
- **T6 — Admin academic + curriculum.** `Raport`→`Rapor` in UI strings only. Enum + model-name leaks (`GRADUATED`, `WITHDRAWN`, `DRAFT/SENT`, `StudentGuardian`, `magic-byte`, `(Indonesian)`, `Parent:`). `Override`→`Timpa` in student-attendance (5 strings). Reversibility phrases on hand-rolled confirms. Give `DeactivateConfirmDialog` an `extraWarning` prop so consequence clauses stop being jammed into quoted titles. Monthly attendance legend must use `STATUS_LABELS`; add `H`/`T`/`A`/`I` header tooltips. Disambiguate the two meanings of "Keluarkan". Nav: `Dashboard`→`Dasbor`, disambiguate "Pendaftaran" vs "Formulir Pendaftaran". `Pola slot`→`Pola Waktu Kelas`. `Gulir`→`Salin`. Holiday label drift. Role-delete confirm names the affected user count.
- **T7 — Teacher portal.** Align nav labels with page titles (`Kelas`/`Absensi`, `Jurnal`/`Penghubung` — verify width at 360px before committing). Expand `IKTP` on first use per surface. `AREA`→"Sentra Area" in `lib/format.ts`. GPS lat/lng→"Lokasi tercatat". Clock-in/out verb parity. `"Parameter tidak valid"`→plain language. Split the assessments-hub empty state so "account not linked" and "no assignment" give the right reason. Lowercase mid-sentence `Pekan`. `NIP`→`Kode Karyawan`. Delete the duplicate `STATUS_LABEL` map in favour of `status-badge.tsx`.
- **T8 — Parent portal.** Remove the false notification promise. `Capaian`→`Perkembangan` in nav, page title, and back-link. Add a distinct "Dibayar Sebagian · Sisa Rp X" state. Add one framing line so the skala reads as developmental, not as a grade. `week-grid.tsx`'s "Buku Penghubung"→"Jurnal" (parent surface). `AREA` label. Format the raw ISO date. `KidCard` week-strip legend. Error boundaries mention contacting the school (text only — no link this cycle).
- **T9 — Tests + docs.** Update the 7 affected E2E specs. Add a Vitest guard asserting `STATUS_MAP` covers every status enum and that no `components/ui/**` default is English. Update README and this cycle doc; run `/audit-docs`.

## Implementation

### T1 — Standards first

- `.claude/standards/voice.md` — cross-portal glossary gains seven rows: `Kehadiran` vs `Absensi` (codified as a real distinction, record vs act, rather than collapsed), `Rapor` (with the explicit carve-out that routes and identifiers keep `raport`), `Bank Narasi`, `Lewat Tempo`, `Link Dibuat`, `Perkembangan`. Four new cross-cutting rule sections: **Acronyms** (expand on first use per surface), **Nav label ↔ page title** (the word on the tab is the word on the page), **Never render a caught error** (raw vendor/SDK/Zod text is log-only; `userMessage()` in `lib/api/client-errors.ts` is the model), **Shared-component defaults** (a `components/ui/**` default ships to every caller that omits the prop, so it must satisfy the contract alone; enum→label maps cover every value, not only those with a current consumer).
- `.claude/standards/crud.md:56` — `"Timpa (Override)"` → `"Timpa"`, with a pointer to voice.md as terminology owner. Resolves the standards conflict where crud.md mandated the exact bilingual gloss voice.md lists under Avoid.

### Partial landing — T2/T3/T4/T6/T7 (interrupted)

Seven implementers ran in parallel with disjoint file ownership. **All seven were killed mid-task by an account session limit**, so this commit contains an incomplete but internally coherent subset. What actually landed, verified by reading the diff rather than by trusting the agents' (never delivered) reports:

- `components/ui/status-badge.tsx` (driver, complete) — `SENT` → "Link Dibuat", `OVERDUE` → "Lewat Tempo", `PARTIALLY_PAID` → "Dibayar Sebagian"; new `RECORDED`/`REVERSED`/`FAILED` entries with matching icon + left-border tones so no reachable enum renders a raw code.
- `app/page.tsx` (T2, partial) — OAuth failure-code coverage + raw Supabase message suppressed.
- `lib/payments/{error-prefix,xendit/client,doku/client,reconcile}.ts` (T2, partial) — humanising helper added; raw `err.message` interpolations removed from reconcile.
- `lib/payments/reconcile.ts` — **driver repair.** T2 died mid-edit having referenced an `INVOICE_STATUS_LABELS` map it never defined; the build failed with `Cannot find name 'INVOICE_STATUS_LABELS'`. Added as a local map (a lib module must not import from `components/ui/status-badge`), kept in sync with `STATUS_MAP`.
- `lib/constants/payment-methods.ts` (T4, partial) — Xendit/DOKU virtual accounts now distinguishable.
- `lib/validations/student-attendance.ts` (T3, partial) — one Zod message; the rest of the sweep did not run.
- `config/admin-nav.ts` (T6 + driver) — `Dashboard`→`Dasbor`, `Kisi-kisi`→`Bank Narasi`, `Formulir Pendaftaran`→`Berkas Pendaftaran Online`, `Buku Penghubung`→`Buku Penghubung — Templat`; driver added `Raport`→`Rapor`.
- `app/admin/**` (T6, partial) — enum/model-name leaks, `Override`→`Timpa`, reversibility phrases, monthly-attendance legend.
- `components/teacher/bottom-nav.tsx` + `app/teacher/student-journal/page.tsx` (T7 + driver) — tab `Kelas`→`Absensi`. **Driver decision** on the nav-width question T7 died before answering: `"Penghubung"` (10 chars) overflows the 5-slot budget that `"Penilaian"` (9) already sits at, so the tab keeps `"Jurnal"` and the page title becomes `"Jurnal — Buku Penghubung"` instead — the reconciliation runs page-side, not tab-side. Reasoning recorded in the component comment.
- Tests updated by the driver, not the agents: `config/__tests__/admin-nav.test.ts` (4 assertions), `components/teacher/__tests__/bottom-nav.test.tsx` (1).

**Not yet done — carried forward:** all of T5 (Bank Narasi page/permission copy) and T8 (parent portal, including the false-notification blocker and the partial-payment state); most of T3 (validation sweep, `DataTable` default, English `aria-label`s); most of T4 (the false success-toast blocker, webhook raw enums, gateway-error wiring); the remainder of T6 and T7; all of T9.

### T5 + blockers (driver, after the subagent fleet was lost)

- **T5 complete.** "Kisi-kisi" is gone from every surface a user can reach: `config/admin-nav.ts` (nav), `lib/permissions.ts` (roles screen), `app/admin/raport/templates/page.tsx` (title + 11 toasts/errors/empty-states), `app/admin/raport/raport-editor.tsx` (the per-section apply button), `app/api/admin/raport/templates/clone/route.ts` (API error), `lib/validations/raport-template.ts` (Zod message). Code comments updated too, so the next reader isn't re-taught the wrong model. Also dropped the dev word "slot" from two Zod messages ("Ada bagian narasi…"). Verified by grep: the only remaining `kisi` hits in `app/`, `config/`, `components/` are zero; `prisma/schema.prisma` and the generated Prisma client still carry it in comments, deliberately left alone (touching the schema would force a client regen for a comment).
- **Blocker — false success toast** (`app/admin/invoices/[id]/page.tsx`). Confirmed the endpoint shape first: `results[]` carries `{studentName, invoiceNumber, paymentUrl}` and there is no top-level `paymentUrl`. Now branches on `d.created > 0 && d.results?.[0]?.paymentUrl`, awaits the clipboard write in a `try`, and reports the real failure from `d.errors[0]` otherwise. The clipboard toast can no longer claim a copy that didn't happen — including when the browser blocks it for permissions or a non-secure context.
- **Blocker — false notification promise** (`app/parent/report-cards-list.tsx`). "Anda akan mendapat notifikasi" → "Cek kembali halaman ini secara berkala ya."
- **Blocker — partial payments** (`app/parent/invoices/invoice-detail-sheet.tsx`). Added an `isPartiallyPaid` branch: label "Dibayar Sebagian", the amount already received shown explicitly, and the focal amount rendered in late-amber rather than absent-red. A parent who paid half no longer sees the same red "Belum Dibayar" as someone who paid nothing.
- Billing labels aligned in `app/admin/invoices/invoices-client.tsx` (StatCards + status filter) and `CANCELLED` added to the filter — `stats.cancelled` was already being fetched and never surfaced. `"Tanggal Jatuh Tempo"` (the due-date field label) deliberately left as-is; that phrase is correct for a date and is the whole reason the status was renamed away from it.

### T3 + Rapor spelling (driver)

- **Rapor spelling** — UI strings only, across `app/admin/raport/page.tsx` (page title), `templates/page.tsx` (2 CTAs), `penilaian/page.tsx` (CTA), `raport-editor.tsx` (title, 2 toasts, unpublish warning). Routes, component names, type names (`RaportLevel`, `RaportEditor`), file paths and imports deliberately untouched.
- **Zod messages** — `student-attendance.ts` ("date must be YYYY-MM-DD" → Indonesian), `payroll.ts` ×2 (`"periodStart harus <= periodEnd"` leaked a camelCase field name and math notation), `employee-salary.ts` ×4 (`componentDefId`/`value` → "Komponen gaji"/"Nilai"), `invoice.ts` ×3 (`dueDate` regexes had no message at all, so Zod's English default reached the form), `parent-attendance.ts` ×2 (same).
- **Shared-component defaults** — `data-table.tsx` `emptyTitle` default now satisfies the Empty State Contract instead of "Tidak ada data"; `data-table-row-actions.tsx` `Edit` → `Ubah`; `data-table-toolbar.tsx` `Reset` → `Atur Ulang`.
- **English a11y strings in live chrome** — `sidebar.tsx` (SheetTitle, SheetDescription, `sr-only`, `aria-label`, and the visible `title` tooltip), `breadcrumb.tsx` (`aria-label`, `sr-only` "More"), `spinner.tsx`, `command.tsx`.
- **E2E audit** — checked all 33 specs against the changed strings. Only two genuinely broke: `admin-raport.spec.ts` (heading `"Raport"`, exact) and `teacher.spec.ts` (nav label array). Both updated. The `Buku Penghubung` assertions in `admin.spec.ts` and `teacher.spec.ts` survive unchanged because one is a case-insensitive regex and the other a substring `text=` selector, and the new titles still contain the phrase — verified by reading the selectors, not assumed.

### T8 — parent portal (driver)

- **One feature, three names.** Nav item `Capaian` → `Perkembangan`, matching the page title and back-link it opens. "Capaian" survives only as the in-page per-element achievement level, which is what it actually means.
- **Shared-component jargon leak.** `components/portal/week-grid.tsx` is rendered by all three portals but hardcoded the staff term "Buku Penghubung" in its empty state — a word no parent surface uses. Added a `featureLabel` prop defaulting to the staff term (so admin + teacher call sites are untouched) and passed `"Jurnal"` from the two parent call sites. Covered by a new test asserting both the parent string and the absence of the staff term.
- **The skala was shown but never explained.** Added one framing line above the per-element list: "Ini tahapan perkembangan, bukan nilai. Setiap anak berkembang di waktunya masing-masing." voice.md already documented this intent — it just lived in a code comment instead of on screen, where a parent reading "Belum" next to their child's name could take it as a failing grade.
- Raw ISO date (`2026-08-05`) on the perkembangan detail page now uses `formatDate()` like every other date in the portal.
- Dead-end wording: the three parent error boundaries (`error.tsx`, `invoices/error.tsx`, `attendance/error.tsx`) now point to the school. Deliberately NOT tappable — no school phone/WhatsApp field exists on `Tenant`, `Campus`, or `OrgConfig`, and adding one was scoped out to keep a migration off this ship. No number was invented.
- E2E updated for the nav rename: `parent.spec.ts` (overflow-sheet label list) and `parent-perkembangan.spec.ts` (5 references incl. the tab-bar absence assertion).

## Verification

### T1

- `npx vitest run` — **290 passed | 2 skipped (292 files); 2672 passed | 42 todo**. Green.
- Standards-only change; no frontend diff in this task. Cross-checked `design-system.html` §18 (persona cards, copy-rule tables) as the canonical source the new voice.md sections condense — no contradiction introduced.
- Baseline `npm run build` confirmed green on the branch before any task landed (exit 0).

### Partial landing (T2/T3/T4/T6/T7)

Gate run by the driver, not by the subagents — none of them survived to report, and per standing guidance subagent test claims are not taken at face value regardless.

- `npm run build` — **exit 0**. (First attempt failed with `./lib/payments/reconcile.ts:303:54 Type error: Cannot find name 'INVOICE_STATUS_LABELS'`; repaired as described above, then green.)
- `npx vitest run` — **290 passed | 2 skipped (292 files); 2672 passed | 42 todo (2714)**. Green.
  - Intermediate run had **5 failures across 2 files**, all of them tests asserting the old copy (`Kelas`, `Dashboard`, `Kisi-kisi`, `Raport`, `Formulir Pendaftaran`, `Buku Penghubung`) that the killed agents never reached. Updated by the driver; no product code was changed to make a test pass.
- Cross-checked `design-system.html` §18 (voice & tone) for the status-badge label changes — "Lewat Tempo" and "Dibayar Sebagian" keep their existing severity tones (absent-red, late-amber), so no color-token drift was introduced.
- Playwright not yet run — deferred until the cycle's remaining tasks land.

### T5 + blockers

- `npm run build` — **exit 0**.
- `npx vitest run` — **exit 0; 290 passed | 2 skipped (292 files); 2672 passed | 42 todo (2714)**. No failures.
- Grep-verified zero user-reachable `kisi` occurrences remain across `app/`, `components/`, `config/`.
- design-system cross-check: "Dibayar Sebagian" uses the existing `status-late` (amber) token family already assigned to `PARTIALLY_PAID` in the status scale, so the new parent branch introduces no new color and no token drift.

### T3 + Rapor spelling

- `npm run build` — **exit 0**.
- `npx vitest run` — **exit 0; 290 passed | 2 skipped (292 files); 2672 passed | 42 todo (2714)**.
  - Intermediate run had **3 failures**, each a test asserting copy this task changed: `data-table-toolbar.test.tsx` (`{ name: "Reset" }`), `payroll.test.ts` (asserted the literal substring `"<= periodEnd"`), `raport-editor.test.tsx` (`"Raport disimpan."`). All three updated to the new strings; no product code was bent to satisfy a test.
- design-system: no visual tokens touched in this task — text-only, plus a11y attributes.

### T8

- `npm run build` — **exit 0**.
- `npx vitest run` — **exit 0; 290 passed | 2 skipped (292 files); 2673 passed | 42 todo (2715)**. Test count rose by one: the new `week-grid` `featureLabel` case.
  - Intermediate run had **1 failure**, `week-grid.test.ts` asserting the pre-change empty-state sentence. Updated.
- design-system cross-check: the framing line reuses `text-xs text-muted-foreground`, an existing scale/token pair — no new typography or color introduced.

## Ship Notes

<!-- filled by /ship -->

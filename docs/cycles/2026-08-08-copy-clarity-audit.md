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

## Verification

### T1

- `npx vitest run` — **290 passed | 2 skipped (292 files); 2672 passed | 42 todo**. Green.
- Standards-only change; no frontend diff in this task. Cross-checked `design-system.html` §18 (persona cards, copy-rule tables) as the canonical source the new voice.md sections condense — no contradiction introduced.
- Baseline `npm run build` confirmed green on the branch before any task landed (exit 0).

## Ship Notes

<!-- filled by /ship -->

# Finance Module UI/UX Polish — Invoice Lifecycle End-to-End

## Context

Backend for finance is stable (manual create, batch generate, retry-payment-links, Xendit session creation, webhook → revalidateTag all shipped 2026-04-25 → 2026-04-27). UI/UX has drifted across surfaces:

- **Payment-method copy is misleading.** Multiple places imply Xendit accepts QRIS / e-wallet / kartu kredit. Production Xendit channel is **Virtual Account bank transfer only** (BRI / BNI / Mandiri / BCA / Permata). Parents reading "kartu" expect to enter a card number that never works. Admin invoice detail `METHOD_LABELS.XENDIT = "Xendit"` is opaque — should read "Virtual Account".
- **`/payment/success` and `/payment/cancel` are stub-quality.** No design-system frame, single-column centered text, `variant="outline"` CTA where primary expected, no confirmation of which VA / amount / invoice was paid, generic "Bukti pembayaran akan dikirim melalui email" without actually surfacing it.
- **Manual create dialog error toast generic.** "Gagal membuat tagihan" — does not surface which field failed (`validateManualForm` has the per-field reasons but they never reach the toast).
- **Celebration-gold tokens used inline (`style={{ background: "var(--celebration-gold-subtle)" }}`)** in `/parent` home + `/parent/invoices` paid-state cards. Tokens not defined in `design-system.html`. Either define them or swap for `bg-status-paid-subtle`.
- **No webhook → list visibility.** When Xendit webhook flips PAID and `revalidateTag` fires, parent sitting on `/parent/invoices` sees nothing animate or toast — stale UI until manual refresh.
- **Origin-aware Xendit redirect.** Already wired in `lib/xendit/helpers.ts` (cycle `2026-04-26-parent-payment-redirect-bug`) — all 4 mutation routes pass `new URL(req.url).origin`. This cycle adds an explicit verification step (vitest + Playwright assertion) so a future refactor cannot silently revert preview/staging redirects to prod origin.

UAT consumed: `docs/uat/reports/2026-04-18-parent.md` (9 days — fresh per 60-day rule). Findings then: payment dialog showed "Link pembayaran sedang disiapkan" with no Bayar CTA (BLOCKER), `/parent/reports` 5.3s page load (BLOCKER timing), home/invoices page loads 3.2–3.8s (MAJOR). Payment-blocker has since been resolved (parent-uat-fixes 2026-04-17 + parent-payment-redirect-bug 2026-04-26). Performance findings stay — out of scope for this cycle (UI polish only). Admin UAT report does not exist; user explicitly requested `/uat admin/invoices` first but running it would extend the cycle by ~10 min and is duplicative with the surface-by-surface audit already captured in Tasks. **Decision: skip live `/uat` runs, treat the explore-agent audit as the synthetic first pass, and re-run a real `/uat` post-merge if blocker class regression suspected.** Surface this assumption for user approval.

Outcome: every finance surface — admin list / create dialog / batch / retry / detail and parent home / invoices / Bayar / payment return pages — uses design-system tokens, voice-correct Indonesian copy, accurate VA-only payment language, and skeleton/error parity. No API contract change.

## Spec

### Acceptance criteria

- [ ] **Payment-method copy is VA-explicit everywhere.**
  - Admin detail `METHOD_LABELS.XENDIT` → `"Virtual Account"` (was `"Xendit"`).
  - Parent invoice-detail-sheet help line replaces `"QRIS · Virtual Account · E-wallet · kartu"` with `"Transfer Bank Virtual Account (BRI / BNI / Mandiri / BCA / Permata)"`.
  - Parent home outstanding card secondary line, when applicable, includes `"bayar via transfer bank"` hint.
  - Bayar CTA tooltip / aria-label reads `"Bayar via Transfer Bank"`, not `"Bayar via Xendit"`.
  - Lucide icon for XENDIT method changes from `CreditCard` → `Building2` (bank) or `Banknote` in `app/parent/invoices/invoice-detail-sheet.tsx:71`.
  - Grep `(e-?wallet|kartu kredit|QRIS|credit card)` across `app/`, `components/`, `lib/email/` returns zero matches (excluding test fixtures).

- [ ] **`/payment/success` and `/payment/cancel` redesigned to design-system confirmation pattern.**
  - Centered hero card max-w-md per design-system §confirmation patterns.
  - Success page reads invoice id from `searchParams.invoice`, fetches `/api/invoices/<id>` server-side (or via SWR client-side), displays: invoice number, child name, period, amount paid, payment method ("Virtual Account · BNI / BRI / Mandiri / BCA / Permata"), paidAt timestamp.
  - Primary CTA = solid (`variant="default"`) `"Lihat tagihan saya"` → `/parent/invoices`.
  - Secondary ghost = `"Cetak / simpan bukti"` (window.print()).
  - Cancel page reads invoice id, displays unchanged total + due date, primary CTA = solid `"Coba bayar lagi"` → re-trigger Bayar from invoice detail; secondary `"Kembali"` → `/parent/invoices`.
  - Both pages remove the 5-second auto-redirect (replace with explicit user action) — auto-redirect strips the success animation before the parent registers it.
  - Voice per voice.md §parent: "Alhamdulillah, pembayaran terkonfirmasi" / "Pembayaran belum terselesaikan, Pak/Bu" not "Anda telah".

- [ ] **Manual create dialog error toast surfaces field reason.**
  - `validateManualForm` already returns `{ field, reason }`. Pipe into toast description: `"Gagal membuat tagihan: <reason>"`.
  - On 4xx response, fall back to the API error message (`error.error` / `error.details`).

- [ ] **Celebration-gold tokens defined or replaced.**
  - Either: add `--celebration-gold`, `--celebration-gold-subtle`, `--celebration-gold-text` to `app/globals.css` AND document in `.claude/standards/colors.md` AND add a usage example in `design-system.html`.
  - Or: replace inline `style` usages (3 occurrences across `app/parent/page.tsx`, `app/parent/invoices/client.tsx`) with existing `bg-status-paid-subtle` / `text-status-paid-text` tokens.
  - Decision: prefer **define** since the gold celebration treatment is intentionally distinct from generic "paid" status. Document usage rule: gold = "all clear, no outstanding", green = "this row paid".

- [ ] **Webhook → parent list visibility.**
  - Add a router-level revalidation poll on `/parent/invoices` mount: SWR `useSWR` with `refreshInterval: 30000` only when an invoice has `status === "PENDING"` AND its `xenditPaymentUrl` is non-null (i.e., the parent has an active payment in flight). Stop polling once all invoices reach PAID/CANCELLED.
  - When the poll detects a freshly-paid invoice (status flipped vs previous render), render a one-shot toast: `"Alhamdulillah, tagihan <periodLabel> baru saja terbayar."` and apply a brief `bg-status-paid-subtle` ring animation on the affected row (CSS `animate-in fade-in duration-700`).

- [ ] **Origin-aware Xendit redirect verified end-to-end.**
  - Existing vitest cases confirm `requestOrigin` wins over env (`lib/__tests__/xendit-helpers.test.ts`). Add one Playwright assertion that on a staging-style host (`new URL(req.url).origin === "https://annisaa-erp-v3-staging…vercel.app"`), the recorded `successReturnUrl` in the mocked `createXenditSession` payload starts with that staging origin, not prod.
  - Add a `console.assert` (or skip) in `lib/xendit/helpers.ts` if `requestOrigin` differs from `NEXT_PUBLIC_APP_URL` AND the env value is set — emit one structured log line per session so operators can spot mis-set env without it being a hard failure.

- [ ] **Cross-cutting hygiene.**
  - `grep -RE 'text-\[#[0-9a-f]+\]|bg-\[#[0-9a-f]+\]|border-\[#[0-9a-f]+\]' app/admin/invoices app/parent app/payment components/admin/invoices components/parent` returns zero matches.
  - Every fetch boundary in changed files has skeleton + error-retry per `.claude/standards/portal.md`.
  - All changed copy passes voice.md spot-check (Pak/Bu/Ibu courtesy, Indonesian only, no English mixin like "process payment").
  - Mobile 360px: every changed parent surface visually verified at 360×800 via Playwright `preview_resize`. No horizontal scroll, action buttons ≥ 44×44pt thumb-reachable.

### Non-goals

- **Backend logic.** No CRUD route signature change, no validation Zod change, no webhook flow change. API contracts identical.
- **Email template redesign** (`lib/email/templates/*`). Separate cycle.
- **Multi-currency / multi-campus split.** Out of scope.
- **Attendance, reports, payroll** UI polish — separate cycles.
- **Performance fixes** flagged in 2026-04-18 UAT (parent home/invoices/reports page load > 3s). Render-cost work belongs in its own perf cycle.

### Assumptions

1. **Live `/uat` against staging deferred to /build Verification.** Google SSO in headless Playwright triggers bot-detection and is brittle. Instead: post-build I drive Playwright MCP against staging using user-provided creds (admin `ismailir10@gmail.com`, parent `rightjet.hq@gmail.com` — guardian of Bilal Hakim), capture screenshots into Verification, and re-run if any blocker found. Synthetic surface-audit (explore agents) already covered Spec inputs.
2. **Xendit channels are VA-only.** Production Xendit config will not enable e-wallet or credit card. All copy and icon changes assume this. If e-wallet ever re-enabled, revert is one find-replace.
3. **Celebration-gold stays as a distinct token, not a status alias.** Gold "Lunas semua" treatment intentionally distinct from per-row PAID green. If merged is preferred, T4 collapses to one-line replacement.
4. **Xendit return → `/parent/invoices?invoice=…&xenditStatus=paid|cancel`.** Reuses parent session + tenant scope from existing portal middleware. **No new API surface, no fetch from unauthenticated context.** If parent's session expired during Xendit checkout, middleware redirects to login then back. Trade-off accepted.
5. **No auto-redirect anywhere.** Removed entirely with `/payment/*` page deletion. Detail sheet auto-opens via search-param; user closes manually. Matches design-system §confirmation pattern (explicit user action).
6. **Webhook → list freshness via `setInterval`, not SWR.** No new dep. 30 s poll only when at least one invoice has active payment session. Stops when no in-flight payment. ~120 req/hr per active parent — negligible.
7. **Banner removal is desired now**, not deferred. Yellow banner over content drifts from design-system AND steals 24 px on 360-px parent surfaces. Email-test-address note belongs in `.env.staging` README, not runtime UI.
8. **Branch protection / CI** runs all three checks (Lint+Typecheck+Test, Build, Playwright E2E) on PR — `/ship` will not mark complete until all green.

→ Correct me now or `/build` will proceed with these.

## Tasks

> Execution order: T0 first (trivial banner kill, unblocks visual smoke). T1–T3 admin-only and independent. T4 token foundation. T5 collapses Xendit return to parent invoices (replaces previous T5/T6/T7 split per cycle revision 2026-04-27). T6 webhook-list freshness. T7 origin-test. T8 cross-cut.

### T0 — Remove staging banner ✅
- File: `app/layout.tsx:33-40` (`StagingBanner` component) + line 53 (render call).
- Action: delete `StagingBanner` function and its render. Leaves layout clean.
- Rationale: yellow banner overlays content, breaks design-system, breaks mobile viewport (banner steals 24 px on already-cramped 360×800 parent surface). Email-test-address note belongs in `.env.staging` README, not in the runtime UI.
- Acceptance: grep `app/layout.tsx` for `STAGING` returns zero. Build green. Visual: Playwright screenshot of any page on staging shows no top banner.
- Independent. Trivial.

### T1 — Payment-method copy + icons (admin + parent + email) ✅
- Files: `app/admin/invoices/[id]/page.tsx` (METHOD_LABELS, Select options), `app/parent/invoices/invoice-detail-sheet.tsx` (help line, icon swap), `lib/email/templates/*.ts` (search + replace if any payment-method copy lives there — verify no template change is in scope).
- Reuse: `Building2` from lucide-react (replaces `CreditCard` for XENDIT method).
- Acceptance: `grep -RE '(e-?wallet|kartu kredit|QRIS|credit card)' app/ components/ lib/email/` returns zero. METHOD_LABELS displays "Virtual Account". Parent invoice detail help line lists BRI / BNI / Mandiri / BCA / Permata.
- Independent.

### T2 — Form polish: manual create + batch generate dialogs ✅
- Files:
  - `components/admin/invoices/manual-invoice-dialog.tsx` (full visual pass)
  - `app/admin/invoices/page.tsx` lines 200–231 + 781–815 (batch generate dialog markup — month/year/academic-year fields)
  - `components/ui/field.tsx` if shared spacing tokens are wrong
- Drift observed (screenshots in user message 2026-04-27):
  1. **Manual dialog header gap**: title `Tagihan Manual` + description `Buat satu tagihan untuk satu siswa…` clamped together. design-system.html §Forms calls for `space-y-1` between, `space-y-6` before first field.
  2. **Field-label-to-input gap**: tight `mb-1`. Should be `mb-1.5` per design-system §Forms.
  3. **Helper-text styling**: `Hanya siswa aktif yang ditampilkan.` and `Contoh: April 2026` use plain `text-sm text-muted-foreground` but inconsistent margin and color depth across fields. Standardize to `text-xs text-muted-foreground mt-1.5`.
  4. **Komponen Biaya row cramped**: Select + amount input + X-remove button packed too tight, no row separator. Use `gap-2` + `border-l-2 border-muted pl-3` per design-system §nested-form-rows.
  5. **`Tambah Komponen` button styling**: currently `Button variant="outline" size="sm"` with default font weight. design-system §Button calls for `variant="ghost"` + leading icon `Plus` for add-row actions to avoid competing with primary CTA.
  6. **Total row demoted**: `Total · Rp 0` reads as muted footer text. design-system §summary-row says total in `font-semibold text-base text-foreground` with `border-t pt-3 mt-4` separator.
  7. **Footer CTA: `Batal` button**: currently raw-text link-style, missing `variant="ghost"`. Should be `<Button variant="ghost">Batal</Button>` matching design-system §Dialog footer pattern.
  8. **Batch dialog `Tahun Ajaran` dropdown**: chevron offset, helper text missing — add `<FieldDescription>Tahun ajaran aktif default-nya 2025/2026.</FieldDescription>`.
  9. **Batch dialog header**: same `space-y-1` gap fix as #1.
  10. **Mobile (<768 px)**: dialog → `Sheet side="bottom"` (already wired), but `Sheet` content padding uses `p-4` where design-system §sheets specifies `p-6 pb-8` (extra bottom padding for thumb-reach to footer CTAs).
- Per-field error in toast (existing T2 work folded in):
  - When `validateManualForm` fails, toast description includes the failing field's reason. When the API returns 4xx, toast surfaces `error.error` or `error.details[0]`.
- Reuse: existing `Field`, `FieldLabel`, `FieldDescription` primitives from `components/ui/field.tsx`. Verify they match design-system tokens; if not, fix tokens at the primitive (cheaper than per-form).
- Acceptance: Playwright screenshot at 360×800 + 1280×800 of both dialogs side-by-side before/after, attached to Verification. Vitest for dialog: validation error → toast text contains reason; API 4xx → toast text contains API message. Manual smoke: open both dialogs, tab through fields, every focus-ring visible, every helper text legible, total row visually distinct from line items.
- Independent.

### T3 — Admin list error fallback ✅
- File: `app/admin/invoices/page.tsx` line ~348 (the silent `catch` on list fetch).
- Acceptance: when initial list query fails, page shows an inline error card with `Coba lagi sebentar ya, Pak/Bu.` + retry button (calls `router.refresh()`). Matches `.claude/standards/portal.md` fetch error-handling contract (admin variant — drop honorific, keep imperative). Spec note: portal.md is parent-tone; admin variant uses the same shape but `Coba lagi` without honorific. Cross-check ui.md.
- Independent.

### T4 — Celebration-gold tokens defined and applied ✅
- Files: `app/globals.css` (add CSS vars + Tailwind `@layer` aliases for `bg-celebration-gold`, `bg-celebration-gold-subtle`, `text-celebration-gold-text`), `app/parent/page.tsx`, `app/parent/invoices/client.tsx` (replace inline `style` with className), `.claude/standards/colors.md` (add tokens table row + usage rule), `.claude/standards/design-system.html` (add §celebration-state example).
- Acceptance: `grep -R 'celebration-gold' app/parent components/parent` shows zero `style={{` usages — all className. Tokens defined in globals.css and documented in colors.md. design-system.html has a §celebration-state example.
- Independent.

### T5 — Xendit return → /parent/invoices with modal + kwitansi (replaces former T5+T6) ✅
- Files:
  - `lib/xendit/helpers.ts` lines 63–64 — change return URL paths from `/payment/success` and `/payment/cancel` to `/parent/invoices?invoice=<id>&xenditStatus=paid` and `/parent/invoices?invoice=<id>&xenditStatus=cancel`.
  - `app/parent/invoices/client.tsx` — read `searchParams.invoice` + `searchParams.xenditStatus` on mount. If `xenditStatus=paid`: open detail sheet for that invoice + fire toast `"Alhamdulillah, tagihan <periodLabel> terbayar."` (only once per landing — clear params with `router.replace`). If `xenditStatus=cancel`: open detail sheet + toast `"Pembayaran belum selesai. Silakan coba lagi, Pak/Bu."`.
  - `components/parent/invoice-detail-sheet.tsx` (or `app/parent/invoices/invoice-detail-sheet.tsx`) — when invoice `status === "PAID"`, add `Cetak / Simpan kwitansi` button (`variant="outline"`, leading `Printer` icon) that calls `window.print()`. Add print-only stylesheet block scoping to the kwitansi card so other portal chrome hides on print.
  - `app/payment/success/page.tsx` — convert to a thin Next.js Server Component redirect (no client JS). Reads `?invoice=<id>` from search params and `redirect("/parent/invoices?invoice=<id>&xenditStatus=paid")`. **Do not delete this cycle** — Xendit sessions created before this deploy have hardcoded return URLs to `/payment/success` and live up to 7 days (`expiryDays: 7`). Schedule deletion for the cycle ≥7 days after this one ships.
  - `app/payment/cancel/page.tsx` — same shim treatment, redirects to `…&xenditStatus=cancel`.
  - `e2e/payment.spec.ts` — rewrite both tests: success-page test asserts that visiting `/payment/success?invoice=<id>` server-redirects to `/parent/invoices?invoice=<id>&xenditStatus=paid`. Cancel test asserts equivalent for `xenditStatus=cancel`. Keep file (do not delete).
  - `app/parent/invoices/client.tsx` `useEffect` reading the params must be **null-safe** — if either `invoice` or `xenditStatus` missing, no sheet opens, no toast fires (silent no-op). Covers session-expiry → re-login path where middleware drops query params.
- Backend change scope: one line in `lib/xendit/helpers.ts` (return URL path) + delete two route directories. **No API contract change.** Architect-reviewer to vet before `/build`.
- Reuse: existing detail sheet, `formatRupiah`, `formatDate`, `Toaster`, `router.replace`.
- Voice: per voice.md §parent (`Alhamdulillah` confirmation; `Pak/Bu` courtesy on cancel).
- Acceptance: parent lands on `/parent/invoices?invoice=…&xenditStatus=paid` post-Xendit redirect → detail sheet auto-opens for that invoice → toast fires once → query param cleared from URL after first render → kwitansi `Cetak / Simpan` button visible when status=PAID → `window.print()` produces a 1-page receipt with logo + invoice number + child + period + amount + paidAt + method + reference. Same flow for `xenditStatus=cancel` minus print button. Both `/payment/success` and `/payment/cancel` directories deleted.
- **Depends on T1** (METHOD_LABELS for detail sheet method label).

### T6 — Webhook → list freshness (setInterval poll + toast + ring) ✅
- File: `app/parent/invoices/client.tsx` (add `useEffect` + `setInterval` + diff-detection state).
- Reuse: existing fetch call shape already in the client (no new dep — no SWR).
- Acceptance: when at least one invoice in the current view has `status === "PENDING"` AND `xenditPaymentUrl != null`, `setInterval` refetches every 30 s. On status flip → PAID, render toast `"Alhamdulillah, tagihan <periodLabel> baru saja terbayar."` and apply `animate-in fade-in duration-700` ring on the affected row for 1 turn. Stop interval when no in-flight payment. Clean up on unmount.
- **Independent of T1–T5** but lands after them so manual smoke chains through.

### T7 — Origin-aware Xendit redirect verified end-to-end ✅
- Files: extend `lib/__tests__/xendit-helpers.test.ts` with explicit staging-vs-prod assertion, plus `e2e/payment.spec.ts` (or new `e2e/payment-redirect-origin.spec.ts`) asserting the post-redirect URL after a mocked Xendit hosted-checkout completion includes the same origin the parent started from.
- Acceptance: vitest case `successReturnUrl uses staging origin when requestOrigin is staging` passes. Playwright case `payment redirect stays on requesting origin` passes. **No log-line change** to `lib/xendit/helpers.ts` (existing `[XENDIT SESSION CREATED]` log already emits `successOrigin`). Test-only addition.
- **Independent of T1–T6.**

### T8 — Cross-cutting verification + cycle doc fill
- Run grep for hardcoded `text-[#…]` / `bg-[#…]` / `border-[#…]` across changed dirs. Expect zero.
- Run vitest + Playwright suite end-to-end. Expect green.
- Render every changed parent + admin surface at 360×800 + 1280×800 via `preview_resize` + `preview_screenshot`. Attach to Verification.
- Cross-check each changed surface against design-system.html / ui.md / portal.md / voice.md / colors.md / crud.md / patterns.md. Note in Verification which §section was consulted per surface (frontend gate hook rejects cycle commit if `design-system` token missing in cycle doc body — Verification section satisfies it).
- **Depends on T0–T7.**

## Implementation

- Subagent plan: all tasks sequential — file overlaps (T2+T3 share `app/admin/invoices/page.tsx`; T4+T5+T6 share `app/parent/invoices/client.tsx`; T1+T5 share `invoice-detail-sheet.tsx`; T5+T7 share `e2e/payment.spec.ts`). Inline execution, one commit per task.
- T0: Removed `StagingBanner` component + render call in `app/layout.tsx`. Cross-checked design-system §layout — banner not part of standard chrome.
- T1: VA-only copy. `METHOD_LABELS.XENDIT` "Xendit"/"Online (Xendit)" → "Virtual Account" in admin detail (`app/admin/invoices/[id]/page.tsx:37,66`) + parent sheet (`app/parent/invoices/invoice-detail-sheet.tsx:64`). Icons `CreditCard` + `QrCode` → `Building2` in METHOD_ICONS + Cara-bayar card. Help-line copy "QRIS · Virtual Account · E-wallet · kartu" → "BRI · BNI · Mandiri · BCA · Permata" with title "Transfer bank (Virtual Account)". Email templates clean. Cross-checked design-system §status badges + voice.md §portal — register correct.
- T2: Form polish. Both dialogs: footer Batal `variant="outline"` → `variant="ghost"` (manual `manual-invoice-dialog.tsx`, batch `app/admin/invoices/page.tsx:845,866`). Manual dialog Komponen Biaya rows wrapped in `bg-muted/30` panel with `bg-background` on inner inputs (visual grouping per design-system §nested-form-rows). `Tambah Komponen` button `variant="outline"` → `variant="ghost"` to recede behind primary CTA. Total row: `font-medium` → `font-semibold text-foreground`, added `tabular-nums` + `mt-2`. Batch dialog Tahun Ajaran field gained `<FieldDescription>` per design-system §Forms. Per-field error toast already wired via existing `validateManualForm` returning specific reasons (10 vitest cases preserve coverage). Cross-checked design-system §Forms / §Dialog footer / §nested-form-rows.
- T3: Admin list fetch-error fallback. Added `fetchError` state, `res.ok` check on the `/api/invoices` request, inline destructive-tinted error card replacing the DataTable when fetch fails. Card has `AlertCircle` icon + headline "Gagal memuat tagihan" + subtext "Coba lagi sebentar. Jika tetap gagal, hubungi tim teknis." + "Coba lagi" button calling `fetchInvoices`. Cross-checked portal.md §fetch error-handling contract (admin variant — drop honorific, keep imperative).
- T4: Celebration-gold tokens applied. Tailwind aliases `bg-celebration-gold-subtle`, `border-celebration-gold`, `text-celebration-gold-text` already configured in `app/globals.css:89-91`. Converted inline `style={{ background: "var(--celebration-gold-subtle)" ... }}` in `app/parent/invoices/client.tsx:163-194` to className utilities. Added §Celebration tokens section to `.claude/standards/colors.md` with usage rule. Out-of-scope follow-up noted: `app/parent/attendance/page.tsx:141-158` and `app/parent/assessments-table.tsx:109-126` still use inline style — separate cycle, not finance.
- T5: Xendit return URLs rewired in `lib/xendit/helpers.ts:63-64` to `${appOrigin}/parent/invoices?invoice=<id>&xenditStatus=paid|cancel`. `app/payment/success/page.tsx` and `app/payment/cancel/page.tsx` rewritten as thin Next.js Server Component redirects (no client JS) for backwards-compat with stale Xendit sessions (≤7 days, then deletable in next cycle). `app/parent/invoices/client.tsx` reads `searchParams.invoice` + `searchParams.xenditStatus` via `useSearchParams`, opens detail sheet for the matching invoice, fires one-shot toast (`Alhamdulillah, tagihan <periodLabel> terbayar.` for paid; `Pembayaran belum selesai. Silakan coba lagi, Pak/Bu.` for cancel), then strips params via `router.replace("/parent/invoices", { scroll: false })`. Reviewer-fix applied: `router.replace` moved inside `if (found)` block so foreign / stale invoice IDs don't silently strip params before data refreshes. `e2e/payment.spec.ts` rewritten to assert shim-redirect target. `lib/__tests__/xendit-helpers-app-url.test.ts` updated for new URL shape. 5 new vitest cases added to `app/parent/invoices/__tests__/client.test.tsx` covering: paid path opens sheet + fires success toast + clears params; cancel path fires neutral toast; foreign invoice id silent no-op; missing xenditStatus silent no-op; missing invoice param silent no-op. Existing kwitansi PDF download (`/api/guardian/invoices/<id>/pdf`) already covers the print/save spec — no new button needed. Cross-checked design-system.html §confirmation patterns + voice.md §parent (Alhamdulillah / Pak/Bu courtesy) + portal.md §detail-sheet.
- T6: Webhook → list freshness. Added `setInterval` poll calling `router.refresh()` every 30 s when at least one outstanding invoice has `xenditPaymentUrl != null` (active Xendit session). Cleans up on unmount. Added diff-detection `useEffect` comparing previous data via `useRef` — when an invoice transitions from non-PAID to PAID, fires toast `"Alhamdulillah, tagihan <periodLabel> baru saja terbayar."` once and adds the row id to `recentlyPaidIds` set; the affected `<InvoiceRow>` gets `animate-in fade-in duration-700 ring-2 ring-status-present-text/40` for 1.5 s before the id is removed from the set. No SWR dep — uses raw `useEffect` + `setInterval` matching existing client patterns. 4 new vitest cases: poll fires every 30 s when in-flight; poll silent when no in-flight; flip-to-PAID fires toast on rerender; initial mount with existing PAID rows silent (no false-fire).
- T7: Origin-aware Xendit redirect pinned. Added priority-pin case to `lib/__tests__/xendit-helpers.test.ts` asserting that staging/preview `requestOrigin` wins over `NEXT_PUBLIC_APP_URL` even when prod env is set. Added end-to-end case to `lib/__tests__/xendit-helpers-app-url.test.ts` stubbing the helper through to `createXenditSession` mock and asserting `successReturnUrl`/`cancelReturnUrl` use the staging origin (not prod). Added `vi.clearAllMocks()` to that file's `beforeEach` to prevent mock-call cross-test contamination. No log-line change to `lib/xendit/helpers.ts` — existing `[XENDIT SESSION CREATED]` log already emits `successOrigin` for operator triage. Test-only addition.

## Verification

- T0: `npm run build` green. `npx vitest run` 700 passed / 2 skipped / 42 todo. Banner removed from runtime — manual smoke at end-of-cycle Playwright. Cross-checked `design-system.html` §layout (no banner in standard chrome).
- T1: build + vitest green (700 / 2 / 42, unchanged). `grep -RE '(e-?wallet|kartu kredit|QRIS|credit card)' app/ components/ lib/email/` returns zero matches in live UI files. Manual smoke deferred to end-of-cycle.
- T2: build + vitest green (700 / 2 / 42, unchanged). 10 existing `validateManualForm` cases preserve per-field-reason coverage. Manual smoke at end-of-cycle Playwright (Chrome MCP).
- T3: build + vitest green (700 / 2 / 42, unchanged). Manual smoke deferred — error path requires API kill which is end-of-cycle territory.
- T4: build + vitest green (700 / 2 / 42, unchanged). `grep "celebration-gold.*style={{" app/parent/invoices` returns zero. Cross-checked design-system.html §empty-states + colors.md §Celebration tokens.
- T5: build + vitest green (705 / 2 / 42 — +5 new client.test.tsx cases). `feature-dev:code-reviewer` reviewed staged diff — flagged "router.replace fires even when invoice not found" + "Xendit-return useEffect lacks unit coverage"; both addressed before commit. Manual smoke deferred to end-of-cycle Chrome MCP UAT.
- T6: build + vitest green (709 / 2 / 42 — +4 new client.test.tsx cases for poll + flip-detect). Manual smoke (parent on list while admin marks invoice PAID → toast + ring) deferred to end-of-cycle.
- T7: build + vitest green (711 / 2 / 42 — +2 new origin pin tests). Manual staging vs prod origin smoke deferred to end-of-cycle UAT — already provable via stdout `[XENDIT SESSION CREATED]` log.

## Ship Notes
<filled by /ship>

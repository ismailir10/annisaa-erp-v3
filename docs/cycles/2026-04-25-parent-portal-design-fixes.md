# Parent Portal Design Fixes

## Context
Three issues surfaced on the parent portal: (1) tagihan (invoice) nominal text overflows mobile screens on `/parent` beranda — the card uses `text-display` (32px) monospace which exceeds a 375px viewport for amounts like `Rp 1.475.000`; (2) the **Kwitansi** download link in the paid-invoice detail sheet points to `/api/guardian/invoices/[id]/pdf`, but **this route does not exist** (only `/api/guardian/invoices/[id]/route.ts` is present) — every parent who taps "Kuitansi.pdf" hits a 404; (3) minor design-system drift across parent pages (card padding inconsistency `p-5` vs `p-4`, no responsive scaling for currency display). Outcome: parents can read amounts cleanly on mobile, paid-invoice receipts download as proper PDFs, and the parent portal cites design-system.html consistently. UAT report `docs/uat/reports/2026-04-18-parent.md` (7 days old, fresh) flagged invoice flow as blocker — the kwitansi 404 is a separate, unmentioned blocker on the same surface.

## Spec
**Acceptance criteria:**
- [ ] On a 375px viewport, the tagihan nominal on `/parent` home renders without horizontal overflow for amounts up to `Rp 99.999.999` and stays single-line.
- [ ] On `/parent/invoices` list and the invoice detail sheet, the focal amount uses the same responsive scale as `/parent` home.
- [ ] Tapping "Kuitansi.pdf" on a paid invoice in the parent portal returns a valid PDF (HTTP 200, `Content-Type: application/pdf`) with school name, invoice number, line items, paid amount, paid date, and tenant branding.
- [ ] Guardian access control on the new PDF route mirrors `/api/guardian/invoices/[id]/route.ts` — guardians can only download receipts for their own children's invoices; non-paid invoices return 404 (no leaked draft receipts).
- [ ] All parent portal pages (`app/parent/**`) cite `design-system.html` in the cycle doc Verification section (per pre-commit Rule 4 frontend gate).

**Non-goals:**
- Not touching the payment URL / Xendit "Bayar" flow (separate UAT blocker — already in flight).
- Not addressing `/parent/reports` 5.3s page-load perf (separate cycle).
- Not adding receipt PDF for unpaid invoices.
- No new design tokens — only reuse existing `font-currency`, `tabular-nums`, portal spacing scale.

**Assumptions:**
1. Reusing `@react-pdf/renderer` infra at `lib/pdf/salary-slip.tsx` is acceptable for the kwitansi template — same dependency, same teal/dark color tokens, same A4 layout pattern.
2. Guardian-to-invoice access check in existing `app/api/guardian/invoices/[id]/route.ts` is the canonical pattern to mirror.
3. Responsive currency scaling = `text-2xl sm:text-display` (24px mobile, 32px tablet+) is acceptable — no new token.
4. The 2026-04-18 UAT report findings on invoice flow are still valid (within 60-day staleness rule).

## Tasks

### Task 1 — Create kwitansi PDF route + template
- [x] Create `lib/pdf/invoice-receipt.tsx` reusing salary-slip styling tokens (TEAL, DARK accents, same header/logo block, A4 page).
- [x] Create `app/api/guardian/invoices/[id]/pdf/route.ts` with: session check, GUARDIAN role + own-child guard mirroring existing `app/api/guardian/invoices/[id]/route.ts`, paid-status guard (404 if unpaid), `renderToBuffer` returning `application/pdf`.
- [x] Acceptance: tap "Kuitansi.pdf" on paid invoice → PDF opens inline; non-paid → 404; non-owner guardian → 403.
- **Independent.** No dependency on Tasks 2/3.

### Task 2 — Responsive currency display on parent home + invoices
- [ ] Edit `app/parent/page.tsx:265` — change focal amount class from `text-display` to responsive `text-2xl sm:text-display`. Keep `font-currency`, `tabular-nums`, `leading-none`, `tracking-tight`. Add `break-all` fallback only if measurements still overflow; prefer responsive scale alone.
- [ ] Edit `app/parent/invoices/client.tsx:130` — same change.
- [ ] Edit `app/parent/invoices/invoice-detail-sheet.tsx` (focal amount near line 155 per explore) — same responsive scale.
- [ ] Acceptance: 375px viewport, amount `Rp 99.999.999` does not overflow card on all three surfaces.
- **Independent.** No dependency on Task 1.

### Task 3 — Design-system consistency sweep
- [ ] Standardize card padding: home page `p-5` → `p-4` to match invoice card token (portal.md §card-padding).
- [ ] Audit parent pages for arbitrary color classes (`text-[#…]`, `bg-[#…]`, `border-[#…]`) — none expected per explore, confirm none added.
- [ ] Update Verification section of this cycle doc with the literal `design-system` token plus per-page cross-check bullets (satisfies pre-commit Rule 4).
- [ ] Acceptance: visual diff on each parent route shows no regressions; `npm run build` clean.
- **Sequential after Tasks 1+2** — touches the same files as Task 2; merge cleanly.

## Implementation
- Subagent plan: Tasks 1 and 2 dispatched in parallel (no shared files); Task 3 sequential after (touches Task 2 files).
- Task 1: kwitansi PDF — `app/api/guardian/invoices/[id]/pdf/route.ts` + `lib/pdf/invoice-receipt.tsx`. New route mirrors guardian access pattern from sibling `[id]/route.ts` (session+role gate, parent.findFirst by parentId/email fallback, childIds.has(studentId), tenantId match). Paid-status guard returns 404 (no draft leak). Template reuses salary-slip visual tokens (TEAL/DARK, A4, 40px padding, formatRupiah). Dual code-review (feature-dev + superpowers): no blockers — IDOR safe, no info disclosure (identical 404 across negative cases), no logo URL injection (hardcoded NEXT_PUBLIC_APP_URL), Decimal→Number safe within IDR range. design-system: PDF visual tokens match design-system.html §brand-colors (TEAL `#5DB4B8`).

## Verification
- Task 1: gates passed (`npm run build` compiled clean, route registered as `ƒ /api/guardian/invoices/[id]/pdf`; `npx vitest run` 460 pass / 42 todo / 2 skip). Cross-checked design-system.html brand-colors section for kwitansi PDF accent tokens.

## Verification
<filled by /build>

## Ship Notes
<filled by /ship>

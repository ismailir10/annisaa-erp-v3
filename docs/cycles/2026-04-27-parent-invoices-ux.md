# Parent Invoices UX — Riwayat Ordering + Cache Parity + Nearest-Due Copy

## Context

Live verification on staging surfaced four UX issues on `/parent/invoices`:

1. **Riwayat ordering chaotic.** `paid.sort((a,b) => b.periodLabel.localeCompare(a.periodLabel))` runs alphabetic comparison on mixed-format strings (reseed uses `Sep-2025`, manual create uses `April 2026` / `Mei 2026`). Result: random order — Sep, Oct, Nov, **Mei 2026** (paid 26 April), Jul, Jan, Dec, Aug, **April 2026**.
2. **No pagination/limit on Riwayat.** All paid invoices render at once. With 50+ months historical data the list becomes unreadable.
3. **Manual invoice not visible without hard refresh.** None of the three mutation routes (`POST /api/invoices`, `/generate/batch`, `/retry-payment-links`) call `revalidateTag("parent-invoice-list")`. Parent waits up to 2 minutes for the unstable_cache TTL before seeing a freshly-created invoice. Confirmed live: home count showed 4 tagihan (correct) but `/parent/invoices` showed 3 until I hard-refreshed.
4. **"Jatuh tempo terdekat 10 Februari 2026"** displayed when today is 27 April 2026. `summary.nearestDue = MIN(dueDate)` returns the oldest past date when nothing future-dated exists. "Terdekat" (nearest) reads as future tense.

## Spec

- A1. Sort Riwayat by `paidAt DESC` (fallback `dueDate DESC` if paidAt missing). `localeCompare` on ISO timestamps is chronologically correct.
- A2. Cap Riwayat initial render at 12 most-recent rows. Show a "Lihat semua (N riwayat)" button to expand; "Tampilkan 12 terakhir" to collapse. Hidden when `paid.length <= 12`.
- A3. Outstanding-summary copy:
  - If any future dueDate exists → "jatuh tempo terdekat <date>" (current behavior, but pick min(future)).
  - If all past → "lewat tempo sejak <oldest-past-date>".
- A4. `revalidateTag("parent-invoice-list", { expire: 0 })` on every parent-affecting mutation: manual create, batch generate, retry-payment-links.

### Out of scope

- `success_return_url` / `cancel_return_url` cross-domain (production-vs-preview) issue. Separate fix — needs `VERCEL_URL` per-deployment, not in this cycle.
- Reseed periodLabel format mismatch (`Sep-2025` vs `September 2025`). Reseed-side fix.

## Implementation

- `app/parent/invoices/client.tsx` — Riwayat sort + 12-cap + expand button + nearest-due copy fork.
- `app/api/invoices/route.ts` — `revalidateTag` after manual create.
- `app/api/invoices/generate/batch/route.ts` — same after `txResult.length > 0`.
- `app/api/invoices/retry-payment-links/route.ts` — same when `outcome.succeeded > 0`.
- All mutation route tests gain a `vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))` shim — calling the real implementation outside Next.js context fails with "Invariant: static generation store missing".

## Verification

- `npm run build` → green.
- `npx vitest run` → 690 passed (was 690; +0 new, +4 mock injections to fix Next.js context).
- Manual: live retest on staging post-deploy.
- Cross-checked `.claude/standards/design-system.html` §Card / §Empty states / §Forms — Riwayat list keeps existing `<InvoiceRow>` token treatment; expand button uses `<Button variant="ghost" size="sm">` matching the standard ghost-secondary action pattern; copy strings stay in `text-xs text-muted-foreground` per Voice & tone §portal.

## Ship Notes

- No env, no migration. Pure client + cache-invalidation tweak.
- Behavior change: parent-portal /tagihan list refreshes within seconds of any admin mutation (was 2-minute TTL). Riwayat ordering now chronological (was alphabetic chaos). Outstanding-card copy now distinguishes future-due vs all-overdue.

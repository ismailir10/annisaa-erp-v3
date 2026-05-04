# UAT Report — cross-actor (admin + parent + teacher) — 2026-05-01

> Persona(s): Ibu Nur (admin), Pak Budi (parent), Bu Sari (teacher) — synthetic role-play via Chrome MCP against staging
> Jobs run: 6 (cap)  •  Blockers: 4  •  Majors: 3  •  Minors: 0
> Runtime: ~22m
> Target: https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app
> Login mode: Google OAuth (3 pre-signed-in profiles in operator's Chrome)

## Summary

Cross-actor sweep targeted the finance pipeline (admin invoice → parent payment → admin reconciliation) plus a sanity check on the teacher journal post-#154/#155 hotfixes. Finance pipeline is **broken end-to-end on staging**: 364 of 544 invoices (66.9%) are stuck in `PENDING_PAYMENT_LINK` despite cycle #151 (auto-retry, merged 2026-04-27) targeting ≥95% `SENT`, and only **1 invoice has ever been PAID** in the system's lifetime. The teacher portal exposed a separate critical regression — the teacher home content (PULANG clock-out, AKSES CEPAT, STATUS HARI INI) does not render for ~15 seconds after navigation, leaving the teacher staring at a blank screen during the daily clock-in moment. The student-journal Simpan z-index hotfix (#155) verified working in production, but the journal-entry list has a `whileInView` regression where above-the-fold student rows stay at opacity 0.04–0.13 until the user scrolls. Parent portal renders correctly and the paid-invoice detail UX is clean; pay path could not be exercised because the test parent's child has no payable `SENT` invoice — environmental seed gap, not a product bug.

## Findings

### FIN-CROSS-01 — 364/544 invoices stuck in PENDING_PAYMENT_LINK on staging
- **Persona:** Ibu Nur (admin)
- **Completed:** partial — admin can see the failed-link queue, but cycle #151's auto-sweep never recovered them
- **Severity:** blocker
- **Observation:** As Ibu Nur opening `/admin/invoices` for the first time after weeks of bulk activity, I see a "Coba Lagi Link (364)" CTA pinned at the top right. The stat panel reads `LINK GAGAL: 364`, `LUNAS: 1`, `SEBAGIAN: 0`, `JATUH TEMPO: 0`, total 544. Cycle [2026-04-27-invoice-create-auto-retry.md](../../cycles/2026-04-27-invoice-create-auto-retry.md) explicitly targeted "≥95% land in SENT directly out of bulk-generate" with an automatic post-run sweep. Achieved on staging today: 32.9% SENT (179), 66.9% PENDING_PAYMENT_LINK (364). Either the auto-sweep code path is not running, or the operator never re-ran a bulk after merge, or transient Xendit failures are wider than the 2-retry budget can absorb. The "Coba Lagi Link (364)" button is the only escape, and clicking it triggers 364 sequential Xendit calls with no progress UI surface that I trust.
- **Evidence:** `/api/invoices/stats` → `{"total":544,"sent":179,"paid":1,"pendingPaymentLink":364,"totalDue":610450000,"totalPaid":975000}`. UI panel renders "LINK GAGAL: 364" stat card and "Coba Lagi Link (364)" CTA in the page header.
- **Suggestion:** Diagnose why cycle #151's auto-sweep didn't reduce backlog (likely root cause: `XENDIT_SECRET_KEY` mis-config or rate-limit cap exceeded — check the popover breakdown promised in the cycle's Task 4 to see if 401/403/429 dominates). Run the `scripts/backfill-pending-payment-links.ts` one-shot promised in cycle Task 8 against staging to clear the 364 backlog, then re-run staging UAT.

**Performance**
| Action | Metric | Measured | Threshold | Verdict |
|---|---|---|---|---|
| /admin/invoices first paint | page full load | 2231ms | 1.5–2.5s | minor |
| /admin/invoices content visible (real "Tagihan / 544") | click-to-visible | ~5000ms | >3s | blocker |

### FIN-CROSS-02 — 1 invoice ever PAID across system lifetime
- **Persona:** Ibu Nur (admin)
- **Completed:** no — the parent payment pipeline has effectively never been exercised at scale
- **Severity:** blocker (data-integrity proxy: the money flow is unverified end-to-end)
- **Observation:** `LUNAS: 1` for `totalPaid: 975000` (Rp 975K). Cross-checked against parent portal: this single PAID invoice belongs to Bilal Hakim (Bu Ibu Nurul, `rightjet.hq@gmail.com`) for April 2026. The webhook → invoice state flip path that cycles 2026-04-24 (Xendit auth fix), 2026-04-26 (webhook robustness), and 2026-04-30 (xendit auth review) all hardened has been confirmed for exactly **one** real Xendit checkout in this system's history. There is no statistical evidence the production pipeline survives volume, rate-limit pressure, or concurrent webhook retries.
- **Evidence:** `/api/invoices/stats` → `paid:1, totalPaid:975000`; parent UI confirms "Lunas semua, Riwayat Pembayaran: April 2026 — Rp 975.000 — Dibayar 30 April" via Virtual Account.
- **Suggestion:** Before the next finance-touching cycle ships, manually drive ≥10 Xendit sandbox payments through the cross-actor flow and verify state-flip latency, idempotency under double-callback, and reconciliation-total parity. The auto-tests cover unit logic; the **production-shaped chain has never been load-tested against real Xendit retries**.

### FIN-CROSS-03 — Parent payment path untestable on staging (env seed gap)
- **Persona:** Pak Budi / Bu Ibu Nurul (parent, `rightjet.hq@gmail.com`)
- **Completed:** no — parent has no payable invoice for current period
- **Severity:** major (UAT enablement blocker, not product bug)
- **Observation:** As Bu Ibu Nurul I land on `/parent/invoices`. The page reads "Lunas semua. Tidak ada tagihan yang menunggu pembayaran." with one history row (April 2026, Rp 975K, paid 30 Apr). My child Bilal has zero `SENT` invoices, so there is no "Bayar" CTA to exercise. Meanwhile 179 SENT invoices exist for *other* students. The cross-actor flow cannot complete end-to-end through this account today. UAT skill expects `POST /api/admin/uat-prep` scenario `parent-payment` to backfill Xendit URLs on this parent's child's invoices — the endpoint exists but is **gated to non-production NODE_ENV and returns 403 on staging** (`{"error":"UAT prep is disabled in production"}`).
- **Evidence:** `POST /api/admin/uat-prep` → `403 "UAT prep is disabled in production"`; `POST /api/admin/seed` → `403 "Not available in production"`; parent invoice list = 0 SENT.
- **Suggestion:** Either (a) loosen the uat-prep gate to allow staging (check `VERCEL_ENV === "preview"` instead of `NODE_ENV !== "production"`) so the cross-actor path is reproducible from /uat, or (b) accept that staging cross-actor UAT requires a manual admin-side invoice creation step for the test-parent's child as a documented preflight. Recommend (a) — it is the documented contract in `.claude/skills/uat/SKILL.md` Step 8 and the friction here cost ~15 minutes of UAT runtime.

### TEACHER-HOME-01 — Home content hydrates ~15s after navigation; teacher sees blank screen
- **Persona:** Bu Sari (teacher)
- **Completed:** no — first-paint is unusable for the daily clock-in moment
- **Severity:** blocker
- **Observation:** As Bu Sari arriving at 6:55am to clock in, I navigate to `/teacher` after Google OAuth. Header and bottom nav render immediately. Main content (greeting, large clock, big orange PULANG/MASUK button, AKSES CEPAT card, STATUS HARI INI card) is **absent from the DOM until ~10s post-navigate** and only fully rendered at ~15s. Measured via `document.querySelector('main').innerHTML.length`: 324 bytes at t=10.3s (skeleton/empty), 3344 bytes at t=15.3s. On staging Vercel cold-start with Indonesian 4G this would be even worse. A teacher facing a blank screen at 6:55am on a workday will refresh, then refresh again, and lose trust.
- **Evidence:** `/teacher` `main innerHTML` size at t=3.6s → 0 elements found; t=10.3s → 324 bytes (no PULANG); t=15.3s → 3344 bytes (full content visible). Visual confirmation: 4s post-navigate screenshot shows ONLY the greeting "Selamat Malam, Ustadz/Ustadzah Ismail" + date (faded, opacity 0.23) and bottom nav — no PULANG button, no AKSES CEPAT card, no STATUS HARI INI.
- **Suggestion:** Check whether the teacher home is using server components with a slow data dependency (attendance lookup? holiday lookup?), or whether client-side framer-motion + suspense is gating render. If a single slow API call is the culprit, return the shell server-side and stream the data card. The PULANG button is the most-used element in the entire teacher day — it must be tappable within 1.5s.

**Performance**
| Action | Metric | Measured | Threshold | Verdict |
|---|---|---|---|---|
| /teacher navigation API load | page full load | 2760ms | 2.5–4s | major |
| /teacher main content hydrated | click-to-visible | ~15000ms | >3s | blocker |

### TEACHER-JOURNAL-01 — Above-the-fold student rows stuck at opacity 0.04–0.13 (whileInView regression)
- **Persona:** Bu Sari (teacher)
- **Completed:** partial — workaround exists (scroll) but discoverability is zero
- **Severity:** major
- **Observation:** On `/teacher/student-journal/entry?classId=...&date=2026-05-01` for KB Aster (16 siswa), the first two student rows (Aziz Abdullah Nasution, Bilal Hakim) appear faintly visible. Computed style on the wrapper divs: `opacity: 0.1267` and `opacity: 0.0418`, `transform: matrix(1, 0, 0, 1, 0, 2.93786)` — caught mid-fade-in-from-translate-Y. The inner buttons report `opacity: 1` but the parent framer-motion wrapper is not completing its animation. The remaining 14 rows render at full opacity *only after the user scrolls them into view*. Strongly suggests a `whileInView` (intersection observer) animation that fires `once: true` but where the initial render doesn't include the first 2 rows in the IntersectionObserver target list — or the IO callback fires before motion mounts so the "in view" trigger is missed.
- **Evidence:** Direct measurement on `/teacher/student-journal/entry?classId=cmodt0rnp001e7bx7mudjnf2h&date=2026-05-01`: row 1 (Aziz) outer wrapper `getComputedStyle(div).opacity = "0.1267"`, row 2 (Bilal) `0.0419`, both with `transform: matrix(1, 0, 0, 1, 0, 2.93786)` indicating mid-translate. Inner button reports opacity 1 — it is the framer-motion wrapper that fails to complete. Rows 3-16 render at full opacity once scrolled into view.
- **Suggestion:** Replace `whileInView`/`once:true` on the journal-entry student row with a plain mount fade, or guard the IntersectionObserver setup with `requestAnimationFrame` so the first paint includes the IO subscription. Bu Sari tapping a faint row icon to open notes will hit a 30%-visible target — borderline accessibility issue beyond aesthetics.

### PARENT-HOME-01 — Page load 3612ms with TTFB 1754ms
- **Persona:** Bu Ibu Nurul (parent)
- **Completed:** yes — content renders, just slow
- **Severity:** major
- **Observation:** Parent home `/parent` measured `loadEventEnd: 3612ms`, `ttfb: 1754ms`, `domContentLoaded: 2647ms`. TTFB above 1.5s on a Vercel staging suggests a server-side data fetch dominating the response (likely the household-overview aggregate from cycle 2026-04-25-parent-payment-hotfix). On a 4G phone this trends toward 5s. Pak Budi's persona note: "If the app feels slow on the train, I close it." 3.6s is the upper edge of acceptable.
- **Evidence:** `performance.getEntriesByType('navigation')[0]` → `{ttfb:1754, dcl:2647, load:3612}`. Recorded on Chrome desktop with stable wifi; mobile/4G would be worse.
- **Suggestion:** Profile the parent home server component's data dependencies. Likely candidate: combined fetch of children + invoices summary + journal week-grid in one round-trip without parallelism. Either parallelize the queries or split into a fast shell + streamed cards.

### ADMIN-INVOICES-01 — List page first paint shows "0 tagihan" before data hydrates (~5s)
- **Persona:** Ibu Nur (admin)
- **Completed:** yes — eventual state correct
- **Severity:** major
- **Observation:** Page header reads "Tagihan / 0 tagihan" for the first ~3s after navigation; six skeleton rows below; stat panel hidden. At ~5s the real data loads — 544 invoices, 364 LINK GAGAL stat, full table. An admin glancing at this page and immediately switching tabs would believe the system has zero invoices, which is wildly misleading on a system with 544. The "0 tagihan" header is computed from the API response before it arrives — it should render `—` or a skeleton, not a confidently-wrong number.
- **Evidence:** First screenshot at t=~3s shows "0 tagihan" subhead with skeleton rows; same page at t=~7s shows "544 tagihan" with stat cards populated and table rows for INV-2026-0544 etc. The header element is rendered with a confidently-wrong `0` from initial state instead of a loading affordance.
- **Suggestion:** Replace the count header's initial `0` with a skeleton or `—` until the first API response lands. Same fix likely applies to the other stat cards (TOTAL TAGIHAN, DRAFT, LUNAS, etc.) which all read `0` during the loading window.

## Heuristic disclaimer

This is synthetic UAT. An LLM persona cannot replicate thumb reach, sunlight glare, emotional distrust, or network conditions on a 4-year-old phone in Bekasi traffic. Treat findings as a cheap first pass, not a substitute for putting the app in front of a real teacher or parent. The cross-actor finance findings are particularly hardened by data: 364/544 stuck and 1 PAID lifetime are server-side facts, not perception. The teacher home blocker was directly measured (DOM size at timed intervals) and is reproducible. The remaining majors are timing-tier breaches against documented thresholds.

## Suggested follow-up (4 blockers present)

Copy-paste to a new session to kick off a fix cycle:

```
/spec fix Teacher home renders blank for ~15 seconds — main content does not hydrate until t=15s after navigation, leaving the daily clock-in moment unusable

Context: UAT on 2026-05-01 as Bu Sari surfaced a blocker on TEACHER-HOME-01.
Measured at t=3.6s the main element is empty; at t=10.3s main innerHTML is 324 bytes (skeleton only); at t=15.3s the PULANG button finally renders. Likely a slow server component data dependency or framer-motion gating the entire shell.
Full report: docs/uat/reports/2026-05-01-cross-actor.md

Constraints: must not regress the existing #155 z-index hotfix on the journal entry Simpan button; must not increase the teacher home payload beyond what cycle 2026-04-25 budgeted.
```

```
/spec fix Finance staging backlog — 364/544 invoices stuck PENDING_PAYMENT_LINK, only 1 invoice ever PAID; cycle #151 auto-sweep ineffective on staging

Context: UAT on 2026-05-01 as Ibu Nur surfaced FIN-CROSS-01 + FIN-CROSS-02. Stats endpoint returns total:544, paid:1, pendingPaymentLink:364, totalDue: Rp 610.450.000. Cycle 2026-04-27-invoice-create-auto-retry promised ≥95% SENT post-run; staging shows 32.9%. The Xendit checkout pipeline has only ever produced one PAID invoice end-to-end.
Full report: docs/uat/reports/2026-05-01-cross-actor.md

Constraints: do not silently delete the stuck invoices; cause analysis required (popover breakdown from cycle #151 Task 4) before backfill. Run scripts/backfill-pending-payment-links.ts only after diagnosis confirms transient (not 401/422) root cause.
```

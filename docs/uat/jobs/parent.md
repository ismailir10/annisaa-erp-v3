# Parent Portal — Jobs to be Done

> Last audited: 2026-04-18 in cycle `uat-jtbd-enrichment`
> Portal root: `app/parent/`
> Default persona: Pak Budi (see `.claude/personas/pak-budi.md`)

This file is the living catalog of what a parent user can and should be able to do in this system. `/uat parent` reads it, picks jobs scoped to the requested area, and role-plays each one via Playwright MCP. When a cycle adds, removes, or materially changes a parent-facing capability, edit this file as part of that cycle and bump the "Last audited" date.

---

## Area: invoices

### JTBD-PARENT-INV-01 — Pay the oldest outstanding invoice
- **Persona:** Pak Budi
- **Preconditions:**
  - Logged in as a parent with ≥1 unpaid invoice (status `PENDING` or `OVERDUE`) in demo seed
  - Demo cookie set (pattern from `e2e/parent.spec.ts`)
- **Steps (user intent, not UI clicks):**
  1. Land on the parent portal home
  2. Find which invoice is due next (amount + due date visible)
  3. Initiate payment via the system's payment flow (Xendit or whatever the wired provider is)
  4. Reach a confirmation state they can trust — amount, reference number, visible success
- **Done when:** User sees a clear success state with amount + reference. If Xendit redirect is involved, the redirect back to the portal shows the invoice as `PAID` or `PENDING_CONFIRMATION`.
- **Why this job matters:** Pak Budi's #1 priority. If this is slow or confusing, he stops trusting the whole ERP.
- **Expected perf:** invoices list load <1.5s; tap "Bayar" click-to-Xendit-redirect <2s; return-to-portal reconciliation visible <3s.
- **Known friction:** BLOCKER resolved 2026-04-17 (cycle `parent-uat-fixes`): demo invoices lacked `xenditPaymentUrl`; seed now populates deterministic placeholder. Duplicate "sedang disiapkan" message also removed. BACKFILL resolved 2026-04-18 (cycle `fix-parent-payment-backfill`): seed idempotency guard now patches existing null-URL SENT/PARTIALLY_PAID/OVERDUE rows on re-run; previously skipped them unconditionally.

---

### JTBD-PARENT-INV-02 — Understand an invoice's line-item breakdown
- **Persona:** Pak Budi
- **Preconditions:** Logged in as a parent with ≥1 invoice that has multiple fee components (SPP, uang kegiatan, etc.)
- **Steps:**
  1. Open the parent portal → Tagihan
  2. Tap into an invoice
  3. See every line item with its label and amount, plus the total
- **Done when:** Pak Budi can tell his wife exactly what the Rp X amount is made of, component by component. No opaque "Tagihan bulan Maret" with just a total.
- **Why this job matters:** Trust builder. When SPP goes up or a new fee appears, parents compare notes in WhatsApp. If the breakdown is hidden, the school looks shady.
- **Expected perf:** detail page load <1.5s; all line items visible without horizontal scroll on 375px viewport.

---

### JTBD-PARENT-INV-03 — Review paid-invoice history (last 3 months)
- **Persona:** Pak Budi
- **Preconditions:** Logged in as a parent with ≥2 paid invoices in the last 90 days
- **Steps:**
  1. Open the parent portal → Tagihan
  2. Filter or scroll to paid/historical invoices
  3. Confirm each paid invoice shows status `LUNAS`, paid date, and amount
- **Done when:** Pak Budi can prove to his wife "we already paid March and April". Paid invoices are listed (not hidden after payment) with a clear paid indicator and date.
- **Why this job matters:** Recordkeeping. When a school admin mistakenly sends a reminder for an already-paid invoice, Pak Budi needs evidence to push back. If paid invoices disappear from the list, he has nothing.
- **Expected perf:** history list load <1.5s; paid indicator + paid-date visible without opening each item.

---

## Area: attendance

### JTBD-PARENT-ATT-01 — Check child's attendance this week
- **Persona:** Pak Budi
- **Preconditions:** Logged in as a parent whose child has attendance records in the current week
- **Steps:**
  1. Open the parent portal
  2. Navigate to the attendance view
  3. See at a glance: how many days present, any absences, any late arrivals for this week
- **Done when:** User can count today's status and this week's status without scrolling. Status is shown as a badge or icon, not just a word in a table.
- **Why this job matters:** Second most common reason Pak Budi opens the app. If it takes more than 2 navigations to find this, he assumes Aisha was absent and panics.
- **Expected perf:** home card shows today's status <1.5s after page load; weekly view load <1.5s.
- **Known friction:** MAJOR addressed 2026-04-17 (cycle `parent-uat-fixes`): home Kehadiran card now shows today's `StatusBadge` or "Belum dicatat", eliminating the extra navigation to determine today's attendance.

---

## Area: reports

### JTBD-PARENT-REP-01 — View latest report card
- **Persona:** Pak Budi
- **Preconditions:** Logged in as a parent whose child has ≥1 published report card in seed
- **Steps:**
  1. Open the parent portal
  2. Navigate to the reports area
  3. Open the most recent report card and see scores/assessments
- **Done when:** User reaches the published report card. If there is no report yet, the empty state explains when it will be available (not a blank page).
- **Why this job matters:** Low frequency (once per quarter) but high emotional weight. Pak Budi wants to read it without being a power user.
- **Expected perf:** report list load <2s; opening a single report (sheet/detail) click-to-visible <2s on 4G.
- **Known friction:** MAJOR resolved 2026-04-17 (cycle `parent-uat-fixes`): replaced 5-col DataTable with mobile card stack; "Lihat" button now fully visible at 375px. BLOCKER (timing) resolved 2026-04-18 (cycle `fix-parent-payment-backfill`): list query now uses `select` with only list-level fields; categories/indicators/scores lazy-loaded via `/api/guardian/assessments/[id]` on sheet open. Page load reduced from 5.3s to expected sub-2s.

---

### JTBD-PARENT-REP-02 — Read the report card indicator by indicator
- **Persona:** Pak Budi
- **Preconditions:** Logged in as a parent whose child has ≥1 published report with multiple categories and indicators (e.g. "Akhlak", "Kognitif", "Bahasa")
- **Steps:**
  1. Open the parent portal → Rapor
  2. Open the latest report
  3. Read each category → each indicator → the score/descriptor
- **Done when:** Pak Budi can point at any single indicator (e.g. "Mampu menyebut huruf hijaiyah 1-10") and see its specific score or narrative, not just a category-level roll-up.
- **Why this job matters:** This is where the report card earns its keep. PAUD/TKIT parents want narrative formative feedback, not letter grades. If the UI flattens everything to a single score per category, the report loses its whole reason to exist.
- **Expected perf:** opening a report with 3+ categories and 10+ indicators renders fully <2s; no lazy-loaded blocks should still be spinning after 3s.

---

## Appendix: jobs not yet seeded

These exist in the product but are not in the UAT library yet. Add them when a cycle touches the corresponding area and update the "Last audited" date.

- School announcements / calendar
- Leave notifications / sakit reporting (parent-initiated)
- Profile and child-info updates
- Guardian-side view of teacher journal / class journal (if exposed)

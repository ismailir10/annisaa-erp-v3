# Parent Portal — Jobs to be Done

> Last audited: 2026-04-18 in cycle `fix-parent-payment-backfill`
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
- **Known friction:** BLOCKER resolved 2026-04-17 (cycle `parent-uat-fixes`): demo invoices lacked `xenditPaymentUrl`; seed now populates deterministic placeholder. Duplicate "sedang disiapkan" message also removed. BACKFILL resolved 2026-04-18 (cycle `fix-parent-payment-backfill`): seed idempotency guard now patches existing null-URL SENT/PARTIALLY_PAID/OVERDUE rows on re-run; previously skipped them unconditionally.

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
- **Known friction:** MAJOR resolved 2026-04-17 (cycle `parent-uat-fixes`): replaced 5-col DataTable with mobile card stack; "Lihat" button now fully visible at 375px. BLOCKER (timing) resolved 2026-04-18 (cycle `fix-parent-payment-backfill`): list query now uses `select` with only list-level fields; categories/indicators/scores lazy-loaded via `/api/guardian/assessments/[id]` on sheet open. Page load reduced from 5.3s to expected sub-2s.

---

## Appendix: jobs not yet seeded

These exist in the product but are not in the UAT library yet. Add them when a cycle touches the corresponding area and update the "Last audited" date.

- Understand invoice line-item breakdown (why does SPP cost what it costs)
- School announcements / calendar
- Leave notifications / sakit reporting
- Profile and child-info updates

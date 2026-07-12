# Parent Portal — Jobs to be Done

> Last audited: 2026-06-23 in cycle `ui-shadcn-audit` (checked invoice search/filter/sort affordances for long lists)
> Portal root: `app/parent/`
> Default persona: Pak Budi (see `.claude/personas/pak-budi.md`)

This file is the living catalog of what a parent user can and should be able to do in this system. `/uat parent` reads it, picks jobs scoped to the requested area, and role-plays each one via Playwright MCP. When a cycle adds, removes, or materially changes a parent-facing capability, edit this file as part of that cycle and bump the "Last audited" date.

---

## Area: invoices

### JTBD-PARENT-INV-01 — Pay the oldest outstanding invoice
- **Persona:** Pak Budi
- **Role:** GUARDIAN
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
- **Role:** GUARDIAN
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
- **Role:** GUARDIAN
- **Preconditions:** Logged in as a parent with ≥2 paid invoices in the last 90 days
- **Steps:**
  1. Open the parent portal → Tagihan
  2. When the child has more than 10 invoice/payment rows, use the search input to find a period or invoice number
  3. Use the status filter to show `LUNAS`, then use the sort control to review newest payment or largest amount ordering
  4. Confirm each paid invoice shows status `LUNAS`, paid date, and amount
- **Done when:** Pak Budi can prove to his wife "we already paid March and April". Paid invoices are listed (not hidden after payment) with a clear paid indicator and date. Long invoice lists expose search, status filter, sort, reset, and an empty state when the current filters match nothing.
- **Why this job matters:** Recordkeeping. When a school admin mistakenly sends a reminder for an already-paid invoice, Pak Budi needs evidence to push back. If paid invoices disappear from the list, he has nothing.
- **Expected perf:** history list load <1.5s; paid indicator + paid-date visible without opening each item.
- **Error scenarios to verify:**
  - Search/status/sort combination with no matches → empty state explains that no invoice matches the current filters
  - Reset clears search, returns status to all, and restores due-date ascending sort

---

## Area: attendance

### JTBD-PARENT-ATT-01 — Check child's attendance this week
- **Persona:** Pak Budi
- **Role:** GUARDIAN
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
- **Role:** GUARDIAN
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
- **Role:** GUARDIAN
- **Preconditions:** Logged in as a parent whose child has ≥1 published report with multiple categories and indicators (e.g. "Akhlak", "Kognitif", "Bahasa")
- **Steps:**
  1. Open the parent portal → Rapor
  2. Open the latest report
  3. Read each category → each indicator → the score/descriptor
- **Done when:** Pak Budi can point at any single indicator (e.g. "Mampu menyebut huruf hijaiyah 1-10") and see its specific score or narrative, not just a category-level roll-up.
- **Why this job matters:** This is where the report card earns its keep. PAUD/TKIT parents want narrative formative feedback, not letter grades. If the UI flattens everything to a single score per category, the report loses its whole reason to exist.
- **Expected perf:** opening a report with 3+ categories and 10+ indicators renders fully <2s; no lazy-loaded blocks should still be spinning after 3s.

---

## Area: student-journal

### JTBD-PARENT-JOURNAL-01 — Read this week's school-side journal entries
- **Persona:** Pak Budi
- **Role:** GUARDIAN
- **Preconditions:**
  - Logged in as a parent whose child has ≥1 school-side journal entry this week (teacher filled the class-day checklist + wrote ≥1 note)
  - Demo cookie set (pattern from `e2e/parent.spec.ts`)
- **Steps (user intent, not UI clicks):**
  1. Open the parent portal → Buku Penghubung
  2. Confirm the right child is selected (multi-child households)
  3. Land on the "Sekolah" tab
  4. Read each day's checklist status (what the teacher filled) and any notes the teacher wrote this week
- **Done when:** Pak Budi can answer his wife's question "what did Aisha do at school this week?" without calling the teacher. Each day's indicator checklist is readable at a glance; notes are grouped by date with the author role visible as `GURU` / `WALI`.
- **Why this job matters:** Buku Penghubung is the primary trust artifact for PAUD/TKIT parents — they pay for visibility into the school day. If this page fails to render the teacher's daily entries, the school looks absent.
- **Expected perf:** week grid load <1.5s; week navigation prev/next click-to-update <1s.
- **Error scenarios to verify:**
  - No entries for the week yet → empty state reads "Belum ada catatan minggu ini" (not a blank grid)
  - Network error on `/api/student-journal/children/{id}/week` → toast + retry CTA, never a white screen
- **Known friction (from last UAT):** <filled by /uat reports>

---

### JTBD-PARENT-JOURNAL-02 — Fill today's home-side habits checklist
- **Persona:** Pak Budi
- **Role:** GUARDIAN
- **Preconditions:** Logged in as a parent whose child has at least one home-side journal indicator configured for this week
- **Steps:**
  1. Open the parent portal → Buku Penghubung
  2. Switch to the "Rumah" tab
  3. For today's column, toggle the habits Aisha completed (e.g. sholat shubuh, mandi, tidur siang)
  4. Confirm the toggle persists immediately — no separate save button (`POST /api/student-journal/entries/home` fires synchronously on each tap, week re-fetches after)
- **Done when:** Toggled entries persist on reload. Only today's column is editable; past days are visually differentiated as read-only or still-editable-per-config. Parent never accidentally overwrites yesterday's data thinking it was today's.
- **Why this job matters:** Home side is the parent's half of the journal contract — skip this and the teacher has no signal on home reinforcement. If the toggle fires for the wrong day, trust collapses immediately.
- **Expected perf:** toggle click-to-persisted <800ms (optimistic UI acceptable as long as rollback on failure is visible).
- **Error scenarios to verify:**
  - Tap a past day's toggle when edit window closed → disabled state or error toast "Hanya hari ini yang bisa diubah"
  - `POST /api/student-journal/entries/home` 500 → toggle reverts after failed re-fetch, toast surfaces failure
- **Known friction (from last UAT):** <filled by /uat reports>

---

### JTBD-PARENT-JOURNAL-03 — Write, edit, then delete a parent note on a specific date
- **Persona:** Pak Budi
- **Role:** GUARDIAN
- **Preconditions:** Logged in as a parent whose child has an active journal for this week
- **Steps:**
  1. Open the parent portal → Buku Penghubung → "Catatan" tab
  2. Pick today's date and write a note ("Aisha batuk semalam, mungkin kurang fit hari ini")
  3. Save. See the note appear in the thread with a `WALI` badge and today's date.
  4. Edit the note (correct a typo) and save again. See the updated text.
  5. Delete the note. Confirm via AlertDialog. See the note gone from the thread.
- **Done when:** Full CRUD round-trip persists across reloads. Delete requires an AlertDialog confirmation (per `.claude/standards/portal.md` destructive-action contract). The note never silently attaches to the wrong child in multi-child households.
- **Why this job matters:** Parent-written notes are how sakit, izin, and family context reach the teacher before morning circle. A stuck save or wrong-child attachment creates real miscommunication.
- **Expected perf:** note create click-to-visible <1s; edit-save <1s; delete confirm-to-removed <1s.
- **Error scenarios to verify:**
  - Empty note body → client-side validation blocks submit with inline message
  - Note body >2000 chars → server rejects with 400 + toast "Catatan terlalu panjang"
  - Delete cancelled in AlertDialog → note stays, no API call fired
  - Attempt to edit/delete a teacher-authored note → edit/delete CTAs absent (client-side `canEdit` guard checks `authorRole === "GUARDIAN"` and `authorUserId === currentUserId`; API does not independently 403 at the route level — UI is the sole enforcement boundary today)
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: profile

### JTBD-PARENT-PROFILE-01 — Review linked children and jump to one child's attendance
- **Persona:** Pak Budi
- **Role:** GUARDIAN
- **Preconditions:** Logged in as a parent linked to ≥2 children
- **Steps:**
  1. Open the parent portal → Profil
  2. Scan the identity block (name, "Wali murid" role, phone, email)
  3. Scroll to the children list
  4. Tap one child's card
  5. Land on `/parent/attendance?child=<studentId>` scoped to that child's data
- **Done when:** Each linked child appears with initials, name, and class. Tapping a child lands on attendance scoped correctly (URL query param set, week grid shows that child's records). The profile view itself is read-only — no edit CTAs are present (editing is not yet shipped).
- **Why this job matters:** Low-frequency page but it is how parents verify the school has the right guardian–child links on file. Wrong linkage here means wrong invoice routing and wrong report-card access.
- **Expected perf:** profile page load <1.5s; child-card tap to attendance page visible <1.5s.
- **Error scenarios to verify:**
  - Parent has zero linked children (edge case, bad seed) → empty state "Belum ada anak terhubung" with instruction to contact admin
  - Child card links to a studentId the parent isn't authorized for → backend 403, UI surfaces it as "Tidak dapat membuka data anak ini"
- **Known friction (from last UAT):** <filled by /uat reports>

---

### JTBD-PARENT-PROFILE-02 — Sign out cleanly
- **Persona:** Pak Budi
- **Role:** GUARDIAN
- **Preconditions:** Logged in as a parent on any portal page
- **Steps:**
  1. Open the parent portal → Profil
  2. Tap "Keluar"
  3. Confirm the sign-out action if an AlertDialog is presented
  4. Land on a safe signed-out state (login page or marketing landing)
- **Done when:** Session cookie cleared; attempting to visit `/parent/invoices` after sign-out redirects to login. The button is findable without zooming on a 375px viewport.
- **Why this job matters:** Shared-device households (one phone, two parents) — if sign-out is hard to find or silently fails, the other parent sees the first parent's data. Privacy breach.
- **Expected perf:** tap-to-signed-out-landing <2s including cookie clear + redirect.
- **Error scenarios to verify:**
  - Sign-out API failure → toast + stay signed in (never pretend to sign out while cookie persists)
  - Browser back button after sign-out → does NOT restore authenticated page (server re-checks session)
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: home

### JTBD-PARENT-HOME-01 — Morning household quick-check
- **Persona:** Pak Budi
- **Role:** GUARDIAN
- **Preconditions:** Logged in as a parent linked to ≥1 child; child has attendance records this week and ≥1 invoice with status `SENT`, `PARTIALLY_PAID`, or `OVERDUE` in seed (the home unpaid-balance query at `app/parent/page.tsx` line 133 explicitly excludes `PENDING` — using `PENDING` for the precondition produces a false-negative "Lunas semua" tile)
- **Steps:**
  1. Open the parent portal root `/parent`
  2. Without scrolling on a 375px viewport, read: unpaid balance (total Rp), today's attendance status per child, latest journal note snippet
  3. Decide whether any action is needed (pay, message teacher, none)
- **Done when:** Unpaid balance and today's attendance are unconditionally visible above the fold on a 375×667 viewport (iPhone SE baseline). Latest journal-note snippet renders inside the per-child `KidCard` footer **only when** today's attendance is `PRESENT` AND a note exists in the last 14 days — non-PRESENT statuses (sick/absent/permission) take precedence in the footer (see `app/parent/page.tsx` lines 52–84). Navigating out and back preserves scroll position and data freshness.
- **Why this job matters:** This is the morning glance — Pak Budi opens the app between sholat shubuh and leaving for work. If the dashboard buries any of the three signals below the fold, he gives up and asks his wife instead.
- **Expected perf:** page full load <1.5s (SSR'd, three parallel Prisma queries via `Promise.all` in `app/parent/page.tsx` — threshold matches the global list-page rule in `SKILL.md`).
- **Error scenarios to verify:**
  - Child with zero attendance records yet → tile reads "Belum ada catatan" (not a blank card)
  - Unpaid-balance query fails but attendance succeeds → partial render (attendance still visible), balance tile shows "Gagal memuat, ketuk untuk muat ulang"
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: multi-child

### JTBD-PARENT-MULTI-01 — Switch from child A to child B across every data page
- **Persona:** Pak Budi
- **Role:** GUARDIAN
- **Preconditions:** Logged in as a parent linked to ≥2 children (Aisha + Yusuf) with distinct data in each area (different invoices, different attendance, different reports, different journal entries this week)
- **Steps:**
  1. On `/parent/invoices`, confirm Aisha is selected. Note her invoice list.
  2. Switch the child tab/pill to Yusuf. Confirm the invoice list updates to Yusuf's invoices (not Aisha's bleeding through).
  3. Navigate to `/parent/attendance`. Child selector should remember the last-chosen child OR default cleanly (either is acceptable, but must be consistent).
  4. Switch to Yusuf on attendance. Confirm his week grid shows.
  5. Repeat on `/parent/reports` and `/parent/student-journal`.
- **Done when:** Each of the four data areas (invoices, attendance, reports, journal) shows the correct child's data after the switch. The URL query param (`?child=<id>`) or state reflects the selected child. No "stale data from the previous child" bug where the list renders with Aisha's data while the tab highlights Yusuf.
- **Why this job matters:** The #1 silent correctness bug for multi-child households. If Pak Budi pays Yusuf's invoice thinking it's Aisha's, or reads Aisha's report thinking it's Yusuf's, trust is gone. This cross-cutting check is the regression canary for every portal page-state refactor.
- **Expected perf:** child switch click-to-new-data-visible <1s per page.
- **Error scenarios to verify:**
  - Child selector shows a child the parent isn't linked to (data bug) → either the child is hidden or tapping it 403s gracefully
  - Deep-link `/parent/invoices?child=<unauthorizedStudentId>` → backend 403, UI lands on "Tidak dapat membuka data anak ini" not a blank list
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Appendix: jobs not yet seeded

These exist as ideas but are not shipped in code yet. Add them when a cycle builds the corresponding feature and update the "Last audited" date.

- School announcements / calendar
- Leave notifications / sakit reporting (parent-initiated — server-side flow not shipped; parent notes in JOURNAL-03 are the current workaround)
- Guardian self-service edit of contact/child info — write capability not yet shipped; `app/parent/profile/page.tsx` is read-only, JTBD-PARENT-PROFILE-01 only credits the read-only navigation job

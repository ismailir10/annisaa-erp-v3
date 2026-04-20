# Teacher Portal — Jobs to be Done

> Last audited: 2026-04-18 in cycle `uat-jtbd-enrichment`
> Portal root: `app/teacher/`
> Default persona: Bu Sari (see `.claude/personas/bu-sari.md`)

This file is the living catalog of what a teacher user can and should be able to do in this system. `/uat teacher` reads it, picks jobs scoped to the requested area, and role-plays each one via Playwright MCP. When a cycle adds, removes, or materially changes a teacher-facing capability, edit this file as part of that cycle and bump the "Last audited" date.

---

## Area: class-attendance

### JTBD-TEACHER-ATT-01 — Mark today's class attendance
- **Persona:** Bu Sari
- **Preconditions:**
  - Logged in as a teacher who is the wali kelas for ≥1 class in seed
  - The class has ≥5 students
  - Demo cookie set (pattern from `e2e/teacher.spec.ts`)
- **Steps (user intent, not UI clicks):**
  1. Open the teacher portal
  2. Navigate to class attendance
  3. Mark today's attendance — default assumption is "everyone present"; she only marks exceptions (absent/sakit/izin/late)
  4. Save
- **Done when:** All students have a status for today. The save completes with visible confirmation. Reopening the page shows today's state preserved.
- **Why this job matters:** Bu Sari's #1 daily task. She has 3 minutes before morning circle. Every extra tap is expensive.
- **Expected perf:** full page load <1.5s; save click-to-confirm <800ms; any slower is noticeable and graded accordingly.
- **Known friction (from last UAT):** Class selector now displays human-readable class name (fixed in `uat-quick-wins` cycle, previously showed raw DB ID like `cs_kb_aster`)

---

### JTBD-TEACHER-ATT-02 — Correct yesterday's attendance (a parent just called)
- **Persona:** Bu Sari
- **Preconditions:**
  - Logged in as wali kelas with ≥1 class
  - At least one student has an attendance record from yesterday
  - Demo cookie set
- **Steps:**
  1. Open the teacher portal → class attendance
  2. Change the date picker to yesterday (or navigate back one day)
  3. Find the student whose parent reported they were actually sick, change status from `HADIR` → `SAKIT`
  4. Save
- **Done when:** Yesterday's record for that student is updated and persists on reload. No confusing "out of range" or "locked" errors for a same-week correction.
- **Why this job matters:** Parents call the next morning saying "my kid was actually sick yesterday, can you fix the record?" If Bu Sari can't correct it without asking admin, she either lies to the parent or stops trusting the system.
- **Expected perf:** date-picker change + list reload <1.5s; save click-to-confirm <800ms.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: slips

### JTBD-TEACHER-SLIP-01 — View this month's salary slip
- **Persona:** Bu Sari
- **Preconditions:** Logged in as a teacher who has ≥1 salary slip generated in seed for the current month
- **Steps:**
  1. Open the teacher portal
  2. Navigate to the salary slip section
  3. Open the latest slip and see gross, deductions, net
- **Done when:** User sees her slip with Rupiah-formatted amounts, breakdown of components, and a way to download or screenshot it. If the slip is not yet issued, the empty state explains when it will be.
- **Why this job matters:** Monthly ritual. She screenshots it to send to her husband. If the layout is awkward or mixes concerns, she loses trust.
- **Expected perf:** slip list load <1.5s; open-slip click-to-visible <800ms.
- **Known friction (from last UAT):** <filled by /uat reports>

---

### JTBD-TEACHER-SLIP-02 — Screenshot or download this month's slip cleanly
- **Persona:** Bu Sari
- **Preconditions:** Logged in as a teacher who has ≥1 issued salary slip this month
- **Steps:**
  1. Open the teacher portal → slip section
  2. Open the latest slip
  3. Either (a) take a screenshot on phone, or (b) tap the download/PDF button
- **Done when:** The visible slip layout fits the phone screen without horizontal scroll; all amounts are on-screen when screenshot is taken; the downloaded PDF (if offered) opens cleanly with full breakdown.
- **Why this job matters:** She sends this to her husband every month. If the layout cuts off or the PDF download fails silently, the trust is broken — she either re-types amounts by hand or stops checking the app.
- **Expected perf:** PDF/download click-to-file <3s; screenshot-ready layout must fit on one mobile viewport without scroll.

---

## Area: profile

### JTBD-TEACHER-PROFILE-01 — Update profile photo
- **Persona:** Bu Sari
- **Preconditions:** Logged in as a teacher, profile exists in seed
- **Steps:**
  1. Open the teacher portal
  2. Navigate to profile
  3. Upload a new profile photo from phone gallery (simulated in the skill via `browser_file_upload`)
  4. See the new photo reflected in the header/avatar
- **Done when:** New photo is visible in both profile and header after save. Upload gives clear feedback (progress or instant).
- **Why this job matters:** Low frequency but a common "first touch" action for new teachers. If upload silently fails she gives up.
- **Expected perf:** upload-to-visible <3s on mid-range Android + 4G; progress indicator must appear within 500ms of file selection.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Appendix: jobs not yet seeded

- Submit weekly class journal (jurnal kelas)
- Record a student assessment / observation
- Request leave (izin cuti) as a teacher

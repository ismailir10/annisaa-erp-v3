# Teacher Portal — Jobs to be Done

> Last audited: 2026-04-25 in cycle `enrich-uat-jobs`
> Portal root: `app/teacher/`
> Default persona: Bu Sari (see `.claude/personas/bu-sari.md`)

This file is the living catalog of what a teacher user can and should be able to do in this system. `/uat teacher` reads it, picks jobs scoped to the requested area, and role-plays each one via Playwright MCP. When a cycle adds, removes, or materially changes a teacher-facing capability, edit this file as part of that cycle and bump the "Last audited" date.

---

## Area: class-attendance

### JTBD-TEACHER-ATT-01 — Mark today's class attendance
- **Persona:** Bu Sari
- **Role:** TEACHER
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
- **Role:** TEACHER
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
- **Role:** TEACHER
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
- **Role:** TEACHER
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
- **Role:** TEACHER
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

## Area: assessments

### JTBD-TEACHER-ASSESS-01 — Fill indicator scores for a full class with autosave
- **Persona:** Bu Sari
- **Role:** TEACHER
- **Preconditions:**
  - Logged in as wali kelas with ≥1 class section assigned in seed
  - At least one assessment template + period (e.g. `2026-Q2`) is configured for that class
  - Class has ≥5 students; no scores filled yet for the period
  - Demo cookie set
- **Steps (user intent, not UI clicks):**
  1. Open the teacher portal → Penilaian
  2. Pick a class section + template + period
  3. Land on the per-student scoring grid
  4. Expand each student accordion and tap one of the 4-level rubric buttons (BB/MB/BSH/BSB) for each indicator
  5. Watch the autosave indicator settle to "saved" between taps (1.2s debounce per `app/teacher/assessments/[classSectionId]/[templateId]/[period]/client.tsx`)
  6. Optionally add a per-indicator note
- **Done when:** Every tapped score persists across a full reload. Autosave indicator never gets stuck on "saving" longer than 3s under normal network. Reopening a previously-edited student shows the prior scores already populated.
- **Why this job matters:** End-of-term ritual — Bu Sari fills 25 students × 12 indicators per template per period. If autosave silently drops scores or the debounce is too aggressive (rapid tap → only last value saved), her work is lost. This is the most expensive data-entry flow in the teacher portal.
- **Expected perf:** scoring page initial load <2s; tap-to-save-confirm <1.5s including the 1.2s debounce; no UI jank when typing notes on a 5-year-old Android.
- **Error scenarios to verify:**
  - Network drop during autosave → indicator shows "error", retry on next tap; no silent loss
  - Two browser tabs editing the same student → last write wins, but neither tab hangs
  - Tap a rubric button rapidly 5× across 200ms → exactly one autosave fires, final value is the 5th tap
- **Known friction (from last UAT):** <filled by /uat reports>

---

### JTBD-TEACHER-ASSESS-02 — Bulk publish all student scores for a period
- **Persona:** Bu Sari
- **Role:** TEACHER
- **Preconditions:** Same as ASSESS-01 plus every student has ≥1 indicator score filled (mix of "all filled" and "one student empty" to verify the gate)
- **Steps:**
  1. With all scoring done, scroll to the sticky bottom action
  2. Tap "Publish" / bulk-publish CTA
  3. Watch the per-student progress (the implementation iterates `students[]` and calls `saveStudent(id, { publish: true })` per student — see `client.tsx` lines 266–290)
  4. Read the resulting toasts: success for each published student, error for any student with zero filled scores ("Bu Sari: belum ada nilai yang diisi")
- **Done when:** All eligible students transition to `PUBLISHED` status; the header counter `{publishedCount}/{totalStudents}` updates live. Empty-score students are NOT published and produce a clear per-student error toast naming the student. After publish, the parent's `/parent/reports` for that child reflects the new published assessment.
- **Why this job matters:** Bulk publish is what makes report cards visible to parents. A silent publish failure = parents WhatsApp Bu Sari asking why the report isn't showing. A wrongful publish (empty-score student treated as published) = parents see an empty report.
- **Expected perf:** publish loop completes in <Nx1s where N=class size (each student ≈1 round-trip). For a 25-student class on 4G, total <30s with progress visible throughout.
- **Error scenarios to verify:**
  - One student has zero scores → toast `<student name>: belum ada nilai yang diisi`, that student stays `DRAFT`, others still publish
  - All students empty → final toast "Tidak ada yang dipublikasikan" (per `client.tsx` line 289)
  - Mid-loop network failure → some students published, some not; no rollback (acceptable but operator must be told to re-tap publish for the failed subset)
  - Publish gate is per-student inside the loop — there is NO upfront "every student must have ≥1 score" check that blocks the button before iteration. UAT must script around this implementation reality.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: own-attendance

### JTBD-TEACHER-ATT-OWN-01 — Review monthly attendance calendar
- **Persona:** Bu Sari
- **Role:** TEACHER
- **Preconditions:** Logged in as a teacher with ≥10 attendance records this month (mix of PRESENT / LATE) and ≥1 in the prior month
- **Steps:**
  1. Open the teacher portal → Kehadiran Saya (`/teacher/attendance`)
  2. See current month calendar with each day's status colored
  3. Tap prev/next to switch to last month
  4. Confirm prior-month records render
  5. Tap a day with a record to read check-in/check-out timestamps
- **Done when:** Calendar renders all records for the chosen month from `GET /api/attendance/my?month=X&year=Y`. Color coding follows the status palette in `.claude/standards/colors.md`. Month nav prev/next round-trip is sub-second after first load. Empty days (weekends / future dates) are visually distinct from "no record" days.
- **Why this job matters:** Bu Sari uses this once per payroll cycle to verify her own attendance before slips drop. If the calendar is wrong, she disputes payroll — admin then has to dig through raw records. Trustworthy display here saves a tail-end of admin work.
- **Expected perf:** initial load <1.5s; month-change reload <1s.
- **Error scenarios to verify:**
  - `/api/attendance/my` 500 → toast "Gagal memuat kehadiran. Coba lagi sebentar ya." + skeleton clears (no infinite spinner) — see `app/teacher/attendance/page.tsx` lines 31–34
  - Future-month nav → empty calendar, not an error
- **Known friction (from last UAT):** <filled by /uat reports>

---

### JTBD-TEACHER-ATT-OWN-02 — Raise a leave / cuti request for a future date
- **Persona:** Bu Sari
- **Role:** TEACHER
- **Preconditions:** Logged in as a teacher with non-zero leave balance configured in seed
- **Steps:**
  1. Open `/teacher/attendance`
  2. Tap the "Cuti & Izin" card at the top
  3. LeaveSheet opens — review remaining balance
  4. Pick start date, end date, leave type (cuti / izin / sakit), reason
  5. Submit
  6. See success toast + the request appear with status `PENDING`
- **Done when:** Request is created in `LeaveRequest` with the correct dates + type. Sheet closes on success. Balance shown in the Sheet reflects the new "pending" deduction (or note clearly that pending requests don't yet decrement the visible balance — verify against current implementation).
- **Why this job matters:** This is the only standalone leave-request flow in the teacher portal. If submission silently fails or rejects valid input, Bu Sari calls admin via WhatsApp instead — re-introducing the manual workflow the ERP was supposed to retire.
- **Expected perf:** sheet open <500ms; submit click-to-confirm <1.5s.
- **Error scenarios to verify:**
  - End date before start date → client-side validation blocks submit
  - Overlapping with an existing approved leave → 400 with reason
  - Leave-balance exhausted → 400 "Saldo cuti tidak cukup"
  - Sheet dismissed mid-submit → does not double-submit on retry
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: student-journal

### JTBD-TEACHER-JOURNAL-01 — Fill today's class-day journal grid
- **Persona:** Bu Sari
- **Role:** TEACHER
- **Preconditions:**
  - Logged in as wali kelas with ≥1 class section
  - Class has ≥5 students and ≥3 school-side indicators configured
- **Steps:**
  1. Open the teacher portal → Buku Penghubung
  2. Pick the class + today's date
  3. Tap "Isi Penghubung" — land on the entry grid (`/teacher/student-journal/entry`)
  4. For each student × indicator cell, toggle the checkbox to mark observed behavior
  5. Tap the sticky bottom "Simpan" — `POST /api/student-journal/entries/batch`
  6. See success toast and updated state on reload
- **Done when:** Every toggled cell persists across reload. Save is a single batch call, not N per-cell calls. The grid is scrollable horizontally on mobile without losing the sticky student-name column.
- **Why this job matters:** Bu Sari's daily after-circle ritual — 5 minutes max before parents come in for pickup. If the grid has horizontal-scroll bugs or the save loops per cell, she abandons it for paper.
- **Expected perf:** grid load <1.5s for a 25-student × 8-indicator class; batch save click-to-confirm <2s; tap-to-toggle latency <100ms (purely client state).
- **Error scenarios to verify:**
  - Save without any toggles → empty payload, server accepts (no-op) or rejects with clear message — verify which
  - Network drop mid-save → button returns to ready state, no double-submit on retry
  - Switch class mid-entry → unsaved toggles warn before discard (or auto-save them — verify which)
- **Known friction (from last UAT):** <filled by /uat reports>

---

### JTBD-TEACHER-JOURNAL-02 — Open one student's week and add a dated observation note
- **Persona:** Bu Sari
- **Role:** TEACHER
- **Preconditions:** Logged in as wali kelas; one student in her class has at least one note from a prior week
- **Steps:**
  1. From the journal picker, drill into a single student's week view (`/teacher/student-journal/students/[id]`)
  2. Use prev/next chevrons to navigate to last week and back to this week
  3. Tap "+" to open the add-note dialog
  4. Pick a date within this week, write a note (≤2000 chars), save
  5. See the note appear in the thread with `GURU` badge and the chosen date
- **Done when:** The note is created via `POST /api/student-journal/notes`, attached to the right student + date. Week navigation works on touch (chevrons) without layout shift. The dialog dismisses on success and the thread updates without a full reload.
- **Why this job matters:** Mid-week observations ("Aisha was withdrawn today after lunch") are how Bu Sari builds the qualitative narrative parents read at term-end. If add-note is buried or breaks, the journal becomes attendance-only and loses its formative value.
- **Expected perf:** week view load <1.5s; week prev/next <1s; note save click-to-visible-in-thread <1s.
- **Error scenarios to verify:**
  - Empty body → client-side block
  - Body >2000 chars → server 400 + toast
  - Date in the future → blocked client-side by `<Input type="date" max={today}>` clamp at `app/teacher/student-journal/students/[id]/page.tsx` line 213
  - Date from a prior week (out-of-visible-week but past) → accepted today; no server-side week-range gate exists. Documented gap — UAT should NOT assert a server rejection here. If tighter scoping is desired, file a follow-up cycle to add server-side week-range validation in `POST /api/student-journal/notes`.
- **Known friction (from last UAT):** <filled by /uat reports>

---

### JTBD-TEACHER-JOURNAL-03 — Read a parent note and confirm role badge renders
- **Persona:** Bu Sari
- **Role:** TEACHER
- **Preconditions:** A parent has written ≥1 note on a student in Bu Sari's class within the visible week (seed JTBD-PARENT-JOURNAL-03 dependency)
- **Steps:**
  1. Open the student's week page
  2. Scroll the NoteThread
  3. Locate the parent note — confirm the badge reads `Orang Tua` (rendered from `authorRole: GUARDIAN` via the `ROLE_LABELS` map in `components/student-journal/note-thread.tsx`)
  4. Confirm Bu Sari's own notes render with the badge `Guru` (rendered from `authorRole: TEACHER`)
  5. Confirm Bu Sari has no edit/delete affordance on the parent's note (read-only for foreign-author notes, per `NoteThread` `canEdit` check)
- **Done when:** Author-role badges are visually distinct: Bu Sari's notes show `Guru`; parent notes show `Orang Tua`. Edit/delete CTAs are visible only on Bu Sari's own notes. Threading is chronological by `note.date` then `createdAt`. **UAT assertion note:** match the literal strings `Guru` and `Orang Tua` exactly — not the enum values `TEACHER` / `GUARDIAN`, which never reach the DOM.
- **Why this job matters:** Two-way journal trust — Bu Sari must visibly distinguish what came from her vs. what came from the parent. If badges blur, she could miscredit a parent's quote as her own observation in end-of-term reports.
- **Expected perf:** thread render <500ms after week load.
- **Error scenarios to verify:**
  - Tap edit/delete on a parent's note → CTAs absent (client-side guard in `NoteThread`); same caveat as JTBD-PARENT-JOURNAL-03 — API does not independently 403 today
  - Note with very long body (1500+ chars) → wraps cleanly in the thread, no horizontal scroll on 375px
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: home

### JTBD-TEACHER-HOME-01 — Morning routine: GPS check-in from home tile
- **Persona:** Bu Sari
- **Role:** TEACHER
- **Preconditions:**
  - Logged in as a teacher
  - Browser has location permission state available (will be either prompt-allowed or denied per scenario)
  - No check-in record yet for today
- **Steps:**
  1. Open the teacher portal root `/teacher`
  2. Read live clock + today's status card (no check-in yet)
  3. Tap "MASUK" — browser geolocation prompt fires (`navigator.geolocation.getCurrentPosition` per `home-client.tsx` line 47)
  4. Allow location → coordinates display, `POST /api/attendance/check-in` fires with lat/lng
  5. Status card flips to "Sudah masuk" with check-in timestamp
  6. Later in the day, return to `/teacher`, tap "PULANG" — same flow against `/api/attendance/check-out`
- **Done when:** Single tap → GPS captured → record persisted → status card shows the timestamp without a full reload. The home page is the only check-in entry point in the portal (the `/teacher/attendance` page does NOT host check-in CTAs — it is calendar + leave only). HOME-01 therefore intentionally subsumes what `/spec` originally listed as `JTBD-TEACHER-ATT-OWN-01` for GPS check-in; the own-attendance area covers calendar review + leave only.
- **Why this job matters:** First action of every workday. If GPS denies or the request hangs, Bu Sari either skips check-in (payroll dispute) or stops trusting the app. This JTBD is the single highest-frequency teacher interaction.
- **Expected perf:** tap to GPS prompt <300ms; allow → coordinates resolved → check-in persisted <2s on 4G; status card update <500ms after persist.
- **Error scenarios to verify:**
  - GPS permission denied → inline `gpsStatus` text under the button changes to `GPS ditolak` (NOT a toast; current code does not block on denial). The check-in `POST` still fires with `lat: undefined, lng: undefined` — this is a pre-existing gap, not a UAT assertion to enforce. UAT should record the behavior as observed, not assert the request was blocked.
  - Browser has no `navigator.geolocation` API at all (`!navigator.geolocation` guard at `home-client.tsx` line 41) → request short-circuits with the no-API path; distinct from permission denial above
  - GPS timeout (no fix in 10s) → `gpsStatus` reflects timeout; same caveat as denial above (request still fires unless code is changed)
  - Already checked in today → "MASUK" button is replaced by "PULANG" (driven by `hasCheckedIn` derived from today's record)
  - Check-in API 500 → status card does NOT flip; toast surfaces failure
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Appendix: jobs not yet seeded

These exist as ideas but are not shipped or are still TBD. Add them when a cycle builds the corresponding feature and update the "Last audited" date.

- Teacher-side announcements feed (read-only inbound from admin)
- Per-student behavior trend charts beyond the weekly grid

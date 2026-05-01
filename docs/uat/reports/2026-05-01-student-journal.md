# UAT Report — student-journal — 2026-05-01

> Persona(s): Bu Sari (teacher), Bu Ibu / Pak Budi proxy (parent)
> Jobs run: 5 (cap 6) — JOURNAL-TEACHER-01, 02, 03 + JOURNAL-PARENT-01, 02, 03
> Blockers: 2 • Majors: 2 • Minors: 3
> Runtime: ~12m (Chrome MCP, staging)
> Target: https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app
> Accounts: teacher `ismail10rabbanii@gmail.com` (wali kelas D'Care — Aster), parent `rightjet.hq@gmail.com` (Bilal Hakim, KB — Aster)

## Summary

The teacher half of Buku Penghubung is shipped but the two highest-frequency teacher jobs are unreachable through the UI. (1) The class-day batch-entry "Simpan" bar is rendered behind the BottomNav due to a z-index inversion — Bu Sari fills indicators, scrolls for save, sees only the bottom nav, and either gives up or assumes the toggles auto-saved (they did not). (2) The wali kelas teacher gets 403 on `GET /api/student-journal/students/[id]/week` and `POST /api/student-journal/notes`, so the per-student week view + add-note dialog are functionally dead even though the route exists and the page renders an empty state that hides the auth failure. The parent half works end-to-end (create/edit/delete CRUD all 200/201) but the home-side toggle has no edit-window enforcement — parent can silently backfill any past day in the visible week. Performance is not a problem on this run; every page loaded under 1.1s and every API responded under 500ms.

## Findings

### JOURNAL-TEACHER-01 — Fill today's class-day journal grid
- **Persona:** Bu Sari
- **Completed:** no (UI path) / yes (programmatic)
- **Severity:** **blocker**
- **Observation:** Bu Sari opens the entry grid for D'Care — Aster on Friday 1 Mei 2026. Picker → Isi Penghubung loads in ~1.1s. The accordion list of 40 students renders. She expands Aisyah, taps "Mengikuti doa pembuka", "Mengikuti doa penutup", "Menyelesaikan tugas hari ini" — counter goes to 2/6 (one tap was a toggle-off on a previously-set indicator). She scrolls down looking for "Simpan". She sees the bottom navigation (Beranda / Kehadiran / Kelas / Penghubung / Penilaian) and nothing else. She scrolls up and down. There is no save button visible anywhere. *Did it save? She doesn't know.* In reality, the Simpan bar **does** exist in the DOM at `position: fixed; bottom: 0; z-index: 20; height: 49px`, but the BottomNav is also `position: fixed; bottom: 0; z-index: 30; height: 65px` and renders directly on top of it, hiding the entire save bar. Forcing the click programmatically (`document.querySelector` + `.click()`) fires `POST /api/student-journal/entries/batch` → 200 with toast "Catatan tersimpan · 3 entri", and persistence is verified on hard reload (counter stays 2/6). The feature works; the UX hides it.
- **Evidence:** DOM snapshot of two `position:fixed; bottom-0` siblings — `<div class="fixed bottom-0 inset-x-0 z-20 ... py-3"><button>Simpan</button></div>` and `<nav class="fixed bottom-0 inset-x-0 ... z-30 safe-area-bottom">`. Both rect.y=658 and 642 respectively in a 707px viewport — full overlap.
- **Suggestion:** Either raise SaveBar z-index above nav AND add `bottom-[64px]` so the nav stays accessible underneath, or hide BottomNav while on `/teacher/student-journal/entry` (full-screen entry mode like attendance).

**Performance**
| Action | Metric | Measured | Threshold | Verdict |
|---|---|---|---|---|
| Picker page | full load | 1094ms | <1500ms | fine |
| Entry grid load | full load | 1094ms | <1500ms | fine |
| Toggle indicator | client-only | <50ms | <100ms | fine |
| Batch save (forced) | POST 200 | <500ms | <2000ms | fine |

---

### JOURNAL-TEACHER-02 — Open one student's week and add a dated observation note
- **Persona:** Bu Sari
- **Completed:** no
- **Severity:** **blocker**
- **Observation:** No UI path from the picker (`/teacher/student-journal`) to the per-student week view (`/teacher/student-journal/students/[id]`). The picker page only has "Pilih Kelas + Tanggal + Isi Penghubung" — no link, button, or breadcrumb to drill into a single student. Even after grabbing a student CUID via `/api/teacher/students` and navigating directly, **`GET /api/student-journal/students/[studentId]/week?weekStart=2026-04-27` returns 403 Forbidden** for the wali kelas teacher of that student. Authentication is fine (the same session reads `/api/teacher/students?classId=...` and gets 200 with 40 students). The page renders "Belum ada indikator yang dikonfigurasi." — an empty state that hides the actual auth failure. Adding a note via the "Tambah Catatan" dialog also returns **`POST /api/student-journal/notes` → 403 Forbidden**. The dialog stays open after the failed click; only a raw English toast "Forbidden" appears in the corner. From Bu Sari's perspective, she filled the dialog ("Aisyah aktif ikuti circle pagi") and clicked Simpan — she doesn't know if it saved or what "Forbidden" means.
- **Evidence:** Network log `GET .../students/cmodt186h00707bx79hsgwqnx/week?weekStart=2026-04-27 → 403`; `POST .../notes → 403` after clicking Simpan in dialog. Toast text literal: `Forbidden`.
- **Suggestion:** Two-part fix. (a) Backend: `app/api/student-journal/students/[studentId]/week/route.ts` and `app/api/student-journal/notes/route.ts` need to accept the wali kelas teacher whose `ClassSection.homeroomTeacherId` matches `student.enrollment.classSectionId`'s homeroom; today the rule appears to be parent/guardian-only. (b) Frontend: add a per-student-row affordance on the entry grid (chevron/expand into week view), so the page is actually reachable.

**Performance**
| Action | Metric | Measured | Threshold | Verdict |
|---|---|---|---|---|
| Week page load | full load | 974ms | <1500ms | fine |
| Week API GET | response | <300ms (403) | <2000ms | fine (perf) — auth-blocked |
| Note POST | response | <300ms (403) | <2000ms | fine (perf) — auth-blocked |

---

### JOURNAL-TEACHER-03 — Read a parent note and confirm role badge renders
- **Persona:** Bu Sari
- **Completed:** no (cascade)
- **Severity:** **blocker** (cascade from JOURNAL-TEACHER-02)
- **Observation:** Cannot exercise. The week view that hosts the NoteThread is the same 403'd `GET /api/student-journal/students/[id]/week` from JOURNAL-TEACHER-02, so no notes ever load on the teacher side and the role-badge spec (`Guru` vs `Orang Tua`) cannot be verified. **Note:** the parent side does render the badge correctly as `Orang Tua` — verified in JOURNAL-PARENT-03. Once the teacher 403 is resolved, JOURNAL-TEACHER-03 should pass without separate work.
- **Evidence:** Same 403 trace as JOURNAL-TEACHER-02.
- **Suggestion:** Re-run JOURNAL-TEACHER-03 once JOURNAL-TEACHER-02 fix lands; expect it to pass.

---

### JOURNAL-PARENT-01 — Read this week's school-side journal entries
- **Persona:** Bu Ibu (Pak Budi proxy)
- **Completed:** yes (rendering); empty state correct (no teacher entries because the test parent's child is in a different class than the test teacher's class — KB Aster vs D'Care Aster — see "Coverage gap" below)
- **Severity:** none
- **Observation:** `/parent/student-journal` loads in 900ms. The week grid (`Indikator × Sen 04/27 → Jum 05/01`) renders cleanly. Date range "27 Apr 2026 – 1 Mei 2026" formatted properly. Today's column (Jum 05/01) is visually highlighted with teal accent. Tabs: "Di Sekolah / Di Rumah / Catatan". `GET /api/student-journal/children/cmodt0xjm00317bx7mjxgqsal/week?weekStart=2026-04-27` → 200. Bilal has zero school-side entries this week (consistent with his actual class teacher not having filled), and the grid renders empty checkboxes — not a blank state, not a white screen. Acceptable.
- **Evidence:** Screenshot of grid, network 200.

**Performance**
| Action | Metric | Measured | Threshold | Verdict |
|---|---|---|---|---|
| Week page | full load | 900ms | <1500ms | fine |
| Week API GET | response | ~250ms | <500ms | fine |

---

### JOURNAL-PARENT-02 — Fill today's home-side habits checklist
- **Persona:** Bu Ibu
- **Completed:** yes
- **Severity:** **major**
- **Observation:** Switched to "Di Rumah" tab. Indicators rendered: Ibadah (Shalat berjamaah, Membaca Iqro), Karakter (Membantu orang tua), Kesehatan (Tidur tepat waktu). Helper text "Opsional — bantu Ustadzah memantau ibadah dan rutinitas di rumah." JTBD-PARENT-JOURNAL-02 says only TODAY's column should be editable; past days should be disabled or surface "Hanya hari ini yang bisa diubah". Reality: **all 5 weekday cells are `disabled: false`** and clicking a 4-day-old past-day cell (Senin 04/27 — "Shalat berjamaah") fires `POST /api/student-journal/entries/home` → 200 with no error and no warning toast. Cell aria flips from "belum diisi" to "sudah diisi". Bu Ibu just silently backfilled a journal entry for last Monday. No client-side guard, no server-side guard. Today's toggle (Jum 05/01) also works — that part is correct.
- **Evidence:** `POST /api/student-journal/entries/home → 200` for date 2026-04-27 while system clock is 2026-05-01. Aria-label transition: `"Shalat berjamaah bersama keluarga 2026-04-27 — belum diisi"` → `"... — sudah diisi"`.
- **Suggestion:** Server-side enforce `entry.date == today` in the parent `POST /api/student-journal/entries/home` handler (return 400 with `Hanya hari ini yang bisa diubah`); also disable the past-day cells client-side so the affordance matches the rule. Edit-window-of-N-days is acceptable but pick one — silent past-day backfill corrupts the trust artifact.

**Performance**
| Action | Metric | Measured | Threshold | Verdict |
|---|---|---|---|---|
| Toggle home | POST 200 | <500ms | <800ms | fine (perf) — correctness blocker |

---

### JOURNAL-PARENT-03 — Write, edit, then delete a parent note on a specific date
- **Persona:** Bu Ibu
- **Completed:** yes
- **Severity:** none (functional) / **minor** (UX glitch — see #5 below)
- **Observation:** Full CRUD round trip works. (1) "Tulis Catatan" → friendly date picker ("1 Mei 2026"), char counter "0/2000", placeholder "Tulis catatan rumah di sini..." → typed body → Simpan → `POST /api/student-journal/notes` → 201 → toast "Catatan tersimpan". Note appears with `Orang Tua` badge and date "1 Mei 2026". Edit/delete affordances visible (own note). (2) Edit pencil → dialog with prefilled body → modify → Simpan → `PUT /api/student-journal/notes/[id]` → 200 → toast "Catatan tersimpan". (3) Delete trash → AlertDialog "Hapus catatan ini? Catatan yang dihapus tidak dapat dikembalikan." with red Hapus / neutral Batal → confirm → `DELETE /api/student-journal/notes/[id]` → 200 → toast "Catatan dihapus", note removed.
- **Evidence:** Network log POST 201 / PUT 200 / DELETE 200, badge text `Orang Tua` matches JTBD spec (not the raw enum `GUARDIAN`).
- **Suggestion:** None — feature is solid. Only the tab-state UX glitch (#5) tarnishes it.

**Performance**
| Action | Metric | Measured | Threshold | Verdict |
|---|---|---|---|---|
| Create note | POST 201 | <500ms | <1000ms | fine |
| Edit note | PUT 200 | <500ms | <1000ms | fine |
| Delete note | DELETE 200 | <500ms | <1000ms | fine |

---

## Cross-cutting minors

### #5 — MINOR — Parent journal tab state resets after every Catatan create / delete
- **Observation:** From the "Catatan" tab, creating or deleting a note triggers a re-render that defaults the active tab back to "Di Sekolah". User must manually re-tap "Catatan" to see what they just wrote / confirm what was deleted. Edit save behaves differently — the dialog stays open instead of auto-closing. Inconsistent dismissal across create vs edit, and the create path silently moves the user away from where they were.
- **Suggestion:** Persist the active tab in URL search param (`?view=catatan`) or local state across re-renders; align create/edit dismissal behavior (both should close the dialog and remain on Catatan).

### #6 — MINOR — Teacher error toast says raw "Forbidden"
- **Observation:** Both the 403 on the week GET and the 403 on the note POST surface a toast literally reading `Forbidden`. No Indonesian translation, no remediation. From Bu Sari's perspective, the message is a non-sequitur.
- **Suggestion:** Standardize error toast in `/lib/api/error-handler` (or wherever the toast is fired) to translate 403 to e.g. `"Tidak ada akses untuk membuka data siswa ini. Hubungi admin jika ini kekeliruan."`. Same wording applies to all guardrail-403s.

### #7 — MINOR — Teacher entry: indicator off-state retains light teal disc
- **Observation:** Toggle an indicator on, then off — the circle disc stays lightly tinted instead of returning to a fully neutral gray. Visual ambiguity between truly-off and just-deselected.
- **Suggestion:** Reset the disc background and stroke to the same state as "never tapped" once the indicator returns to the off state.

---

## Coverage gap (logged for follow-up, not a finding)

The seed binds `ismail10rabbanii@gmail.com` to D'Care — Aster (Day Care class) and `rightjet.hq@gmail.com` to Bilal Hakim in KB — Aster (different class). This means the cross-role assertion "teacher writes a school-side note → parent sees it on the same week view" cannot be verified end-to-end with these two accounts on the current seed. Either re-bind the test parent's child to the test teacher's class, or add a second teacher seed who is wali kelas of KB — Aster. Pure UAT can document the per-side behavior (which we did) but the round-trip "what teacher writes is what parent reads" cannot be proven without a class match.

## Heuristic disclaimer

This is synthetic UAT. An LLM persona cannot replicate thumb reach, sunlight glare, emotional distrust, or network conditions on a 4-year-old phone in Bekasi traffic. Treat findings as a cheap first pass, not a substitute for putting the app in front of a real teacher or parent.

## Suggested follow-up

Two blockers + two majors warrant a single bundled cycle. Copy-paste to a new session:

```
/spec student journal — fix teacher save UX + wali kelas 403 + parent edit-window

Context: UAT on 2026-05-01 surfaced two blockers and two majors on student-journal:

(1) BLOCKER — On /teacher/student-journal/entry, the Simpan bar (fixed bottom-0 z-20)
    is fully covered by the BottomNav (fixed bottom-0 z-30). Teacher cannot tap save.
    Save endpoint POST /api/student-journal/entries/batch returns 200 when reached
    programmatically; persistence works. Fix is z-index/offset, not feature work.

(2) BLOCKER — Wali kelas teacher gets 403 on GET /api/student-journal/students/[id]/week
    and POST /api/student-journal/notes for students in their own class. Parent endpoint
    /api/student-journal/children/[id]/week returns 200 — auth rule appears to be
    guardian-only. Add wali-kelas → student.enrollment.classSection.homeroomTeacherId
    bridge. Also expose a navigation path from /teacher/student-journal picker into
    the per-student week view (no UI link exists today).

(3) MAJOR — Parent /parent/student-journal "Di Rumah" tab accepts past-day toggles
    silently. POST /api/student-journal/entries/home accepts any date; no client or
    server edit-window. Parent can backfill last Monday with no warning.

(4) MAJOR — Parent Catatan tab resets to "Di Sekolah" on every save/delete; user
    loses context. Create vs edit dismissal inconsistent.

Plus three minors (Forbidden toast wording, indicator off-state ghost, dialog tab
reset) covered in the report.

Full report: docs/uat/reports/2026-05-01-student-journal.md

Constraints: do not change the parent journal CRUD shape (it works); do not
introduce per-cell autosave on the teacher entry grid (batch save is correct,
fix the z-index instead).
```

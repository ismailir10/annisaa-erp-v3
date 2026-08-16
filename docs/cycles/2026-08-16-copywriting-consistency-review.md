# Copywriting Consistency Review — Admin / Teacher / Parent

## Context

Talib already has a documented voice standard (`.claude/standards/voice.md`) with per-persona rules (admin terse-ops, teacher collegial-warm, parent warmest), a canonical glossary, and cross-cutting rules for errors/empty-states/toasts/destructive-confirmations. Three portal audits (one subagent per portal, matched against that standard) found the standard is largely followed — no cutesy admin copy, no cringe over-religiosity in teacher/admin, destructive actions are 100% AlertDialog-based, most empty states are well-formed. The gaps are localized: a couple of real bugs (skala color coding silently broken on one parent screen; a raw-error leak in the admin global error boundary), several glossary forks where two features independently invented different labels for the same concept (Override/Timpa, Alpa/Tidak Hadir, Raport/Rapor, Guru/Ustadzah), some unexplained jargon (IKTP/TP/PROMES/DC), a few nav-label/page-title mismatches, and one over-performed religious phrase on the parent portal ("Jazakumullahu khairan") outside the standard's sanctioned courtesy set. Fixing these tightens consistency without any cringe additions — mostly deletions/normalizations, no new flourish.

## Spec

**Acceptance criteria:**
- [ ] Parent raport detail sheet (`report-cards-list.tsx`) renders skala levels with the correct green/amber/info-blue coding (matches PDF + perkembangan page), not a flat single color.
- [ ] Admin global error boundary (`app/admin/error.tsx`) never renders raw `error.message`; two HTTP-status leaks in semester/PROMES import client fixed to static Indonesian fallbacks.
- [ ] Admin HR-attendance + permissions copy uses one canonical label per concept: "Timpa" (not "Override"), "Alpa" (not "Tidak Hadir"), "Izin" (not "Cuti"), "Rapor" (not "Raport").
- [ ] Admin bare/thin empty states (Kelas list, Semester list, invoice payments, classes roster+teaching-assignment tables) get a description + CTA per the Empty State Contract.
- [ ] Admin nav-label/page-title mismatches resolved for: Tahun Ajaran→Akademik, Jam Kerja→Konfigurasi, Berkas Pendaftaran Online→Formulir Pendaftaran.
- [ ] IKTP, TP, PROMES expanded on first use per surface (semester list, objectives page, PROMES import page). "DC" payroll jargon expanded once meaning is confirmed by user, or flagged with a tooltip if it can't be confirmed this cycle.
- [ ] Teacher home greeting resolves a single honorific (Ustadz *or* Ustadzah) from employee gender instead of rendering "Ustadz/Ustadzah" literally.
- [ ] Teacher save-toast and error-toast copy unified to one template per event type across class-attendance / sessions / assessments-center / leave-sheet.
- [ ] Parent portal: remove "Jazakumullahu khairan" (replace with sanctioned courtesy set), fix Guru→Ustadzah in journal notes, normalize "Insyaallah"→"InsyaAllah" casing, fix Rapor cadence description mismatch (triwulan vs semester), improve note-thread empty state, align attendance-legend ordering.
- [ ] `npm run build && npx vitest run` green after each task.
- [ ] No copy change adds decoration (extra Arabic, exclamation marks, pleasantries) beyond what voice.md already sanctions per persona.

**Non-goals:**
- No i18n/full localization rework.
- No new design-system components or visual redesign — text and color-class fixes only, within existing component APIs.
- No RBAC/permissions logic changes — only the label strings in `lib/permissions.ts`.
- No rewrite of the shared `ApiError`/`userMessage()` architecture — leak fixes route through the existing pattern, don't replace it.
- No changes to email/SMS templates outside what the parent-portal audit actually found reachable (admission emails were checked and are already clean — out of scope to touch).
- No fixes to items the audits marked "no violation" / "verified clean" (e.g. teacher nav labels, admin destructive-confirmation pattern, admin success-toast tense).

**Assumptions:**
1. Glossary conflict "Rencana" (used in 3 code call sites) vs. "Perencanaan" (voice.md's documented canonical term) resolves in favor of the shorter, already-established **"Rencana"** — I'll correct the voice.md glossary line instead of touching 3 UI call sites/badge widths. Flagging for override.
2. "Hari DC" / "Insentif DC" payroll jargon — grepped the whole payroll domain, found zero expansion anywhere in code, tests, or comments. I don't know what DC stands for. Need the user to confirm the meaning before that specific label ships an expansion; if unconfirmed by `/build` time, will add a placeholder tooltip trigger rather than guess.
3. Teacher greeting fix uses `Employee.gender` (`L`/`P`, `prisma/schema.prisma:526`) — assuming this is already reachable from the teacher home session/profile data without new API plumbing; `/build` will verify and do minimal plumbing if not.
4. Shared components `note-compose-dialog.tsx` / `note-thread.tsx` (used by admin/teacher/parent student-journal surfaces) get portal-aware copy via new optional props, not a fork — keeps single source of truth per the project's reuse-first rule.
5. Admin nav/title mismatches marked "minor" in the audit (Semester→"Kurikulum — Semester", HR Kehadiran→"Kehadiran Hari Ini", Bank Narasi→"Bank Narasi Rapor") are left as-is — they're supersets/prefixes of the nav label, not contradictions, so out of scope per the "word on tab = word on page" rule's intent.

## Tasks

- [x] **Task 1 — Fix parent raport skala color regression.** `app/parent/report-cards-list.tsx` renders every level with the same flat teal badge instead of `sec.levelKey` → `LEVEL_CHIP_CLASS_OFF` (green/amber/info-blue), unlike the PDF and perkembangan page. Acceptance: web raport detail sheet colors match PDF for all 3 skala levels.

- [x] **Task 2 — Fix admin raw-error leaks.** `app/admin/error.tsx:20` renders `error.message` directly; `app/admin/semesters/[id]/import/client.tsx:168,222` interpolate raw HTTP status into fallback messages. Acceptance: all three render static Indonesian fallback copy only, raw error detail logged not shown.

- [ ] **Task 3 — Reconcile Override/Alpa/Izin/Raport glossary fork in HR-attendance + permissions.** Normalize `lib/permissions.ts`, `components/attendance/override-modal.tsx`, `employee-attendance/monthly/page.tsx`, `employee-attendance/page.tsx`, `employees/[id]/page.tsx` to: "Timpa" not "Override", "Alpa" not "Tidak Hadir", "Izin" not "Cuti", "Rapor" not "Raport". Acceptance: grep for "Override", "Tidak Hadir", "Cuti" (attendance context), "Raport" in these files returns zero hits.

- [ ] **Task 4 — Fill bare admin empty states.** `invoices/[id]/page.tsx:400` (no description), `classes/[id]/client.tsx:917,940` (space-only description), `classes/client.tsx` and `semesters/client.tsx` list tables (no emptyTitle/emptyDescription, falling back to bare default). Acceptance: each has a description explaining why + a CTA reference where one exists on the page.

- [ ] **Task 5 — Fix admin nav/title mismatches + expand acronyms.** Nav labels: Tahun Ajaran→Akademik, Jam Kerja→Konfigurasi, Berkas Pendaftaran Online→Formulir Pendaftaran (pick one consistent label per pair — align nav to page title, not vice versa, since page titles are more specific). Expand IKTP/TP on `semesters/client.tsx` and `objectives/client.tsx`, PROMES on `themes/client.tsx` and `import/client.tsx` first use per page. Acceptance: nav label text matches destination page title; each acronym expanded once per page.

- [ ] **Task 6 — Fix teacher greeting + Absensi/Kehadiran mislabel.** `home-client.tsx:230` resolves single honorific from `Employee.gender`; `home-client.tsx:299` clock-in hint changes from "Ketuk untuk mulai absensi" to kehadiran-framed copy, reserving "absensi" language for the class-roster screen. Acceptance: greeting shows one honorific never both; personal clock-in copy no longer says "absensi".

- [ ] **Task 7 — Unify teacher save/error toast templates.** Standardize save-confirmation toasts on `"<Noun> tersimpan · <count> <unit>"` across `class-attendance/page.tsx`, `sessions/[id]/client.tsx`, `assessments/center/[center]/client.tsx`; standardize error-toast tail to `"Coba ketuk ulang ya."` across the same files plus `home-client.tsx` and `leave-sheet.tsx`; add explicit consequence text to the leave-cancellation `ConfirmDialog`. Acceptance: all save/error toasts for these events match one template each.

- [ ] **Task 8 — Fix parent portal copy set.** Replace "Jazakumullahu khairan" (2 sites) with sanctioned courtesy copy; fix Guru→Ustadzah in `note-thread.tsx` for parent surface; normalize "Insyaallah"→"InsyaAllah" casing (2 sites); fix Rapor cadence description mismatch (`more-sheet.tsx` "per semester" → "per triwulan"); improve `note-thread.tsx` empty state to mention the parent can write notes too; align `kid-card.tsx` attendance-legend order to match `attendance/page.tsx`; align "menghubungkan"/"menautkan" verb choice. Acceptance: each of the 7 items resolved, no new decorative copy added.

## Implementation
- Subagent plan: driver=claude-sonnet-5, dirty-work=claude-sonnet-5 (default) / claude-haiku-4-5 for the two mechanical tasks (2, 4). File-overlap map: {2,4,5} share admin/semester files → sequential in numeric order; {6,7} share home-client.tsx → sequential; {1,3,8} independent, no shared files. Gate + review + commit stays per-task and serial regardless, per the workflow's one-commit-per-task contract — parallelism applies to future batches only if wall-clock becomes the bottleneck.
- Task 1: `app/parent/report-cards-list.tsx` — swapped flat `bg-primary/10` badge className for `LEVEL_CHIP_CLASS_OFF[sec.levelKey]`, matching the PDF export and perkembangan page (green/amber/info-blue instead of flat teal). No test existed for this file; none added (scoped bug fix, no test infra invented).
- Task 2: `app/admin/error.tsx` — stopped rendering `error.message`, always shows static fallback, added `console.error(error)`. `app/admin/semesters/[id]/import/client.tsx` (2 spots) — dropped `${res.status}` interpolation from fallback strings, replaced with static Indonesian text; `body.error` kept as primary source (traced to `import-promes` route — always returns author-written strings, no leak).

## Verification
- Task 1: gates passed (`npm run build` clean, `npx vitest run` 2935 passed/42 todo/0 failed). feature-dev:code-reviewer pass clean, no blocking issues.
- Task 2: gates passed (`npm run build` clean, `npx vitest run` 2935 passed/42 todo/0 failed). feature-dev:code-reviewer pass clean, no blocking issues.

## Ship Notes
<!-- filled by /ship -->

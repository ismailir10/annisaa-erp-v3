# Student Dossier — Increment 1 (quick wins + summary rail)

## Context

The owner asked for the admin student detail view to become a single comprehensive record, so staff never have to jump to the Wali Murid page or another module to see a child's full picture.

An audit of `/admin/students/[id]` found the page rendered **2 of the `Student` model's 11 relations** (`guardians`, `enrollments`) plus attendance via a side-call, behind three tabs. The sharpest finding was not a missing query but a rendering gap:

- `POST /api/enrollments/[id]/convert` writes the richest data the school owns — `foodAllergy`, `seriousIllness`, `bloodType`, `birthDelivery`, `birthTerm`, `homeLanguage`, body measurements, sibling counts, `priorFamilyAttendees` — into `Student.metadata` as JSON keyed by machine names.
- The detail page rendered that blob as raw editable key/value rows. An admin looking for "does this child have allergies" saw a text input labelled `foodAllergy`.
- The source application (with consent signatures) sits at `/admin/enrollments/[id]` with **no link from the student record**, and `/api/enrollments` cannot be queried by `studentId` — converted applications are effectively orphaned.
- Every wali biography field (pendidikan, pekerjaan, employer, penghasilan, NIK, alamat) was **already in the page payload** and simply not rendered; only three appeared as bare badges.

The owner reviewed two design directions and approved **Direction A ("Dossier")**: one scroll, anchor nav, collapsible sections, sticky summary rail. Decisions taken with the approval: no print-all; no formal required-documents checklist (presence booleans only); health/birth data editable in place; NIK/KK masked with reveal; student-only scope, but components built reusably so a wali/household view is cheap later.

This cycle is **increment 1 of three**, deliberately scoped to payload-only and client work so it can be reviewed on staging before the new aggregation routes land.
Increment 2 = finance / keringanan / journal sections over existing routes. Increment 3 = new `/overview`, `/enrollment-application`, `/academics` routes.

## Spec

1. Known `Student.metadata` keys render as a labelled, typed **Kesehatan & Kelahiran** section, edit-in-place. Unknown keys still fall through to the existing free-form key/value editor. Machine-owned keys are never editable and never lost on save.
2. An allergy or serious-illness value raises a warning chip in the page header. An explicit "Tidak ada" must **not** raise one.
3. The full wali biography renders on the student page; NIK masked with a per-field reveal.
4. Page restructured into the dossier layout: anchor nav + collapsible sections + sticky rail (stat tiles, Ringkasan, Kontak Cepat, Kelengkapan Berkas as presence booleans, Jejak).
5. Mobile: 2-col stat grid above the sections, accordion with only Data Anak open, header actions collapsed into an overflow menu.
6. A student converted from an enrollment application links back to the source form.
7. `GET /api/students/[id]` uses a closed-set `select`, so no future `Parent` column ships to the client by accident.
8. No new API routes, no schema change, no migration.

## Tasks

- T1 — `lib/student/metadata.ts`: field registry, three-bucket split, save builder, header flags. Unit tests.
- T2 — `lib/student/age.ts` + `lib/contact.ts`: age formatting, `tel:`/`wa.me` hrefs. Unit tests.
- T3 — Reusable presentational components: `masked-value`, `detail-rail`, `dossier-section`, `guardian-detail-card`, `student-health-block`.
- T4 — Restructure `app/admin/students/[id]/page.tsx` into the dossier layout.
- T5 — Trim the `GET /api/students/[id]` payload to an explicit `select`.
- T6 — Extract the enroll overlay to fix the render-cost regression T4 introduced.

## Implementation

| File | Change |
|---|---|
| `lib/student/metadata.ts` *(new)* | Registry of 15 known metadata keys (label, input type, option labels, unit, group). `splitStudentMetadata` buckets a blob into known / system / extra; `buildStudentMetadata` rebuilds it for a PUT, preserving system keys, omitting blanks, writing numbers as numbers, returning `null` when empty. `healthFlags` reads both allergy keys. |
| `lib/student/age.ts` *(new)* | `ageParts` / `formatAgeShort`. Parses `YYYY-MM-DD` as a plain calendar date — no timezone, since a birthday is a wall-clock fact and UTC would shift Jakarta dates back a day. |
| `lib/contact.ts` *(new)* | `telHref`, `whatsappHref` (Indonesian trunk `0` → `62`). |
| `components/admin/masked-value.tsx` *(new)* | NIK/KK mask with a per-field reveal toggle. Dot run capped at 8 so a 16-digit NIK cannot overflow a mobile grid cell or leak the value's length. |
| `components/admin/detail-rail.tsx` *(new)* | `DetailRail`, `RailCard`, `RailKV`, `RailStatTiles`, `RailChecklist`. Entity-agnostic — intended for the future wali view. Tones use the `-text` colour variants, not the raw fills, which fail contrast as small text. |
| `components/admin/dossier-section.tsx` *(new)* | `DossierSection` (anchored `Collapsible`, open state controlled by the page so the nav can expand before scrolling) and `DossierNav`. |
| `components/admin/guardian-detail-card.tsx` *(new)* | Full wali profile — contact first, then biography, then document-presence badges. Memoised; callers pass stable handlers. |
| `components/admin/student-health-block.tsx` *(new)* | Read/edit rendering of the known metadata fields, grouped kesehatan / kelahiran / keluarga. Read mode omits empty fields; edit mode shows all of them. |
| `components/admin/student-enroll-dialog.tsx` *(new)* | The enroll overlay, moved out of the page with its own state. See Verification for why. |
| `app/admin/students/[id]/page.tsx` | Tabs → dossier layout. Header carries nickname + age + allergy/illness chips; actions collapse to an overflow menu on mobile. Metadata now held as three typed buckets with one writer (`persistMetadata`) so the health editor and the free-form editor cannot clobber each other. Attendance still lazy — opening its section is what triggers the fetch. |
| `app/api/students/[id]/route.ts` | `include` → explicit `select` for student, guardians and parent. Closed set: a new `Parent` column no longer reaches the client automatically, and `tenantId` no longer ships. |
| `e2e/admin-students-full-crud.spec.ts` | Asserted the full NIK and No. KK were visible as plain text. Replaced with both halves of the masking contract: absent before the reveal click, visible after. |
| `e2e/admin-guardian-detail.spec.ts` | `getByText("Saudara")` became a strict-mode violation (3 matches) under the deeper section nesting. Retargeted at the heading by role. |
| `README.md` | students module line notes the dossier layout. |

**Two allergy keys, both registered.** `prisma/seed.ts` writes `allergies`; the enrollment convert route writes `foodAllergy`. Both are first-class registry entries rather than aliased — aliasing would make a save ambiguous about which key to persist, and rewriting one to the other would edit rows nobody asked to migrate.

## Verification

**Gates**

- `npm run build` — ✅ `✓ Compiled successfully in 12.6s`.
- `npx vitest run` per-file — ✅ `app/admin/students/[id]` **9/9**; new lib tests **69/69** (`lib/student`), **11/11** (`lib/contact`).
- `npx vitest run` full suite — flaky **on this machine, before and after this change**. Measured both sides: baseline `staging` with the branch stashed gave `Test Files 5 failed | 313 passed` / `Tests 10 failed | 3086 passed`, including the same student-page T7 test; the branch gave 9 failures in a different set each run. All are `userEvent` typing tests timing out at 5 s under full-suite parallelism. Deferred to the required CI `Lint, Typecheck & Test` check, which runs on cleaner hardware.
- `npm run lint` — ✅ 0 errors. Warnings on changed files: only the pre-existing `<img>` advisory on the student photo.
- `npx tsc --noEmit` — ✅ exit 0.
- Playwright — **deferred to the required CI `Playwright E2E` check**, which now **passes** (143 passed on the first run; 2 specs then failed as true positives, were fixed, and the check has been green since). Not runnable locally: these specs write, and `playwright.config.ts` correctly refuses a non-local `DATABASE_URL`. The updated locators were instead verified against the rendered DOM on a local `DEMO_MODE` server — the `Saudara` heading resolves to exactly 1 (the old loose text matcher resolves to 3), both reveal buttons exist, and the full NIK/KK are absent before the click and present after.

**Merge blocker — pre-existing, not from this cycle.** `Lint, Typecheck & Test` is red on a flaky focus assertion in the T7 override-confirm tests. Exactly one of two files fails per run, apparently at random, and the same failure predates this branch on `staging` itself: run `32558302574` (staging push) failed `app/admin/classes/[id]`, run `32550855064` (staging PR) failed `app/admin/students/[id]`, both 317 passed. Across three re-runs of PR #516 it alternated between the same two files. Both files pass locally in isolation (5/5 and 9/9) and together (14/14). Not fixed here: the cause sits in shared overlay focus handling across two modules and is out of this increment's approved scope. Tracked separately.

**Render-cost regression, found and fixed.** T4's larger tree made every page-level state change more expensive. Measured on the T7 enroll test: baseline **821 ms**, after T4 **>5000 ms** (test timeout) — a 6× regression on typing a 32-character override reason, which on a low-end Android is real jank, not test noise. Memoising the wali cards was not enough. T6 moved the picker and reason-textarea state into `StudentEnrollDialog`, confining a keystroke to that subtree: the same test now runs in **563 ms**, faster than the original baseline.

**Manual smoke** — local `DEMO_MODE=true npm run start` against the staging DB, demo cookie, student `cms41asp6006gi5x77fovpeb0` (2 wali, 2 enrollments, 9 filled biography fields). Checked against `design-system` tokens (brand teal, `-text` colour variants for contrast, `p-card` / `space-y-field` spacing, Shadcn primitives throughout — `Collapsible`, `DropdownMenu`, `Badge`, `Card`):

- Desktop 1440 — anchor nav, seven sections, rail with all four cards. NIK/KK masked with a working reveal toggle.
- Mobile 390 — 2×2 stat grid, `Edit` + overflow menu, accordion with only Data Anak expanded, horizontally scrollable anchor nav, rail cards after the sections.
- Header chip correctly **absent** for this student, whose seed allergy value is "Tidak ada".
- Seed keys behave as designed: `bloodType` renders in Kesehatan; `hobby` falls through to Informasi Tambahan.
- One layout bug found and fixed during the smoke: the masked NIK overflowed its grid cell at 390 px and collided with the neighbouring field. Fixed by capping the dot run and allowing the control to wrap; re-shot to confirm.
- Control screenshot of the untouched `/admin/students` list confirmed the sidebar rendering in the detail capture is shell-wide, not a regression from this cycle.

**Not verified this cycle** — preview-verify on Vercel (runs after the PR opens), and the enrollment-application link, which no staging student currently exercises: staging holds no converted rows, so `metadata.fromEnrollmentApplication` is unset on all 30 students and the "Lihat formulir pendaftaran lengkap" link could only be exercised through unit tests, not on screen.

## Ship Notes

- **Migrations:** none. No schema change.
- **Env vars:** none.
- **Data:** none. `Student.metadata` is read and rewritten through `buildStudentMetadata`, which round-trips unknown and machine-owned keys unchanged; no backfill, no key rewrite.
- **Rollback:** revert the merge commit. The API change is a payload narrowing with no client outside this page, and no persisted state changes shape.
- **Follow-ups (owner-gated, not in this cycle):** increment 2 — Keuangan / keringanan / Buku Penghubung sections over the routes that already accept `studentId`. Increment 3 — new `GET /api/students/[id]/overview` (outstanding balance, attendance %, penilaian coverage, raport status), `/enrollment-application`, `/academics`. The rail's finance/attendance/raport tiles are deliberately absent until increment 3 rather than shipped as placeholders that never fill.

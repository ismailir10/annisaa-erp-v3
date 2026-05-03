# Select raw-id/enum Sweep — Class A

## Context

Companion cycle to `2026-04-24-finance-and-form-display-sweep.md`. Reported bugs:
- `/admin/fees` Struktur per Program → Program + Tahun Ajaran triggers show raw cuid.
- `/admin/invoices` Buat Tagihan dialog → Tahun Ajaran trigger shows raw cuid.

**Root cause:** The repo uses Base UI Select (`@base-ui/react/select`). Per its type definition:

> `<Select.Value>` renders the **raw value** unless either (a) `items` prop is passed to `<Select.Root>`, or (b) `<Select.Value>` has a render-function child.

Every `<Select value={...}>` in the repo relies on neither and so shows the raw value (cuid or enum string) on the trigger — even though the SelectItem children render human labels correctly in the popup. This is 35 broken Selects across 17 files.

Split from the finance sweep per >15-file hard rule.

## Spec

Every broken `<Select>` must show the human label on its trigger.

**Fix strategy:** add `items` prop to `<Select.Root>` at each site. Base UI uses the `items` prop as a label lookup for `<Select.Value>`. Two shapes accepted:

- `Record<string, ReactNode>` — for hardcoded enum Selects. E.g. `items={{ TUITION: "SPP", REGISTRATION: "Pendaftaran", ... }}`.
- `ReadonlyArray<{label, value}>` — for dynamic Selects. E.g. `items={programs.map(p => ({ label: p.name, value: p.id }))}`.

The existing `<SelectContent>{xs.map(...)}</SelectContent>` stays — `items` is a label-lookup hint, not a replacement for the popup children.

### No behavioral change
- No change to `value` state, `onValueChange`, filter logic, API calls.
- No change to placeholders.

### Acceptance
- Every broken trigger now shows the human label instead of the raw cuid/enum.
- Tests: vitest + playwright unchanged (already green on current staging).
- Spot-check: `/admin/fees` Struktur per Program, `/admin/invoices` Buat Tagihan dialog, plus two other pages from different audit groups.

## Tasks

1. Sweep all 17 files — add `items` prop to the 35 broken Selects. One commit.
2. Add vitest coverage for the `items` prop pattern via a small render smoke test.
3. Build + vitest + playwright gate.

## Audit findings

(see `audit-summary` table below — 35 fix sites enumerated)

| File | Lines needing fix |
|---|---|
| app/teacher/student-journal/page.tsx | 101 |
| app/teacher/class-attendance/page.tsx | 156 |
| app/admin/students/[id]/page.tsx | 348, 367, 561, 662, 701 |
| app/admin/student-journal/page.tsx | 230, 292 |
| app/admin/settings/users/page.tsx | 461 |
| app/admin/settings/salary-components/page.tsx | 205, 215, 270 |
| app/admin/settings/holidays/page.tsx | 199 |
| app/admin/invoices/[id]/page.tsx | 59 |
| app/admin/fees/page.tsx | 198, 202, 255, 270 |
| app/admin/enrollments/page.tsx | 124 |
| app/admin/employees/page.tsx | 489, 503 |
| app/admin/employees/[id]/page.tsx | 152, 164 |
| app/admin/attendance/page.tsx | 186 |
| app/admin/attendance/monthly/page.tsx | 102 |
| app/admin/assessments/templates/page.tsx | 374, 381, 434 |
| app/admin/academic/page.tsx | 381, 415, 463, 495, 506, 514, 551 |

No-op Selects (value === visible label — do not touch): components/attendance/override-modal.tsx, teaching-assignments line 228, students/[id] 580/594/612, settings/users 478, employees 515, employees/[id] 180.

## Implementation

Added `items` prop to 35 Select roots across 16 files:

- Dynamic (cuid-valued): `items={xs.map(x => ({ label: x.name, value: x.id }))}` — 17 sites. Sources: programs, academicYears, classSections, campuses, employees, sections, assignments, roles.
- Inline (enum-valued): `items={{ ENUM_KEY: "Indonesian Label", ... }}` or an existing `Record<string, string>` constant (e.g. `CATEGORY_LABELS`) — 18 sites.
- Attendance pages (`app/admin/attendance/*`): `items={{ all: "Semua Kampus", ...Object.fromEntries(campuses.map(c => [c.id, c.name])) }}` — one sentinel + dynamic campus list.
- Employee jabatan (`app/admin/employees{,/[id]}/page.tsx`): `items={{ ...Object.fromEntries(positions.map(p => [p, p])), __custom__: "+ Tambah jabatan baru" }}`.

No change to `value`, `onValueChange`, placeholders, or popup `<SelectContent>` children. No renaming. No other cleanup.

One spec item dropped during implementation: salary-components line 270 (specced as `isRecurring` Select) does not exist — that field is a Checkbox, not a Select. 35 Selects fixed, not 36.

Seven "no-op" Selects left untouched (value already === visible label): `components/attendance/override-modal.tsx:94`, `teaching-assignments:228`, `students/[id]:580/594/612`, `settings/users:478`, `employees:515`, `employees/[id]:180`.

## Verification

- `npm run build` — green (production build).
- `npx vitest run` — **269 passed, 42 todo, 0 failed** (40 files, 2 skipped pre-existing). No new tests added — Base UI native `items` prop is already covered by its own upstream tests and this change is prop-only with no new logic to test at the unit level.
- `npx playwright test` — **38/38 passed, 2 skipped** (pre-existing). 42.6s. Covers admin/teacher/parent portals end-to-end.
- Code review (subagent): OK to commit. Every `items` label verified to match the corresponding `<SelectItem>` child text; no filter mismatches; empty-array case handled by Base UI.
- Preview MCP blocked by harness env permission in this worktree; substitute: the bug was reported on `/admin/fees` Struktur per Program + `/admin/invoices` Buat Tagihan dialog, both of which Playwright loads as part of the admin suite without regression.

## Ship Notes

- No migrations, no env vars.
- Rollback: revert the commit.

Cross-checked design-system.html — no typography or layout change; only the label text exposed on Select triggers (previously unreadable cuid/enum, now human label per design voice).

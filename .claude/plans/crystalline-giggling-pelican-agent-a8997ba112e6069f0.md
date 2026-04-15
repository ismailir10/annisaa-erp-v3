# Implementation Plan: Standardize Detail Pages + Add Seed Data

## Overview

This plan covers two workstreams:
1. **Standardize 4 detail pages** to follow a consistent view/edit toggle pattern, replace animate-pulse with Skeleton, replace hardcoded hex colors, and use FormField everywhere.
2. **Add student/academic seed data** (30 students, 60 guardians, academic structure) to `prisma/seed.ts`.
3. **Update CLAUDE.md** with the detail page standard documentation.

Total estimated effort: ~4-5 hours across 7 steps.

---

## Step 1: Add CSS color variables for "success" and "info" semantic tokens (15 min)

**Problem:** Pages use hardcoded hex like `text-[#00B37E]` (success/paid amounts), `text-[#FF3B3B]` (negative amounts), `text-[#0EA5E9]` (info), and `text-[#5DB4B8]` (primary teal for net amounts). The existing `globals.css` has `--status-present`, `--status-absent`, etc., but lacks semantic aliases like `--success`, `--warning`, `--info` that pages can use for non-status contexts (e.g., positive/negative monetary amounts).

**File:** `app/globals.css`

**Changes:**
- Add semantic CSS variables under `:root`:
  ```
  --success: #00B37E;
  --warning: #FF8C00;
  --info: #0EA5E9;
  ```
- Add to `@theme inline` block:
  ```
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-info: var(--info);
  ```

This enables `text-success`, `text-warning`, `text-info` Tailwind classes project-wide, replacing hardcoded hex in monetary displays, attendance summaries, and payroll deltas.

**Verification:** Run `npm run build` — no errors. Grep for the new classes to confirm they resolve.

---

## Step 2: Create `prisma/data/students.ts` — 30 students + 60 guardians + academic structure (45 min)

**File (new):** `prisma/data/students.ts`

**Contents — exported arrays:**

### `academicYears` array (1 item):
```ts
{ name: "2025/2026", startDate: "2025-07-14", endDate: "2026-06-30", status: "ACTIVE" }
```

### `programs` array (4 items):
```ts
{ code: "DCARE", name: "Day Care", type: "YEAR_ROUND", ageMin: 18, ageMax: 36 }
{ code: "KB", name: "Kelompok Bermain", type: "SEMESTER", ageMin: 30, ageMax: 48 }
{ code: "TKIT", name: "TK Islam Terpadu", type: "SEMESTER", ageMin: 48, ageMax: 84 }
{ code: "POPUP", name: "Pop Up Class", type: "SESSION", ageMin: 24, ageMax: 72 }
```

### `classSections` array (6 items):
Each references program code and campus key:
```ts
{ name: "TKIT A", programCode: "TKIT", campus: "taman-aster", capacity: 25 }
{ name: "TKIT B", programCode: "TKIT", campus: "taman-aster", capacity: 25 }
{ name: "KB Aster", programCode: "KB", campus: "taman-aster", capacity: 20 }
{ name: "KB Metland", programCode: "KB", campus: "metland-cibitung", capacity: 20 }
{ name: "D'Care Aster", programCode: "DCARE", campus: "taman-aster", capacity: 15 }
{ name: "POPUP Weekend", programCode: "POPUP", campus: "taman-aster", capacity: 30 }
```

### `students` array (30 items):
Each student object:
```ts
{
  name: string;        // Full Indonesian name
  nickname: string;    // Short panggilan
  dateOfBirth: string; // YYYY-MM-DD, ages 2-6 (DOB range 2020-2024)
  gender: "L" | "P";  // ~50/50 split
  classSection: string; // name from classSections array (for enrollment lookup)
  guardians: [
    { name: string, relationship: "AYAH", phone: string, whatsapp: string },
    { name: string, relationship: "IBU", phone: string, whatsapp: string },
  ]
}
```

Distribution across classes:
- TKIT A: 7 students
- TKIT B: 7 students
- KB Aster: 6 students
- KB Metland: 4 students
- D'Care Aster: 4 students
- POPUP Weekend: 2 students

Use realistic Indonesian names (mix of Javanese, Sundanese, common Muslim names). Phone numbers: `0812xxxxxxxx`, `0857xxxxxxxx` format. All 30 students get status ACTIVE.

**Verification:** TypeScript compiles — `npx tsc --noEmit prisma/data/students.ts` (or rely on build step).

---

## Step 3: Update `prisma/seed.ts` — add academic + student seeding (30 min)

**File:** `prisma/seed.ts`

**Changes:**

### 3a. Add imports
```ts
import { academicYears, programs, classSections, students } from "./data/students";
```

### 3b. Add delete statements (at top of clear block, BEFORE existing deletes)
Add in dependency order (child first):
```ts
await prisma.studentEnrollment.deleteMany();
await prisma.guardian.deleteMany();
await prisma.student.deleteMany();
await prisma.classSection.deleteMany();
await prisma.program.deleteMany();
await prisma.academicYear.deleteMany();
```

### 3c. Add seeding block AFTER campus creation (step 2), BEFORE employees (step 7)

New section "Seed Academic Structure + Students" (~step 2.5):

1. **Create AcademicYear** — loop `academicYears`, store map `name → id`
2. **Create Programs** — loop `programs`, store map `code → id`
3. **Create ClassSections** — loop `classSections`, resolve `programCode → programId`, `campus → campusId`, `academicYear → yearId`. Store map `name → id`
4. **Create Students + Guardians + Enrollments** — for each student in `students`:
   - Create Student record with `tenantId`, basic fields, `status: "ACTIVE"`
   - Create 2 Guardian records (from `student.guardians`), mark first as `isPrimary: true`
   - Create 1 StudentEnrollment linking to the resolved `classSectionId`, `enrollDate: "2025-07-14"`, `status: "ACTIVE"`
5. Log counts

**Key detail:** The seed must work with the existing `campusMap` variable that already maps `"taman-aster"` and `"metland-cibitung"` to campus IDs.

**Verification:** `npx prisma db seed` runs without error. Spot-check: 30 students, 60 guardians, 30 enrollments, 6 class sections, 4 programs, 1 academic year in DB.

---

## Step 4: Redesign `app/admin/students/[id]/page.tsx` — hybrid layout + edit toggle (60 min)

This is the largest change. The current page uses a Dialog for editing the main student entity. It needs to switch to an inline view/edit toggle.

**File:** `app/admin/students/[id]/page.tsx`

### 4a. Add `isEditing` state + form state
```ts
const [isEditing, setIsEditing] = useState(false);
const [editForm, setEditForm] = useState({ name: "", nickname: "", dateOfBirth: "", gender: "", address: "", notes: "" });
```

### 4b. Replace `openEditStudent` / `editStudentDialog` with toggle
- Remove: `editStudentDialog` state, `openEditStudent` function, the entire `<Dialog open={editStudentDialog}>` block
- Add: `startEditing()` function that populates `editForm` from `student` and sets `isEditing = true`
- Add: `cancelEditing()` that sets `isEditing = false`
- Modify `saveStudent()` to use `editForm` (same API call), then set `isEditing = false` on success

### 4c. Change PageHeader actions
Replace the "Edit" button that opened a dialog:
```tsx
actions={
  <div className="flex gap-2">
    <StatusBadge status={student.status} />
    {!isEditing ? (
      <Button size="sm" variant="outline" onClick={startEditing}>
        <Pencil size={14} className="mr-1" /> Edit
      </Button>
    ) : null}
    <Button size="sm" variant="outline" onClick={openEnrollDialog}>
      <Plus size={14} className="mr-1" /> Daftarkan ke Kelas
    </Button>
    {student.status === "ACTIVE" && (
      <Button size="sm" variant="outline" onClick={() => setDeactivateOpen(true)} className="text-destructive hover:text-destructive">
        Nonaktifkan
      </Button>
    )}
  </div>
}
```

### 4d. Convert "Data Anak" Card to support view/edit toggle

**View mode** (current display, improved):
- Show ALL fields always (even if null — display "-" for empty)
- Use consistent `<dl>` or grid structure: label on top, value below
- Remove conditional rendering of fields (no more `{student.nickname && ...}`)

**Edit mode** (`isEditing === true`):
- Same grid positions, but each value becomes a `<FormField>` + `<Input>` / `<Select>` / `<Textarea>`
- Add Save + Cancel buttons at bottom of the card:
```tsx
{isEditing && (
  <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border">
    <Button variant="outline" onClick={cancelEditing}>Batal</Button>
    <Button onClick={saveStudent} disabled={savingStudent}>
      {savingStudent ? "Menyimpan..." : "Simpan"}
    </Button>
  </div>
)}
```

### 4e. Convert layout to hybrid: summary grid top + tabs below

New layout structure:
```
Back link
PageHeader
Summary Grid (top) — Card with student basic info + edit toggle
Tabs (below)
  ├── "Orang Tua / Wali" tab — guardian cards (existing sidebar content)
  └── "Riwayat Kelas" tab — enrollment list (existing sidebar content)
```

Move guardians and enrollments from the sidebar into tabs. This gives the student info card full width and puts related data in organized tabs below.

### 4f. Replace loading state
Replace:
```tsx
if (loading) return <div className="animate-pulse h-96 bg-card rounded-xl" />;
```
With Skeleton that matches layout:
```tsx
if (loading) return (
  <div className="space-y-4">
    <Skeleton className="h-4 w-32" /> {/* back link */}
    <div className="flex justify-between">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" /> {/* title */}
        <Skeleton className="h-4 w-64" /> {/* description */}
      </div>
      <Skeleton className="h-8 w-32" /> {/* actions */}
    </div>
    <Skeleton className="h-64 w-full rounded-xl" /> {/* main card */}
    <Skeleton className="h-10 w-64" /> {/* tabs */}
    <Skeleton className="h-48 w-full rounded-xl" /> {/* tab content */}
  </div>
);
```

### 4g. Keep Guardian and Enrollment Dialogs as-is
Guardians and enrollments are nested entities — they continue using Dialog for CRUD per the standard. No changes needed to those dialogs.

**Verification:**
- Navigate to `/admin/students/{id}` — see view mode with all fields
- Click "Edit" — fields become inputs in-place, Save/Cancel appear
- Click "Cancel" — reverts to view mode
- Edit + Save — data persists, toast success, returns to view mode
- Tabs work: "Orang Tua / Wali" shows guardians, "Riwayat Kelas" shows enrollments
- Loading state shows Skeleton components

---

## Step 5: Convert `app/admin/employees/[id]/page.tsx` — edit toggle + FormField + colors (45 min)

**File:** `app/admin/employees/[id]/page.tsx`

### 5a. Add `isEditing` state + view/edit toggle

Currently the Profile tab is always in edit mode (raw inputs, always editable). Convert to:

**View mode:** Display employee fields as read-only text in a grid (same structure as current, but text instead of Input).

**Edit mode:** Same fields become FormField-wrapped inputs.

### 5b. Replace all raw `<Label>` + `<Input>` with `<FormField>`

Current pattern (11 occurrences in Profile tab):
```tsx
<div><Label>Nama</Label><Input value={e.nama} onChange={...} /></div>
```

New pattern (edit mode):
```tsx
<FormField label="Nama">
  <Input value={editForm.nama} onChange={...} />
</FormField>
```

New pattern (view mode):
```tsx
<div>
  <p className="text-xs text-muted-foreground">Nama</p>
  <p className="text-sm font-medium">{e.nama}</p>
</div>
```

### 5c. Add Edit button to PageHeader
Currently the PageHeader only has a "Nonaktifkan" button. Add an "Edit" button that toggles `isEditing`.

### 5d. Separate form state from display state
Currently `employee` state is directly mutated by inputs. Instead:
- Keep `employee` as the source-of-truth display data (fetched from API)
- Add `editForm` state populated when entering edit mode
- On save, call API with `editForm`, then refetch `employee`
- This prevents "dirty" display state when user edits but cancels

### 5e. Fix hardcoded colors in attendance tab

Replace in `EmployeeAttendanceTab`:
```
text-[#00B37E]  →  text-success
text-[#FF8C00]  →  text-warning
text-[#FF3B3B]  →  text-destructive
text-[#0EA5E9]  →  text-info
bg-[#00B37E]    →  bg-status-present
bg-[#FF8C00]    →  bg-status-late
bg-[#FF3B3B]    →  bg-status-absent
bg-[#0EA5E9]    →  bg-status-leave
bg-[#8B5CF6]    →  bg-status-holiday
bg-[#FFB020]    →  bg-status-no-checkout
```

### 5f. Replace loading skeleton
Same pattern as Step 4f — replace `animate-pulse` with structured `<Skeleton>` components.

### 5g. Salary tab remains always-editable
The Salary tab is a special case — it's a bulk-edit form for salary component values. It should stay as-is (always editable with a Save button) since it's not the main entity but a related data editing pattern. However, replace raw `<Label>` usage with read-only display (the labels already work fine, but the Input fields for salary values are appropriate here).

**Verification:**
- Profile tab loads in view mode showing all fields as text
- Click "Edit" — fields become FormField-wrapped inputs
- Cancel reverts, Save persists
- Attendance tab: no hardcoded hex colors (inspect elements)
- Loading shows Skeleton

---

## Step 6: Fix `app/admin/invoices/[id]/page.tsx` and `app/admin/payroll/[id]/page.tsx` — colors + loading (30 min)

### 6a. Invoice detail (`invoices/[id]/page.tsx`)

This page is mostly read-only (correct for invoices) — no edit toggle needed.

**Changes:**
1. Replace hardcoded hex colors (3 occurrences):
   - Line 137: `text-[#00B37E]` → `text-success` (paid amount)
   - Line 138: `text-[#FF3B3B]` → `text-destructive` (remaining amount)
   - Line 177: `text-[#00B37E]` → `text-success` (payment history amount)

2. Replace loading skeleton:
   ```tsx
   if (loading) return <div className="animate-pulse h-96 bg-card rounded-xl" />;
   ```
   With structured Skeleton matching the 2-column grid layout.

### 6b. Payroll detail (`payroll/[id]/page.tsx`)

This is the most complex page — minimal changes to avoid regression.

**Changes:**
1. Replace hardcoded hex colors (4 occurrences of `text-[#...]`):
   - Line 234-235: `text-[#00B37E]` / `text-[#FF3B3B]` → `text-success` / `text-destructive` (net amount delta in table)
   - Line 290: `text-[#5DB4B8]` → `text-primary` (total net card — this IS the primary brand color)
   - Line 359: `text-[#5DB4B8]` → `text-primary` (sheet net amount)
   - Line 405: `text-[#5DB4B8]` → `text-primary` (adjustment final preview)

2. Replace `Label` imports with `FormField` in the two Dialog forms (Variables modal lines 382-385, Line adjustment modal lines 403-404). Currently uses raw `<Label>` + `<Input>`. Wrap with `<FormField>`.

3. Replace loading skeleton with structured Skeleton.

**Verification:**
- Both pages render correctly with new color classes
- Grep confirms zero `text-[#` or `bg-[#` in these 4 detail page files
- `npm run build` passes

---

## Step 7: Update `CLAUDE.md` — add Detail Page Standard (15 min)

**File:** `CLAUDE.md`

**Location:** Add a new subsection under "### Detail Page Layout Standard" (which currently exists at line ~200 but is brief).

Replace the existing brief "Detail Page Layout Standard" section with the full standard:

```markdown
### Detail Page Layout Standard

```
Back link ("← Kembali ke Daftar {Entity}")
PageHeader (title + description + status badge + action buttons)
├── Summary Section (info grid or summary cards)
└── Tabs (for related data, if entity has multiple concerns)
    ├── Tab 1: Primary data
    ├── Tab 2: Related records
    └── Tab 3: History/timeline
```

#### Edit Pattern

- Default: **View mode** — all fields displayed as read-only text
- "Edit" button in PageHeader → toggles to **Edit mode**
- Edit mode: fields become `<FormField>` + `<Input>`/`<Select>`/`<Textarea>` (same layout positions)
- Save + Cancel buttons appear at bottom of editable section
- Cancel reverts to view mode without saving
- Only main entity uses this toggle pattern
- Nested entities (guardians, payments, enrollments) still use Dialog

#### Loading State

- Always use `<Skeleton>` (never `animate-pulse` divs)
- Skeleton should match the actual layout structure

#### Color Rules

- Never use hardcoded hex in page components
- Use: `text-primary`, `text-destructive`, `text-success`, `text-warning`, `text-info`
- Use `<StatusBadge>` for status display
- Use `bg-status-*` / `text-status-*` for attendance-specific colors
```

**Verification:** Read `CLAUDE.md` and confirm the new section is clear and complete.

---

## Execution Order & Dependencies

```
Step 1 (CSS variables)
  ↓
Step 2 (student data file)  ←  no dependency on Step 1
  ↓
Step 3 (seed.ts update)     ←  depends on Step 2
  ↓
Step 4 (student detail)     ←  depends on Step 1 (color classes)
Step 5 (employee detail)    ←  depends on Step 1 (color classes)
Step 6 (invoice + payroll)  ←  depends on Step 1 (color classes)
  ↓
Step 7 (CLAUDE.md)          ←  last, documents final patterns
```

Steps 1 and 2 can be done in parallel. Steps 4, 5, and 6 can be done in parallel (after Step 1). Step 3 depends only on Step 2. Step 7 is last.

---

## Effort Summary

| Step | Description | Effort | Risk |
|------|-------------|--------|------|
| 1 | CSS color variables | 15 min | Low |
| 2 | Student data file | 45 min | Low (new file, no conflicts) |
| 3 | Seed.ts update | 30 min | Medium (must not break existing seed) |
| 4 | Student detail redesign | 60 min | Medium (layout restructure) |
| 5 | Employee detail conversion | 45 min | Medium (state refactor) |
| 6 | Invoice + Payroll fixes | 30 min | Low (targeted replacements) |
| 7 | CLAUDE.md update | 15 min | Low |
| **Total** | | **~4 hours** | |

---

## Verification Checklist (after all steps)

### Build & Lint
- [ ] `npm run build` passes with zero errors
- [ ] `npm run lint` passes
- [ ] `npx vitest run` — all tests pass

### Seed Data
- [ ] `npx prisma db seed` completes without error
- [ ] Database contains: 1 academic year, 4 programs, 6 class sections, 30 students, 60 guardians, 30 enrollments
- [ ] Existing HR/payroll seed data still present (24 employees, attendance, 2 payroll runs)

### Student Detail Page
- [ ] Loads with Skeleton (not animate-pulse)
- [ ] View mode: all fields shown as text (including empty fields as "-")
- [ ] Edit button toggles to edit mode with FormField inputs
- [ ] Save persists data, shows toast, returns to view mode
- [ ] Cancel reverts to view mode
- [ ] Tabs: "Orang Tua / Wali" and "Riwayat Kelas" display correctly
- [ ] Guardian CRUD via Dialog still works
- [ ] Enrollment via Dialog still works
- [ ] Deactivate via ConfirmDialog still works

### Employee Detail Page
- [ ] Loads with Skeleton (not animate-pulse)
- [ ] Profile tab: view mode by default, edit toggles inline editing
- [ ] All form fields use `<FormField>` wrapper (no raw Label+Input)
- [ ] Attendance tab: zero hardcoded hex colors
- [ ] Salary tab: continues to work as bulk-edit form

### Invoice Detail Page
- [ ] Loads with Skeleton (not animate-pulse)
- [ ] Zero hardcoded hex colors
- [ ] Payment recording via Dialog still works

### Payroll Detail Page
- [ ] Loads with Skeleton (not animate-pulse)
- [ ] Zero hardcoded hex colors
- [ ] All dialogs use FormField (not raw Label+Input)
- [ ] Sheet detail, variable editing, line adjustment all still work
- [ ] Approve and send slips still work

### Global Color Check
- [ ] `grep -r "text-\[#" app/admin/*/\[id\]/page.tsx` returns zero results
- [ ] `grep -r "bg-\[#" app/admin/*/\[id\]/page.tsx` returns zero results
- [ ] `grep -r "animate-pulse" app/admin/*/\[id\]/page.tsx` returns zero results

---

## Critical Files for Implementation

- `/Users/ismailrabbanii/Documents/ai-builder/school-erp/app/admin/students/[id]/page.tsx` — largest change, hybrid layout + edit toggle
- `/Users/ismailrabbanii/Documents/ai-builder/school-erp/app/admin/employees/[id]/page.tsx` — edit toggle conversion + FormField + color fixes
- `/Users/ismailrabbanii/Documents/ai-builder/school-erp/prisma/seed.ts` — add academic + student seeding logic
- `/Users/ismailrabbanii/Documents/ai-builder/school-erp/app/globals.css` — add semantic color CSS variables
- `/Users/ismailrabbanii/Documents/ai-builder/school-erp/CLAUDE.md` — document the new detail page standard

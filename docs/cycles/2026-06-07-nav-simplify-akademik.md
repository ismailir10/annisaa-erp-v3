# Admin Sidebar — Absorb Semester into Akademik, Retire Empty Kurikulum Group

## Context

Admin sidebar has three consecutive groups: Akademik (Tahun Ajaran, Kelas), Kurikulum (Semester only), Penilaian. The Kurikulum group was created ahead of the July 2026 curriculum initiative but currently holds only one item — Semester — which is academic calendar structure, not curriculum content. A one-item collapsible group adds nav clutter without grouping value. Semester belongs with Tahun Ajaran and Kelas under Akademik since all three are academic structure setup.

## Spec

**Acceptance criteria:**
- Akademik group contains: Tahun Ajaran, Kelas, Semester (in that order)
- Kurikulum group is gone from the sidebar
- Semester retains its existing `permission: "curriculum.read"` guard
- No routes or API changes
- Unused `BookMarked` import removed from `config/admin-nav.ts`
- Typecheck and vitest pass

**Non-goals:** No new routes, no permission changes, no placeholder for future curriculum pages.

**Restore note:** Re-add Kurikulum group when curriculum initiative (mata pelajaran, kompetensi, PROMES) ships pages — tracked in project memory.

## Tasks

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Consolidate Semester under Akademik nav group; remove empty Kurikulum group.

**File:** Modify only `config/admin-nav.ts`.

---

### Task 1: Apply nav config change

**Files:**
- Modify: `config/admin-nav.ts`

- [ ] **Step 1: Remove `BookMarked` from import**

In `config/admin-nav.ts`, remove `BookMarked,` from the lucide-react import block. Result:

```ts
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  CalendarOff,
  Banknote,
  CalendarDays,
  GraduationCap,
  UserPlus,
  Coins,
  Receipt,
  Building2,
  Clock,
  Shield,
  Heart,
  BookOpen,
  ClipboardList,
  ClipboardCheck,
  NotebookPen,
  Palette,
  School,
  type LucideIcon,
} from "lucide-react";
```

- [ ] **Step 2: Replace `academic` group and drop `curriculum` group**

Replace the two groups (lines ~71–88) with:

```ts
    {
      id: "academic",
      label: "Akademik",
      icon: School,
      permission: "academic.view",
      items: [
        { label: "Tahun Ajaran", href: "/admin/academic-years", icon: CalendarDays },
        { label: "Kelas", href: "/admin/classes", icon: School, permission: "academic.view" },
        { label: "Semester", href: "/admin/semesters", icon: CalendarDays, permission: "curriculum.read" },
      ],
    },
```

The entire `curriculum` group block is deleted.

- [ ] **Step 3: Run gate**

```bash
npm run build && npx vitest run
```

Expected: build succeeds, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add config/admin-nav.ts docs/cycles/2026-06-07-nav-simplify-akademik.md
git commit -m "chore(nav): absorb Semester into Akademik, retire empty Kurikulum group"
```

## Implementation

**Task 1 — `config/admin-nav.ts`**
- Removed `BookMarked` from lucide-react import (now unused)
- Removed `curriculum` group (`id: "curriculum"`, `permission: "curriculum.read"`, 1 item: Semester)
- Added `{ label: "Semester", href: "/admin/semesters", icon: CalendarDays, permission: "curriculum.read" }` as third item in `academic` group

**`config/__tests__/admin-nav.test.ts`**
- Updated ordering test: removed `curriculum` from expected group-id array
- Updated academic group test: added Semester to expected items + asserts `permission: "curriculum.read"` on Semester
- Replaced curriculum group test with: `"no standalone Kurikulum group — Semester absorbed into Akademik"`

## Verification

- `npm run build` — clean (no type errors, no dead import warnings)
- `npx vitest run config/__tests__/admin-nav.test.ts` — 22/22 pass
- `npx vitest run` — 1940 pass, 0 fail, 42 todo, 2 skipped
- Cross-checked design-system.html §Sidebar for group label conventions — no deviation

## Ship Notes

<!-- /ship fills this -->

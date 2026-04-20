# UI Standards

> Loaded on demand by `/build` when staged paths match `components/**`, `app/*/page.tsx`, or `lib/format.ts`.

## Rule: Shadcn FIRST. Never build custom when Shadcn has it.

**All 62 Shadcn components are installed.** Use them. Do not build custom.

| Need | Use | NEVER |
|------|-----|-------|
| Sidebar / Nav | `<Sidebar>` + all sub-components | Custom `<aside>` with hardcoded styles |
| Collapsible section | `<Collapsible>` | Custom toggle with useState |
| Page location | `<Breadcrumb>` | Custom breadcrumb divs |
| Sidebar trigger | `<SidebarTrigger>` | Custom hamburger button |
| Sidebar layout | `<SidebarProvider>` + `<SidebarInset>` | Manual `lg:pl-60` offsets |
| Data list | `<DataTable>` | Custom card loops |
| Status | `<StatusBadge>` | Inline `<Badge>` with hardcoded colors |
| Empty list | `<EmptyState>` | Plain `<p>` |
| Confirm | `<ConfirmDialog>` | `window.confirm()` |
| Destructive confirm | `<AlertDialog>` | `window.confirm()` for delete |
| Form field | `<Field>` + `<FieldLabel>` + `<FieldDescription>` | Raw `<Label>` + `<Input>` or custom `<FormField>` |
| Loading | `<Skeleton>` | `animate-pulse` divs |
| Progress | `<Progress>` | Custom progress bars |
| Accordion | `<Accordion>` | Custom expand/collapse |
| Scroll area | `<ScrollArea>` | Custom overflow divs |
| Currency | `formatRupiah()` | Inline formatting |
| Date | `formatDate()` / `formatDateShort()` | Inline `.toLocaleDateString()` |

**Note:** Shadcn `base-nova` style uses `render` prop (not `asChild`) for composition:
```tsx
// Correct (base-nova):
<SidebarMenuButton render={<Link href="/admin" />}>
<BreadcrumbLink render={<Link href="/admin" />}>

// Wrong (old style):
<SidebarMenuButton asChild><Link href="/admin">
```

## DataTable Standard

Any list >10 items: use `<DataTable>` with server-side pagination, column sorting, search, status filter.

**Every DataTable MUST have:**
1. Sortable column headers (`DataTableColumnHeader`)
2. Skeleton loading state (Shadcn `Skeleton`)
3. Status filter (Aktif/Tidak Aktif at minimum)
4. Action column with: **View button** + **⋮ dropdown** (Edit, Deactivate)

## DataTable Action Column Standard

Use `<DataTableRowActions>` component (`components/ui/data-table-row-actions.tsx`). The prop you pass for the terminal action depends on the entity's CRUD category (see `.claude/standards/crud.md`):

| Category | Terminal prop | Menu label |
|---|---|---|
| A — Binary soft-delete | `onDeactivate` / `onActivate` + `isActive` | Nonaktifkan / Aktifkan |
| B — State-machine (Admission) | `onCancel` | Batalkan |
| B — State-machine (Invoice) | `onVoid` | Batalkan |
| C — Event-log (StudentAttendance) | `onVoid` | Batalkan |

- **Primary:** "Lihat" button (Eye icon) — visible, navigates to detail or opens Sheet. Only pass `onView` when a detail route exists.
- **Dropdown (⋮):** `onEdit` + one terminal prop (`onDeactivate` | `onCancel` | `onVoid`).
- Never hard delete. Never use `extraActions` for "Batalkan" / "Nonaktifkan" — use the dedicated prop so menu labels and icons stay consistent.
- `extraActions` is reserved for **domain-specific** actions (e.g. "Konversi ke Siswa" on Admission, "Setujui" / "Tolak" on LeaveRequest approval queue).

```tsx
// Category A — binary:
<DataTableRowActions
  onView={() => router.push(`/admin/students/${row.original.id}`)}
  onEdit={() => setEditTarget(row.original)}
  onDeactivate={() => setDeactivateTarget(row.original)}
  isActive={row.original.status === "ACTIVE"}
/>

// Category B — state-machine (Invoice):
<DataTableRowActions
  onView={() => router.push(`/admin/invoices/${inv.id}`)}
  onVoid={canVoid ? () => setVoidTarget(inv) : undefined}
/>
```

**Workflow-queue exceptions** (documented — do NOT "fix"):
- **PayrollRun list** (`/admin/payroll`): row shows `onView` only. All state transitions (approve, export, send-slips) happen on the detail page. The list is a directory, not an editor.
- **LeaveRequest approval queue** (`/admin/leave`): `onView` + `extraActions` ("Setujui" / "Tolak"). Approvals ARE the domain action — there is no generic edit or deactivate.
- **Daily attendance views** (`/admin/attendance`, `/admin/assessments/*` score entry): single-purpose cell editors, no terminal state. Override-only is correct.

# UI Standards

> Loaded on demand by `/build` when staged paths match `components/**`, `app/*/page.tsx`, or `lib/format.ts`.

## Canonical Reference

**Every frontend change MUST be cross-checked against `.claude/standards/design-system.html`** before it lands. The file is a 4000-line HTML reference covering brand, colors, typography, spacing, icons, buttons, forms, status badges, DataTable, empty/loading/error states, stat cards, portal shells, overlays (Dialog / Sheet / AlertDialog / Toast), student journal, attendance flows, and voice & tone. It is the single source of truth when tokens, recipes, or copy disagree across this repo.

When `/build` touches frontend (`app/**/*.tsx`, `components/**/*.tsx`, `app/globals.css`, `tailwind.config.*`), open the HTML file and scan the sections relevant to the change before editing. Follow the **frontend gate** (pre-commit Rule 4) — the cycle doc Verification section MUST cite the `design-system` reference.

## Design Tokens — Spacing & Typography

Canonical scale lives in `app/globals.css`. Use the Tailwind utilities below; never hand-write `p-4` / `text-lg` for page chrome.

| Token | Utility | Value | When |
|---|---|---|---|
| `--space-page-x` | `p-page-x` / `px-page-x` | 1.5rem | Page horizontal padding |
| `--space-page-y` | `py-page-y` | 2rem | Page vertical padding |
| `--space-section` | `gap-section` / `mt-section` | 2rem | Between sections on a page |
| `--space-card` | `p-card` | 1.5rem | Card internal padding |
| `--space-field` | `space-y-field` / `gap-field` | 1rem | Form row gap |
| `--text-display` | `text-display` | 2rem | Dashboard hero numbers, stat-card primary |
| `--text-h1` | `text-h1` | 1.5rem | Page title |
| `--text-h2` | `text-h2` | 1.125rem | Section / card title |
| `--text-body` | `text-body` | 0.875rem | Default body text |
| `--text-small` | `text-small` | 0.75rem | Secondary labels |
| `--text-caption` | `text-caption` | 0.6875rem | Table meta, badges, captions |

Retrofitting existing pages against this scale is a follow-up cycle — new pages and new sections MUST start on the scale.

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
| Desktop form / create-edit | `<Dialog>` | Route-level form pages |
| Mobile form / create-edit | `<Sheet>` | Dialog stuffed into narrow viewport |
| Destructive confirm | `<AlertDialog>` | `<Dialog>` or `window.confirm()` |
| Transient feedback | `toast.*()` (sonner) | `alert()`, inline banner for success |

## Overlays Rule

**One overlay at a time — toasts excepted.** Never stack Dialog over Dialog, Sheet over Sheet, or Dialog over Sheet. Close the current overlay before opening another.

- **Dialog on desktop, Sheet on mobile.** Use `useIsMobile()` to switch. The create-or-edit form is the same form — only the container changes.
- **Destructive = AlertDialog, always.** Delete, void, cancel, hard-deactivate — all through `<AlertDialog>`. Cancel-left (ghost), destructive-right (red, `variant="destructive"`).
- **Toasts stack, overlays don't.** Multiple toasts allowed; they auto-dismiss. Sonner's default 3–5s timing is correct for success; errors should stay longer (or be persistent via `toast.error(..., { duration: Infinity })` for critical failures).
- **Body copy states the consequence.** "Data akan hilang selamanya" for hard delete; "Bisa diaktifkan kembali kapan saja" for soft delete. See `voice.md` for audience-matched copy.

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

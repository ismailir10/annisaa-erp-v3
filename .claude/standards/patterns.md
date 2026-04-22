# Page Recipes

> Loaded on demand by `/build` when staged paths match `app/*/page.tsx`, `app/**/client.tsx`, or `components/{admin,teacher,parent,portal}/**`.

**Canonical reference:** `.claude/standards/design-system.html` — read the matching `§ Page Recipes` section (and the Portal Shell, Overlays, DataTable sections it cross-links) before inventing new layouts.

Six recipes cover every screen in the ERP today. Pick the narrowest match; do not invent a 7th without raising it in CLAUDE.md.

## Recipe 1 — Admin List

**When:** any admin route rendering >10 rows of a single entity (students, employees, invoices, admissions, ...).

**Layout skeleton:**

```tsx
<SidebarInset>
  <SiteHeader breadcrumbs={[{ label: "Siswa", href: "/admin/students" }]} />
  <main className="flex flex-1 flex-col p-page-x py-page-y">
    <PageHeader
      title="Siswa"
      subtitle="Kelola data siswa aktif dan riwayat"
      actions={<Button>Tambah Siswa</Button>}
    />
    <section className="mt-section">
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Cari nama / NIS..."
        statusFilter={<StatusFilter value={s} onChange={setS} />}
      />
    </section>
  </main>
</SidebarInset>
```

**Required pieces:** breadcrumb in SiteHeader · PageHeader with title + subtitle + primary CTA · DataTable with sort + search + status filter + pagination + action column (`<DataTableRowActions>` — see `ui.md`) · Created At + Updated At columns (sortable, muted) · EmptyState via `DataTable`'s empty slot.

**Forbidden:** hand-rolled `flex flex-col gap-2` row loops · custom modal buttons outside the `<Dialog>` / `<Sheet>` rule · hardcoded `p-6` page padding (use `p-page-x` / `py-page-y` from the spacing scale).

## Recipe 2 — Admin Detail

**When:** `/admin/<entity>/[id]` pages — single entity overview with sub-sections (tabs or vertical).

**Layout skeleton:**

```tsx
<main className="flex flex-1 flex-col p-page-x py-page-y">
  <PageHeader
    title={`${student.name}`}
    subtitle={`${student.nis} · ${student.className}`}
    actions={<><Button variant="outline">Nonaktifkan</Button><Button>Edit</Button></>}
  />
  <div className="mt-section grid gap-section md:grid-cols-[1fr_280px]">
    <Tabs defaultValue="profil">
      <TabsList>...</TabsList>
      <TabsContent value="profil">...</TabsContent>
    </Tabs>
    <aside className="space-y-4">{/* metadata cards */}</aside>
  </div>
</main>
```

**Required pieces:** PageHeader with entity name + identifier subtitle + action cluster (destructive-left / edit-right) · Tabs for sub-sections (if >1) · right-rail aside for metadata (created_at, updated_at, audit log link) · StatusBadge on every state field.

## Recipe 3 — Admin Form (Dialog or Sheet)

**When:** create or edit an entity from a list page. Never a separate route.

**Rule:** Dialog on desktop, Sheet on mobile (`useIsMobile()`). Destructive confirm always `<AlertDialog>`, never `<Dialog>`. One overlay at a time — toasts excepted.

**Layout skeleton (desktop):**

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="sm:max-w-lg">
    <DialogHeader>
      <DialogTitle>Tambah Siswa</DialogTitle>
      <DialogDescription>Isi data siswa baru.</DialogDescription>
    </DialogHeader>
    <form className="space-y-field" onSubmit={onSubmit}>
      <Field>
        <FieldLabel>Nama Lengkap</FieldLabel>
        <Input {...register("name")} />
        <FieldDescription>Sesuai akta kelahiran.</FieldDescription>
      </Field>
      {/* ...more fields */}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
        <Button type="submit" disabled={isPending}>Simpan</Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

**Required pieces:** `<Field>` + `<FieldLabel>` + `<FieldDescription>` (never raw `<Label>` + `<Input>`) · Zod schema + React Hook Form · submit button shows loading state · ghost-Cancel on the left, solid-Submit on the right.

## Recipe 4 — Portal Dashboard

**When:** `/teacher` or `/parent` home pages — mobile-first landing with stat cards + quick links + recent activity.

**Layout skeleton:**

```tsx
<main className="mx-auto max-w-md px-5 pb-20 pt-6">
  <PortalHeader {...} />
  <PageHeader title="Beranda" subtitle={greeting} />
  <section className="mt-6 grid grid-cols-3 gap-3">
    <QuickLinkCard ... />
    <QuickLinkCard ... />
    <QuickLinkCard ... />
  </section>
  <section className="mt-6 space-y-3">
    {/* Primary content: household overview (parent) OR clock-in card (teacher) */}
  </section>
  <PortalBottomNav ... />
</main>
```

**Required pieces:** `PortalHeader` · `PortalBottomNav` · `PageHeader` · `QuickLinkCard` grid (always 3-up, `h-[132px]` fixed) · `max-w-md` · `pb-20` to clear bottom nav · `safe-area-bottom` on bottom nav.

**Parent-specific:** home body MUST use the Household Overview pattern (see `portal.md`) — card-per-child with signal chips, not pill-tabs, once the family has ≥3 kids. Two-kid families may keep pill-tabs.

## Recipe 5 — Workflow Queue

**When:** approval list where the row action IS the domain work (LeaveRequest approve/reject, AdmissionConversion, refund approval).

**Layout skeleton:** same as Admin List (Recipe 1) but with:
- `DataTableRowActions` using `extraActions` for "Setujui" / "Tolak" (see `ui.md` — domain-specific actions exception).
- Top toolbar shows count of pending items.
- Row colour hints ok (amber background for stale items >N days old).

**Required pieces:** pending-count toolbar chip · per-row approve/reject with AlertDialog confirm · audit-log link on each row · EmptyState shows the "nothing pending" copy, not the generic "no data yet".

## Recipe 6 — Daily Data Entry

**When:** single-purpose grids where the user types/taps the same field across many rows (class attendance, assessment score entry, home-note week grid).

**Rules:**
- **Cycle-tap, not radio.** Default value = the common case (PRESENT for attendance). One tap rotates through states (`PRESENT → ABSENT → SICK → PERMISSION`). Long-press or "..." menu for less-common states.
- **Sticky first column** identifies the entity (student name / date / category). Sticky so it doesn't scroll off horizontally on mobile.
- **Summary trio above the grid** shows live totals (e.g. "Hadir 25 · Sakit 2 · Alpa 1").
- **Save on every tap**, not on a submit button. Optimistic UI + toast rollback on failure.

**Layout skeleton:**

```tsx
<main className="flex flex-1 flex-col p-page-x py-page-y">
  <PageHeader title="Absensi Kelas" ... />
  <section className="mt-section flex items-center gap-3">
    <ClassPicker /> <DatePicker />
    <div className="ml-auto flex gap-4 text-small">
      <span className="text-status-present-text">Hadir {present}</span>
      <span className="text-status-absent-text">Alpa {absent}</span>
      <span className="text-status-leave-text">Sakit {sick}</span>
    </div>
  </section>
  <AttendanceGrid rows={roster} onCycle={cycleStatus} />
</main>
```

**Required pieces:** class + date picker row · live summary trio · sticky-first-column grid · per-cell optimistic save · row-level skeleton on first load.

## Cross-recipe invariants

- **Never render nothing on empty.** Every conditional list MUST have an `<EmptyState>` branch (see `portal.md` — Empty State Contract).
- **Loading is always `<Skeleton>`.** No `animate-pulse` divs.
- **Errors via `toast.error()`.** Never `alert()`, never silent catch.
- **Currency via `formatRupiah()`, dates via `formatDate()` / `formatDateShort()`.** Never inline `.toLocaleString()`.
- **Spacing from tokens.** `p-page-x`, `py-page-y`, `gap-section`, `p-card`, `space-y-field` — never ad-hoc `p-4` / `p-8` for page chrome.
- **Typography from tokens.** `text-h1`, `text-h2`, `text-body`, `text-small`, `text-caption` — never ad-hoc `text-lg` / `text-base` for page chrome.

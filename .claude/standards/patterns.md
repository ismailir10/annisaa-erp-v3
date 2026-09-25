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

**When:** `/admin/<entity>/[id]` pages. Two variants — pick by trigger rule, do not default to either without checking:

**Trigger rule — use 2b (dossier) only when *both* hold:** (1) the page is a read/overview surface, not a stateful editor or workflow tool, and (2) the entity has 3+ independent concerns worth their own section (finance, academics, documents, ... — something an admin would search for by name). Otherwise use 2a. See `docs/cycles/2026-09-03-detail-page-pattern-decision.md` for the full reasoning and the current retrofit backlog (which existing pages are 2a today but qualify for 2b).

### Recipe 2a — Simple Detail

**When:** single-concern entities (one invoice, one payroll run) or stateful editors/workflow tools (raport editor) — the common case for anything that isn't named in the 2b backlog.

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

### Recipe 2b — Dossier

**When:** multi-concern entity overviews. Canonical example: `/admin/students/[id]`. Backlog candidates: `guardians/[id]` (high priority — the components below were built naming this page), `classes/[id]`, `employees/[id]`.

**Layout skeleton:**

```tsx
<main className="flex flex-1 flex-col p-page-x py-page-y">
  <DetailPageHeader title={entity.name} subtitle={...} actions={...} />
  <div className="mt-section grid gap-section lg:grid-cols-[1fr_280px]">
    <div>
      <DossierNav sections={sectionDefs} openMap={openMap} onNavigate={...} />
      <DossierSection id="keuangan" label="Keuangan" open={openMap.keuangan} onOpenChange={...}>
        ...
      </DossierSection>
      {/* more DossierSections, one per concern */}
    </div>
    <DetailRail>
      <RailStatTiles tiles={[...]} />
      <RailCard title="Kontak">...</RailCard>
    </DetailRail>
  </div>
</main>
```

**Required pieces:** `DetailPageHeader` + `DetailPageSkeleton` for loading (`components/admin/`) · sticky `DossierNav` that expands a collapsed section before scrolling to it · one `DossierSection` per concern, `id` = DOM anchor = nav target, `keepMounted` only for sections whose fetch is worth surviving a collapse · `DetailRail` (`RailStatTiles` / `RailCard` / `RailKV` / `RailChecklist`) — collapses into normal document flow below `lg` · hash-addressable sections (`#akademik` etc.) · aggregate numbers distinguish "not loaded" (`Memuat…`) from a real zero (never a bare `0` while a fetch is pending) · lazy sections fetch only on first open; above-the-fold rail data fetches eagerly.

Both variants share: StatusBadge on every state field, the Edit Toggle Pattern (`crud.md`) for inline section edits.

## Recipe 3 — Admin Form (Dialog or Sheet)

**When:** create or edit an entity from a list page. Never a separate route.

**Rule:** Use `ResponsiveFormDialog` for create/edit forms: it renders Dialog on desktop and Sheet on mobile, freezing that choice while open. Destructive confirmation remains `<AlertDialog>`. One overlay at a time — toasts excepted.

The wrapper owns the viewport-height limit, shadcn `ScrollArea` body, internal focus-ring padding, and docked header/footer. Put fields in `children` and action buttons in `footer`; do not add another scrolling wrapper or viewport-height constraint. Choose width through `size`.

**Layout skeleton:**

```tsx
const formId = useId();

<ResponsiveFormDialog
  open={open}
  onOpenChange={setOpen}
  title="Tambah Siswa"
  description="Isi data siswa baru."
  size="lg"
  footer={
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Batal
      </Button>
      <Button type="submit" form={formId} disabled={isPending}>
        {isPending ? "Menyimpan..." : "Tambah Siswa"}
      </Button>
    </>
  }
>
  <form id={formId} className="space-y-field" onSubmit={onSubmit}>
    <Field>
      <FieldLabel required htmlFor={`${formId}-name`}>Nama Lengkap</FieldLabel>
      <Input id={`${formId}-name`} required {...register("name")} />
      <FieldDescription>Sesuai akta kelahiran.</FieldDescription>
    </Field>
    {/* ...more fields */}
  </form>
</ResponsiveFormDialog>
```

The footer sits outside the form's DOM subtree; its submit button must use the matching `form` attribute. For existing click-driven submissions, keep the submit handler on the footer button.

**Required pieces:** `<Field>` + `<FieldLabel>` + `<FieldDescription>` (never raw `<Label>` + `<Input>`) · Zod schema + React Hook Form · submit button shows loading state · ghost-Cancel on the left, solid-Submit on the right.

## Recipe 4 — Portal Dashboard

**When:** `/teacher` or `/parent` home pages — mobile-first landing that makes today's next action obvious.

**Layout skeleton:**

```tsx
<main className="mx-auto max-w-md px-5 pb-20 pt-6">
  <PortalHeader {...} />
  <PageHeader title="Beranda" subtitle={greeting} />
  <section className="mt-section space-y-3">
    {/* Teacher: current class and the tasks still needing work.
        Parent: children and the information or action each needs. */}
    <TaskList><TaskRow ... /></TaskList>
  </section>
  <PortalBottomNav ... />
</main>
```

**Required pieces:** `PortalHeader` · `PortalBottomNav` · clear page heading · current context and a task-first next-action area · `max-w-md` · bottom padding to clear navigation · `safe-area-bottom` on bottom nav. Quick links are optional secondary navigation; do not reserve a fixed-height three-card grid above the work.

**Parent-specific:** show the household's children together with each child's actionable information (see `portal.md`). Do not turn absent attendance data into a claim that the child was absent, present, or late.

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
- **Make each state clear.** Existing cycle controls may keep their current behavior. New attendance entry may use explicit state choices when that makes the result easier to understand and verify.
- **Sticky first column** identifies the entity (student name / date / category). Sticky so it doesn't scroll off horizontally on mobile.
- **Summary trio above the grid** shows live totals (e.g. "Hadir 25 · Sakit 2 · Alpa 1").
- **Preserve the route's real save contract.** Show saving, saved, and error feedback beside the work. Do not claim success before persistence or replace a working submit flow merely to match a mockup.

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

**Required pieces:** class + date picker row · live summary · clear per-student state · save feedback that matches the actual persistence flow · row-level skeleton on first load.

## Cross-recipe invariants

- **Never render nothing on empty.** Every conditional list MUST have an `<EmptyState>` branch (see `portal.md` — Empty State Contract).
- **Loading is always `<Skeleton>`.** No `animate-pulse` divs.
- **Errors via `toast.error()`.** Never `alert()`, never silent catch.
- **Currency via `formatRupiah()`, dates via `formatDate()` / `formatDateShort()`.** Never inline `.toLocaleString()`.
- **Spacing from tokens.** `p-page-x`, `py-page-y`, `gap-section`, `p-card`, `space-y-field` — never ad-hoc `p-4` / `p-8` for page chrome.
- **Typography from tokens.** `text-h1`, `text-h2`, `text-body`, `text-small`, `text-caption` — never ad-hoc `text-lg` / `text-base` for page chrome.

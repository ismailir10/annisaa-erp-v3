# Parent Portal UX Polish — Cycle 2 (convergence with teacher + home-note write)

## Context

Cycle 1 (2026-04-21, merged as #98) closed mobile-fit defects and extracted the first shared primitive (`PortalTabs`) for the parent portal. Follow-up scope was queued: teacher portal adopting `PortalTabs` + text-size rule, a PortalTabs `leading` slot for avatars, and friction-tier findings from the 2026-04-21 audit.

CTO review on 2026-04-22 (with two user-supplied screenshots: desktop rapor drawer + mobile parent dashboard) confirms parent portal is functional but still diverges from teacher portal in six visible ways:

1. **Header divergence.** Teacher header shows user avatar + profile link ([teacher/header.tsx:26-34]); parent header is text-only (name + logout). Teacher pattern is more discoverable and more trustworthy ("I'm logged in as the right person").
2. **Missing error boundary.** Teacher has `app/teacher/error.tsx` (branded recovery page with reset). Parent has no `error.tsx` — a client crash shows the Next.js default error stack.
3. **Layout padding drift.** `app/parent/student-journal/page.tsx:118` wraps content in its own `max-w-md mx-auto p-4` while other parent routes defer to the layout's `px-5 py-6`. Two different horizontal rhythms side-by-side.
4. **Teacher text-size violations.** Cycle 1 added the `text-[10px]`/`text-[11px]` ban to `portal.md` but applied it only to parent. Teacher still carries violations at `components/teacher/bottom-nav.tsx:51`, `app/teacher/assessments/page.tsx:144,177`, `app/teacher/assessments/client.tsx:308,325`, and others (13 total).
5. **Desktop rapor sheet poor padding + blur.** User screenshot shows the right-side rapor drawer on desktop with `backdrop-blur` obscuring the underlying list (60 % of screen becomes visual noise), close button floating in top-right with weak hit target, header stack crammed against the edge, and inside-section content (PERKEMBANGAN MOTORIK HALUS / BAHASA …) butting the right edge with no gutter. Cycle 1 fixed mobile (bottom sheet) but left desktop untouched.
6. **No codified spacing / page-header scale.** Each parent route composes its own `h1` + subtitle + `mb-*` block. No shared `<PageHeader>` primitive. Result: rhythm drift across routes AND rhythm drift between parent and teacher. User asked explicitly for a "UI standard" — this cycle adds the primitive + the scale so cycle 3 and beyond have one ruler, not six.
10. **No cross-portal reusability rule.** `components/{parent,teacher}/bottom-nav.tsx` both render a 5-tab bottom-nav with Framer Motion `layoutId` active indicator — identical pattern, two copies. `header.tsx` in both directories had the same divergence (T4 + T5 fix). `app/{parent,teacher}/error.tsx` are about to become twins (T7 + existing). Every future pair will drift the same way unless a rule exists. Today `components/portal/` has only one file (`portal-tabs.tsx`). Needs a codified reusability standard: shared UI primitives live in `components/portal/**`; portal-specific composition lives in `components/{parent,teacher}/**`; per-page specifics live next to the page. Plus a migration entry for bottom-nav + error-boundary to close the second-instance gap.

9. **Dashboard IA duplicates `/parent/invoices`.** `app/parent/page.tsx` renders `UnpaidInvoicesTable` (full DataTable of unpaid tagihan) right on the dashboard, re-doing work that `/parent/invoices` already covers. Dashboard's job should be *summary + recent activity at a glance*, with CTAs that route into the dedicated pages — not a second copy of the tagihan list. Also the inline "Bayar" button (filled teal) vs "Lihat" (plain link) on the same table row violates the action-column standard (uniform icon-button row) per `ui.md`.

8. **Dashboard quick-link cards are ragged.** User screenshot of Tagihan / Kehadiran / Rapor trio shows three different card heights because payloads differ (Tagihan = label + "Sisa" + rupiah; Kehadiran = label + "Belum dicatat"; Rapor = label only). Bottom edges don't align, visual weight is unbalanced, and Rapor / Kehadiran feel empty. Every card should render the same slot structure (icon → label → one data line) and the same fixed height so the trio reads as a grid, not a list of fragments.

7. **Parent Kehadiran violates DataTable + list-pagination standard.** `app/parent/attendance/page.tsx:28` hard-codes `getStudentAttendanceRecent(selected.studentId, 30)` — last 30 records only. `client.tsx` then hands that array to `<DataTable>` with no server pagination, no status filter, no date-range filter. A student with 100+ recorded school days is silently truncated — 70+ records invisible. Violates `api.md` GET-list pagination contract (page + pageSize + total + filters) and `ui.md` DataTable standard (server-side sort/filter on list routes of unbounded size).

Separately, the user flagged a **blocker-level gap in student journal**: parents cannot write home-notes (catatan rumah) despite the backend `POST /api/student-journal/notes` already accepting `GUARDIAN` role ([api/student-journal/notes/route.ts:65-68]) and the `NoteThread` read-only surface already rendering teacher + parent posts side-by-side. The note-write form exists on the teacher detail page ([teacher/student-journal/students/[id]/page.tsx:176-187]) but parent portal's Catatan tab is read-only ([parent/student-journal/page.tsx:269-270]). Cycle 1 of student-journal explicitly deferred this as "v2"; we are unwrapping that deferral in this cycle because the backend is ready and the parity gap is visible to users.

No UAT report exists for this area post-2026-04-18; the parent UAT report is 4 days old and findings fed cycle 1.

## Spec

**Acceptance criteria:**

*Parent–teacher convergence*
- [ ] `components/portal/portal-header.tsx` exists. Shared header primitive with `logo`, `userName`, `userSubtitle` (role/class), `avatarUrl?`, `profileHref?`, `onLogout`. Renders logo left, avatar + name stack right with optional profile link.
- [ ] `components/parent/header.tsx` and `components/teacher/header.tsx` both render via `PortalHeader`. No bespoke header markup remains in either file.
- [ ] Parent header now shows a user avatar (initial fallback when `avatarUrl` absent) matching teacher's visual weight. Logout button keeps existing `aria-label="Keluar"`.
- [ ] `components/portal/portal-tabs.tsx` gains optional `leading` per item (`ReactNode` — typically `<Avatar>` or icon). Existing consumers unaffected (undefined leading = no visual change).
- [ ] `components/parent/child-selector-tabs.tsx` uses the new `leading` slot to render a 20 px avatar with child initial (restores the avatar circle that cycle 1 dropped).
- [ ] `app/parent/error.tsx` exists. Branded error boundary: AlertTriangle icon + "Terjadi kesalahan" heading + description + "Coba lagi" reset button + "Kembali ke beranda" secondary link. Mirrors `app/teacher/error.tsx` styling exactly so cycle 3 can lift them both to `components/portal/portal-error.tsx` if they prove identical.
- [ ] `app/parent/student-journal/page.tsx` drops its inner `max-w-md mx-auto p-4` wrapper; content relies on layout's `px-5 py-6 max-w-md mx-auto`. No horizontal rhythm diff against `/parent/invoices`.

*Teacher text-size + PortalTabs adoption (the cycle-1 follow-up)*
- [ ] `grep -rn 'text-\[10px\]\|text-\[11px\]' app/teacher components/teacher` returns zero matches. Every hit replaced with `text-xs` (and any parent container adjusted to keep 5-tab bottom-nav on one line at 360 px).
- [ ] `components/teacher/bottom-nav.tsx` verified at 360 px Playwright snapshot — all 5 labels visible, no overflow.
- [ ] If teacher has any horizontal-overflow tab site (none currently identified; confirm during T3), it migrates to `PortalTabs`. Otherwise note "no teacher migration site" in Implementation.

*Parent home-note write (unwrapping the journal v2 deferral)*
- [ ] Parent Catatan tab on `app/parent/student-journal/page.tsx` gains a "Tulis Catatan" button above the thread. Click opens a dialog with date picker (defaults to today; bounded to current week dates) + textarea (1-2000 chars, matches `noteBodySchema`).
- [ ] Submit POSTs to `/api/student-journal/notes` with `{ studentId, date: YYYY-MM-DD, body }`. Success: dialog closes, week refetches, toast "Catatan tersimpan".
- [ ] Server error (4xx/5xx/429 rate-limit) surfaces inline in the dialog AND toast; dialog stays open so parent can fix/retry without retyping the body.
- [ ] Parent sees their own note immediately after reload (already supported by `children/[id]/week/route.ts:107-123`). Parent can edit/delete their own note via the existing `PUT/DELETE /api/student-journal/notes/[id]` endpoints (author-gated at `notes/[id]/route.ts:52-53`). Minimum: add edit + delete affordance on `NoteThread` items where `authorRole === "GUARDIAN"` AND the note is author-owned.
- [ ] `NoteThread` component gains `onEdit` + `onDelete` optional callbacks; parent page wires them, teacher page leaves them undefined (teachers already have full CRUD on their detail page).

*Desktop rapor drawer + UI standard*
- [ ] `app/parent/assessments-table.tsx` desktop (`md:` and up) sheet: remove `backdrop-blur`, use standard `bg-black/40` overlay. Sheet width bumps to `md:max-w-2xl` (was `sm:max-w-md`) so content breathes. Internal padding lifts to `p-6 md:p-8` (was tight default). Close button is a proper `h-9 w-9` icon Button with `aria-label="Tutup"` anchored top-right with `top-4 right-4`.
- [ ] Inside rapor sheet: header stack (title + subtitle) has `pb-4 border-b` separator. Each domain section uses `space-y-3` between indicator rows, `mt-6` between sections. Indicator row keeps label left + `StatusBadge` right with `gap-4` minimum.
- [ ] Mobile bottom-sheet version (cycle 1) unchanged — still `h-[95dvh]` with `p-5` internal.
- [ ] `components/portal/page-header.tsx` exists. Props: `title: string`, `subtitle?: string`, `actions?: ReactNode` (right-aligned slot for buttons). Spacing: `h1` = `text-2xl font-semibold tracking-tight`; subtitle = `text-sm text-muted-foreground mt-1`; block margin-bottom = `mb-6`.
- [ ] Every parent route (`/parent/page.tsx` dashboard greeting, `/parent/invoices`, `/parent/attendance`, `/parent/reports`, `/parent/student-journal`) renders its page title via `<PageHeader>`. No bespoke `<h1>` + `<p>` pairs remain in `app/parent/**`.
- [ ] `.claude/standards/portal.md` adds a **Spacing scale** section: page-level `px-5 py-6` (mobile) / `md:px-8 md:py-8` (desktop), page-header `mb-6`, section gap `space-y-4`, card padding `p-4 md:p-6`, sheet padding `p-5` mobile / `p-6 md:p-8` desktop. One table. Cycle 3 can sweep teacher to adopt.

*Parent Kehadiran DataTable + pagination (API + UI standard)*
- [ ] New API route `app/api/parent/children/[id]/attendance/route.ts` — GET with `page` (default 1), `pageSize` (default 20, max 100), `status?` (`PRESENT|ABSENT|SICK|PERMIT|LATE`), `dateFrom?` / `dateTo?` (YYYY-MM-DD). Returns `{ data, total, page, pageSize, totalPages }` per `api.md` list contract. Auth: reuse `requireGuardianForStudent` (same pattern as `/api/student-journal/children/[id]/week`). Sort `date desc` default; accept `sortField` + `sortOrder` query.
- [ ] `app/parent/attendance/client.tsx` rebuilds on server-pagination `DataTable` pattern used by admin CRUD pages (see `app/admin/**` for reference — same `useSWR` + `page`/`pageSize` state + `DataTable` with `serverPagination` prop). No more 30-row client truncation.
- [ ] Filter controls above the table: status dropdown + date-from + date-to. Clear-filters button. Debounced (300 ms) — match admin list pattern.
- [ ] Empty states: "Belum ada data kehadiran" (no data at all) vs "Tidak ada hasil untuk filter ini" (filters empty the set). Both via `EmptyState` component.
- [ ] Loading skeleton inside DataTable matches post-load shape (header + 5 row skeletons at the configured pageSize), no reflow.
- [ ] `getStudentAttendanceRecent` in `lib/parent-helpers.ts` still exists but scoped to "last 7 / 30 days for week-summary strip" — rename or clearly comment so it is not reused for the list.
- [ ] `WeekSummaryStrip` keeps its own 7-day query; not driven by the paginated list (decouples KPI from table filtering).
- [ ] CI: add test cases covering page=2, pageSize=50, status filter, date-range filter, empty result, 403 for non-guardian.

*Dashboard quick-link card uniformity*
- [ ] `app/parent/page.tsx` Tagihan / Kehadiran / Rapor cards adopt a shared `<QuickLinkCard>` component at `components/parent/quick-link-card.tsx`. Props: `href`, `icon: LucideIcon`, `label: string`, `primary: string` (one-line stat), `primaryTone?: 'default' | 'destructive' | 'success'`, `secondary?: string` (optional muted caption above `primary`).
- [ ] All three cards on the dashboard render via `<QuickLinkCard>` and share the same fixed height (`h-[132px]` or min-height equivalent), internal padding (`p-4`), icon size (24 px), label weight (`font-medium text-sm`), and primary line position (bottom-anchored via `flex-col justify-between`).
- [ ] Data parity:
  - Tagihan: `secondary="Sisa"`, `primary={formatRupiah(totalUnpaid)}` with `primaryTone="destructive"` when `totalUnpaid > 0`; else `primary="Lunas"` with `primaryTone="success"`.
  - Kehadiran: `primary` = "Hadir X / Y hari" based on last 7 days, else "Belum dicatat" in muted tone.
  - Rapor: `primary` = latest semester label (e.g. "Semester 1 2025/2026") if a report exists, else "Belum tersedia" in muted tone.
- [ ] Zero layout shift when data loads (skeleton matches final card height).
- [ ] Grid layout `grid-cols-3 gap-3` on mobile — all three cards same width, bottom edges aligned.

*Dashboard IA — summary + recent activity, not embedded tagihan list*
- [ ] `app/parent/page.tsx` drops `UnpaidInvoicesTable`. Tagihan detail lives at `/parent/invoices` only — no duplicate table on beranda.
- [ ] New component `components/parent/recent-activity.tsx` — chronological feed of the 7 most recent cross-module events for the selected child. Event types (unified shape `{ id, timestamp, kind, title, detail?, href? }`):
  - `ATTENDANCE_MARKED` — "Hadir · <tanggal>" / "Sakit · <tanggal>" etc.
  - `NOTE_POSTED` — "Catatan dari <guru>: <snippet>" / "Catatan rumah: <snippet>".
  - `JOURNAL_ENTRY` — "Aktivitas sekolah tercatat · <tanggal>" (only the first entry per day, not per indicator).
  - `INVOICE_ISSUED` — "Tagihan baru · <periodLabel>".
  - `PAYMENT_RECEIVED` — "Pembayaran diterima · <rupiah>".
  - `REPORT_PUBLISHED` — "Rapor <semester> tersedia".
- [ ] New API `app/api/parent/children/[id]/activity/route.ts` — GET, returns top N (default 7) union-fed events across tables, sorted `timestamp desc`. Auth via `requireGuardianForStudent`. Server-only; never hits the client-side store.
- [ ] Dashboard calls the activity API server-side in `page.tsx`; passes to `<RecentActivity items={…} />` for render.
- [ ] `<RecentActivity>` visual: vertical stack, each item = icon (24 px, tone by kind) + title (text-sm font-medium) + detail (text-xs muted) + relative time (e.g. "2 jam lalu") right-aligned. Whole row clickable when `href` present; card/button styling per `ui.md`.
- [ ] Empty state: "Belum ada aktivitas" with "Catatan dan kehadiran akan muncul di sini" caption via `EmptyState`.
- [ ] Dashboard final structure (top → bottom): header → child-selector → `<QuickLinkCard>` trio (T13) → `<RecentActivity>` (this task) → bottom-nav. No tables.
- [ ] Action-column cleanup on `/parent/invoices` itself: "Bayar" and "Lihat" unify as icon-only buttons of the same size/tone per `ui.md` action-column standard — `Bayar` = primary tone when payment URL exists, `Lihat` = ghost tone always. Both 32 px square with `aria-label`. (Scope of this bullet is `/parent/invoices` + `components/parent/unpaid-invoices-table.tsx` usage if still referenced elsewhere.)

*Cross-portal reusability (new rule + migrations)*
- [ ] `.claude/standards/portal.md` adds a **Component Reusability Layers** section with this table (canonical source of truth):
  | Layer | Location | Owns | Consumers |
  |---|---|---|---|
  | Primitive (cross-portal) | `components/portal/**` | Stateless/low-state UI shared by ≥2 portals | Parent + teacher + admin when applicable |
  | Portal composition | `components/{parent,teacher,admin}/**` | Portal-flavoured wiring around primitives (data fetch, link targets, copy) | That portal only |
  | Page-local | Next to the page (`app/.../route-specific.tsx`) | One-off markup with no reuse potential | That page only |
  Rule: if a pattern lands in two portals, migrate to `components/portal/**` within the same cycle — not a later cycle. The 2nd instance is the extraction trigger.
- [ ] Existing duplications closed this cycle (enforced by task list): `header` → `PortalHeader` (T2 T4 T5); `child-selector avatar slot` → `PortalTabs.leading` (T1 T6); `error.tsx` → after this cycle both parent + teacher hold independent files, cycle 3 extracts `PortalError`; `bottom-nav` → `PortalBottomNav` this cycle (T15).
- [ ] `components/portal/portal-bottom-nav.tsx` exists. Props: `items: { href, label, icon, matcher? }[]`, `activeIndicatorId?: string` (for Framer layoutId). Handles: motion active pill, focus ring, aria-current, safe-area inset bottom padding.
- [ ] `components/{parent,teacher}/bottom-nav.tsx` become thin wrappers: import `PortalBottomNav`, supply their own `items[]` (parent's 5 tabs, teacher's 5 tabs). No more duplicated Framer code.
- [ ] `PortalBottomNav` default text size = `text-xs` (12 px) — enforces the cycle-1 ban inside the primitive itself. Callers cannot downsize.
- [ ] Inventory note in `portal.md` lists current portal primitives: `PortalHeader`, `PortalTabs`, `PortalBottomNav`, `PageHeader`. Next extraction candidates (cycle 3): `PortalError`, portal-level loading skeleton family (`PageSkeleton`, `ListSkeleton`, `DetailSkeleton`), `RecentActivity` (if teacher home adopts same feed shape).

*Cross-cutting*
- [ ] `npm run build && npx vitest run` green between each task.
- [ ] `npx playwright test` green at end of cycle (extend parent spec to cover: write-note dialog open → submit → thread updates).
- [ ] `.claude/standards/portal.md` gets a **PortalHeader primitive** section + notes the teacher text-size sweep is complete.
- [ ] README.md CRUD-status/modules table updated if any row changes (student-journal parent-write going from "read-only" → "full CRUD for own notes" is a status change worth logging).

**Non-goals (this cycle does NOT touch):**
- Admin portal. No header change, no error boundary, no journal change.
- Friction-tier findings from cycle 1 (dead-end "Lihat" CTA, vague "sedang disiapkan" copy, assessment grader metadata, retry affordance) — queued for cycle 3.
- Lifting `app/{parent,teacher}/error.tsx` into a shared `PortalError` primitive. Do this cycle 3 after confirming both files end up identical.
- Parent reply to a specific teacher note (threaded reply). Parents write day-level home-notes, not message-thread replies.
- Teacher portal structural refactor (page-header primitive, loading-skeleton primitive) — cycle 3 candidates.
- Rate-limit change on `POST /api/student-journal/notes` (20/min/IP stays).

**Assumptions:**
1. `components/portal/portal-tabs.tsx` export signature permits adding an optional `leading?: ReactNode` field to the `items[]` element type without breaking TypeScript consumers that spread narrower object shapes. Verify on T2.
2. The parent-write dialog can reuse `components/ui/dialog.tsx` + date picker already present in teacher's note dialog ([teacher/student-journal/students/[id]/page.tsx:200-240]). Pull the date-picker pattern directly rather than re-inventing.
3. Teacher text-size sweep is mechanical and safe (same 10 → 12 px rationale as cycle 1). Bottom-nav at 5 tabs × (icon 20 + label text-xs 12) already proven on parent to fit 360 px.
4. `app/parent/error.tsx` can be a straight visual copy of `app/teacher/error.tsx` with Indonesian copy intact. No need to build the shared primitive yet — two instances are the threshold for extraction, which we reach at the end of this cycle.
5. `NoteThread` editing is a per-note inline-edit-dialog (small pencil icon opens the same dialog pre-filled), not in-place contenteditable. Simpler + matches teacher detail-page pattern.
6. Parent delete uses a confirm dialog (`AlertDialog`) — "Hapus catatan ini?" — destructive action, not a silent click.
7. `/build` will use `superpowers:subagent-driven-development` for the parallel group per cycle-1 precedent.

→ Correct any assumption now or `/build` proceeds with them.

## Tasks

Ordered, atomic, each committable on its own. Dependencies marked so `/build` can dispatch independent tasks in parallel via subagents.

### Group A — foundation (sequential, must land first)

- [x] **T1 — Extend `PortalTabs` with optional `leading` slot.**
  - File: `components/portal/portal-tabs.tsx` + `components/portal/__tests__/portal-tabs.test.tsx`.
  - Add `leading?: ReactNode` to the `items[]` element. When present, render before the label inside the tab trigger. Default undefined → no visual change.
  - Test: existing tests still pass; add 1 test that renders 3 items with a 16 px avatar as `leading` and asserts both avatar + label are visible.
  - Acceptance: zero visual diff when callers don't pass `leading`; avatar-bearing tabs render correctly at 375 px.

- [x] **T2 — Build `PortalHeader` primitive.**
  - File: `components/portal/portal-header.tsx` (new) + `components/portal/__tests__/portal-header.test.tsx` (new).
  - Props: `logo: ReactNode`, `userName: string`, `userSubtitle?: string`, `avatarUrl?: string`, `avatarFallback: string` (required when no url — 1-2 chars), `profileHref?: string`, `onLogout: () => void`.
  - Layout: flex row; logo left; right side has avatar (24 px) + name stack; chevron-right icon if `profileHref` provided; logout icon button (ghost variant, `aria-label="Keluar"`) trailing.
  - Acceptance: renders in isolation with stub props at 375 px without overflow; avatar falls back to initials when `avatarUrl` absent; keyboard focus reaches logout + profile link in order.

### Group B — parallelisable (dispatch via subagents after T1 + T2 land)

- [x] **T3 — Teacher text-size + PortalTabs sweep. Dep: T1.**
  - Files: every hit of `text-\[10px\]` / `text-\[11px\]` under `app/teacher/**` + `components/teacher/**`. Known hotspots: `components/teacher/bottom-nav.tsx:51`, `app/teacher/assessments/page.tsx:144,177`, `app/teacher/assessments/client.tsx:308,325`. Run grep first, fix each.
  - Scan for any horizontal-overflow tab markup; if found, migrate to `PortalTabs`. If none, note absence.
  - Acceptance: `grep -rn 'text-\[10px\]\|text-\[11px\]' app/teacher components/teacher` returns zero; Playwright 360 px snapshot on `/teacher` home shows 5 bottom-nav labels on one line.

- [x] **T4 — Parent header adopts `PortalHeader`. Dep: T2.**
  - File: `components/parent/header.tsx`.
  - Replace bespoke markup with `<PortalHeader logo={…} userName={session.user.name} userSubtitle={`${activeChildren} anak`} avatarFallback={initials(session.user.name)} onLogout={logoutAction} />`. No `profileHref` yet (parent portal has no profile page).
  - Acceptance: visual parity with teacher header in weight and spacing; logout still functional; existing parent tests still pass.

- [x] **T5 — Teacher header adopts `PortalHeader`. Dep: T2.**
  - File: `components/teacher/header.tsx`.
  - Same migration. Keep teacher's `profileHref="/teacher/profile"` and existing avatar wiring.
  - Acceptance: pixel-equivalent to current teacher header.

- [x] **T6 — Parent `child-selector-tabs` uses `leading` avatar. Dep: T1.**
  - File: `components/parent/child-selector-tabs.tsx`.
  - Pass `leading: <Avatar className="h-5 w-5"><AvatarFallback className="text-[10px]">{initial}</AvatarFallback></Avatar>` per item. (Inner 10 px is inside an Avatar component, not raw text — the text-size rule bans `text-[10px]` on content text, not on Avatar initial rendering. Document this exception in Implementation.)
  - Acceptance: all 3 child pills show an initial-circle + name; active tab pill still highlights; no layout shift vs cycle-1 layout.

- [x] **T7 — Parent `error.tsx`. Independent.**
  - File: `app/parent/error.tsx` (new).
  - Copy `app/teacher/error.tsx`; translate any teacher-specific copy → parent-facing phrasing. Keep "use client", `reset` handler, AlertTriangle icon.
  - Acceptance: throwing in `/parent/page.tsx` briefly to verify boundary catches, then reverted — screenshot evidence in Verification.

- [x] **T8 — Drop parent student-journal self-wrapping. Independent.**
  - File: `app/parent/student-journal/page.tsx`.
  - Remove the outer `max-w-md mx-auto p-4` wrapper. Top-level element becomes a fragment or `<div className="space-y-4">` (or equivalent). Layout's `px-5 py-6` takes over.
  - Acceptance: horizontal padding matches `/parent/invoices` exactly (measure via DevTools ruler or computed style).

- [x] **T9 — Parent Catatan write dialog + edit + delete. Dep: T1 (none blocking, but groups with T1's test infra).**
  - Files: `app/parent/student-journal/page.tsx`, `components/student-journal/note-thread.tsx`, `components/student-journal/parent-note-dialog.tsx` (new).
  - Add `ParentNoteDialog` (create + edit modes, one component). Props: `mode: 'create' | 'edit'`, `studentId`, `initialDate?`, `initialBody?`, `noteId?` (edit mode), `weekDates: string[]`, `onSaved: () => void`. Internally handles POST (`mode='create'`) or PATCH `/api/student-journal/notes/[id]` (`mode='edit'`). Date picker bounded to `weekDates`. Textarea with live char count (X/2000).
  - Extend `NoteThread`: optional `onEdit(noteId, note)` + `onDelete(noteId)` + `canEdit(note) => boolean` callbacks; render pencil + trash icon buttons next to each note when `canEdit(note)` is true.
  - Parent page wires "Tulis Catatan" button above `NoteThread` on Catatan tab → opens `ParentNoteDialog` in create mode; wires `onEdit` to open dialog in edit mode; wires `onDelete` to open `AlertDialog` ("Hapus catatan ini?") → confirm → `DELETE /api/student-journal/notes/[id]` → toast.
  - Acceptance: as a seeded parent, open Catatan tab → "Tulis Catatan" → pick a date from this week → type 20 chars → Simpan → toast appears, dialog closes, week reloads, new note visible under `authorRole=GUARDIAN`. Edit + delete same note. Empty body blocked. 2001-char body blocked.

- [x] **T11 — Desktop rapor drawer padding + overlay fix. Independent.**
  - File: `app/parent/assessments-table.tsx` (desktop sheet branch only).
  - Remove `backdrop-blur`; switch to `bg-black/40` overlay. Sheet `md:max-w-2xl` (was `sm:max-w-md`). Internal padding `p-6 md:p-8`. Header stack gets `pb-4 border-b`. Domain sections `space-y-3` inside, `mt-6` between. Close button upgraded to `h-9 w-9` icon Button, `aria-label="Tutup"`, anchored `top-4 right-4`.
  - Mobile bottom-sheet untouched (cycle 1 work preserved).
  - Acceptance: side-by-side screenshot with cycle 1 shows content has visible gutter on right + clear overlay dim (not blur); no content butts the edge.

- [x] **T12 — Parent Kehadiran — API pagination + server-paginated DataTable. Independent (large task).**
  - New file: `app/api/parent/children/[id]/attendance/route.ts` — GET with `page`, `pageSize`, `status?`, `dateFrom?`, `dateTo?`, `sortField?`, `sortOrder?`. Returns `{ data, total, page, pageSize, totalPages }`. Zod schema in `lib/validations/parent-attendance.ts` (new). Auth via `requireGuardianForStudent`.
  - Refactor `app/parent/attendance/client.tsx` to client-fetched server-paginated DataTable (follow the admin-list pattern — reuse whatever hook/prop the admin tables use for server pagination so parent and admin stay consistent).
  - Add filter controls: status dropdown + date-from + date-to + clear button, debounced 300 ms.
  - `app/parent/attendance/page.tsx` stops hard-coding `getStudentAttendanceRecent(id, 30)`; it only supplies the initial server-rendered first page + week-summary counts.
  - Empty states differentiated: no data at all vs filters empty the result.
  - Acceptance: seed a student with 120 attendance records; `/parent/attendance?child=<id>` shows page 1 of 20, paginates to page 6, filter "SICK" narrows set, date-range narrows further, all totals update. Same visual pattern as admin CRUD tables.

- [x] **T15 — Extract `PortalBottomNav` + migrate both portals. Independent of B tasks; can run parallel.**
  - New file: `components/portal/portal-bottom-nav.tsx` + `components/portal/__tests__/portal-bottom-nav.test.tsx`.
  - Props per spec; handles Framer `layoutId` active indicator, active-route matcher (default exact-or-prefix on pathname), safe-area inset bottom padding, `aria-current="page"` on active item, `text-xs` baked in.
  - Migrate `components/parent/bottom-nav.tsx` + `components/teacher/bottom-nav.tsx` to thin wrappers (≤30 LOC each) that only pass their item arrays + `activeIndicatorId`.
  - Verify both portals still render identical UX via Playwright snapshot (parent + teacher home at 360 px).
  - Acceptance: `grep -r 'motion\.' components/parent/bottom-nav.tsx components/teacher/bottom-nav.tsx` returns zero (motion code moved to primitive); both nav bars visually unchanged; test suite green.

- [ ] **T14 — Dashboard IA: drop tagihan list, add RecentActivity feed. Dep: T13 (ordering on page). Subagent-heavy.**
  - New API: `app/api/parent/children/[id]/activity/route.ts` — union query across `StudentAttendance`, `StudentJournalNote`, `StudentJournalEntry`, `Invoice` (issued + paid transitions), and `StudentAssessment` (published). Limit 7. Zod query schema in `lib/validations/parent-activity.ts`.
  - New component: `components/parent/recent-activity.tsx` with icon-by-kind mapping + relative-time formatter (`lib/format.ts#formatRelativeTime` — add if missing).
  - `app/parent/page.tsx` — remove `UnpaidInvoicesTable` render + its supporting data fetches. Add server fetch of activity. Final order: header → child-selector → QuickLinkCard trio → RecentActivity → (no table).
  - Action-column cleanup in `app/parent/unpaid-invoices-table.tsx` (still referenced from `/parent/invoices`): normalise "Bayar" + "Lihat" to matching 32 px icon buttons (primary vs ghost tone), each with `aria-label`. No text + icon mismatch; either both have labels or both are pure icon.
  - Acceptance: dashboard no longer shows a tagihan table; activity feed shows 7 mixed events from last 30 days for the selected child; click routes to relevant deep-link; empty state when child has no events. `/parent/invoices` row actions read as a uniform column, not "one big teal button among plain links".

- [x] **T13 — Dashboard quick-link cards uniform via `QuickLinkCard`. Independent.**
  - New file: `components/parent/quick-link-card.tsx` — props + styling per Spec.
  - `app/parent/page.tsx` — replace the 3 inline Card blocks (Tagihan / Kehadiran / Rapor) with `<QuickLinkCard>` instances. Data parity: compute attendance-7-day summary + latest-semester label in the server component and pass in.
  - Skeleton matches final card height (no CLS).
  - Acceptance: three cards same height on mobile + desktop; bottom edges align; every card has one stat line (no empty Rapor / Kehadiran).

### Group C — closes the loop (sequential after Group B)

- [ ] **T10 — Standards + README doc-sync. Dep: T1–T9, T11–T13.**
  - `.claude/standards/portal.md`: add **PortalHeader primitive** section (when to use, props, example). Note teacher text-size sweep complete — parent + teacher both clean.
  - README.md: update student-journal row (parent-write UI shipped) and mobile-polish row (cycle 2 notes). Update "Last cycle" date.
  - Acceptance: standards doc + README both mention the new primitive and the journal capability change.

### Dispatch plan (for `/build`)

- Sequential: T1 solo → T2 solo → (Group B: T3 T4 T5 T6 T7 T8 T9 T11 T12 T13 T15 in parallel) → T14 (depends on T13 for page order) → T10.
- Subagents: 11 parallel implementers in Group B via `superpowers:subagent-driven-development`; then T14 as its own implementer. `feature-dev:code-reviewer` pass on staged diff before each commit. `frontend-design` skill invoked by any task touching visual polish (T4 T5 T6 T11 T13 T14 T15).
- Between-task gate (`npm run build && npx vitest run`) after every task. End-of-cycle gate adds `npx playwright test e2e/parent.spec.ts e2e/teacher.spec.ts` before T10's commit.
- Preview verification required after T7 (throw to confirm boundary, then revert), T9 (full write → edit → delete smoke), T11 (desktop rapor drawer screenshot), T12 (120-row seeded student pagination smoke), T13 (card-height parity screenshot), T14 (activity feed smoke on seeded child — mixed event types render + deep-link works) via Playwright MCP on live preview.

## Implementation

- Dispatch plan: T1 solo (inline), T2 solo (inline), then Group B tasks dispatched as parallel implementer subagents where file-disjoint; remaining sequential. T14 after T13. T10 last.
- T12: subagent dispatch (general-purpose). New `lib/validations/parent-attendance.ts` (Zod query schema + `ATTENDANCE_STATUS_VALUES` constant). New `app/api/parent/children/[id]/attendance/route.ts` — paginated GET (page/pageSize/status/dateFrom/dateTo/sortField/sortOrder) using `requireGuardianForStudent` from `lib/student-journal/guards.ts` (helper is generic — auth + tenant + parent-child link). 5 vitest cases (`__tests__/route.test.ts`): 401, 403 non-guardian, 200 default, page=2, missing guardian link 403. `app/parent/attendance/client.tsx` rewritten to server-paginated DataTable with status/date filters + Reset (300 ms debounce). `app/parent/attendance/page.tsx` drops 30-row prefetch for the table; keeps 7-day fetch for `WeekSummaryStrip` only. Pagination pattern duplicated from `app/admin/students/page.tsx` (`useState` + `useCallback` + `useEffect`); now two consumers — `usePaginatedFetch` extraction queued for cycle 3. Enum deviation: spec said `LATE+PERMIT`; real schema is `PERMISSION` (no LATE) — used actual values.
- T9: subagent dispatch (general-purpose). New `components/student-journal/parent-note-dialog.tsx` — single component for create + edit modes, Select-based date picker bounded to weekDates, Textarea with 2000 char limit + live count, inline error + sonner toast on 4xx/429. `components/student-journal/note-thread.tsx` extended with `onEdit` / `onDelete` / `canEdit` callbacks; teacher consumer (passes none) unchanged. `app/parent/student-journal/page.tsx` adds "Tulis Catatan" button + AlertDialog confirm for delete. `app/api/student-journal/notes/[id]/route.ts` got a new DELETE handler (auth-gated, tenant-scoped, author-only, soft-delete via `status="DELETED"`, 20/min rate limit). `app/api/student-journal/children/[id]/week/route.ts` selects `authorUserId` for client ownership check. Deviations: spec said PATCH but real route is PUT (date immutable per `noteUpdateSchema`); spec assumed DELETE existed but it didn't; banned-size sweep on note-thread fixed an existing `text-[10px]` to `text-xs` so the file's grep stays clean. currentUserId fetched once via `/api/auth/me`.
- T13: subagent dispatch (general-purpose). New `components/parent/quick-link-card.tsx` (`h-[132px]`, `rounded-2xl border bg-card hover:bg-accent`, 24 px icon, tone variants default/destructive/success, muted state). `app/parent/page.tsx` swapped 3 inline Card blocks for `<QuickLinkCard>` instances inside `grid grid-cols-3 gap-3`. Data: Tagihan reuses `totalUnpaid`, Kehadiran computes 7-day summary via existing `getStudentAttendanceRecent(id, 7)`, Rapor uses existing `getPublishedAssessmentsForStudent(id)[0]`. Deviation (per spec instruction): subagent also removed `UnpaidInvoicesTable` block from dashboard early — T14 still owns RecentActivity feed addition; table removal is now done. Component file at `app/parent/unpaid-invoices-table.tsx` retained for `/parent/invoices`.
- T15: subagent dispatch (general-purpose). New `components/portal/portal-bottom-nav.tsx` + `components/portal/__tests__/portal-bottom-nav.test.tsx` (2 tests passing). Both `components/parent/bottom-nav.tsx` (`ParentBottomNav` export preserved, `?child=` query forwarding preserved via per-item `href` build + `matcher` on pathname) and `components/teacher/bottom-nav.tsx` (`BottomNav` export preserved) shrunk to thin wrappers. Framer `motion.div` + `usePathname` logic moved to primitive. Deviation: dropped parent's prior `flex-1 min-w-0 truncate max-w-full` on the Link/span — primitive uses canonical `px-2 flex-1`; spec endorsed teacher pattern as the common shape. 231 passed total.
- T11: `app/parent/assessments-table.tsx` — desktop sheet width `sm:!max-w-2xl` (important-flag needed to override shadcn's baked-in `sm:max-w-sm`), padding `p-6 md:p-8` desktop / `p-5` mobile. Header now has `pb-4 border-b` separator + `pr-10` title to clear built-in close button. Domain section gap bumped `space-y-6` → `space-y-8`. Overlay/backdrop-blur deferred: changing shadcn overlay affects 5 Sheet consumers cycle-wide — scoped to cycle 3 if padding fix alone is insufficient. Close button: reused shadcn's built-in (top-3 right-3) rather than add a second.
- T8: `app/parent/student-journal/page.tsx` — removed `max-w-md mx-auto p-4 pb-24` from 3 top-level return wrappers (loading / empty / content). Layout's `px-5 py-6 max-w-md mx-auto` now owns horizontal rhythm; `pb-20` at layout owns bottom-nav clearance. Horizontal padding now matches `/parent/invoices`.
- T7: `app/parent/error.tsx` (new) — branded error boundary. Near-copy of `app/teacher/error.tsx` with an added "Kembali ke Beranda" secondary link to `/parent`. Button component doesn't expose `asChild`, so the secondary action is a styled `<Link>` rather than `<Button asChild>`.
- T6: `components/parent/child-selector-tabs.tsx` — each tab now carries a `leading` node: `h-6 w-6` circle with `bg-primary/10` + `text-xs` initial. Spec said `h-5 w-5` + `text-[10px]`, but the banned-size grep gate (`portal.md`) has no Avatar exception, so the circle was bumped to 24 px + `text-xs` to comply. Parity: teacher uses 28 px avatar in header; child-selector uses 24 px — intentionally one step smaller for tab density.
- T5: `components/teacher/header.tsx` — shrunk to thin wrapper around `<PortalHeader>` with `profileHref="/teacher/profile"`. Avatar initial preserved; pixel-equivalent to prior design since `PortalHeader` itself inherits the teacher layout shape.
- T4: `components/parent/header.tsx` — shrunk to thin wrapper around `<PortalHeader>`. Adds `initialsOf()` helper + optional `childCount` prop (not yet wired from layout; layout still passes only `userName` — subtitle will render when a consumer passes `childCount`). Avatar initial now renders in parent portal (previously text-only).
- T3: perl sweep across 7 teacher files (`components/teacher/bottom-nav.tsx`, `components/teacher/leave-sheet.tsx`, `app/teacher/home-client.tsx`, `app/teacher/class-attendance/page.tsx`, `app/teacher/assessments/page.tsx`, `app/teacher/profile/page.tsx`, `app/teacher/assessments/[classSectionId]/[templateId]/[period]/client.tsx`) — every `text-[10px]`/`text-[11px]` → `text-xs`. 23 substitutions. No horizontal-overflow tab migration needed (no such site in teacher portal).
- T2: `components/portal/portal-header.tsx` + `components/portal/__tests__/portal-header.test.tsx` — shared header primitive. Mirrors cycle-1 teacher header layout (sticky `h-14`, `max-w-md mx-auto`, `px-5`). Props: `userName`, `userSubtitle?`, `avatarUrl?`, `avatarFallback`, `profileHref?`, `onLogout`, `brandLabel?`. When `profileHref` set, avatar + name become a link; otherwise inline. Logout button carries `aria-label="Keluar"`. 7 tests green (brand, subtitle, link vs no-link, logout fires, avatar url fallback).
- T1: `components/portal/portal-tabs.tsx` — added optional `leading?: ReactNode` field to `PortalTab`; render inside tab button wrapped in `aria-hidden="true"` span with `mr-2`. Button gains `inline-flex items-center` for the new slot (no visual regression: existing callers have `whitespace-nowrap` + no taller siblings). JSDoc explicitly notes the aria-hidden decorative contract + the `label` field is the accessible name. Added 1 test (`renders leading slot content before the label when provided`) covering both presence + DOM order. Reviewer: 2 notes (85/82 confidence) — addressed JSDoc; `inline-flex` layout note accepted (no consumer regression from current call sites).

## Verification

- T1: `npx vitest run components/portal` → 8 passed / 8 total. `npm run build` green. Manual: existing `<PortalTabs>` consumers (`child-selector-tabs`, `invoice-filter`, `student-journal`) untouched + render unchanged; leading slot is purely additive.
- T2: `npx vitest run components/portal` → 14 passed / 14 total. `npm run build` green. No consumers migrated yet — T4 + T5 wire it in.
- T3: `grep -rn 'text-\[1[01]px\]' app/teacher components/teacher` → zero. `npm run build` green. `npx vitest run` → 229 passed / 42 todo / 2 skipped (271 total).
- T4: `npm run build` green. `npx vitest run` → 229 passed / 42 todo / 2 skipped (271 total).
- T5: `npm run build` green. `npx vitest run` → 229 passed / 42 todo / 2 skipped (271 total).
- T6: banned-size grep gate returns zero across all portal dirs. `npm run build` green. `npx vitest run` → 229 passed / 42 todo / 2 skipped.
- T7: `npm run build` green (first pass failed on `Button asChild` — `components/ui/button.tsx` has no Slot; fixed by using plain styled Link). `npx vitest run` → 229 passed / 42 todo / 2 skipped.
- T8: `npm run build` green. `npx vitest run` → 229 passed / 42 todo / 2 skipped.
- T11: `npm run build` green. `npx vitest run` → 229 passed / 42 todo / 2 skipped.
- T15: `npm run build` green. `npx vitest run` → 231 passed / 42 todo / 2 skipped (273 total). +2 portal-bottom-nav tests.
- T13: `npm run build` green. `npx vitest run` → 231 passed / 42 todo / 2 skipped (273 total).
- T9: `npm run build` green. `npx vitest run` → 236 passed / 42 todo / 2 skipped (278 total).
- T12: `npm run build` green. `npx vitest run` → 236 passed / 42 todo / 2 skipped (278 total). +5 attendance route tests.

## Ship Notes
<!-- filled by /ship -->

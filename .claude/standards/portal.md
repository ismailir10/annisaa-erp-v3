# Portal Consistency Standard

> Loaded on demand by `/build` when staged paths match `app/teacher/**`, `app/parent/**`, `app/**/layout.tsx`, `components/{teacher,parent}/**`, or `lib/format.ts`.

> Admin, Teacher, and Parent portals MUST use the same Shadcn components and patterns.

## All Portals Must Use:

| Need | Use | NEVER |
|------|-----|-------|
| Data display | `DataTable` (if >10 items) or Card list (if <10) | Custom divs with `.map()` |
| Status display | `StatusBadge` | Inline `Badge` with hardcoded colors |
| Empty state | `EmptyState` component | Plain `<p>` or `<div>` |
| Loading state | Shadcn `Skeleton` | `animate-pulse` divs |
| Currency | `formatRupiah()` from `@/lib/format` | Inline `.toLocaleString()` |
| Dates | `formatDate()` / `formatDateShort()` from `@/lib/format` | Inline `new Date().toLocaleDateString()` |
| Time | `formatTime()` from `@/lib/format` | Inline formatting |
| Colors | CSS variables (`text-primary`, `text-destructive`, etc.) | Hardcoded hex (`text-[#5DB4B8]`, `bg-[#00B37E]`) |
| Errors | `toast.error()` from sonner | `alert()` or `console.error()` only |
| Confirmations | `ConfirmDialog` | `window.confirm()` |
| Forms | `FormField` + Zod validation | Raw `Label` + `Input` |

## Portal Navigation Standard

**Teacher Portal** (mobile-first, max-w-md):
- Header: logo + school name + user name + logout button
- Bottom nav: 5 tabs with icons + labels + active indicator
- Content: centered `max-w-md`

**Parent Portal** (mobile-first, max-w-md — MUST match teacher pattern):
- Header: logo + school name + user name + logout button (same as teacher)
- Bottom nav: 4 tabs (Beranda, Tagihan, Kehadiran, Rapor) with icons + active indicator
- Content: centered `max-w-md` (NOT max-w-2xl — parents are mobile users)
- Logout: accessible from header (same pattern as teacher)

**Both portals MUST have:**
- Active state on current tab (teal underline + icon color)
- Logout button in header with `title="Keluar"` for accessibility
- Framer Motion `layoutId` for smooth active indicator animation
- Safe area padding for mobile (`safe-area-bottom` on bottom nav)

## Empty State Contract

**Every conditional list render MUST have an explicit else branch that renders visible content.** Rendering nothing in the empty case is a Playwright test failure waiting to happen — every E2E test asserts visible text on the page.

```tsx
// CORRECT — always render something
{items.length > 0 ? (
  <ul>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>
) : (
  <EmptyState title="Belum ada data" description="Data akan muncul setelah ditambahkan" />
)}

// WRONG — renders literally nothing when empty (test will fail)
{items.length > 0 && (
  <ul>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>
)}
```

**Rule:** If a page or component conditionally renders a list based on fetched data, it MUST render an `<EmptyState>` or at minimum visible text in the empty branch. This applies to all portals (admin, teacher, parent) and all page types (list pages, detail pages, dashboard cards).

## Portal Text-Size Scale

Target device for parent + teacher portals: mid-range Android at 375 px viewport, arm's-length reading, sometimes 4G and sunlight.

**Minimum text size: `text-xs` (12 px).** The following classes are BANNED in `app/parent/**`, `app/teacher/**`, `components/parent/**`, `components/teacher/**`, `components/portal/**`:

- `text-[10px]`
- `text-[11px]`

Use the standard Tailwind scale only. When 12 px still feels too dense, loosen the surrounding layout (padding, line-height, grid columns) rather than shrinking text.

Rationale: screenshots + audits surfaced that labels at 10 px were consistently missed by the target persona (Pak Budi, PAUD/TKIT parent) and failed WCAG AA contrast-size combinations on muted-foreground. Codified 2026-04-21 in cycle `parent-ux-cycle-1`.

Grep gate (should return zero):
```bash
grep -rn 'text-\[10px\]\|text-\[11px\]' app/parent app/teacher components/parent components/teacher components/portal
```

## PortalTabs Primitive

Shared horizontal-scroll tab bar for parent + teacher portals. Located at `components/portal/portal-tabs.tsx`.

**Use it whenever** you render >2 horizontal options that may overflow the 375 px viewport (child selector, filter tabs, segmented status filters, etc.). Replaces hand-rolled `flex gap-2 overflow-x-auto` patterns.

**Props:**

| Prop | Type | Notes |
|---|---|---|
| `items` | `{ id, label, secondary?, count? }[]` | `secondary` renders as muted `text-xs`; `count` renders as a badge pill |
| `activeId` | `string` | Controlled — consumer owns state |
| `onSelect` | `(id: string) => void` | Fires on click AND on keyboard nav |
| `variant` | `'pills' \| 'underline'` | Default `pills` |
| `ariaLabel` | `string?` | Applied to the `role="tablist"` container |

**Behaviour:**
- Horizontal scroll with edge-fade mask so truncated content hints at more.
- Active tab auto-scrolls into view (`scrollIntoView({ block: 'nearest', inline: 'center' })`).
- Keyboard: ArrowLeft / ArrowRight wrap-around, Home / End jump to ends.
- Roving tabindex, `role="tablist"` / `role="tab"` / `aria-selected` per WAI-ARIA.
- No internal `activeId` state — fully controlled.

**Example:**

```tsx
<PortalTabs
  items={[
    { id: "all", label: "Semua", count: 5 },
    { id: "unpaid", label: "Belum Bayar", count: 2 },
    { id: "partial", label: "Dibayar Sebagian", count: 1 },
  ]}
  activeId={value}
  onSelect={setValue}
  variant="pills"
  ariaLabel="Filter tagihan"
/>
```

**Consumer migration status (as of 2026-04-21):**
- Parent: `child-selector-tabs`, `invoice-filter`, `student-journal` child pills → migrated in cycle `parent-ux-cycle-1`.
- Teacher: pending (cycle 2).

## Error Handling Standard

Every `fetch()` call MUST check response:
```tsx
const res = await fetch("/api/...");
if (!res.ok) {
  const err = await res.json().catch(() => ({}));
  toast.error(err.error || "Terjadi kesalahan");
  return;
}
const data = await res.json();
```

Never silently ignore errors: `.catch(() => {})` is forbidden.

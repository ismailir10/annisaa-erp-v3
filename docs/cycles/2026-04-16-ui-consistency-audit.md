# UI Consistency Audit — Error Handling & Date Formatting

## Context

Full audit of admin, teacher, and parent portals against CLAUDE.md standards. Teacher and parent portals are highly consistent (~97% compliant). Admin portal has several concrete violations that are user-visible or crash-risk:

1. **Attendance page** — `Promise.all` fetch with no `res.ok` checks. On API failure, calling `.json()` on an error response sets `data` / `campuses` to `{ error: "..." }` instead of arrays. Downstream `.filter()` calls throw and the page crashes silently.
2. **Leave page** — DataTable and review dialog display raw ISO date strings (`2026-04-01`) via `{r.startDate} — {r.endDate}` — no `formatDateShort()`. Users see machine dates.
3. **Invoices page** — Xendit session creation (`handleSendPaymentLinks`) calls `.json()` before checking `res.ok`. On 5xx from Xendit, `d.created` is undefined and errors go unreported. Also: `dueDate` column shows raw ISO string without formatting.
4. **Fees page** — `fetchAll` (initial load of components/programs/years), `fetchStructure` (load fee structure for selected program/year), and `toggleComponent` (toggle enable/disable) all lack error handling. Failed fetches silently produce empty dropdowns or stale data with no user feedback.
5. **Silent "non-critical" catches** — `.catch(() => { /* stats are non-critical */ })` pattern across 8 files suppresses errors without logging, violating CLAUDE.md rule: "Never silently ignore errors: `.catch(() => {})` is forbidden."

No issues found in teacher or parent portals — both pass all navigation, component, color, and formatting standards.

## Spec

### Acceptance Criteria

- [ ] `app/admin/attendance/page.tsx`: `fetchData` wraps Promise.all in try/catch + checks `res.ok` before calling `.json()`. Toast on error, early return.
- [ ] `app/admin/leave/page.tsx`: All raw `{startDate}` / `{endDate}` display uses `formatDateShort()`. Both the DataTable cell (L223) and the review dialog (L356-357) fixed.
- [ ] `app/admin/invoices/page.tsx`: `handleSendPaymentLinks` checks `if (!res.ok)` before `.json()`. DataTable due-date cell uses `formatDateShort(row.original.dueDate)`.
- [ ] `app/admin/fees/page.tsx`: `fetchAll`, `fetchStructure`, and `toggleComponent` all have proper error handling (try/catch or `if (!res.ok)` + `toast.error()`).
- [ ] All `.catch(() => { /* non-critical */ })` patterns converted to `.catch((err) => console.error("[stats]", err))` across 8 files.
- [ ] `npm run build && npx vitest run` passes after all changes.

### Out of Scope

- Campuses page raw `<button>` pattern (functional, low visibility)
- Fees guidance card (Card + p — not a list, debatable whether EmptyState applies)
- DataTable action column gaps (CRUD completion sweep — separate cycle)

## Tasks

- [x] T0: Create cycle doc
- [x] T1: Fix attendance page critical fetch error handling
- [x] T2: Fix leave page raw ISO date display (DataTable + review dialog)
- [x] T3: Fix invoices page xendit res.ok guard + raw dueDate column
- [x] T4: Fix fees page missing error handling (fetchAll, fetchStructure, toggleComponent)
- [x] T5: Convert silent non-critical catches to console.error (8 files)
- [x] T6: Run end-of-cycle gate (`npm run build && npx vitest run`)

## Implementation

### T1 — `app/admin/attendance/page.tsx`
- Added `toast` import from `sonner`
- Wrapped `Promise.all` in `try/catch` with `if (!attRes.ok || !campRes.ok)` guard
- Early return + `toast.error()` on failure; `finally` block clears loading state

### T2 — `app/admin/leave/page.tsx`
- DataTable date cell (L223): `{r.startDate} — {r.endDate}` → `{formatDateShort(r.startDate)} — {formatDateShort(r.endDate)}`
- Review dialog (L356-357): `{reviewTarget?.startDate}` / `{reviewTarget?.endDate}` → guarded `formatDateShort()` calls

### T3 — `app/admin/invoices/page.tsx`
- `dueDate` column (L98): wrapped with `formatDateShort()`
- `handleSendPaymentLinks`: added `if (!res.ok)` guard before `.json()` with structured error extraction and early return

### T4 — `app/admin/fees/page.tsx`
- `fetchAll`: converted from bare `Promise.all().then().then()` to `try/catch` with individual `res.ok` checks and `toast.error()` on failure
- `fetchStructure`: added `if (!res.ok)` check + `try/catch` + `finally` for `setStructureLoading(false)`
- `toggleComponent`: added `if (!res.ok)` check with `toast.error()` before calling `fetchAll()`

### T5 — Silent catches (8 files)
- `app/admin/employees/page.tsx` (2 catches)
- `app/admin/leave/page.tsx` (1 catch)
- `app/admin/invoices/page.tsx` (2 catches)
- `app/admin/payroll/page.tsx` (1 catch)
- `app/admin/students/page.tsx` (1 catch)
- `app/admin/admissions/page.tsx` (2 catches)
- `app/admin/settings/users/page.tsx` (2 catches)

All converted from `.catch(() => { /* non-critical */ })` to `.catch((err) => console.error("[module] context", err))`.

## Verification

| Gate | Result |
|------|--------|
| `npm run build` | ✓ Compiled successfully, 80/80 static pages |
| `npx vitest run` | ✓ 6 files, 69 tests passed |

Manual spot-check: leave page date cells now show formatted dates (e.g. "1 Apr 2026") instead of raw ISO strings.

## Ship Notes

- No migrations — UI-only changes
- No new env vars
- Rollback: revert this commit; no data risk

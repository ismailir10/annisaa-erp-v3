# CRUD Standard Completion — Phase 2

## Context

README lists 7 entities as "partially complete" against the CRUD Standard and 4 as "missing admin UI." An audit of the 7 partials (Program, ClassSection, Admission, AttendanceRecord, PayrollRun, Invoice, StudentAttendance) surfaced a structural finding: the CRUD Standard in CLAUDE.md assumes every entity uses binary `ACTIVE`/`INACTIVE` soft-delete, but three of them (Admission, PayrollRun, Invoice) are state-machine entities where "deactivate" semantically means *cancel* or *void*. The standard as written can't be satisfied for them — and forcing it would be wrong. AttendanceRecord is a daily event log, not a managed entity; standard CRUD also doesn't fit. The intended outcome of this cycle: (1) evolve the CRUD Standard in CLAUDE.md to formalize the ACTIVE/INACTIVE vs state-machine distinction so future work has clear guidance, (2) close real, concrete gaps (missing Zod validation on PUT routes, Program using a legacy `isActive` boolean, state-machine entities missing their terminal row action), and (3) bring README's CRUD status matrix back to truth. This keeps the repo honest and unblocks the "CRUD completion" roadmap line without forcing a square-peg/round-hole refactor.

## Spec

**Acceptance criteria**

- [ ] CLAUDE.md CRUD Standard documents two sub-standards: **binary soft-delete** (ACTIVE/INACTIVE entities) and **state-machine** (terminal action: Cancel/Void/etc.), with explicit list of which entities belong to each.
- [ ] Every `PUT /api/{entity}/[id]` in scope enforces Zod validation (`lib/validations/<entity>.ts`): Program, ClassSection, Admission, Invoice.
- [ ] Program model migrated from `isActive: Boolean` to `status: String` (ACTIVE/INACTIVE). List, detail, and API all read `status`; seed data updated; existing rows backfilled.
- [ ] Invoice admin list has a **Void** row action (dropdown) wired to `POST /api/invoices/[id]/void`, behind `ConfirmDialog`, disabled once `status IN (PAID, CANCELLED)`.
- [ ] Admission admin list has a **Batalkan** (Cancel) row action wired to `PUT /api/admissions/[id]` with `status: CANCELLED`, behind `ConfirmDialog`, disabled once `status = CANCELLED`.
- [ ] README CRUD completion matrix updated: state-machine entities move from "Partial" to "Complete (state-machine)" once their terminal action ships; Program stays "Complete" post-migration; overall percentage recalculated.
- [ ] Every admin list page's DataTable action column conforms to the standard: primary **View** button (Lihat) + ⋮ dropdown with **Edit** and **Deactivate/Cancel/Void** (whichever terminal action fits the entity). Misssing actions are added; stray custom action columns are normalized to `<DataTableRowActions>`.
- [ ] End-of-cycle gate green: `npm run build && npx vitest run && npx playwright test`.

**Non-goals**

- AttendanceRecord list CRUD — it's a daily event log; its "override" flow already exists and is correct. Documenting the exception in CLAUDE.md is enough for this cycle.
- PayrollRun standard CRUD — already workflow-driven (DRAFT → APPROVED → SLIPS_SENT) with its own endpoints. Zod hardening on its mutation endpoints is a separate security cycle.
- The 4 "missing admin UI" entities (EmailLog, PayrollItem, InvoiceLine, Payment) — three are nested children managed through their parent; EmailLog is observability. Out of scope.
- Audit logging — next roadmap item, owned by its own cycle.
- Any hard-delete path.

**Assumptions**

1. Program's `isActive` boolean is only read in `app/admin/academic/page.tsx` (line 27 type, line 205) and written in `app/api/programs/[id]/route.ts:25`. No other code branches on it. *(Grep confirmed no `program.isActive` / `where isActive` usage outside these two files.)*
2. Invoice's `/[id]/void` endpoint already exists and is correct — this cycle just wires the UI action to it, not refactors the endpoint.
3. Admission's status state machine already supports `CANCELLED` as a terminal state (confirmed: `status String @default("INQUIRY")` with CANCELLED in the transition set).
4. The "state-machine entity" classification is: Admission, PayrollRun, Invoice, AttendanceRecord, StudentAttendance. Everything else in the CRUD matrix is binary ACTIVE/INACTIVE.
5. StudentAttendance uses `isVoided: Boolean` instead of `status` and that's acceptable — it's documented as the state-machine pattern variant for event logs. No migration this cycle.

→ Correct any assumption now or `/build` proceeds with them.

## Tasks

- [x] **Task 1 — Evolve CRUD Standard in CLAUDE.md.** Rewrite the `## CRUD Standard` section to split into two sub-standards: **"Binary soft-delete entities"** (existing spec: Deactivate row action → PUT with `status: INACTIVE`) and **"State-machine entities"** (terminal row action named for the domain — Void/Cancel/etc. — wired to a domain endpoint; `status` follows the entity's state machine, not ACTIVE/INACTIVE). Include an explicit list of which entities belong to each category. Document that event-log entities (StudentAttendance, AttendanceRecord) use `isVoided` flag instead of `status` and why. *Acceptance: CLAUDE.md CRUD Standard section has two sub-standards with entity lists; `grep "state-machine"` in CLAUDE.md returns the new section.*

- [x] **Task 2 — Add Zod validation on PUT routes.** Create or extend Zod schemas for Program, ClassSection, Admission, Invoice update inputs in `lib/validations/`. Wire each into its `PUT /api/{entity}/[id]` route using the `.safeParse()` + 400 response pattern. *Acceptance: each of the 4 PUT routes calls `.safeParse()` and returns `{ error: "Validation failed", issues: ... }` on invalid input; vitest still green.*

- [x] **Task 3 — Migrate Program from `isActive` to `status`.** Add Prisma migration: add `status String @default("ACTIVE")`, backfill from `isActive` (`UPDATE "Program" SET status = CASE WHEN "isActive" THEN 'ACTIVE' ELSE 'INACTIVE' END`), then drop `isActive`. Update `app/api/programs/[id]/route.ts` and `route.ts` to read/write `status`. Update `app/admin/academic/page.tsx` (type at line 27, row action at line 205) to use `status`. Update `prisma/seed.ts` if it sets `isActive`. *Acceptance: `grep -r "isActive" app/admin/academic app/api/programs prisma/seed.ts` returns no matches; Prisma migration file exists under `prisma/migrations/`; vitest + build green.*

- [ ] **Task 4 — Wire Invoice Void row action.** In `app/admin/invoices/page.tsx`, add a "Batalkan" / "Void" action to the DataTable row dropdown. On click, open `<ConfirmDialog>` ("Batalkan invoice ini?"); on confirm, `POST /api/invoices/[id]/void`; on success, `toast.success()` + refetch. Disable the action when `row.original.status === "PAID"` or `"CANCELLED"`. Use standard error handling (check `res.ok`, surface `err.error`). *Acceptance: clicking Void on a DRAFT/SENT invoice opens confirm → posts → row status becomes `CANCELLED`; action is hidden/disabled on PAID/CANCELLED rows.*

- [ ] **Task 5 — Wire Admission Cancel row action.** In `app/admin/admissions/page.tsx`, add a "Batalkan" action to the row dropdown. On click, open `<ConfirmDialog>` ("Batalkan pendaftaran ini?"); on confirm, `PUT /api/admissions/[id]` with `{ status: "CANCELLED" }`; on success, `toast.success()` + refetch. Disable when `status === "CANCELLED"`. Ensure the existing `DataTableRowActions` call is updated — current code at `line 343` uses a "Deactivate" that sends `status: CANCELLED` already, but uses wrong label; rename and align with state-machine semantics. *Acceptance: Cancel action labeled "Batalkan" (not "Nonaktifkan"); sends `status: CANCELLED`; hidden/disabled on already-CANCELLED rows; vitest green.*

- [ ] **Task 6 — Standardize DataTable action column across all admin list pages.** Audit all 20 admin list pages (`app/admin/**/page.tsx` that use DataTable). For each, verify the actions column uses `<DataTableRowActions>` with: (a) `onView` → navigates to detail page OR opens a view Sheet (required if detail page exists; skip for entities with no detail surface like LeaveRequest approval queue), (b) `onEdit` → opens edit dialog (required for all binary-soft-delete entities; N/A for workflow-only screens), (c) terminal action — `onDeactivate` for binary entities, `onCancel` / `onVoid` for state-machine entities (add these semantic props to `components/ui/data-table-row-actions.tsx` if missing). Fix drift: any page where only a subset of actions is wired gets the missing ones added; any page using a custom action column gets converted. Out of scope: queue/review screens where "actions" are workflow transitions (e.g., payroll approve, leave approve) — those stay as they are but are documented as exceptions in CLAUDE.md. *Acceptance: every admin list page that renders a DataTable of managed entities has the full standard action set; `components/ui/data-table-row-actions.tsx` supports `onCancel` / `onVoid` variants; CLAUDE.md lists the documented exceptions.*

- [ ] **Task 7 — Update README CRUD completion status.** Rewrite the `### CRUD completion status` section (README lines ~57–85). Reclassify Admission, Invoice, StudentAttendance as "Complete (state-machine)"; Program as "Complete (binary)" post-migration; PayrollRun and AttendanceRecord flagged as "Complete (domain workflow — CRUD standard not applicable)". Recompute the overall percentage. Update the "In progress" and "Previous gaps resolved" lists. Link to this cycle doc. *Acceptance: README has no entity listed as "Partial" that this cycle didn't explicitly defer; overall completion % matches new count; link to `docs/cycles/2026-04-19-crud-standard-completion.md` present.*

## Implementation
- Task 1: Evolve CRUD Standard in CLAUDE.md — `CLAUDE.md` — split `## CRUD Standard` into three categories: A (binary soft-delete, default), B (state-machine: Admission/Invoice/PayrollRun with Cancel/Void terminal actions), C (event-log: AttendanceRecord/StudentAttendance with `isVoided` flag). Added entity roster per category, API patterns per category, and a "which category fits" decision tree.
- Task 2: Zod on PUT routes — `lib/validations/{program,class-section}.ts` (new), `lib/validations/invoice.ts` (extended with `updateInvoiceSchema`), `app/api/{programs,class-sections,admissions,invoices}/[id]/route.ts` — each PUT now safeParses the body, returns 400 `{ error, issues }` on invalid input. `updateAdmissionSchema` already existed; wired it in. Preserves existing state-transition check in admissions (Zod handles shape; custom code handles transition rules).
- Task 3: Program `isActive` → `status` migration — `prisma/schema.prisma` (Program model), `prisma/migrations/20260419000000_program_isactive_to_status/migration.sql` (new: add status col, backfill from isActive, drop isActive), `app/api/programs/[id]/route.ts` (PUT writes `status`), `lib/validations/program.ts` (removed `isActive` from schema), `app/admin/academic/page.tsx` (type + row-action reads `status === "ACTIVE"`). Pre-existing deactivate action that silently failed (sent `status` to a field that didn't exist) now works end-to-end. Grep across non-generated `app/` + `lib/` returns no remaining `Program.isActive` references. Prisma client regenerated.

## Verification
- Task 1: gates passed (`npm run build` green, `npx vitest run` 116/116). Doc-only edit — no runtime surface to smoke.
- Task 2: gates passed (build green, vitest 116/116). Reviewed existing PUT callers: academic page sends `{ status }` on program/class-section deactivate — Zod accepts. Admissions sends `{ status: CANCELLED }` via existing handleCancel — Zod accepts + state-transition check still enforced. Invoice PUT has no direct UI callers in admin (status transitions happen via `/send`, `/void` endpoints) — Zod-gated now regardless.
- Task 3: gates passed (build green, vitest 116/116). Prisma client regenerated. Migration SQL validated by eye — 3 steps (add col, backfill, drop); no data loss. Ship Notes will call out the migration for runtime.

## Ship Notes
<!-- filled by /ship -->

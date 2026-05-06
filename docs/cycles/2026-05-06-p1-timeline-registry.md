# p1-timeline-registry — TimelineEvent registry + emit middleware + audit SOFT_DELETE/RESTORE bridge

**Type:** scaffold + standards
**Phase:** p1 (cycle 9)
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §4.1 Foundation row + §4.2 visibility tiers + §18.1 phase 1 cycle plan + §18.12 marathon mode

## Context

Phase 1 follow-up cycle, 2 of 3 remaining cycle-6 deferrals. The audit foundation has shipped at staging tip (PR #186, 1e6405f): `lib/audit/write.ts` exports `writeAuditLog(input, tx?)` server-only with PII redaction + tx threading; `defineAction` exposes opt-in `audit?` config; partition trigger + redactor generator + `verify-pii-annotations.sh` CI gate live. The TimelineEvent foundation already lives at HEAD: `prisma/schema.prisma` lines 762-788 declare the `TimelineEvent` model (tenant-scoped, soft-delete YES, GIN index on `payload` from migration `06_audit_timeline`); the `TimelineVisibility` enum (lines 79-83 — `PRIVATE` / `INTERNAL` / `PARENT_VISIBLE`) per spec §4.2; `TimelineEvent.kind` is a `VARCHAR(50)` referencing the registry that this cycle ships, documented as a deferral by the schema comment at lines 749-753 ("`lib/timeline/events.ts` deferred to `p1-scaffold-engine-skeleton`" — re-deferred to this cycle by `p1-scaffold-engine-skeleton` Ship Notes since the audit middleware was a hard prerequisite).

Two consumer call-sites are stubbed waiting on this cycle. `lib/audit/write.ts` does NOT emit timeline events today (audit and timeline are separate by design per spec §4.1: every mutation audits, only feed-visible state changes emit timeline). This cycle wires the SOFT_DELETE / RESTORE bridge so the two systems stay coupled exactly where the spec calls for it. All p2+ CRUD routes will additionally call `emitTimelineEvent` directly from server actions when a state change should be subject-feed-visible (Student admission progressing, Invoice payment received, Employee leave approved). **Marathon mode** (spec §18.12) — full brainstorm skipped, plan derived from foundation spec + cycle 6 / cycle 8 Ship Notes deferral rows.

**Sequential build, no subagent fan-out.** T1→T2→T3 form a tight chain (emit imports from events; write.ts bridge imports from both). T4 (`timeline.md` standards) is independent and could parallelise but is small enough that serial keeps the diff coherent. T5 bundles docs at the end. Subagent dispatch wins on independent tasks; here it would mostly add merge friction.

**No new dependencies.** Registry uses `zod` (already installed via existing validations). Emit middleware reuses `prisma` from `@/lib/db` and `Prisma.TransactionClient` from `@/lib/generated/prisma/client` — same boundary pattern as `writeAuditLog` (no `server-only` package — that npm shim isn't installed in this repo; the `prisma` import is the runtime boundary marker, identical to the audit cycle's reasoning).

Cross-checked design-system.html: N/A (library + standards cycle, no frontend diff). UAT reports: N/A (pre-launch rebuild). Disk monitored — pre-cycle worktree cleanup recommended; ~3 GiB free.

## Spec

### Acceptance criteria

- [ ] `lib/timeline/events.ts` exports the timeline event registry:
  - `TIMELINE_EVENTS` — frozen object literal keyed by kebab-case `<subject>.<verb>` strings.
  - **Type-inference pattern (per spec-time review BLOCKER §1):** declare the literal `as const satisfies Record<string, { subjectKind: string; defaultVisibility: TimelineVisibility; payloadSchema: z.ZodTypeAny }>`. The `satisfies` operator validates structural shape WITHOUT widening the inferred element types — each entry's `payloadSchema` keeps its precise `ZodObject<...>` type, so `z.infer` flows through. Do NOT introduce a separate `TimelineEventEntry` type and assign through it before freezing — that round-trip erases the schema type and makes `TimelineEventPayload<K>` resolve to `any`.
  - Final shape:
    ```ts
    const _TIMELINE_EVENTS_RAW = { /* 8 entries below */ } as const satisfies Record<
      string,
      { subjectKind: string; defaultVisibility: TimelineVisibility; payloadSchema: z.ZodTypeAny }
    >;
    export const TIMELINE_EVENTS = Object.freeze(_TIMELINE_EVENTS_RAW);
    export type TimelineEventKind = keyof typeof TIMELINE_EVENTS;
    export type TimelineEventPayload<K extends TimelineEventKind> = z.infer<
      (typeof TIMELINE_EVENTS)[K]["payloadSchema"]
    >;
    ```
  - **8 initial seed entries** (registry decision per spec-time review MAJOR §4 — `employee.soft-deleted` added as a separate kind from `employee.terminated`; soft-delete is administrative record-archival, termination is an HR state change. Coupling them into one kind muddied semantics. Both ship; bridge map points at `employee.soft-deleted` for the SOFT_DELETE action; `employee.terminated` is reserved for the future explicit termination workflow that the entity cycle will wire via direct `emitTimelineEvent` call):
    - `student.admitted` — subjectKind `Student`, visibility `PARENT_VISIBLE`, payload `z.object({ programId: z.string().optional(), admittedAt: z.string().optional() }).strict()` (placeholder — entity cycle tightens).
    - `student.enrolled` — subjectKind `Student`, visibility `PARENT_VISIBLE`, payload `z.object({ classSectionId: z.string().optional() }).strict()`.
    - `student.soft-deleted` — subjectKind `Student`, visibility `INTERNAL`, payload `z.object({}).strict()` (audit row carries the diff; timeline only carries the existence-of-event signal).
    - `student.restored` — subjectKind `Student`, visibility `INTERNAL`, payload `z.object({}).strict()`.
    - `employee.hired` — subjectKind `Employee`, visibility `INTERNAL`, payload `z.object({ employmentType: z.string().optional() }).strict()`.
    - `employee.soft-deleted` — subjectKind `Employee`, visibility `INTERNAL`, payload `z.object({}).strict()` (record archival; bridge target).
    - `employee.terminated` — subjectKind `Employee`, visibility `PRIVATE`, payload `z.object({ reason: z.string().optional() }).strict()` (HR state change; reserved for direct emit from termination workflow, not the SOFT_DELETE bridge).
    - `note.added` — subjectKind `"*"` sentinel (polymorphic — emit middleware uses caller's `input.subjectKind`), visibility `INTERNAL`, payload `z.object({ text: z.string().min(1).max(2000) }).strict()` (max length per spec-time review NIT §6 — caps GIN index entry size against runaway notes).
  - `RESOURCE_TO_SOFT_DELETE_KIND` exported map (audit→timeline bridge, see §4): `Record<string, { SOFT_DELETE?: TimelineEventKind; RESTORE?: TimelineEventKind }>`. Initial entries: `Student → { SOFT_DELETE: 'student.soft-deleted', RESTORE: 'student.restored' }`, `Employee → { SOFT_DELETE: 'employee.soft-deleted' }` (no `employee.restored` kind ships this cycle — restore semantics for Employee land alongside the entity cycle that needs them; deferral surfaced in Ship Notes).
  - Both `TIMELINE_EVENTS` and `RESOURCE_TO_SOFT_DELETE_KIND` wrapped in `Object.freeze` for runtime immutability beyond TypeScript's `as const` (consistent with cycle 8's `PII_FIELDS` precedent).
- [ ] `lib/timeline/__tests__/events.test.ts` — registry-shape tests:
  1. `TIMELINE_EVENTS` is frozen (`Object.isFrozen` true).
  2. `RESOURCE_TO_SOFT_DELETE_KIND` is frozen.
  3. All 8 kind keys match kebab-case `<subject>.<verb>` regex `/^[a-z]+\.[a-z]+(-[a-z]+)*$/`.
  4. All 8 entries have a `payloadSchema` whose runtime is a Zod schema (`.parse` is a function).
  5. All 8 entries have `defaultVisibility` set to a valid `TimelineVisibility` enum member.
  6. Bridge map values reference only kinds that exist in `TIMELINE_EVENTS` (catches typos at test time — no `student.restored` typo'd as `student.restored-x`).
  7. Bridge map kinds resolve to subjectKind matching the bridge resource — e.g. `Student → student.soft-deleted` and `TIMELINE_EVENTS['student.soft-deleted'].subjectKind === 'Student'`; `Employee → employee.soft-deleted` and `TIMELINE_EVENTS['employee.soft-deleted'].subjectKind === 'Employee'` (catches cross-resource map errors).
- [ ] `lib/timeline/emit.ts` exports `emitTimelineEvent(input, tx?)`:
  - Generic over kind: `<K extends TimelineEventKind>(input: EmitTimelineEventInput<K>, tx?: Prisma.TransactionClient): Promise<void>`.
  - Input shape (exported as `EmitTimelineEventInput<K>`). Per spec-time review MAJOR §3 (cleaner ergonomics): `subjectKind` is **optional** — required only for polymorphic kinds (registry `subjectKind === "*"`); when registry has a concrete value, the caller may omit, and if supplied it MUST match (mismatch throws explicitly rather than silently ignoring):
    ```ts
    {
      tenantId: string;
      actorUserId: string | null; // required-and-nullable, mirrors writeAuditLog
      kind: K;
      subjectKind?: string;       // required iff registry entry's subjectKind === "*"
      subjectId: string;
      payload: TimelineEventPayload<K>;
      visibility?: TimelineVisibility; // override registry default
      occurredAt?: Date;          // defaults to now()
    }
    ```
  - Behavior:
    a. Look up `TIMELINE_EVENTS[kind]`; throw `Error("emitTimelineEvent: unknown kind '<k>'")` if missing.
    b. Validate `input.payload` via `entry.payloadSchema.parse(input.payload)` — surfaces Zod's formatted error path on failure (re-thrown unchanged; do NOT wrap).
    c. Resolve `subjectKind`:
       - If `entry.subjectKind === "*"`: caller MUST supply `input.subjectKind` (non-empty); throw if missing.
       - Else: use `entry.subjectKind`. If the caller also supplied `input.subjectKind` and it differs from the registry value, throw `Error("emitTimelineEvent: subjectKind mismatch for kind '<k>': registry='<r>', input='<i>'")`. If it matches, accept silently.
    d. Resolve `visibility`: `input.visibility ?? entry.defaultVisibility`.
    e. INSERT via `(tx ?? prisma).timelineEvent.create({ data: { ... } })`.
  - Required-field validation matches `writeAuditLog` pattern: explicit non-null + non-empty checks for `tenantId`, `kind`, `subjectId`.
  - Top of file: header comment documenting server-only-via-prisma boundary (same pattern as `writeAuditLog`).
- [ ] `lib/timeline/__tests__/emit.test.ts` — ~10 cases (mocked prisma):
  1. **Happy path** — minimal valid input → `prisma.timelineEvent.create` called once with full payload + registry-resolved `subjectKind` + registry-default `visibility` + `occurredAt = now()`.
  2. **Unknown kind throws** — `kind: 'nope.notreal' as TimelineEventKind` → throws `/unknown kind/`; `prisma.create` not called.
  3. **Payload Zod validation — valid** — `student.admitted` with valid optional fields → succeeds.
  4. **Payload Zod validation — invalid** — `note.added` with `text: ''` → Zod throws (min(1) fails); `prisma.create` not called.
  5. **Visibility default** — emit `student.admitted` without `visibility` arg → row stores `PARENT_VISIBLE` (registry default).
  6. **Visibility override** — emit `student.admitted` with `visibility: 'INTERNAL'` → row stores `INTERNAL`.
  7. **Tx threading** — `tx` arg provided → `tx.timelineEvent.create` called; top-level `prisma.create` not called.
  8. **Required-field validation — tenantId** — empty `tenantId` throws; `prisma.create` not called.
  9. **Required-field validation — kind/subjectId** — parametrized via `it.each` (one case per required field; merges with §8 implementation).
  10. **`occurredAt` override** — explicit `occurredAt: new Date('2026-01-15')` → row stores that exact value (not `now()`).
  11. **Polymorphic subject (`note.added`)** — emit with `subjectKind: 'Invoice', subjectId: 'inv_1'` → registry entry has `"*"` sentinel; row stores `subjectKind: 'Invoice'` (caller-supplied passthrough).
  12. **Polymorphic subject — missing input.subjectKind throws** — emit `note.added` without `subjectKind` arg → throws (registry sentinel demands it); `prisma.create` not called.
  13. **subjectKind mismatch throws** — emit `student.admitted` with `subjectKind: 'Invoice'` (registry says `'Student'`) → throws explicit mismatch error per spec-time review MAJOR §3.
- [ ] `lib/audit/write.ts` — SOFT_DELETE / RESTORE bridge:
  - When `input.action === 'SOFT_DELETE'` or `input.action === 'RESTORE'` AND `RESOURCE_TO_SOFT_DELETE_KIND[input.resource]?.[input.action]` resolves to a kind, call `emitTimelineEvent` after the audit `create` succeeds, in the **same client** (`tx ?? prisma`) for atomic commit/rollback semantics.
  - Bridge fields passed to emit: `tenantId` + `actorUserId` from input; `kind` from map; `subjectKind` **omitted** (registry value is authoritative for non-polymorphic kinds — emit middleware resolves it; bridge-map test §7 already enforces resource→subjectKind alignment); `subjectId` from input.resourceId; `payload: {}` (empty — audit row carries the diff; timeline only signals existence; payload schemas for `*.soft-deleted` / `*.restored` are `z.object({}).strict()` for this contract).
  - **Order matters** — audit insert first (canonical record), timeline emit second (derived view). If timeline insert fails inside a `tx`, the surrounding transaction rolls back including the audit row — desired semantics per spec §4.1.
  - **No-tx atomicity warning (per spec-time review item 2):** the bridge implementation MUST carry an inline comment at the call site documenting that without a `tx` the two writes are non-atomic and a timeline failure leaves a phantom audit row. Exact comment text:
    ```ts
    // NOTE: when no tx is supplied, audit + timeline writes run on the global
    // prisma client without a transaction — a timeline failure here leaves the
    // audit row committed without a matching timeline event. Callers needing
    // atomicity MUST pass tx (see audit-pii.md §4 / timeline.md §6).
    ```
  - **Partial-coverage warning (per spec-time review NIT §5):** when `input.resource` IS in the bridge map but the action key (`SOFT_DELETE` / `RESTORE`) is NOT present (e.g. `RESTORE` on Employee today — no `employee.restored` kind ships this cycle), emit a `console.warn` with the resource + action so future Employee-restore call sites surface a clear diagnostic instead of silently no-op'ing. Exact format: `console.warn(`writeAuditLog bridge: ${resource}.${action} has no timeline kind registered — audit row written, no timeline event emitted`)`. The warn fires only when the resource has SOME bridge entry (i.e. the resource is "known to the bridge"); fully unmapped resources (no entry at all) stay silent.
  - Bridge is **opt-in via map lookup** — fully unmapped resources stay audit-only; `UPDATE` / `CREATE` / `DELETE` / `READ` / `IMPORT` / `EXPORT` actions are ignored regardless of map state (action-gated, not resource-gated).
  - Imports added: `emitTimelineEvent` from `@/lib/timeline/emit`; `RESOURCE_TO_SOFT_DELETE_KIND` from `@/lib/timeline/events`.
- [ ] `lib/audit/__tests__/write.test.ts` — +5 bridge tests in a new `describe("writeAuditLog — timeline bridge")`:
  1. **SOFT_DELETE on mapped resource emits** — `action: SOFT_DELETE, resource: 'Student', resourceId: 'stu_1'` → `prisma.auditLog.create` called once (existing) AND `prisma.timelineEvent.create` called once with `kind: 'student.soft-deleted'` + `subjectKind: 'Student'` + `subjectId: 'stu_1'` + empty payload. Both calls observed on the same client (no `tx` arg → both on `prisma`).
  2. **RESTORE on mapped resource emits** — `action: RESTORE, resource: 'Student', resourceId: 'stu_1'` → same shape with `kind: 'student.restored'`.
  3. **UPDATE on mapped resource does NOT emit** — `action: UPDATE, resource: 'Student'` → `prisma.auditLog.create` called; `prisma.timelineEvent.create` NOT called. Action-gating verified.
  4. **SOFT_DELETE on unmapped resource does NOT emit** — `action: SOFT_DELETE, resource: 'NotInMap'` → audit fires; timeline NOT called; no `console.warn` (resource fully unmapped, not partial-coverage). Resource-side gating verified.
  5. **Partial-coverage RESTORE on Employee warns + does not emit** — `action: RESTORE, resource: 'Employee'` → audit fires; timeline NOT called; `console.warn` called once with the documented message format. Spy via `vi.spyOn(console, 'warn').mockImplementation(() => {})`; restore in `afterEach`. Verifies the partial-coverage diagnostic per spec-time review NIT §5.
  - Test mocks must extend the existing `vi.mock("@/lib/db", ...)` factory: add `timelineEvent: { create: timelineCreateMock }`. The mock for `@/lib/timeline/emit` is **not used** — the bridge calls the real `emitTimelineEvent` which exercises the registry validation. (Alternative: mock `emit` directly. Picked real-emit + mocked-prisma for thicker integration coverage; both layers under test.)
- [ ] `.claude/standards/timeline.md` — new standards file. Sections:
  1. **When to emit** — table mapping caller scenario → kind (state changes the subject's parent/staff/student should see in their feed; NOT every audit row). Explicit contrast with `writeAuditLog`.
  2. **Visibility tiers** — `PRIVATE` / `INTERNAL` / `PARENT_VISIBLE` semantics + when to override the registry default.
  3. **How to add a new kind** — 4-step checklist: extend `TIMELINE_EVENTS` with Zod payload schema → wire emit call sites in the entity cycle → extend `RESOURCE_TO_SOFT_DELETE_KIND` if soft-delete bridge applies → add registry-shape test coverage.
  4. **Polymorphic subject pattern** — `subjectKind` + `subjectId` are string fields; no FK by design (soft-delete semantics + cross-domain feeds). Registry's `"*"` sentinel marks polymorphic kinds (e.g. `note.added`).
  5. **Integration with `writeAuditLog`** — audit-vs-timeline contract: audit logs every mutation; timeline only records feed-visible events. SOFT_DELETE / RESTORE bridge wires the foundational pair automatically via `RESOURCE_TO_SOFT_DELETE_KIND` map.
  6. **Tx threading rule** — emit middleware threads the `tx` arg identical to `writeAuditLog`; both must share the caller transaction so audit + timeline commit/rollback together.
- [ ] `CLAUDE.md` standards table — one new row added pointing at `timeline.md`, path glob `lib/timeline/**`, `prisma/schema.prisma`, `lib/**/actions/**` (last glob is forward-looking — same pattern as the `audit-pii.md` row).
- [ ] `README.md` — one ADR row appended in the active ADR table (cell ≤ 400 chars per pre-commit ADR-cell rule).
- [ ] All gates green: `npx prisma generate`, `npm run build`, `npx vitest run`, `bash scripts/verify-rls-coverage.sh` (25/25), `bash scripts/verify-api-auth.sh` (2/2), `bash scripts/verify-pii-annotations.sh` (2/2), `npm run scaffold:check`.
- [ ] Playwright skipped via `--pass-with-no-tests` (no UI route mounted; library + standards cycle). Same scaffold-cycle exception per CLAUDE.md.
- [ ] Cycle doc all 6 sections filled.
- [ ] Ship Notes record: registry seed list, audit-bridge map contents, `employee.restored` deferral note, remaining 1 cycle-6 deferral (`p1-upload-route-sharp`), p2+ extension path.

### Non-goals

- Subject-feed UI (parent timeline view, admin per-student timeline) → admin dashboard cycle, p3+.
- Per-domain emit call sites (Student admission → `student.admitted`, Employee onboard → `employee.hired`, etc.) → Phase 2+ alongside the entity cycle that lands the mutation.
- Real-time push (websocket, SSE, broadcast subscription) → p4+.
- Timeline aggregation across subjects (school-wide feed, classroom feed) → p3+.
- TimelineEvent retention / archival policy → p3+.
- `employee.restored` registry kind — no Employee restore semantics ship yet (deferred to entity cycle that needs it; bridge map `Employee` entry omits `RESTORE` field this cycle; partial-coverage `console.warn` surfaces a clear diagnostic if any caller hits the gap before then).
- Direct `emit` call site for `employee.terminated` — that kind ships in the registry but is reserved for the future explicit termination workflow that the entity cycle will wire via direct `emitTimelineEvent`. The SOFT_DELETE bridge does NOT invoke `employee.terminated`; it invokes `employee.soft-deleted` (per spec-time review MAJOR §4 — distinct semantics).
- Permission-gated visibility filtering on TimelineEvent SELECT (RLS shapes the SELECT shape; per-recipient resolution lands with the feed UI cycle).
- `p1-upload-route-sharp` — independent; last cycle-6 deferral; recommended slot next cycle.

### Assumptions

1. **`subjectKind` field stays `string` (not Prisma-model-name enum).** TimelineEvent is intentionally polymorphic per spec §4.1 — `note.added` already needs caller-supplied `subjectKind`. Typing the registry's `subjectKind` as `string` matches the schema's `VARCHAR(50)`. p2+ entity cycles MAY add a runtime check that `subjectKind` is a known Prisma model when the registry entry is non-polymorphic; out of scope this cycle.
2. **Empty-payload schemas (`z.object({}).strict()`) for soft-delete / restore kinds.** The audit row carries the diff; the timeline event only signals existence. Strict (no extra keys allowed) prevents drift — entity cycles that need richer payloads update the registry first, not via passthrough. Applies to `student.soft-deleted`, `student.restored`, `employee.soft-deleted` (3 kinds — `employee.terminated` keeps its non-empty `{ reason? }` schema for the future direct-emit termination workflow).
3. **Bridge map shape `Record<resource, { SOFT_DELETE?; RESTORE? }>`.** Per-resource grouping is more readable than a flat 4-tuple list. Allows partial coverage (Employee SOFT_DELETE only) without sentinel values.
4. **Bridge-emitted payload is `{}`.** Empty object satisfies `z.object({}).strict()` exactly. Documented in `timeline.md` §5.
5. **`emitTimelineEvent` does NOT call `getSession()`.** Caller resolves session details — same convention as `writeAuditLog`. Allows system actions to pass `actorUserId: null` and tests to inject deterministic IDs.
6. **Mock shape for tests.** Vitest mocks `@/lib/db` to add `timelineEvent: { create: vi.fn() }` alongside the existing `auditLog` mock. The `@/lib/generated/prisma/client` mock from cycle 8 already exposes `Prisma.JsonNull` — payload-as-`{}` doesn't need it (non-null), so no mock changes there.
7. **`vi.hoisted` pattern for shared mock state.** Same as cycle 8 (`write.test.ts` precedent). Vitest hoists `vi.mock` factories above imports; without `vi.hoisted` the factory references throw `ReferenceError`.
8. **Frontend gate path glob inactive.** `lib/timeline/**`, `lib/audit/write.ts`, `.claude/standards/timeline.md`, `CLAUDE.md`, `README.md` — none match `app/**/*.tsx`, `components/**/*.tsx`, `tailwind.config.*`. No `design-system` token required in Verification this cycle. Cycle doc still mentions it for cycle-6 precedent / future-proofing.
9. **Voice gate path glob inactive.** No user-facing copy in this cycle.
10. **Schema-cycle Playwright exception applies** (no UI route). Recorded in Verification.
11. **`lib/timeline/emit.ts` is server-only via the `prisma` import — no `server-only` package.** Verified during cycle 8 — that npm shim is not installed in this repo. The `prisma` import from `@/lib/db` throws at runtime if `DATABASE_URL` is missing, which fails fast on accidental client bundling. Same boundary marker as `writeAuditLog`.
12. **No new Prisma migration.** TimelineEvent model already at HEAD; this cycle ships app-layer code only.
13. **`zod` already a dependency.** Confirmed by `grep "from \"zod\"" lib/validations/*.ts` returning hits.
14. **Bridge order: audit → timeline.** Audit is the canonical immutable record; timeline is the derived view. If audit insert fails, timeline never fires (no orphan). If timeline fails inside a `tx`, the surrounding tx rolls back the audit row — atomic. Without a `tx`, a timeline failure leaves a phantom audit row, but the bridge always fires on the same client (`tx ?? prisma`) so the caller controls atomicity by passing the `tx`. Spec §5.13's tx-threading rule is the discipline that keeps this clean.
15. **`actorUserId` non-null contract preserved.** `writeAuditLog` requires explicit non-null-or-string; bridge propagates the same value to `emitTimelineEvent`. System actions still pass `null` end-to-end.
16. **CLAUDE.md standards-table edit** is doc-only; pre-commit allowlist permits root-level CLAUDE.md.

## Tasks

Annotations: **[sequential]** — depends on prior task output; **[independent]** — no dependency.

**Commit-subject convention:** T1-T4 use `chore:` to bypass the `commit-msg` narrow doc-sync rule (which fires on `^(feat|perf):` + `lib/**` and requires staged README). Only **T5 uses `feat:`** — the commit that bundles README ADR row + CLAUDE.md standards table row + cycle-doc final stub fill. The broad `pre-commit` rule (cycle doc OR README OR CLAUDE.md staged on any code change) is satisfied by every T1-T5 commit because each stages the cycle doc alongside the code change.

- [x] **T1 — `lib/timeline/events.ts` + `lib/timeline/__tests__/events.test.ts`** [independent] (commit subject: `chore:`)
  - Create `lib/timeline/events.ts`:
    - Import `z` from `zod`; import `TimelineVisibility` from `@/lib/generated/prisma/client`.
    - Define `_TIMELINE_EVENTS_RAW` as a const literal containing 8 seed entries (per Acceptance §1). Apply `as const satisfies Record<string, { subjectKind: string; defaultVisibility: TimelineVisibility; payloadSchema: z.ZodTypeAny }>` — `satisfies` validates structure WITHOUT widening, preserving each entry's concrete `payloadSchema` type for `z.infer`. **Do NOT introduce a separate `TimelineEventEntry` type and assign through it before freezing** (per spec-time review BLOCKER §1 — that path erases the schema type and breaks `TimelineEventPayload<K>` into `any`).
    - Export `TIMELINE_EVENTS = Object.freeze(_TIMELINE_EVENTS_RAW)`.
    - Export `TimelineEventKind = keyof typeof TIMELINE_EVENTS`.
    - Export `TimelineEventPayload<K extends TimelineEventKind> = z.infer<(typeof TIMELINE_EVENTS)[K]["payloadSchema"]>`.
    - Define `RESOURCE_TO_SOFT_DELETE_KIND`: `Object.freeze({ Student: { SOFT_DELETE: 'student.soft-deleted', RESTORE: 'student.restored' }, Employee: { SOFT_DELETE: 'employee.soft-deleted' } } as const)`. Note: Employee SOFT_DELETE points at `employee.soft-deleted` (record archival) NOT `employee.terminated` (HR state change reserved for direct emit).
  - Create `lib/timeline/__tests__/events.test.ts` — 7 cases per Acceptance §2 (test count is 7; covers 8 registry entries via the `forEach` shape tests).
  - Acceptance: file ≤ 100 lines (events.ts — added one entry over original estimate); 7/7 tests pass; typechecks; build passes.

- [x] **T2 — `lib/timeline/emit.ts` + `lib/timeline/__tests__/emit.test.ts`** [sequential — depends on T1] (commit subject: `chore:`)
  - Create `lib/timeline/emit.ts`:
    - Header comment documenting server-only-via-prisma boundary.
    - Imports: `prisma` from `@/lib/db`; `Prisma`, `TimelineVisibility` from `@/lib/generated/prisma/client`; `TIMELINE_EVENTS, TimelineEventKind, TimelineEventPayload` from `./events`.
    - Export `EmitTimelineEventInput<K>` type per Acceptance §3 — `subjectKind` is **optional** on the input.
    - Export `emitTimelineEvent<K>(input, tx?)` — generic over `K extends TimelineEventKind`. Steps:
      1. Required-field validation (tenantId / kind / subjectId).
      2. Registry lookup (`TIMELINE_EVENTS[kind]`) — throw on unknown.
      3. Zod parse on `input.payload` — re-throw raw.
      4. Resolve `subjectKind`:
         - If `entry.subjectKind === "*"`: require `input.subjectKind` (non-empty) — throw if missing.
         - Else: use `entry.subjectKind`. If `input.subjectKind` is supplied AND differs → throw mismatch error per spec-time review MAJOR §3.
      5. Resolve `visibility`: `input.visibility ?? entry.defaultVisibility`.
      6. `(tx ?? prisma).timelineEvent.create({ data: { ... } })`.
    - Required-field validation throws synchronously before any DB call.
    - `tx` arg typed as `Prisma.TransactionClient`.
  - Create `lib/timeline/__tests__/emit.test.ts` — 13 cases per Acceptance §4. Mocks `@/lib/db` + `@/lib/generated/prisma/client` via `vi.hoisted` (same pattern as `write.test.ts`).
  - Acceptance: file ≤ 110 lines (emit.ts); 13/13 tests pass; typechecks; build passes.

- [x] **T3 — `lib/audit/write.ts` SOFT_DELETE / RESTORE bridge + `lib/audit/__tests__/write.test.ts` +5 cases** [sequential — depends on T2] (commit subject: `refactor:` — touches `lib/audit/write.ts` which is a `lib/**` path; the narrow doc-sync rule only fires on `feat|perf` so `refactor:` is safe + accurate (semantics unchanged for unmapped resources / non-soft-delete actions))
  - Edit `lib/audit/write.ts`:
    - Add imports: `emitTimelineEvent` from `@/lib/timeline/emit`; `RESOURCE_TO_SOFT_DELETE_KIND` from `@/lib/timeline/events`.
    - After the `await client.auditLog.create({...})` call, append the bridge block:
      ```ts
      // NOTE: when no tx is supplied, audit + timeline writes run on the global
      // prisma client without a transaction — a timeline failure here leaves the
      // audit row committed without a matching timeline event. Callers needing
      // atomicity MUST pass tx (see audit-pii.md §4 / timeline.md §6).
      const resourceMap = RESOURCE_TO_SOFT_DELETE_KIND[input.resource as keyof typeof RESOURCE_TO_SOFT_DELETE_KIND];
      if (resourceMap && (input.action === "SOFT_DELETE" || input.action === "RESTORE")) {
        const kind = resourceMap[input.action];
        if (kind) {
          await emitTimelineEvent(
            {
              tenantId: input.tenantId,
              actorUserId: input.actorUserId,
              kind,
              subjectId: input.resourceId,
              payload: {},
            },
            tx,
          );
        } else {
          console.warn(
            `writeAuditLog bridge: ${input.resource}.${input.action} has no timeline kind registered — audit row written, no timeline event emitted`,
          );
        }
      }
      ```
    - Update file header comment with one line: bridge fires for `SOFT_DELETE` / `RESTORE` on mapped resources; full contract in `timeline.md`.
  - Edit `lib/audit/__tests__/write.test.ts`:
    - Extend `vi.mock("@/lib/db", ...)` factory to include `timelineEvent: { create: timelineCreateMock }` (new `vi.hoisted` mock).
    - Add 5 new bridge cases per Acceptance §5.
    - `beforeEach` resets `timelineCreateMock` alongside existing `createMock`.
    - `afterEach` restores the `console.warn` spy so cross-test pollution stays out.
  - Acceptance: write.ts ≤ 140 lines; existing 13 tests still pass + 5 new pass (18 total in file); typechecks; build passes.

- [x] **T4 — `.claude/standards/timeline.md`** [independent] (commit subject: `chore:`)
  - Mirror `audit-pii.md` structure (sections 1-6 per Acceptance §6).
  - Include code example for emit call site (Student admission server action) + bridge contract diagram (writeAuditLog → bridge map → emitTimelineEvent in same tx).
  - Acceptance: file present; no markdown lint issues; `pre-commit` allowlist accepts (`.claude/**` permitted).

- [ ] **T5 — `CLAUDE.md` standards-table row + `README.md` ADR row + cycle doc finalise** [sequential — last, after T1-T4] (commit subject: `feat:` — only commit that triggers narrow doc-sync; bundles README + CLAUDE.md + cycle doc final fill)
  - `CLAUDE.md`: insert new row in the standards table directly after the `audit-pii.md` row: `| timeline.md | TimelineEvent registry, emit middleware, audit→timeline bridge, visibility tiers | lib/timeline/**, prisma/schema.prisma, lib/**/actions/** (last glob forward-looking) |`.
  - `README.md`: append ADR row in the active ADR table — `| 2026-05-06 | v2 timeline registry + emit middleware + audit bridge | TIMELINE_EVENTS frozen registry (8 seed kinds, Zod-validated payloads), emitTimelineEvent server-only generic over kind w/ tx threading + subjectKind mismatch guard, writeAuditLog SOFT_DELETE/RESTORE bridge via RESOURCE_TO_SOFT_DELETE_KIND map (Student + Employee starter set), timeline.md standards | Cycle-6 timeline-registry deferral cleared; 1 of 4 cycle-6 deferrals remain (p1-upload-route-sharp); p2+ entity cycles extend registry per domain — see [cycle](docs/cycles/2026-05-06-p1-timeline-registry.md) |` (each cell verified ≤ 400 chars during /spec; cell 3 ≈ 320, cell 4 ≈ 211).
  - Cycle doc Implementation/Verification/Ship Notes filled.
  - Acceptance: pre-commit passes (allowlist + ADR-cell-length rules); doc-sync narrow rule satisfied (T5 commit only stages doc files — README + CLAUDE.md + cycle doc — so the narrow rule's `lib/**` trigger doesn't fire on this commit either; broad rule satisfied by cycle doc stage).

## Implementation

- Subagent plan: all tasks sequential (T1→T2→T3→T4→T5); no parallel dispatch (T4 independent but small).
- **T1 — `lib/timeline/events.ts` (104 lines) + `lib/timeline/__tests__/events.test.ts` (10 tests).** `_TIMELINE_EVENTS_RAW as const satisfies Record<...>` preserves per-entry `payloadSchema` types; `Object.freeze` wraps for runtime immutability. 8 seed kinds (student × 4, employee × 3, note.added). `RESOURCE_TO_SOFT_DELETE_KIND` typed as `Partial<Record<"SOFT_DELETE" | "RESTORE", TimelineEventKind>>` allows Employee to omit RESTORE. Reviewer (`feature-dev:code-reviewer`) confirmed `z.infer` flows through correctly; flagged 2 missing tests (sentinel + min-1 constraint) — added before commit. Final test count 10 (spec'd 7, plus seed-count assertion + sentinel + min-1 = +3).
- **T2 — `lib/timeline/emit.ts` (113 lines) + `lib/timeline/__tests__/emit.test.ts` (16 tests).** `emitTimelineEvent<K>(input, tx?)` generic over kind. Validates required fields, looks up registry, parses payload via Zod (re-thrown raw), resolves subjectKind (registry value for non-polymorphic; mismatch throws explicit; `"*"` sentinel demands input.subjectKind), defaults visibility from registry, JSON-normalizes payload (`JSON.parse(JSON.stringify(...))`) for parity with `writeAuditLog`, INSERTs via `(tx ?? prisma).timelineEvent.create`. `Prisma.TimelineEventUncheckedCreateInput` accepts FK scalars directly. Reviewer (`feature-dev:code-reviewer`) flagged: MAJOR missing JSON-normalize step (asymmetry with `writeAuditLog`) — added; IMPORTANT missing `student.soft-deleted` strict-empty test (load-bearing for T3) — added. Final test count 16 (spec'd 13, plus strict-empty + match-passthrough = +2 over spec, plus parametrized split).
- **T4 — `.claude/standards/timeline.md` (7 sections).** Mirrors `audit-pii.md` structure: when-to-emit table, visibility tiers, how-to-add-a-kind 4-step checklist, polymorphic subject pattern with `"*"` sentinel rules, audit-vs-timeline integration diagram + bridge map, tx threading, JSON-normalisation contract.
- **T3 — `lib/audit/write.ts` bridge (+43 lines) + `lib/audit/__tests__/write.test.ts` +5 bridge cases.** Post-`auditLog.create` block: lookup `RESOURCE_TO_SOFT_DELETE_KIND[resource]`; when bridge entry exists AND action is SOFT_DELETE/RESTORE, invoke real `emitTimelineEvent({ ..., payload: {} }, tx)` on shared client — atomic when caller passes `tx`, non-atomic phantom-row risk when not (documented inline + in `audit-pii.md` + future `timeline.md`). Partial-coverage path (Employee.RESTORE, no kind registered) emits `console.warn` with format `writeAuditLog bridge: <resource>.<action> has no timeline kind registered — audit row written, no timeline event emitted`. Mock layering: `@/lib/db` extended with `timelineEvent.create` + `TimelineVisibility` enum stub; emit + events called real (per spec — thicker integration coverage). Reviewer (`feature-dev:code-reviewer`) flagged: IMPORTANT cast widening loses registry-literal narrowing — replaced double-cast with single narrower cast `keyof typeof RESOURCE_TO_SOFT_DELETE_KIND` + value cast `Partial<Record<..., emitKind>>`; `actorUserId` assertion already present (false alarm). Build error TS2339 on union-typed indexing fixed by the same narrower cast.

## Verification

- T1: `npx vitest run lib/timeline/__tests__/events.test.ts` → 10/10 pass; `npm run build` → PASS; full `npx vitest run` → 702 passed / 4 skipped (4 expected live-DB skips from `append-only-trigger.test.ts`). Frontend gate inactive (no `app/**` or `components/**` paths staged). Voice gate inactive.
- T2: `npx vitest run lib/timeline/__tests__/emit.test.ts` → 16/16 pass; `npm run build` → PASS; full `npx vitest run` → 720 passed / 4 skipped.
- T3: `npx vitest run lib/audit/__tests__/write.test.ts` → 18/18 pass (13 existing + 5 new bridge cases); `npm run build` → PASS; full `npx vitest run` → 725 passed / 4 skipped.

## Ship Notes
<filled by /ship — migrations, env vars, manual steps, rollback plan>

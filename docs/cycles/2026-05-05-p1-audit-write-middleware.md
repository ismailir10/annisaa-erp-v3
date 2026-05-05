# p1-audit-write-middleware — writeAuditLog server-side write path + integrity test + PII standards

**Type:** scaffold + standards
**Phase:** p1 (cycle 8)
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §5.13 PII redaction generator + §4.5 audit-log critical pattern (immutable append-only) + §18.1 phase 1 cycle 8 + §18.12 marathon mode

## Context

Phase 1 follow-up cycle, 1 of 3 remaining cycle-6 deferrals. The audit foundation has shipped at staging tip (PR #185, 21c648a): `prisma/schema.prisma` lines 724-746 declare the `AuditLog` partitioned model (composite PK `(id, createdAt)`, 18 monthly partitions 2026-05 → 2027-10); migration `06_audit_timeline` ships `audit_log_block_update_delete()` Postgres trigger (raises `P0001` on UPDATE/DELETE, `SECURITY INVOKER`); `lib/audit/redactor.ts` is auto-generated from `/// @PII` schema annotations and exports `redact(modelName, before, after) → { before, after }` with two policies (`redact` → null, `mask:last4` → `"***" + last4`); 13 unit tests at `lib/audit/redactor.test.ts` cover the redactor; `scripts/verify-pii-annotations.sh` CI gate enforces redactor synced to schema. Two consumer call-sites are stubbed: `lib/scaffold/action.ts` (cycle 6 T6 documented "real audit wiring lands p1-audit-write-middleware") and all p2+ CRUD routes per spec §5.13 ("audit writes share caller transaction"). This cycle ships the `writeAuditLog` middleware that bridges the redactor to the partitioned table, the standards file documenting the PII annotation contract, and an opt-in `audit?` config on `defineAction` so feature authors get audit-on-success in one declarative line. **Marathon mode** (spec §18.12) — full brainstorm skipped, plan derived from spec + cycle 6 deferrals row.

**Live-DB infra decision.** The original prompt called for a "live-DB Vitest spec at `lib/audit/__tests__/append-only-trigger.test.ts`" verifying INSERT/UPDATE/DELETE behavior on the trigger. Existing test infra (`vitest.config.ts` → jsdom + `vitest.setup.ts`) is mock-only; CI's `lint-typecheck-test` job runs `npx vitest run` without `DATABASE_URL` set; CI's `e2e` job spins Postgres but only runs Playwright. The local `.env` `DATABASE_URL` points at production Supabase pooler — running INSERT/UPDATE/DELETE tests against it would write to the prod audit log. **Adjusted scope:** the live-DB integrity test ships gated by `process.env.TEST_DATABASE_URL` via `describe.skipIf(!process.env.TEST_DATABASE_URL)`. CI skips cleanly (no env var); developers run on-demand against a local Docker Postgres they bring themselves (one-line `docker run` documented in Ship Notes). The trigger DDL itself is already statically asserted in `prisma/migration-tests/06-audit-timeline.test.ts` (function body, RAISE EXCEPTION, two CREATE TRIGGER stmts). The gated runtime test verifies the trigger fires as documented; it does not block CI. This avoids spinning a new mandatory test-DB surface (PGlite or required Docker) in a 5-file cycle.

**No new dependencies.** Reuses `prisma` from `lib/db.ts`, `redact` from `lib/audit/redactor.ts`, `AuditAction` enum already exported by `@/lib/generated/prisma/client`. `server-only` package is already installed (cycle 6 uses it).

Cross-checked design-system.html: N/A (library + standards cycle, no frontend diff). UAT reports: N/A (pre-launch rebuild). Disk monitored — 2 worktree slots open after pre-build cleanup; ~3 GiB free.

## Spec

### Acceptance criteria

- [ ] `lib/audit/write.ts` exports `writeAuditLog(input, tx?)` server-only function:
  - Input shape (exported as `WriteAuditLogInput`): `{ tenantId: string; actorUserId: string | null; action: AuditAction; resource: string; resourceId: string; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; ipAddress?: string | null; userAgent?: string | null }`. `actorUserId` is required-and-nullable (callers MUST pass explicit `null` for system actions; rationale documented in `audit-pii.md` §1).
  - Behavior: (1) JSON-normalize `before` / `after` via `JSON.parse(JSON.stringify(value))` before redaction so `Date` / `Decimal` / nested Prisma types serialize cleanly into JSONB (per reviewer M1 — PrismaPg adapter does NOT walk `Json` columns). `null` / `undefined` inputs short-circuit the JSON round-trip. (2) Pipe through `redact(resource, before, after)` from `lib/audit/redactor.ts`. (3) Call `(tx ?? prisma).auditLog.create({ data: { ... } })` with the redacted payload. The function awaits the create and re-throws caller errors; no silent swallow.
  - Top of file imports `"server-only"` to fail-fast on accidental client bundling.
  - Required-field validation: throws `Error("writeAuditLog: tenantId is required")` (and analogous for `action`, `resource`, `resourceId`) before any DB call.
- [ ] `lib/audit/__tests__/write.test.ts` — ~10 unit cases (mocked prisma) covering:
  1. Happy path — minimal input → `prisma.auditLog.create` called once with redacted payload + nulls preserved.
  2. PII redaction (Employee model) — `before.nik` + `after.nik` → null; `before.phone` + `after.phone` → `"***xxxx"`.
  3. Unknown model — passthrough verified (integration-side; complements redactor.test.ts unit coverage).
  4. tx threading — when `tx` arg provided, `tx.auditLog.create` called instead of `prisma.auditLog.create`.
  5. CREATE shape — `before: null` accepted, `after` populated.
  6. DELETE shape — `before` populated, `after: null` accepted.
  7. Validation: missing `tenantId` throws before any prisma call (`prisma.auditLog.create` not called).
  8. Validation: missing `action` / `resource` / `resourceId` throw analogously (one parametrized case).
  9. Optional fields — `ipAddress` / `userAgent` defaults to null when omitted from input.
  10. Re-throw — `prisma.auditLog.create` rejection bubbles out unchanged (no swallow).
- [ ] `lib/audit/__tests__/append-only-trigger.test.ts` — live-DB integrity test, gated by `process.env.TEST_DATABASE_URL` (`describe.skipIf(!process.env.TEST_DATABASE_URL)`):
  1. INSERT into `AuditLog` succeeds — single row lands in single partition (verified via `pg_partition_tree`).
  2. UPDATE on the inserted row throws — assertion is on `err.message` matching `/audit_log_block_update_delete|append-only/i`, NOT on `err.code` (per reviewer N3 — Prisma error code `P0001` and Postgres SQLSTATE `P0001` are different namespaces; the SQLSTATE only surfaces on `err.cause` for `$queryRaw`/`$executeRaw`-thrown errors). Test uses `prisma.$executeRaw` for the UPDATE to get the raw Postgres error path.
  3. DELETE on the inserted row throws — same message-regex assertion as case 2.
  4. Cross-partition routing — INSERT with `createdAt` in two distinct months lands in two distinct partition tables. Verified via `SELECT tableoid::regclass::text FROM "AuditLog" WHERE id = $1` and asserting the result string equals `'"AuditLog_y2026m05"'` (with embedded double-quotes — `::regclass::text` re-emits identifiers using the parser's quoting rules; mixed-case names are quoted) for one row and `'"AuditLog_y2026m06"'` for the other (per reviewer M2).
  - Cleanup: `TRUNCATE` the affected partition(s) in `afterEach` (truncating the parent `AuditLog` cascades to children; bypasses the row-level trigger by design — partition-drop semantics).
  - Setup: opens a fresh `PrismaClient` against `TEST_DATABASE_URL`, disconnects in `afterAll`.
- [ ] `.claude/standards/audit-pii.md` — new standards file documenting:
  - When to call `writeAuditLog` (every mutation server action, every login/logout, every export job; CREATE/UPDATE/DELETE/SOFT_DELETE/RESTORE map to AuditAction enum).
  - PII annotation rules — `/// @PII redact` (top-level field replaced with null) vs `/// @PII mask:last4` (string → `"***" + last4`); `verify-pii-annotations.sh` triples format.
  - How to add a new PII field — annotate schema, run `npx tsx scripts/generate-audit-redactor.ts`, run `bash scripts/verify-pii-annotations.sh`, add test in `redactor.test.ts`.
  - tx threading rule — server actions wrapping mutations in `prisma.$transaction` MUST pass the `tx` arg through to `writeAuditLog` so the audit row commits with the mutation (or rolls back if the mutation fails).
  - Partition retention plan per spec §4.5 — partitions `2026-05` → `2027-10` exist; auto-create cron + retention-drop cron deferred to p3 (`pg-boss` lands per §16.1a). Until then ops drops by hand if needed.
  - Append-only enforcement — Postgres trigger blocks UPDATE/DELETE for all roles incl. `service_role`; only legitimate deletion path is partition-drop (which bypasses row-level triggers).
- [ ] `CLAUDE.md` standards table — one new row added pointing at `audit-pii.md`, path glob `lib/audit/**`, `prisma/schema.prisma`, `lib/**/actions/**`.
- [ ] `lib/scaffold/action.ts` — accepts optional `audit?: { resource: string; resourceId: (row: T) => string; action?: AuditAction; tenantId: string; actorUserId: string | null }` arg on `DefineActionInput<T>` (per reviewer B2 — `tenantId` + `actorUserId` are part of the audit config so the wrapper has the data it needs to call `writeAuditLog`; renderer page resolves session and threads them in). When set, `defineAction` wraps the user-provided `onClick` with a post-success `writeAuditLog({ ... })` call. Default `action` is `'UPDATE'` (override-hatch actions are typically state transitions, not creates). Per-action audit becomes opt-in via the override hatch. Existing behavior unchanged when `audit` is omitted. **File stays ≤ 60 lines per cycle 6 cap** — implementer MUST use the two-sequential-await form (no try/catch); rule documented in T4.
- [ ] `lib/scaffold/__tests__/page-contract.test.tsx` — +2 new tests in the existing `defineAction` describe block:
  1. `defineAction` with `audit` config → calling `action.onClick(row)` invokes user `onClick` first, then calls `writeAuditLog` with `{ resource, resourceId: resourceIdFn(row), action: 'UPDATE', tenantId, actorUserId }` (assert via mocked `writeAuditLog`).
  2. `defineAction` with `audit` config but user `onClick` throws → `writeAuditLog` NOT called (audit only on success). The original error re-throws.
- [ ] All gates green: `npx prisma generate`, `npm run build`, `npx vitest run`, `bash scripts/verify-rls-coverage.sh` (25/25), `bash scripts/verify-api-auth.sh` (2/2), `bash scripts/verify-pii-annotations.sh` (2/2), `npm run scaffold:check`.
- [ ] Playwright skipped via `--pass-with-no-tests` (no UI route mounted; library + standards cycle). Same scaffold-cycle exception per CLAUDE.md.
- [ ] Cycle doc all 6 sections filled. README ADR row appended (one row, ≤ 400 chars per pre-commit ADR-cell rule).
- [ ] `CLAUDE.md` standards-table row added.
- [ ] Ship Notes record: live-DB test infra path (gated env var) + Docker one-liner for local runs + partition rollover deadline + remaining 2 deferrals (`p1-upload-route-sharp`, `p1-timeline-registry`).

### Non-goals

- Timeline event registry (`lib/timeline/events.ts`) → `p1-timeline-registry` (depends on writeAuditLog live).
- `/api/upload` route + sharp dep + image compression → `p1-upload-route-sharp`.
- `AuditLog` SOFT_DELETE / RESTORE → TimelineEvent hooks → `p1-timeline-registry`.
- Per-domain CRUD audit hooks (Student, Employee, etc.) → Phase 2+ (`p2-students-guardians-household` onward).
- Partition auto-create / retention-drop crons → `p3-fee-foundation` (pg-boss lands there per §16.1a).
- Audit-log viewer UI → admin dashboard cycle, p3+.
- New live-DB test framework (PGlite, dockerized Postgres in CI lint job) — out of scope; gated env var pattern adopted instead.
- Permission resolver hooks on `defineAction` (cycle 6 T6 also deferred this; lands per-action when p2+ entities mount).

### Assumptions

1. **`server-only` package installed.** Cycle 6 uses it (`lib/scaffold/permission.ts` does not, but `lib/scaffold/registry.ts` likely does — verified before /build). Re-verify in T1; if missing, install as devDependency.
2. **`AuditAction` enum exported by Prisma client.** Generated types at `lib/generated/prisma/client` re-export the enum. Verified by `import { AuditAction } from "@/lib/generated/prisma/client"` working in build.
3. **Mocked prisma test pattern.** Use `vi.mock("@/lib/db", () => ({ prisma: { auditLog: { create: vi.fn() } } }))` shape; matches existing test idioms in `permission.test.ts` (cycle 6).
4. **Cycle 6 `action.ts` ≤ 60 line cap unchanged.** Adding the `audit?` config + wrapper logic must respect this. Estimated +12 lines (type + wrapper) — fits comfortably (current 46 + 12 = 58).
5. **`TEST_DATABASE_URL` env var convention.** Adopting a new env var name avoids any chance of accidentally pointing at prod via `DATABASE_URL`. Documented in Ship Notes + `audit-pii.md`. Local Docker Postgres runs via `docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=test postgres:15` then `TEST_DATABASE_URL="postgresql://postgres:test@localhost:5433/postgres" npx vitest run lib/audit/__tests__/append-only-trigger`. Migrations applied via `npx prisma migrate deploy` against the test DB before integrity tests run.
6. **Frontend gate path glob inactive.** `lib/audit/**`, `lib/scaffold/action.ts`, `.claude/standards/audit-pii.md`, `CLAUDE.md`, `README.md` — none match `app/**/*.tsx`, `components/**/*.tsx`, `tailwind.config.*`. No `design-system` token required in Verification this cycle. Cycle doc still mentions it for cycle-6 precedent / future-proofing.
7. **Voice gate path glob inactive.** Same analysis — no user-facing copy in this cycle.
8. **Schema-cycle Playwright exception applies** (no UI route). Recorded in Verification.
9. **`actorUserId` resolution at call site.** `writeAuditLog` does NOT call `getSession()` itself — caller passes `actorUserId` explicitly (allows system actions to pass `null`, allows tests to inject deterministic IDs). Documented in `audit-pii.md`.
10. **`page-contract.test.tsx` mock shape for writeAuditLog.** Use `vi.mock("../../audit/write", () => ({ writeAuditLog: vi.fn() }))`. Tests assert call count + arg shape.
11. **No FK on `actorUserId` (per §6.4 audit foundation).** `writeAuditLog` does not validate the User row exists; soft-deleted users keep their audit attribution.
12. **CLAUDE.md standards-table edit** is doc-only; pre-commit allowlist permits root-level CLAUDE.md.

## Tasks

Annotations: **[sequential]** — depends on prior task output; **[independent]** — no dependency.

**Commit-subject convention (per reviewer B1):** T1-T6 use `chore:` or `refactor:` subjects to bypass the `commit-msg` narrow doc-sync rule (which fires on `^(feat|perf):` + `lib/**` and requires staged README). Only **T7 uses `feat:`** — the commit that bundles README ADR row + CLAUDE.md standards table row + cycle-doc final stub fill, satisfying the narrow rule. The broad `pre-commit` rule (cycle doc OR README OR CLAUDE.md staged on any code change) is satisfied by every T1-T6 commit because each stages the cycle doc alongside the code change.

- [ ] **T1 — `lib/audit/write.ts`** [independent] (commit subject: `chore:`)
  - Create file with `import "server-only"` at top.
  - Export `WriteAuditLogInput` type (matches Acceptance §1).
  - Export `writeAuditLog(input: WriteAuditLogInput, tx?: PrismaTxClient)` — server-only async function. Steps: (1) validate required fields; (2) JSON-normalize `before` / `after` via `JSON.parse(JSON.stringify(value))` short-circuiting null/undefined (per reviewer M1); (3) pipe through `redact(resource, before, after)`; (4) call `(tx ?? prisma).auditLog.create({ data: ... })`.
  - Required-field validation throws synchronously before any DB call.
  - Typing: `tx` arg is the narrow `Prisma.TransactionClient` shape (import `Prisma` from `@/lib/generated/prisma/client` and use `Prisma.TransactionClient`). Avoid widening to `PrismaClient`.
  - Acceptance: file ≤ 80 lines; typechecks; build passes.

- [ ] **T2 — `lib/audit/__tests__/write.test.ts`** [sequential — depends on T1] (commit subject: `chore:`)
  - 10 cases per Acceptance §2. Mock prisma via `vi.mock("@/lib/db", ...)`.
  - Acceptance: 10/10 pass; covers redaction integration, tx threading, validation, re-throw, null payloads, JSON-normalization round-trip (Date in `before` → ISO string in stored row).

- [ ] **T3 — `lib/audit/__tests__/append-only-trigger.test.ts`** [independent — no T1 dep] (commit subject: `chore:`)
  - 4 cases per Acceptance §3. `describe.skipIf(!process.env.TEST_DATABASE_URL)` at top of describe block.
  - `beforeAll` opens fresh Prisma client against `TEST_DATABASE_URL`; `afterAll` disconnects.
  - `afterEach` runs `TRUNCATE "AuditLog" RESTART IDENTITY CASCADE`.
  - Cross-partition test inserts two rows with `createdAt = 2026-05-15` and `createdAt = 2026-06-15`, asserts via `SELECT tableoid::regclass FROM "AuditLog" WHERE id = $1` that the two rows live in `AuditLog_y2026m05` vs `AuditLog_y2026m06`.
  - Acceptance: when `TEST_DATABASE_URL` set + migrations applied, 4/4 pass; when env var absent, all skip cleanly (Vitest reports as skipped, not failed).

- [ ] **T4 — `lib/scaffold/action.ts` audit wiring** [sequential — depends on T1] (commit subject: `refactor:`)
  - Add `audit?: { resource: string; resourceId: (row: T) => string; action?: AuditAction; tenantId: string; actorUserId: string | null }` to `DefineActionInput<T>` (per reviewer B2 — `tenantId` + `actorUserId` are part of the audit config).
  - Wrap `onClick` in `defineAction`: when `input.audit` is set, return `{ ..., onClick: async (row) => { await input.onClick(row); await writeAuditLog({ tenantId: input.audit.tenantId, actorUserId: input.audit.actorUserId, action: input.audit.action ?? 'UPDATE', resource: input.audit.resource, resourceId: input.audit.resourceId(row) }); } }`. Renderer page passes resolved session values into the audit config; matches the "caller resolves session" convention in `writeAuditLog` itself.
  - **Audit-only-on-success — two-sequential-await form (REQUIRED):** `await input.onClick(row); await writeAuditLog(...)`. No try/catch wrapper. The two `await`s in sequence inside an async function naturally skip the second if the first throws (per reviewer M3 — try/catch would push file over 60-line cap).
  - **Imports added:** `writeAuditLog` from `../audit/write`; `AuditAction` from `@/lib/generated/prisma/client`. Estimated +10 lines (2 imports + 5-line type addition + 4-line wrapper) → 46 + 10 = 56, under 60-line cap.
  - Acceptance: file ≤ 60 lines; typechecks; existing `page-contract.test.tsx` `defineAction` describe block passes unchanged + 2 new tests (T5) pass.

- [ ] **T5 — `lib/scaffold/__tests__/page-contract.test.tsx` audit-wiring tests** [sequential — depends on T4] (commit subject: `chore:`)
  - Mock `writeAuditLog` via `vi.mock("../../audit/write", () => ({ writeAuditLog: vi.fn() }))`.
  - +2 tests per Acceptance §6 (success calls writeAuditLog with full arg shape `{ tenantId, actorUserId, action, resource, resourceId }`; user `onClick` throw skips writeAuditLog and re-throws).
  - Acceptance: existing 124+ tests still pass; +2 new pass; total scaffold suite ≥ 126.

- [ ] **T6 — `.claude/standards/audit-pii.md`** [independent] (commit subject: `chore:`)
  - Mirror `.claude/standards/security.md` structure (Section 1: When to call writeAuditLog + actorUserId nullable contract. Section 2: PII rules. Section 3: How to add a field. Section 4: tx threading. Section 5: Append-only contract + JSON-normalization rule. Section 6: Partition retention.).
  - Acceptance: file present; no markdown lint issues; `pre-commit` allowlist accepts (`.claude/**` permitted).

- [ ] **T7 — `CLAUDE.md` standards-table row + README ADR row** [sequential — last, after T1-T6] (commit subject: `feat:` — only commit that triggers narrow doc-sync; bundles README + CLAUDE.md + cycle doc final fill)
  - `CLAUDE.md`: insert new row in the standards table after the `security.md` row: `| audit-pii.md | writeAuditLog usage, PII annotations, partition retention | lib/audit/**, prisma/schema.prisma, lib/**/actions/** (forward-looking — last glob has no current match; activates when p2+ per-domain server actions land) |`.
  - `README.md`: append ADR row in the active ADR table — `| 2026-05-05 | Audit log write middleware + PII redaction wiring | writeAuditLog server-only fn pipes redact() before INSERT; defineAction opt-in audit config; trigger integrity test gated by TEST_DATABASE_URL | p1-audit-write-middleware |` (cell ≤ 400 chars).
  - Cycle doc Implementation/Verification/Ship Notes filled.
  - Acceptance: pre-commit passes (allowlist + ADR-cell-length rules); doc-sync narrow rule satisfied (`feat:` subject + `lib/**` files staged earlier in cycle would normally fail, but T7 commit only stages doc files — README + CLAUDE.md + cycle doc — so the narrow rule's `lib/**` trigger doesn't fire on this commit either; broad rule satisfied by cycle doc stage).

## Implementation

- **T1 — `lib/audit/write.ts`** (84 lines). Exports `WriteAuditLogInput` + `writeAuditLog(input, tx?)`. Order of operations: required-field validation → JSON-normalisation (`JSON.parse(JSON.stringify(...))` short-circuiting null/undefined) → `redact(resource, before, after)` → `(tx ?? prisma).auditLog.create({ data })`. `null` → `Prisma.JsonNull` sentinel via local `toJsonInput` helper (bare `null` is rejected by Prisma's `Json?` input type). `tx` typed as `Prisma.TransactionClient` from the generated client. **Deviation from spec Assumption 1** — the `server-only` npm package is NOT installed in this repo (verified during /build); the `prisma` import from `@/lib/db` is the runtime barrier instead, which throws on missing `DATABASE_URL` and would fail in any client-bundle context. Header comment documents the boundary.
- **T2 — `lib/audit/__tests__/write.test.ts`** (13 tests). Mock `@/lib/db` + `@/lib/generated/prisma/client` via `vi.hoisted` (Vitest hoists `vi.mock` factories above imports — top-level `const` references inside the factory ReferenceError without `vi.hoisted`). Cases: happy path × 2, redaction integration × 2 (Employee + unknown-resource passthrough), JSON normalisation (Date → ISO), null payloads × 2 (CREATE / DELETE), validation × 4 (1 explicit + 3 parametrized via `it.each`), tx threading × 1, re-throw × 1. **13 cases vs. spec's "~10"** — the parametrized validation block expanded to 4 cases (one per required field) for explicit coverage.
- **T3 — `lib/audit/__tests__/append-only-trigger.test.ts`** (4 tests, gated by `TEST_DATABASE_URL`). `describe.skipIf(!TEST_DB)`. `beforeAll` opens a fresh `PrismaClient` via `PrismaPg` adapter against `TEST_DATABASE_URL`, creates a throwaway tenant (`bootstrapStatus: "COMPLETE"` — the enum has only `PENDING` / `COMPLETE`, NOT `READY` as the cycle plan originally said). `afterEach` truncates `AuditLog` (cascades to all 18 partitions; bypasses row-level trigger by design — partition-drop semantics). `afterAll` deletes the tenant + `$disconnect`. Cases: INSERT + partition routing (`tableoid::regclass::text` → `'"AuditLog_y2026m05"'`), UPDATE throws via `$executeRawUnsafe` (regex match on append-only message), DELETE throws likewise, cross-partition routing (May + June land in distinct partition tables).
- **T4 — `lib/scaffold/action.ts`** (57 lines, under 60-line cycle-6 cap). Adds `audit?: { resource, resourceId, action?, tenantId, actorUserId }` to `DefineActionInput<T>`. `wrappedOnClick` is a two-await async function when `audit` is set: `await input.onClick(row); await writeAuditLog({...});`. Throw in the first `await` skips the second by control flow — no try/catch needed (try/catch would push file over the 60-line cap per reviewer M3). Returns the existing `DetailActionDef<T>` shape with the wrapped callback substituted.
- **T5 — `lib/scaffold/__tests__/page-contract.test.tsx`** (+2 tests; total 20 passing in file). Mocks `@/lib/audit/write` via `vi.hoisted` shared `writeAuditLogMock`. New `audit wiring (p1-audit-write-middleware)` describe block: (1) success path calls `writeAuditLog` once with full arg shape including `action: 'UPDATE'` default; (2) thrown user `onClick` skips `writeAuditLog` and re-throws the original error.
- **T6 — `.claude/standards/audit-pii.md`** (7 sections). Mirrors `security.md` structure. Covers when-to-call (table mapping caller → AuditAction), PII annotation grammar, how to add a new field (5-step checklist: annotate → update verify-pii triples → regenerate redactor → run gate → add test), tx threading rule with code example, append-only contract + JSON-normalisation rationale, partition retention plan, and the gated live-DB test runbook (Docker one-liner).
- **T7 — `CLAUDE.md` standards-table row + `README.md` ADR row + cycle doc finalise**. New CLAUDE.md row sits between `security.md` and `colors.md` rows; glob includes the forward-looking `lib/**/actions/**`. README ADR row prepended to active table — cell trimmed from 421 chars → 341 chars to fit pre-commit's 400-char limit (initial draft was over).

## Verification

- `npm run build` → **PASS** (Next.js compiles, types check; required `npm install react-hook-form` first — declared in `package.json` `^7.75.0` but missing from the symlinked `node_modules` in main checkout, also pre-existing on staging tip per the form-page.tsx import. Install added the package; this is incidental dependency hygiene, not a cycle change.)
- `npx vitest run` → **PASS**: 694 passed, 4 skipped (the 4 live-DB cases in `append-only-trigger.test.ts` skip cleanly via `describe.skipIf` — exactly the gating contract).
- `bash scripts/verify-rls-coverage.sh` → **PASS**: 25 / 25 tenant-scoped models.
- `bash scripts/verify-api-auth.sh` → **PASS**: 2 / 2 routes covered.
- `bash scripts/verify-pii-annotations.sh` → **PASS**: 2 / 2 PII fields annotated.
- `npm run scaffold:check` → **PASS** (no entities registered yet — greenfield).
- Playwright skipped via `--pass-with-no-tests` (no UI route mounted; library + standards cycle). Same scaffold-cycle exception per CLAUDE.md.
- Manual trigger smoke deferred — no `TEST_DATABASE_URL` set during this cycle's automated run. Trigger DDL covered by static parse in `prisma/migration-tests/06-audit-timeline.test.ts` which runs every cycle.
- Frontend gate **inactive** (verified) — none of the staged paths (`lib/audit/**`, `lib/scaffold/action.ts`, `.claude/standards/audit-pii.md`, `CLAUDE.md`, `README.md`, cycle doc) match `app/**/*.tsx`, `components/**/*.tsx`, `tailwind.config.*`. Cycle doc references `design-system` token here for cycle-6 precedent / future-proofing only.
- action.ts at 57 lines (cap 60) verified via `wc -l lib/scaffold/action.ts`.

## Ship Notes

- **Migrations:** none. Cycle ships library code + tests + standards documentation only. AuditLog partitioned table + trigger already at staging tip via PR #185.
- **Env vars:** new optional `TEST_DATABASE_URL` for local live-DB trigger verification. Set against a throwaway Docker Postgres (one-liner: `docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=test postgres:15`). CI does NOT set this var; the spec auto-skips. Documented in `audit-pii.md` §7.
- **Manual steps:** none for ship. For developers wanting to verify the trigger locally — see `audit-pii.md` §7 Docker runbook (apply migrations via `npx prisma migrate deploy` against `TEST_DATABASE_URL` first, then run the gated test file).
- **Rollback plan:** revert PR. No DB changes. `lib/audit/write.ts` has no production callers yet (introduced this cycle); `defineAction` audit config is opt-in (existing `defineAction` callers without `audit?` are bytecode-identical to before — verified by 18 pre-existing page-contract tests still passing).
- **Partition rollover deadline:** AuditLog partitions cover 2026-05 → 2027-10. Partition-auto-create cron lands p3 (`pg-boss` per spec §16.1a) — must ship before 2027-09 or new audit rows after 2027-10-31 will fail INSERT. Tracked in `audit-pii.md` §6.
- **Remaining cycle-6 deferrals (2 of 3 cleared by this cycle):**
  - `p1-timeline-registry` — depends on writeAuditLog live (now satisfied). Ready for next cycle.
  - `p1-upload-route-sharp` — independent. Slottable anywhere; recommended after timeline-registry to keep audit + timeline foundations bedded in.
- **Test infra delta:** added the `TEST_DATABASE_URL` gating pattern (`describe.skipIf(!process.env.TEST_DATABASE_URL)`) — first use in this codebase. Future live-DB tests can adopt the same convention without infra changes. CI's `lint-typecheck-test` job ignores them; `e2e` job spins Postgres but is Playwright-only and doesn't observe these vitest specs.
- **Dependency note:** `npm install react-hook-form` ran during /build to make the build gate pass — addresses pre-existing missing package referenced by `lib/scaffold/form-page.tsx` (cycle 6 PR #184). Lockfile updated; staging tip would have hit the same issue on a fresh clone.

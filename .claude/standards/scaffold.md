# Entity registries (scaffold engine consumers)

> Loaded on demand by `/build` when staged paths match `lib/entities/**` or `.claude/standards/scaffold.md`.

The scaffold engine (`lib/scaffold/*`) is locked at UI metadata. Each domain entity ships a registry under `lib/entities/<kebab-name>/` (singular form, kebab-case dir, PascalCase resource name verbatim from Prisma) consisting of three files. The engine consumes `entity.ts`; the seed (`prisma/seed/06-permissions.ts`) consumes `policy.ts`; the form layer + Detail-page redaction consume `schema.ts`. This standard codifies the conventions; per-domain detail lives in the cross-referenced standards below.

---

## 1. Required exports per file

| File | Required exports | Notes |
|---|---|---|
| `schema.ts` | `export const <name>Schema = z.object({...})` (or `export const schema` for aliased re-export); `export type <Name>Input = z.infer<typeof ...>`; `export default <name>Schema` | Validates admin INPUT only. NEVER includes server-managed columns (`tenantId`, audit, `deletedAt`, server-set tokens). |
| `entity.ts` | `export default <name>Entity: EntityDef<T>`; optional named `<Name>Row` type when widening Prisma model with relation includes | Spec §5.2 4-line page pattern imports the default export directly. |
| `policy.ts` | `export const <name>Policy: EntityPolicy = defineEntityPolicy({...})` (or `export const policy` for short modules); `export default <name>Policy` | Type annotation `: EntityPolicy` is REQUIRED — narrow literal inference from `defineEntityPolicy<P extends EntityPolicy>(p: P): P` would prevent Partial-keyed absence tests (`fileKindAllowlist.<missing-role> === undefined`). |

The barrel (`lib/entities/index.ts`) re-exports each entity's three modules + the `_types` re-exports + `ALL_ENTITIES` / `ALL_POLICIES` aggregate constants for downstream introspection.

---

## 2. `schema.ts` patterns

Mirror Prisma fields admin owns; omit server-managed columns. Validation choices:

- **Regex over freeform** for structurally constrained strings (per p2-cycle-1 lesson):
  - NIK: `z.string().regex(/^\d{16}$/)` — Indonesian KTP, 16 digits no separators
  - Phone (Indonesian mobile): `z.string().regex(/^(\+62|0)8\d{8,10}$/)` — `+62` or `08` prefix, 8-10 tail digits per BRTI subscriber range
  - Token (base64url 32-byte secret): `z.string().regex(/^[A-Za-z0-9_-]{43}$/)` — 43 chars, padding stripped
- **CUIDs:** `z.string().cuid()` — NEVER hand-rolled regex (consistency).
- **Email:** `z.string().email().max(255)` — RFC + VarChar mirror.
- **Enums** mirror EXACTLY the migration CHECK list. Mismatched lists silently accept invalid DB writes:
  ```ts
  // migration 07: CHECK (kind IN ('NIS', 'NISN', 'PREVIOUS_SCHOOL'))
  kind: z.enum(["NIS", "NISN", "PREVIOUS_SCHOOL"])
  ```
- **VarChar lengths** mirror `@db.VarChar(N)` declarations.
- **Date columns:** `z.coerce.date()` so admin form posts ISO strings and Zod normalizes to JS `Date`.

PII propagation: when a schema field carries `/// @PII <policy>` in `prisma/schema.prisma`, the auto-generated `lib/audit/redactor.ts` `PII_FIELDS` map drives Detail-page redaction at the consumer layer. Schema authors do not need to wire this — see [audit-pii.md](audit-pii.md) for the annotation contract.

---

## 3. `entity.ts` patterns

`EntityDef<T>` from `@/lib/scaffold` is the consumer contract. `T` is the **row type** the dataFetcher returns — typically the Prisma-generated model type, optionally widened with relation `include` selects (`<Entity>Row = Entity & { student: { fullName: string } }`). NEVER use the `<Entity>Input` type as `T` — it loses `id` / timestamps / `_count` and forces lossy `unknown` casts at the dataFetcher return path.

Required fields:
- `key`: kebab-case singular (e.g. `"student-identifier"`)
- `label` / `labelSingular`: Indonesian per [voice.md](voice.md) glossary
- `icon`: Lucide name (verify presence in `node_modules/lucide-react/dist/esm/icons/<kebab>.js`)
- `resource`: Prisma model name VERBATIM (matches `Permission.resource` in the seed)
- `searchFields: ReadonlyArray<keyof T & string>` — UI hint for engine search rendering. **EXCLUDES PII fields** (per `lib/audit/redactor.ts` PII_FIELDS) even when the dataFetcher's search predicate matches against them — predicate is independent of `searchFields`, which is rendered as a UI search-hint label.
- `listColumns`: 14-renderer table per spec §5.5. **EXCLUDES PII fields.** Use `format: (row) => ...` for computed display strings; pick an anchor `field` that exists on the row type (use `_count` when the indicator computes from a relation count).
- `filters`: 3-5 chip filters per spec §5.10 (count includes `SEARCH`). Under-floor deviations require explicit documentation in the file's header comment (the entity's typical access path being via another entity's detail page is the canonical justification — Household is the reference example).
- `views`: Smart Views for derived predicates that don't fit the chip-filter convention (chip BOOLEAN = `field=true|false`, NOT a derived predicate like `expiresAt < now()`). `expired` on GuardianInvitation is the reference example.
- `formSections`: per spec §5.4 anatomy.
- `detailTabs`: per spec §5.4 (e.g. Student → `ringkasan / wali / riwayat / lampiran / aktivitas`); render placeholder `<div>(deferred)</div>` until per-entity detail wiring lands.
- `detailActions: []` until override-hatch actions land per spec §5.3.
- `dataFetcher`: see §3a below.

### 3a. Shared dataFetcher contract

The engine signature has no session arg — `lib/scaffold/list-page.tsx` calls `entity.dataFetcher({page, pageSize, filters, search, sort?})` directly. Each dataFetcher MUST:

1. **Session resolve:** `const session = await getSession(); if (!session) throw new Error("UNAUTHENTICATED");`
2. **Tenant filter:** every `where` includes `tenantId: session.tenantId` (per spec §6.4 cross-tenant safety + RLS strict 32/32). NO exceptions.
3. **Soft-delete filter:** when `policy.softDelete === true`, include `deletedAt: null`. When `false`, OMIT — operational records have no `deletedAt` column; injection emits invalid SQL.
4. **OWN_STUDENT fail-closed branch (forward-looking):** when SessionContext gains `role` + `currentTermId` (lands `p2-scaffold-pages`), if `policy.scopes.read` includes `{ role: session.role, scope: "OWN_STUDENT" }` AND `resolvePermissions` returns `studentScopeUnresolved: true`, **`throw new Error("OWN_STUDENT_UNRESOLVED")`** — typed sentinel. NEVER fall through to `prisma.<model>.findMany` against an empty `studentIds` Set, which silently returns zero rows and masks the permission failure as a "no data" UI state. Until that lands, dataFetchers are admin tenant-scoped only.
5. **Sort handling:** `params.sort ? { [params.sort.field]: params.sort.dir } : <per-entity default>`. Hardcoded defaults silently break sortable column headers.
6. **Pagination:** `take: pageSize`, `skip: (page-1)*pageSize`; `count` runs in parallel via `Promise.all`.
7. **Search predicate:** entity-specific OR over searchable columns with `contains, mode: "insensitive"` for free-form text. Trigram GIN indexes (e.g. `Student.fullName` migration 07) are NOT used by Prisma `contains` — correctness-correct; raw-SQL trigram acceleration deferred.
8. **PII exclusion from listColumns** (clause 8): any `/// @PII`-annotated field in `prisma/schema.prisma` MUST NOT appear in `listColumns`. Detail-page tabs MAY render PII via consumer-layer `redact()` lookup of `PII_FIELDS`. List = unredacted exposure surface; Detail = redacted exposure surface.

---

## 4. `policy.ts` patterns

`EntityPolicy` is `lib/entities/_types.ts` (not in scaffold engine — keeps engine pristine; future engine cycle MAY promote). Required fields:

- `resource`: Prisma model name verbatim (matches `entity.resource`)
- `softDelete`: matches schema (`deletedAt` column presence)
- `auditActions`: cycle default `[CREATE, UPDATE, SOFT_DELETE, RESTORE]`. **`DELETE` is opt-in** — only when `softDelete: false` AND a hard-delete code path is intentional. Enrolling DELETE on a soft-delete entity writes semantically misleading audit rows when no hard-delete path exists (per p2-scaffold-registries spec-time review C2).
- `scopes: Record<CrudAction, ReadonlyArray<{role, scope}>>` — per-action × per-role grants. Empty array = action denied to that role.
- `fileKindAllowlist: Partial<Record<RoleCode, ReadonlyArray<FileKind>>>` — keyed only for roles with WRITE permission per the corresponding `scopes.create | update` entry. A read-only role has no upload right and therefore no allowlist key — `undefined` lookup is fail-closed at the gate (gating logic lands `p2-scaffold-canary`; see [storage.md](storage.md)).

Type annotation `: EntityPolicy` is REQUIRED on the export — narrow literal inference from `defineEntityPolicy<P>` blocks Partial-keyed absence tests (`fileKindAllowlist.<missing-role> === undefined`) at compile time.

---

## 5. OWN_STUDENT semantics

For parent-portal entities (Guardian / GuardianInvitation read scope), `OWN_STUDENT` resolves to `studentGuardians.guardianId = currentSession.guardianId` joined to the entity's tenant-scoped query. The resolver in `lib/scaffold/permission.ts` currently returns `studentScopeUnresolved: true` (Student model present from migration 07; resolver wiring lands `p2-scaffold-canary`). Page-layer callers MUST treat `studentScopeUnresolved === true` as block-render — see §3a clause 4.

---

## 6. Split-view FK precedent (Guardian.userId)

Phase 2 cycle p2-guardians introduced a **DB-composite + Prisma-single-column** FK pattern for nullable cross-tenant FKs. Reference for future entities with the same shape:

- **Migration:** composite FK `(userId, tenantId) → User(id, tenantId) ON DELETE SET NULL ("userId")` (Postgres 15.4+ column-list SET NULL — preserves §6.4 tenant alignment; tenantId stays bound when the User is hard-deleted).
- **Prisma schema:** SINGLE-column relation `user User? @relation(fields: [userId], references: [id], onDelete: SetNull)`. Dodges Prisma issue #25061 — composite SetNull would null all composite columns including `tenantId` via the client disconnect path, breaking the NOT NULL constraint at runtime.
- **`prisma migrate dev` drift trap:** Prisma WILL detect the divergence and propose a "regenerated" migration that drops the column-list SET NULL. **REJECT in PR review** — drift is intentional. `migrate deploy` (production path) only applies committed migrations and is unaffected.
- **Drift-recovery flow:** if a future contributor needs `migrate dev` for an UNRELATED schema change, manually edit the generated migration to remove the spurious Guardian.userId FK changes, keeping only the unrelated change. Apply via `migrate dev --create-only`.

Future entities with nullable cross-tenant FKs should reuse this pattern verbatim. Do NOT use a composite SetNull at the Prisma layer.

---

## 7. Partial-unique drift trap (entity Zod vs DB)

Entity Zod schemas may mirror DB CHECK constraints (discrete enums, regex patterns) for INPUT validation, but MUST NOT recreate DB-level partial-WHERE uniqueness. Partial uniques like `(tenantId, code) WHERE deletedAt IS NULL AND code IS NOT NULL` live ONLY in migrations (per p2-cycle-1 lesson — Prisma 7's DSL cannot express partial-WHERE; declaring `@@unique([tenantId, code])` at the schema layer would cause `prisma migrate dev` to regenerate a full unique constraint conflicting with the partial index). Use `findFirst` for those queries; the index covers the read.

---

## 8. Redirect-target convention

Per p2-cycle-1 lesson: prefer existing redirect helpers (`errorRedirect()`, route-conventional `/auth/error?reason=...`) over literal URL strings. Applies to entity policy.ts redirect-on-deny paths + future page-layer fail-closed branches. Literal URL strings drift if conventions change between speccing and implementing.

---

## 9. Cross-references

| Standard | Covers (do not duplicate here) |
|---|---|
| [audit-pii.md](audit-pii.md) | `writeAuditLog` usage, `/// @PII` annotation policies, partition retention, append-only contract |
| [crud.md](crud.md) | ERPNext-inspired CRUD recipes, soft-delete UX, list/detail layouts, edit-dialog pattern |
| [patterns.md](patterns.md) | Page recipes — Admin List/Detail/Form, Portal Dashboard, Workflow Queue |
| [security.md](security.md) | API route auth checklist, data-access roles, new-route security |
| [storage.md](storage.md) | `/api/upload` route, sharp pipeline, signed-URL TTL, FileKind bucket layout, role-FileKind gating logic |
| [voice.md](voice.md) | Voice/tone, Indonesian glossary, persona copy register |
| [api.md](api.md) | GET list pagination shape, mutation-response contract |

---

## 10. Lessons surfaced (cycle p2-scaffold-registries)

- **`SessionContext` shape gap surfaced at /build time.** The cycle's spec assumed `session.role` + `session.currentTermId` so dataFetchers could discriminate admin (ALL) from parent (OWN_STUDENT). Post-p1-auth the session carries only `{ tenantId, userId, supabaseUserId }`. Spec adjusted: dataFetchers admin-only this cycle; OWN_STUDENT throw branch deferred to `p2-scaffold-pages` when SessionContext widens. Lesson: SessionContext shape is an explicit dependency for any cycle that wires per-role data access. Spec-time check: `grep -n "type SessionContext\|interface SessionContext" lib/auth/session.ts` before locking dataFetcher contract.
- **Narrow literal inference on `defineEntityPolicy<P>` blocks Partial-keyed absence tests.** Tests asserting `policy.fileKindAllowlist.parent === undefined` need the wide `Partial<Record<RoleCode, ...>>` type, not the narrow inferred-keys-only type. Annotate policy exports `: EntityPolicy` explicitly.
- **`EntityDef<InputType>` is the wrong narrowing pattern.** Always use the row type (Prisma model + relation includes). Spec-time + post-build review caught all 5 entities; future entities should never start from the input type.

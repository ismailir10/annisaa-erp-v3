# Audit + PII

> Loaded on demand by `/build` when staged paths match `lib/audit/**`, `prisma/schema.prisma`, or `lib/**/actions/**` (last glob is forward-looking — activates when p2+ per-domain server actions land).

The `AuditLog` table is a Postgres-partitioned, append-only timeline. Every state-changing event in the system MUST land an audit row through `lib/audit/write.ts`. PII redaction is enforced by an auto-generated redactor sourced from `/// @PII` annotations on the schema; the partition table itself blocks `UPDATE` and `DELETE` via the `audit_log_block_update_delete()` trigger (migration 06).

---

## 1. When to call `writeAuditLog`

Call `writeAuditLog` from server-side code. Caller resolves session details (no implicit `getSession()` call inside the middleware). Required-and-nullable fields (`actorUserId`) MUST be passed explicitly — pass `null` for system actions (cron jobs, webhooks, retention sweeps) and never rely on `undefined` coercion.

| Caller | When | `action` |
|---|---|---|
| Server action mutating a row | After every CREATE / UPDATE / DELETE / SOFT_DELETE / RESTORE | matching `AuditAction` |
| Auth handlers | On successful login / logout / failed login attempt | `LOGIN` / `LOGOUT` (extend enum if needed) |
| Async export job | When the job completes or fails | `EXPORT` |
| Async import wizard | After each batch commits | `IMPORT` |
| Read-sensitive admin views | When inspecting payroll / salary / KK / NIK columns | `READ` |

Do NOT call from API route handlers if the underlying server action already audits. Pick one layer per code path. Two-layer audit creates duplicate rows.

## 2. PII annotation rules

Triple-slash directly above a schema field, on its own line:

```prisma
nik    String?  @db.VarChar(16)  /// @PII redact
phone  String?  @db.VarChar(20)  /// @PII mask:last4
```

Two policies, no others:

- **`redact`** — top-level field replaced with `null` in the audit row.
- **`mask:last4`** — string values become `"***" + last4`; values shorter than 4 characters become `"***"`; non-string values pass through unchanged.

The redactor walks **top-level keys only**. Nested PII must be flat-promoted to a top-level column to be caught — JSONB columns containing nested PII (e.g. `customFields.nik`) are not safe.

## 3. How to add a new PII field

1. Annotate the schema field: add `/// @PII <policy>` directly above the field.
2. Update the triples list in `scripts/verify-pii-annotations.sh` (hardcoded list — heuristic field-name scan would false-positive on `Campus.email`).
3. Re-run the redactor generator: `npx tsx scripts/generate-audit-redactor.ts` → writes `lib/audit/redactor.ts`.
4. Run the CI gate: `bash scripts/verify-pii-annotations.sh` → must report N/N pass.
5. Add a test case to `lib/audit/redactor.test.ts` covering the new field.
6. Stage all four files (schema, script, redactor, test) in the same commit — the gate enforces sync.

### Hardcoded triple list

Source of truth is `scripts/verify-pii-annotations.sh`'s `TRIPLES` array. Mirror table below kept in sync per cycle:

| Model    | Field   | Policy       | Cycle introduced                                  |
|----------|---------|--------------|---------------------------------------------------|
| Employee | nik     | redact       | `p1-employees` (migration 03)                     |
| Employee | phone   | mask:last4   | `p1-audit-timeline-files` (migration 06)          |
| Guardian | nik     | redact       | `p2-guardians` (migration 08)                     |
| Guardian | phone   | mask:last4   | `p2-guardians` (migration 08)                     |
| Student  | nik     | redact       | `p2-students-guardians-household` (migration 07)  |

## 4. Transaction threading (spec §5.13)

Server actions wrapping mutations in `prisma.$transaction` MUST pass the `tx` arg through to `writeAuditLog`:

```ts
await prisma.$transaction(async (tx) => {
  const updated = await tx.employee.update({ where: { id }, data });
  await writeAuditLog({
    tenantId: session.tenantId,
    actorUserId: session.userId,
    action: AuditAction.UPDATE,
    resource: "Employee",
    resourceId: updated.id,
    before,
    after: updated,
  }, tx);
});
```

Without `tx`, the audit row commits on the global client even if the surrounding transaction rolls back — leading to phantom audit rows that reference state never persisted. The `tx` thread is the single source of atomicity.

## 5. Append-only contract + JSON normalisation

The Postgres trigger `audit_log_block_update_delete()` raises `P0001` on every `UPDATE` and `DELETE` — fires for all roles including `service_role` (no `SECURITY DEFINER` bypass; `SECURITY INVOKER` raise-only function). The only legitimate deletion path is partition-drop (`DROP TABLE "AuditLog_y2026m05"`), which bypasses row-level triggers.

`writeAuditLog` JSON-normalises the `before` / `after` payloads before redaction (`JSON.parse(JSON.stringify(...))` round-trip). Why: callers commonly pass full Prisma rows that include `Date` / `Decimal` / nested types. PrismaPg forwards `Json?` column values to pg **as-is** without a serialisation pass — a raw `Date` object coerces via pg's default `.toString()`, producing `"Tue May 05 2026 …"` rather than an ISO string, and silently corrupts the audit row's payload shape. The round-trip yields a JSON-safe shape (`Date` → ISO string via `Date.prototype.toJSON`; `Decimal` → string via its `toJSON`; functions / `undefined` drop). Caveat: circular references throw upstream. Don't pass entities with bidirectional relations expanded.

## 6. Partition retention

Migration 06 pre-creates 18 monthly partitions (`AuditLog_y2026m05` through `AuditLog_y2027m10`). Auto-create cron + retention-drop cron land in p3 (pg-boss per spec §16.1a).

| Concern | Plan |
|---|---|
| Partition rollover after 2027-10 | Manual `CREATE TABLE` ahead of the boundary, OR p3 auto-create cron must ship before 2027-09 |
| Retention horizon | 7 years per spec §4.5 — first partition becomes droppable around 2033-05 |
| Drop mechanism | `DROP TABLE "AuditLog_yYYYYmMM"` — O(1), bypasses row trigger by design |
| Live verification | `lib/audit/__tests__/append-only-trigger.test.ts` — gated by `TEST_DATABASE_URL`. CI skips; developers run on demand against a Docker Postgres |

## 7. Append-only test gate (live DB)

Local run, against a throwaway Docker Postgres:

```bash
docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=test postgres:15
TEST_DATABASE_URL="postgresql://postgres:test@localhost:5433/postgres" \
  npx prisma migrate deploy
TEST_DATABASE_URL="postgresql://postgres:test@localhost:5433/postgres" \
  npx vitest run lib/audit/__tests__/append-only-trigger.test.ts
```

CI's `lint-typecheck-test` job has no `TEST_DATABASE_URL` set; the spec auto-skips. The trigger DDL itself is statically asserted in `prisma/migration-tests/06-audit-timeline.test.ts` and runs on every PR.

# TimelineEvent

> Loaded on demand by `/build` when staged paths match `lib/timeline/**`, `prisma/schema.prisma`, or `lib/**/actions/**` (last glob is forward-looking — activates when p2+ per-domain server actions land).

The `TimelineEvent` table is the per-subject activity feed per spec §4.1 Foundation row. Polymorphic (`subjectKind` + `subjectId` reference any model) and Zod-validated app-side via the `TIMELINE_EVENTS` registry. Visibility tiers (`PRIVATE` / `INTERNAL` / `PARENT_VISIBLE`) per §4.2 gate which actor sees the event in their feed; `RESOURCE_TO_SOFT_DELETE_KIND` automatically bridges `AuditLog.SOFT_DELETE` and `AuditLog.RESTORE` actions into matching timeline kinds.

---

## 1. When to emit

Emit a timeline event when the state change is meaningful for the subject's parent / staff / student to see in their feed. Audit and timeline are separate by design — every mutation audits, but only feed-visible events emit.

| Caller | When | Kind |
|---|---|---|
| Server action mutating a row that progresses an admission state | After the mutation succeeds | `student.admitted`, `student.enrolled` |
| Server action soft-deleting a row | Automatic via the audit bridge — do NOT call emit directly | `student.soft-deleted`, `employee.soft-deleted` (and parity restore kinds where mapped) |
| HR termination workflow | Direct emit (NOT the bridge — soft-delete and termination are distinct) | `employee.terminated` |
| Note attached to any subject (admin annotation, parent message) | After persistence | `note.added` |

Do NOT emit a timeline event when the audit row already covers the change AND the subject's feed audience does not need to see it (e.g. internal field-correction UPDATEs, READ accesses, system-generated EXPORT jobs). Two-layer "audit + timeline for everything" creates noisy feeds and duplicates the storage cost on a GIN-indexed JSONB column.

## 2. Visibility tiers

| Tier | Audience |
|---|---|
| `PRIVATE` | Only the actor and admin role; not visible to staff or parents. Used for sensitive HR events (e.g. `employee.terminated`). |
| `INTERNAL` | Admin + staff visible. Default for soft-delete / restore record-archival events and most operational events. |
| `PARENT_VISIBLE` | Admin + staff + parent of the subject student visible. Used for events parents should see (admission, enrolment). |

Override the registry default per call only when the visibility depends on context (e.g. a `note.added` flagged confidential should pass `visibility: 'PRIVATE'`). Otherwise leave the default — the registry is the canonical visibility statement.

Permission-gated SELECT filtering on the row itself lands with the feed UI cycle (p3+); today the visibility column is a hint for the read layer, not an enforced filter.

## 3. How to add a new kind

1. **Extend the registry.** In `lib/timeline/events.ts`, add an entry to `_TIMELINE_EVENTS_RAW`:

   ```ts
   "invoice.paid": {
     subjectKind: "Invoice",
     defaultVisibility: TimelineVisibilityEnum.PARENT_VISIBLE,
     payloadSchema: z.object({
       amountCents: z.number().int().positive(),
       method: z.enum(["cash", "transfer", "xendit"]),
     }).strict(),
   },
   ```

2. **Wire emit call sites.** From the entity cycle, call `emitTimelineEvent` in the server action that lands the mutation:

   ```ts
   await prisma.$transaction(async (tx) => {
     const invoice = await tx.invoice.update({ where: { id }, data });
     await emitTimelineEvent({
       tenantId: session.tenantId,
       actorUserId: session.userId,
       kind: "invoice.paid",
       subjectId: invoice.id,
       payload: { amountCents: invoice.amountCents, method: "xendit" },
     }, tx);
   });
   ```

3. **Extend the bridge map** ONLY if the new kind covers a soft-delete pair. Add a `RESOURCE_TO_SOFT_DELETE_KIND[Resource]` entry and re-run the registry-shape tests:

   ```ts
   Invoice: { SOFT_DELETE: "invoice.soft-deleted", RESTORE: "invoice.restored" },
   ```

   Skip this step for non-soft-delete kinds.

4. **Add registry-shape coverage.** The existing `lib/timeline/__tests__/events.test.ts` tests run forEach over all entries — new entries get the kebab-case + frozen + visibility checks for free. Add a payload-validation test only if the schema has non-trivial constraints worth pinning.

## 4. Polymorphic subject pattern

`subjectKind` and `subjectId` are plain `VARCHAR(50)` + `String` columns. There is no foreign key by design — the column references survive soft-deletes (which is the whole point of the timeline) and the column model is open across every domain.

The registry's `subjectKind` field declares which Prisma model a kind belongs to. Two patterns:

- **Non-polymorphic kinds** (most kinds — `student.admitted`, `employee.hired`, etc.) — registry value is the concrete model name. The emit middleware uses the registry value; if the caller also supplies `input.subjectKind` and it differs, emit throws an explicit mismatch error. This prevents typos drifting into the column.
- **Polymorphic kinds** (`note.added`) — registry value is the `"*"` sentinel. The emit middleware demands a non-empty `input.subjectKind` from the caller; without it, emit throws "polymorphic — input.subjectKind is required".

p2+ entity cycles MAY add a runtime guard that rejects unknown `subjectKind` values for polymorphic kinds; today the column accepts any string so a typo on `note.added.subjectKind` would persist.

## 5. Integration with `writeAuditLog` (audit-vs-timeline contract)

Audit logs every mutation; timeline only records feed-visible events. The two systems share the same caller transaction and mostly run in parallel — `writeAuditLog` does NOT emit timeline events except for the soft-delete / restore bridge that this cycle (p1-timeline-registry) wires automatically.

`RESOURCE_TO_SOFT_DELETE_KIND` (in `lib/timeline/events.ts`) declares which resources the bridge fires for. When `writeAuditLog` runs with `action: SOFT_DELETE` or `action: RESTORE` on a keyed resource:

```text
writeAuditLog(input, tx?)
  ├─ auditLog.create({ ... }) on (tx ?? prisma)
  └─ if RESOURCE_TO_SOFT_DELETE_KIND[input.resource]?.[input.action]:
       emitTimelineEvent({ ..., payload: {} }, tx)  on the same client
```

Atomicity is the caller's responsibility — pass `tx` so audit + timeline commit/rollback together. Without `tx`, both writes happen on the global `prisma` client without a transaction, and a timeline failure leaves a phantom audit row. The bridge implementation surfaces this risk via an inline comment at the call site.

Bridge map today (this cycle):

| Resource | SOFT_DELETE → kind | RESTORE → kind |
|---|---|---|
| `Student` | `student.soft-deleted` | `student.restored` |
| `Employee` | `employee.soft-deleted` | _(not yet registered — `console.warn` fires for partial-coverage diagnostic)_ |

Note: the bridge for `Employee.SOFT_DELETE` points at `employee.soft-deleted` (record archival), NOT at `employee.terminated` (HR state change). Termination is a separate workflow that emits directly via `emitTimelineEvent` and ships with the entity cycle that owns the termination UI.

## 6. Transaction threading

Identical to the `writeAuditLog` contract. Server actions wrapping mutations in `prisma.$transaction` MUST pass the `tx` arg through to `emitTimelineEvent`:

```ts
await prisma.$transaction(async (tx) => {
  const updated = await tx.student.update({ where: { id }, data });
  await emitTimelineEvent({
    tenantId: session.tenantId,
    actorUserId: session.userId,
    kind: "student.enrolled",
    subjectId: updated.id,
    payload: { classSectionId: data.classSectionId },
  }, tx);
});
```

The same rule applies to the audit→timeline bridge: when a server action calls `writeAuditLog({ action: SOFT_DELETE, resource: "Student", ... }, tx)`, the bridge threads the same `tx` through to `emitTimelineEvent` automatically. The `tx` thread is the single source of atomicity — without it, a Zod parse failure or DB hiccup mid-bridge leaves a phantom audit row.

## 7. JSON-normalisation contract

Same as `writeAuditLog` — `emitTimelineEvent` runs `JSON.parse(JSON.stringify(input.payload))` before persisting to the JSONB column. PrismaPg forwards `Json?` column values to pg as-is; a raw `Date` instance would coerce via the driver's default `.toString()` and silently corrupt the stored row. The round-trip yields a JSON-safe shape (`Date` → ISO string via `Date.prototype.toJSON`; `Decimal` → string via its `toJSON`; functions / `undefined` drop). Today's registry payloads are string-only, but the registry is open for entity cycles to add date / decimal fields.

Caveat: circular references throw at the `JSON.stringify` boundary. Don't pass entities with bidirectional relations expanded; pass plain payload shapes the way the registry's Zod schema declares.

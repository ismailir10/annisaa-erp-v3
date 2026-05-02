# Finance YAGNI — Second Pass

## Context

PR #141 (`finance-followup`) just merged with a ~540 LOC YAGNI sweep across the
finance module. User asked for one more pass focused on:

- Over-abstracted helpers that could be inline
- Single-use wrapper functions
- Defensive error handling that obscures flow
- Enterprise patterns inappropriate for a 500-student school
  (advisory locks, distributed-tx patterns, complex retry queues)
- Dead code, unused imports, commented-out blocks
- Duplicate logic across routes

A targeted explore agent flagged ~144 candidate lines. After verifying each
finding against the actual code, most had legitimate, documented reasons:

| Audit finding | Verdict | Why kept |
|---|---|---|
| `xendit-retry.ts` try/catch on best-effort write-back | Keep | Preserves partial-progress reporting on rare DB hiccups; without it, rows 1-N are lost when row N+1's update fails |
| `webhook.ts` `markProcessed` / `markIgnored` wrappers | Keep | Agent miscounted — they have 3 and 8 call sites respectively, not 1 |
| `invoices/route.ts POST` outer try/catch | Keep | Invoice is durable post-tx; outer try preserves "201 + xenditError field" UX. Removing → 500 instead of partial success |
| Per-tenant advisory lock in `nextInvoiceNumber` | Keep | Simpler than retry-on-unique-violation. Single SQL line vs a retry loop |
| Per-invoice advisory lock in webhook + manual payment + void | Keep | Defense-in-depth against rare TOCTOU between webhook and admin actions; comments document the why |
| `parent-activity.ts` author dedup with Set + Map | Keep | Standard idiom; alternative (JOIN) is more complex |
| `void/route.ts` throw-string-tagged-Error pattern | Keep | Canonical Prisma transaction pattern — must throw to roll back |

Two genuine simplifications remained.

## Spec

Acceptance criteria:

1. `lib/finance/run-bulk-generate.ts` — drop the named `defaultSleep` helper;
   inline the arrow at the call site.
2. `lib/parent-helpers.ts` — drop the `getStudentInvoices` pass-through wrapper.
   Make the cached function the export directly.
3. All gates green: `npx tsc --noEmit`, `npx vitest run`, `npm run lint` on
   changed files, `npm run build` (Next.js).
4. No behavior change. No public API change (the export name stays the same).

## Tasks

1. **Inline `defaultSleep`** — replace named function + reference with an arrow
   at the single call site in `runBulkGenerate`.
2. **Inline `getStudentInvoices` wrapper** — change the cached function from a
   private `_cachedGetStudentInvoices` const into the public `getStudentInvoices`
   export. Update its docstring to absorb the deleted wrapper's note.

## Implementation

### Task 1 — `lib/finance/run-bulk-generate.ts`

Removed `defaultSleep` (3 LOC). Inlined arrow at the call site:

```ts
const sleep = input.sleepImpl ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
```

Net: -3 LOC.

### Task 2 — `lib/parent-helpers.ts`

Removed the `getStudentInvoices` pass-through. The cached function is now the
export directly. Trimmed the comment (Set + Map idiom note) since the export
itself documents the cache key strategy.

Net: -8 LOC. (The sibling `_cachedGetParentWithChildren` wrapper was kept — it
adapts `SessionUser` to primitives, which is non-trivial.)

## Verification

- `npx tsc --noEmit` → clean.
- `npx vitest run` → 72 files pass, 584 tests pass, 42 todo, 2 skipped (matches
  staging baseline).
- `npx eslint lib/parent-helpers.ts lib/finance/run-bulk-generate.ts` → 0 errors.
- No design-system surface touched (this is a backend cleanup; no UI deltas).

## Ship Notes

- No migrations.
- No new env vars.
- Rollback: revert this commit; both wrapper functions return identical behavior.
- Follow-up: none. The audit confirmed the prior 540-LOC sweep was thorough;
  remaining "bloat" candidates have documented justifications and should not be
  removed without first changing the underlying contract (e.g. dropping the
  advisory locks would require introducing retry-on-conflict logic, which is
  more code, not less).

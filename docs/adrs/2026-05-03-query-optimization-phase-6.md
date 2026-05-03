# ADR — Query optimization Phase 6: eliminate N+1, fat rows, unbounded fetches

**Status:** Accepted, 2026-05-03 (codifies patterns established in commit cc5c368, PR #32)
**Cycle origin:** Phase 6 sweep landed 2026-05 (see commit `cc5c368` "perf: Phase 6 query optimization")
**Related:** prior phases archived under `docs/cycles/archive/2026-04-1[5,6,7,8]-perf-*.md`

---

## Context

Phases 1–5 chipped at bundle size, dynamic imports, and obvious slow-query offenders. Phase 6 was a systematic sweep with three targets: (1) N+1 patterns where a list query was followed by a per-row fetch (admin invoice list, parent dashboard, payroll detail), (2) "fat rows" — `findMany` calls with no `select`, returning all columns when the UI needed three, (3) unbounded fetches — `findMany` without `take` on tables that could grow past 1k rows in a few months (audit log, payment history, attendance records). Each pattern shows up in 30+ places; without a codified rule, future work re-introduces them.

## Decision

1. **Mandate `select:` on every `findMany` and every nested relation** that surfaces in an API response. Returning the full Prisma model is a code smell; a route's response shape is a contract.
2. **Default `take:` cap on listy routes** — pagination is mandatory above ~50 rows. Where a true unbounded list is needed (admin dashboard "all invoices this period"), wrap in a stats `groupBy` + on-demand drill-down rather than a flat list.
3. **`include: { _count: { select: { … } } }` for parent counts** instead of N+1 `count()` per parent. See `app/api/programs/route.ts` for the canonical example.
4. **Resolve relations via `findUnique({ where: { id }, select: { …, parent: { select: …} } })`** rather than two queries. The `select` rule extends to nested relations.
5. **Prefer `groupBy` over multi-`count` aggregates** for stats endpoints. See `app/api/invoices/stats/route.ts`.
6. **Two-query budget on detail pages.** A detail page handler fetches at most 2 queries: one for the main row + relations, one for any "list of related" the UI shows separately. More than that → restructure.
7. **Cap audit-log + payment-history reads** with `take: 100` and a UI "Load more" instead of full-history rendering.

## Consequences

**Accepted:**
- New routes must follow the `select` rule. Code review enforces; no automated lint yet.
- Adding a UI field that needs a new column requires updating both the `select:` and the response type — refactor friction is real but bounded.
- Unbounded growth on `AuditLog` and `Payment` tables means a `LIMIT`-driven UI; full export goes through a separate report path (deferred).

**Rejected alternatives:**
- Caching layer (Redis / KV): premature for current scale; added latency on stale invalidation; no obvious win until p95 page-load is bottlenecked on DB rather than transit.
- Prisma view models with `@@map`: adds a layer of indirection without removing the underlying `select` discipline.
- DataLoader-style batching: meaningful only if we had a GraphQL layer — REST + Server Components don't benefit enough.

## Verification

- Manually audited via PR #32 (commit `cc5c368`): 30+ routes touched, response shapes preserved, no E2E regressions
- `npx vitest run` covers shape contracts on tested routes (e.g. `invoices-stats.test.ts` asserts response is `{ total, draft, sent, ... }`, not the raw groupBy)
- No automated guard for the `select`-everywhere rule yet — future ADR may add a custom ESLint rule. Until then, code review is the gate.

// Typed error classes for the scaffold engine. Page-layer fail-closed contract
// per spec §5.7 + scaffold.md §5b dataFetcher contract clause 4.
//
// `OwnStudentUnresolvedError` is the canary for a parent caller hitting a
// dataFetcher that depends on the OWN_STUDENT scope resolver while the
// resolver still returns `studentScopeUnresolved: true` (resolver wiring
// lands p2-scaffold-canary). The page shells (`ScaffoldListPage` /
// `ScaffoldDetailPage`) catch any thrown error and pass it to
// `ScaffoldErrorState`, which differentiates this class via `instanceof` and
// renders Indonesian no-permission copy instead of the generic error UI.
//
// `instanceof` survives because the throw + catch + render all happen inside
// the same React Server Component evaluation — no client-component boundary
// (and thus no serialisation) is crossed.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages.md (T2)

export class OwnStudentUnresolvedError extends Error {
  constructor(message = "OWN_STUDENT_UNRESOLVED") {
    super(message);
    this.name = "OwnStudentUnresolvedError";
  }
}

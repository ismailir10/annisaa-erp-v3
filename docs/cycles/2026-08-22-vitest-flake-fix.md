# Vitest CI Flakiness — Three False Failures in One Day

## Context

The required `Lint, Typecheck & Test` check went red three times on 2026-08-22,
each time on a **different** single test out of 3138, each time on a diff that
touched no `app/`, `lib/` or test code:

| Test | Reported symptom |
|---|---|
| `app/admin/students/[id]/__tests__/page.test.tsx` › `AGE_OUT_OF_RANGE: warn → enter reason → success` | `role="alert"` never observed on `document.activeElement` |
| `app/admin/classes/[id]/__tests__/client.test.tsx` › same test name | same |
| `app/teacher/class-attendance/__tests__/page.test.tsx` › `ignores an older failed save…` | expected `Absensi tersimpan`, got `Menyimpan absensi` |

All three pass in isolation. Promotions were blocked on noise.

### Reproduction

Reproduced locally by oversubscribing the CPU — 12–14 busy loops on an
8-core box while running the suite at `--maxWorkers=12..14`, which is a
harsher version of what `ubuntu-latest` (4 vCPU, three vitest forks, each
constructing a jsdom) does to itself:

```
run 15:       Tests  2 failed | 17 passed (19)

 FAIL  app/admin/classes/[id]/__tests__/client.test.tsx > AGE_OUT_OF_RANGE: warn → enter reason → success
Error: Test timed out in 5000ms.
 FAIL  app/admin/students/[id]/__tests__/page.test.tsx > AGE_OUT_OF_RANGE: warn → enter reason → success
Error: Test timed out in 5000ms.
```

1 failure in 20 runs for a single file; 2 in 25 for the three together.

### Root cause — two distinct classes, one shared driver

**Driver: the suite starves its own runner.** `jsdom` was the global vitest
environment, so every one of the 320 suites paid ~2.8s of jsdom construction.
Measured on the `lib/**` + `app/api/**` subset — 225 files that never touch
the DOM:

```
jsdom:  Test Files 225 passed   Duration 146.32s (tests 36.47s, environment 627.84s)
node:   Test Files 225 passed   Duration  46.57s (tests 67.01s, environment  0.21s)
```

`environment` dominates `tests` by 17x. That wasted work is what makes the
runner contended, and contention is what turns wall-clock ceilings into dice.

**Class A — wall-clock ceilings too close to the work.** Vitest's stock
`testTimeout` is 5000ms and testing-library's `asyncUtilTimeout` is 1000ms.
Both are wall-clock: if the OS deschedules the worker mid-wait, the timer
fires on resume *before* the pending work does. Under full-suite parallelism
the slowest tests already sat within 1.4x of the cliff:

```
  3590ms  StudentDetailPage — AGE_OUT_OF_RANGE: warn → enter reason → success
  3538ms  ClassDetailClient — AGE_OUT_OF_RANGE: warn → enter reason → success
  2952ms  TeacherMoreSheet exposes the three lower-frequency teacher destinations
  ...     14 tests ≥1500ms, 26 ≥1000ms, 76 ≥500ms
```

That is the whole of the AGE_OUT_OF_RANGE story. Two band-aids for the same
cliff were already in the tree (`describe(..., { timeout: 30_000 })` twice in
`app/api/__tests__/parents.test.ts`).

A tempting alternative diagnosis was ruled out by measurement: the product
code does `setTimeout(() => ref.current?.focus(), 0)` after `setEnrollBlock`,
which *looks* like it could fire before React commits the banner and leave the
ref null forever. Instrumenting that callback and running 20 stressed
iterations gave **100 OK / 0 NULL** — the ref is always attached, so the
product code is not at fault and was left alone.

**Class B — sync assertions behind a false barrier.** The attendance failure is
a genuine race and nothing to do with timeouts:

```tsx
newerSave.resolve(ok({ saved: 1 }));
expect(await screen.findByRole("button", { name: /Aisyah — Sakit/ })).toBeInTheDocument();
expect(screen.getByRole("status")).toHaveTextContent("Absensi tersimpan");
```

The `await findByRole` reads as a barrier but is not one: the button label
comes from the *optimistic* update and was already in the DOM before
`newerSave.resolve`, so the find resolves on its first poll. The live region
only flips once the save promise chain settles, and the synchronous assertion
that follows raced it.

The same shape appears wherever a test resolves a deferred promise and then
asserts synchronously that the response was *ignored* — a negative assertion
that runs before the thing it is denying has even been processed. Those are
not currently red, but they are the same defect and are timing-dependent
rather than deterministic.

Neither `await` was missing anywhere: a sweep for unawaited `waitFor`,
unawaited `user.*` events and unawaited `screen.find*` found zero hits.

## Spec

1. The suite runs `node` for suites that do not touch the DOM and `jsdom` only
   for those that do, cutting the contention that drives the flake.
2. `testTimeout`/`hookTimeout` and testing-library's `asyncUtilTimeout` give
   real headroom over the slowest observed test, so a loaded runner cannot
   decide the outcome. A genuinely stuck test still fails — later, not never.
3. Every assertion that depends on an async transition waits for that
   transition explicitly: `findBy*`/`waitFor` for positive assertions,
   `await act()` for negative ones (a `waitFor` on an already-true condition
   is not a barrier).
4. No assertion is removed, loosened or wrapped in a retry. Each rewritten
   assertion is mutation-tested: break the guard it covers, the test must go
   red.
5. Proof is a loop, not a run: ≥10 consecutive green full suites, plus
   stressed runs under deliberate CPU oversubscription.

## Tasks

- **T1 — Split the vitest environment into `node` and `jsdom` projects.**
  Route by extension with a named-file escape hatch; split `vitest.setup.ts`
  into a shared half and a DOM-only half.
- **T2 — Raise the wall-clock ceilings.** `testTimeout`/`hookTimeout` to 30s;
  `asyncUtilTimeout` to 5s. Drop the two local `{ timeout: 30_000 }` band-aids
  now that the global default covers them.
- **T3 — Fix the Class B races.** Rewrite the false-barrier assertions in the
  attendance and student-journal suites; mutation-test each.
- **T4 — Prove it.** 10 consecutive clean full runs plus 10 stressed full runs.

## Implementation

**T1 — `node` / `jsdom` projects.** `vitest.config.ts` now declares two
projects: `node` owns `**/*.test.ts`, `jsdom` owns `**/*.test.tsx`. One `.ts`
suite renders React (`components/portal/__tests__/week-grid.test.ts` asserts
WeekGrid's markup, not only the `isWeekGridDateEditable` predicate) and is
named in `DOM_TS_SUITES`, which both excludes it from `node` and hands it the
DOM setup file — an escape hatch that is a list, not a docblock, so it stays
visible and countable.

`vitest.setup.ts` split in two. The shared half (the `next/cache` stub) loads
in both projects and may not touch `window`; the new `vitest.setup.dom.ts`
keeps `jest-dom`, the `scrollIntoView`/`matchMedia`/`ResizeObserver` shims and
`afterEach(cleanup)`, and adds the `asyncUtilTimeout` bump.

**T2 — ceilings.** `testTimeout`/`hookTimeout` 30s, `asyncUtilTimeout` 5s. The
two `describe(..., { timeout: 30_000 })` band-aids in
`app/api/__tests__/parents.test.ts` and the `waitFor(..., { timeout: 1000 })`
in `components/teacher/__tests__/leave-sheet.test.tsx` were deleted — the
first is now the global default, and the second was the old default restated,
so keeping it would have pinned that one assertion back under the cliff.

## Verification

## Ship Notes

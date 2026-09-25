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

**T3 — the races.** Four assertions in three suites:

| File | Was | Now |
|---|---|---|
| `app/teacher/class-attendance/__tests__/page.test.tsx` | sync `getByRole("status")` after `newerSave.resolve` | `await waitFor(...)` — the preceding `findByRole` matched optimistic state and was never a barrier |
| ″ | `firstRoster.resolve` + `waitFor` on already-visible content, then a sync negative assertion | `await act(async () => firstRoster.resolve(...))`, then the assertions |
| `app/teacher/student-journal/students/[id]/__tests__/page.test.tsx` | same shape for the stale prior-week response | same fix |
| `components/teacher/__tests__/leave-sheet.test.tsx` | `await user.click` then "zero overlays are up" | `fireEvent.click` — synchronous, so `openAfterSheetCloses`'s 240ms handoff timer cannot fire between the click and the assertion |

The leave-sheet one was **not** in the original three. It was found by T4's
harness after the other fixes were in, and it was the harder call: the
assertion samples a 240ms window, so no amount of waiting makes it
deterministic — only refusing to yield the event loop does. Fake timers were
tried first and rejected: `vi.useFakeTimers()` deadlocks Base UI's overlay
presence logic and hung all three tests in the file for the full 30s.

Each rewritten assertion was mutation-tested — break the guard it covers, the
test must go red:

```
$ # disable the roster stale-response guard (page.tsx:83)
  × keeps the newest class/date roster when an earlier request resolves late
$ # disable the journal stale-response guard (page.tsx:96)
  × ignores a stale prior-week response after week navigation
$ # make openAfterSheetCloses open the next overlay immediately
  × hands off from sheet to request dialog without stacking overlays
    AssertionError: expected <div data-open …> to have a length of +0 but got 1
```

**T4 — `scripts/flake-hunt.sh`.** Runs the suite N times under M CPU hogs and
prints every test that failed at least once. This is the thing that was
missing: a static sweep cleared leave-sheet, the harness caught it 6 times out
of 10. Registered in CLAUDE.md next to the testing gates.

**Not changed, deliberately.** No product code. The
`setTimeout(() => ref.current?.focus(), 0)` pattern in six call sites looked
like the AGE_OUT_OF_RANGE culprit; instrumenting it showed 100 OK / 0 NULL
across 20 stressed runs, so it was left alone. No `retry`, no removed or
loosened assertion, no `try`/`catch` around a flaky expectation.

## Verification

**Gates.** `npm run build` ✅ · `npx vitest run` ✅ 3138 tests ·
`npx tsc --noEmit` ✅ · `npm run lint` ✅ 0 errors, 62 pre-existing warnings.

- [x] Cross-checked `design-system.html`: no visual surface changed. The diff
      is vitest config, four test files, one shell script and docs — no
      component, page, stylesheet or token — so there is nothing to check it
      against.

**Playwright** — deferred to the required CI `Playwright E2E` check. Not run
locally: `playwright.config.ts` refuses a non-local `DATABASE_URL`, and this
repo's `.env` points at shared staging, where the specs would create real
`E2E …` rows. Nothing in this cycle can affect Playwright — it shares no
config with vitest.

**Preview-verify** — skipped. No runtime code changed; there is nothing for a
Vercel preview to show.

**The loop.** Before, three files under 14 CPU hogs at `--maxWorkers=14`:

```
run 15:  Tests  2 failed | 17 passed (19)     ← both AGE_OUT_OF_RANGE, "Test timed out in 5000ms"
         2 red runs in 25            (single file alone: 1 red in 20)
```

After T1–T3, full suite × 10 under 12 hogs at `--maxWorkers=12` — the
AGE_OUT_OF_RANGE and attendance failures are gone, and the harness finds the
one that was left:

```
run 1: ok    run 2: FAIL   run 3: ok    run 4: ok    run 5: FAIL
run 6: FAIL  run 7: FAIL   run 8: FAIL  run 9: ok    run 10: FAIL
   6  FAIL |jsdom| components/teacher/__tests__/leave-sheet.test.tsx > hands off from sheet to request dialog without stacking overlays
```

After the leave-sheet fix, the same stressed harness, 12 runs:

```
run-1 … run-12:  Tests  3096 passed | 42 todo (3138)
FAIL lines: (none)
```

And unstressed, `bash scripts/flake-hunt.sh 10 0`:

```
run 1: ok  —      Tests  3096 passed | 42 todo (3138)
run 2: ok  —      Tests  3096 passed | 42 todo (3138)
run 3: ok  —      Tests  3096 passed | 42 todo (3138)
run 4: ok  —      Tests  3096 passed | 42 todo (3138)
run 5: ok  —      Tests  3096 passed | 42 todo (3138)
run 6: ok  —      Tests  3096 passed | 42 todo (3138)
run 7: ok  —      Tests  3096 passed | 42 todo (3138)
run 8: ok  —      Tests  3096 passed | 42 todo (3138)
run 9: ok  —      Tests  3096 passed | 42 todo (3138)
run 10: ok  —      Tests  3096 passed | 42 todo (3138)

flake-hunt: 10/10 runs green.
```

**22 consecutive green full suites** (12 stressed + 10 clean), 3138 tests
each, against 6-in-10 red on the same stressed harness before the last fix.

**Suite wall-clock: 144s → 62s**, entirely from not building a jsdom for the
224 suites that never touch one.

### T5 — the one this cycle missed, found by its own CI run

The first CI run of this PR still failed `Lint, Typecheck & Test`: **320 passed,
1 failed**, `app/admin/classes/[id]/__tests__/client.test.tsx > AGE_OUT_OF_RANGE:
warn → enter reason → success`, on

```
expect(element).toHaveAttribute("role", "alert") // element.getAttribute("role") === "alert"
```

after 5802 ms. T1–T4 had assumed the two T7 override-confirm files were casualties
of parallelism pressure and would recover once the jsdom split relieved it. They
were not — the classes-page one has a real defect of its own, and this cycle never
opened the file.

**The defect is in the component, not the test.** `app/admin/classes/[id]/client.tsx`
moved focus to the 409 advisory with

```ts
setEnrollBlock({ code: d.code, message: d.error });
setTimeout(() => enrollBannerRef.current?.focus(), 0);
```

That races React. On scheduling orders where the macrotask runs before the banner
commits, `enrollBannerRef.current` is still `null`, `focus()` no-ops, and **nothing
retries** — so the test's `waitFor` is not waiting on something slow, it is waiting
on something that is never going to happen, and burns its full ceiling before
failing. Raising a timeout could never have fixed this.

It is also a real accessibility bug, not only a test artifact: on those same
orders a screen-reader user is left on the old step while a new one is on screen.

Fixed by moving the focus into an effect keyed on `enrollBlock`, which runs after
commit, so the ref is always attached.

**Honesty about the evidence.** This fix is *not* backed by a local reproduction.
`flake-hunt.sh` could not reproduce the failure on this machine either way:

```
# single file, 12 hogs on 8 cores — with the fix
flake-hunt: 8/8 runs green.
# single file, 12 hogs — with the fix stashed (baseline)
flake-hunt: 8/8 runs green.
# full suite × 3, 12 hogs — with the fix stashed (baseline)
run 1: ok  —      Tests  3134 passed | 42 todo (3176)
run 2: ok  —      Tests  3134 passed | 42 todo (3176)
run 3: ok  —      Tests  3134 passed | 42 todo (3176)
flake-hunt: 3/3 runs green.
```

CI's 4 vCPUs are harsher than 12 hogs on 8 cores, and this failure has only ever
been seen there. So the argument for the change is the mechanism — a
fire-and-forget `setTimeout` against an uncommitted ref cannot be correct — and
the evidence is the CI check itself. `flake-hunt` staying green is consistent
with the fix, and proves no regression, but it is not the proof.

## Ship Notes

- No migration, no env var. One runtime change (T5): the enroll-advisory focus
  in `app/admin/classes/[id]/client.tsx` moves from a `setTimeout` to an effect.
  Behaviour is unchanged when the timer used to win the race, and correct when
  it used to lose.
- **Rollback:** revert the PR. Nothing outside `vitest.config.ts`,
  `vitest.setup*.ts`, four test files, `app/admin/classes/[id]/client.tsx`,
  `scripts/flake-hunt.sh` and docs changes, and no test loses an assertion on
  the way back.
- Watch the `Lint, Typecheck & Test` check on the next few PRs: it should
  also get materially faster, since the jsdom split removes ~80s of the job.
- The `{ timeout: … }` per-test override is now a smell, not a fix — CLAUDE.md
  says so. If one is ever needed again, the global ceiling is wrong.

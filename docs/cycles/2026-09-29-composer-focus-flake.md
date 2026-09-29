# Deflake the composer discard-focus test

## Context

After #584 merged, the required `Lint, Typecheck & Test` check went red on promotion PR #581 (head `4c8b5f1`, run 36592357780). The failing test is `components/student-journal/__tests__/note-compose-dialog.test.tsx`, "asks inside the composer: no second overlay is stacked on top": focus was expected on "Lanjut menulis" but was on the date `Select` trigger. The same test passed on #584's own CI run and locally, including 12/12 `flake-hunt` runs under CPU load.

Root cause, from `@base-ui/react` `FloatingFocusManager` (initial-focus layout effect → `queueMicrotask` → `enqueueFocus`, one `requestAnimationFrame`):
1. The test rendered the dialog, typed and clicked Batal in one synchronous run, before the dialog's open-focus microtask had run.
2. By the time that microtask ran, focus was already inside the dialog, on "Lanjut menulis". So `hadFocusInside` was true, and its `shouldFocus()` guard always returns true.
3. The queued frame then moved focus to the first tabbable field, the date `Select`. Whether that frame fired before the test's assertion depended on runner load.

This is a test artifact, not a product bug. A person cannot click within one microtask of a dialog opening, and once opening has settled the guard sees focus already moved and leaves it alone. Reproduced deterministically by stubbing `requestAnimationFrame` as `setTimeout(0)`: 1 of 8 tests fails.

## Spec

- [x] The test waits for the dialog's initial focus to land before interacting, as a user would. No per-test timeout, no skip.
- [x] Passes with `requestAnimationFrame` stubbed to fire immediately, delayed 80 ms, and real.
- Non-goals: the component. Its behaviour is correct once the dialog has opened.

## Tasks

- [x] 1. Wait for initial focus in the discard-focus test.

## Implementation

- Subagent plan: inline, no fan-out. A one-line test change, diagnosed by reading the library's focus manager directly.
- Task 1: `components/student-journal/__tests__/note-compose-dialog.test.tsx` adds `await waitFor(() => expect(document.activeElement).not.toBe(document.body))` after `setup()`, with a comment naming the mechanism.

## Verification

- Before: rAF stubbed to `setTimeout(0)` → `Tests 1 failed | 7 passed (8)` (the CI failure, reproduced). After: fast rAF 8/8, rAF delayed 80 ms 8/8, real rAF 8/8. The stub was a local check only and is not committed.
- Gates on base 4c8b5f1 plus this diff: `npm run build` exit 0; `npx vitest run` → `Tests  4368 passed | 42 todo (4410)`; audit-docs 0 fail.
- [x] Cross-checked design-system.html: not applicable, test-only diff with no rendered or visual change.
- Route: test-only diff. Playwright is not affected; the CI `Playwright E2E` check still gates the merge.

## Ship Notes

- No runtime change, no migrations, no env vars. Rollback: revert.

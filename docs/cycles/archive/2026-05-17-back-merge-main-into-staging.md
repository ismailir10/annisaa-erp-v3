# Back-merge main → staging (unblock promote PR #288)

## Context

Promote PR [#288](https://github.com/ismailir10/annisaa-erp-v3/pull/288) (staging → main, 66 commits) opened CI-green but `gh pr merge --squash` rejected with: *"the merge commit cannot be cleanly created"*. Main has 4 commits since the last promote (#162, 2026-05-03) that never back-merged to staging:

- `dbf82ee3` — chore(deps): bump next from 16.2.3 to 16.2.6 (#254)
- `b0e16ced` — chore(deps): bump fast-uri from 3.1.0 to 3.1.2 (#213)
- `fd6491f1` — chore(deps): bump hono from 4.12.14 to 4.12.18 (#210)
- `e48435a7` — chore(deps): bump ip-address and express-rate-limit (#197)

`e48435a7` is a malformed squash: title claims "bump ip-address + express-rate-limit" but the actual commit landed 295 files on main (the full Talib rebrand bundle + many cycle 0 files that had also accumulated on staging from #166/#171/#177). Result: staging and main independently evolved 38 of the same files since 2026-05-03 → merge conflicts.

Same pattern as #238 ("back-merge main → staging — bring 3 dependabot lockfile bumps"). This is the 2026-05-17 equivalent for the newer drift.

## Spec

**Acceptance criteria:**
- Branch is a clean merge of `origin/staging` + `origin/main`, no conflicts.
- Resolution policy: take staging for all 38 code/doc/snapshot conflicts (staging is newer; main's contribution was the corrupted PR #197 squash that re-introduced pre-#162 content).
- `package.json` reflects staging's deps **plus** main's `next` bump (16.2.3 → 16.2.6). The other 3 main bumps (fast-uri, hono, ip-address, express-rate-limit) are transitives — lockfile only.
- `package-lock.json` regenerated via `npm install`.
- 3 main-only files dropped because staging deleted them or never had them:
  - `docs/superpowers/plans/2026-05-02-rebrand-talib.md` (staging archived superpowers tree)
  - `docs/superpowers/plans/2026-05-03-dashboard-shadcn-rebuild.md` (same)
  - `e2e/__snapshots__/admin-dialogs/settings-salary-components-create-desktop.png` (staging uses `salary-components-create-desktop.png` — renamed)
- After merge, PR #288 becomes auto-mergeable.
- Build + vitest gates green.

**Non-goals:**
- Reviewing the 295 files in `e48435a7` for what should have been on main vs staging. The corrupted squash is permanent in main history; this cycle just normalises forward.
- Investigating why PR #197 squashed so badly. File separately if interesting.

## Tasks

- [x] T1 — Create `chore/back-merge-main-2026-05-17` off `origin/staging`. Run `git merge origin/main`, resolve 38 conflicts by `git checkout --ours` for all non-package files. Manually resolve `package.json` (staging base + `"next": "16.2.6"`). Regen lockfile via `npm install`. Drop 3 main-only files via `git rm`. Restore tracked `node_modules` symlink.
- [x] T2 — Build + vitest gates. Skip Playwright locally — deps-only diff, no code changed; CI Playwright run is the gate.

## Implementation

### T1 — Merge + resolve

- 38 conflict files (UU+AA) batched via `git checkout --ours $(cat /tmp/conflict-files.txt)` then `git add`.
- `package.json`: `cp /tmp/pkg-ours.json package.json` then `sed -i 's/16.2.3/16.2.6/'` on the `next` line.
- `package-lock.json`: `git checkout --ours` then `npm install` to regen. Output: `5 moderate severity vulnerabilities` warning carried over — same vulnerabilities present on staging tip pre-merge, not introduced here. File separately if Dependabot doesn't auto-PR these.
- `node_modules` symlink (tracked blob `120000 952701c12393`) was replaced by `npm install` with a real directory; restored via `ln -s /Users/ismailrabbanii/Documents/ai-builder/school-erp/node_modules node_modules` matching the tracked target.

Net diff vs `origin/staging` after merge resolution:

```
 package-lock.json | 80 ++++++++++++++++++++++++++++----------------------------
 package.json      |  2 +-
 2 files changed, 41 insertions(+), 41 deletions(-)
```

Just the next bump plus the lockfile reconciliation.

## Verification

- `npm run build` — ✓ green, full Next.js 16.2.6 production build succeeded.
- `npx vitest run` — ✓ green, verbatim: `Test Files  175 passed | 2 skipped (177)`, `Tests  1663 passed | 42 todo (1705)`, duration 59.61s. Identical pass count to the pre-merge baseline run earlier today on `feat/fix-classtrack-rls-role`.
- Playwright skipped locally — deps-only diff (1 patch-version Next.js bump, no code change), pattern matches dependabot lockfile PRs (#234, #235) which skip local Playwright. CI Playwright will run on the PR.
- Cross-checked design-system.html §none — no UI surface touched.

## Ship Notes

**Migration:** none.

**Env vars:** none.

**Rollback:** revert this merge commit with `git revert -m 1 <sha>` on staging. Staging continues to lack the 4 main bumps; PR #288 will remain blocked until resolved another way.

**Follow-up:** once this merges, `gh pr merge 288 --squash` succeeds and the 66-commit promote (plus this back-merge as the 67th merge-parent) lands on main.

Audit candidate (file separately): PR #197's squash bundled 295 unrelated files — investigate dependabot config or the squash workflow to prevent recurrence.

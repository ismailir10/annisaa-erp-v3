# TanStack Table v9 compatibility for PR #483

## Context

PR #483 upgrades `@tanstack/react-table` from v8 to v9. The first v9.1.2 typecheck reproduced 325 errors because the current shared table and its consumers use v8 hooks, row-model helpers, and column-definition types. The dependency has no authentication impact; it is consumed by admin table UI and types. The user approved completing this PR for staging, based on `staging` at `54f3fba`.

## Spec

- Keep the v9 dependency and use TanStack's official `@tanstack/react-table/legacy` compatibility API to preserve existing table behavior with the smallest complete migration.
- Move the shared hook and row-model imports to the legacy entrypoint; use `LegacyColumnDef` for existing column definitions and `LegacyColumn` for the shared header type.
- Preserve client/server sorting and pagination. TanStack row selection is not used by the app and is outside this change.
- Keep JSX and CSS unchanged. Inspect current table layout and interactions against [the design-system reference](../../.claude/standards/design-system.html).
- Use the official [v9 migration guide](https://tanstack.com/table/latest/docs/framework/react/guide/migrating) and [useLegacyTable guide](https://tanstack.com/table/latest/docs/framework/react/guide/use-legacy-table). The compatibility API is explicitly temporary and deprecated, includes all features, and costs more bundle size; a native v9 migration is future scope.

## Tasks

- [x] Confirm the v9.1.2 type break and trace existing table consumers.
- [x] Migrate the shared table hook/model helpers and all v8 column type consumers to supported legacy exports.
- [x] Add regression coverage for sort behavior and client/server pagination without weakening existing assertions.
- [x] Run local checks and browser inspection; complete the documentation audit and record results.
- [x] Prepare current-head CI and merge guards; final CI status and merge remain pending.

## Implementation

- Subagent plan: driver `gpt-6`; delegate migration, regression tests and audit to `gpt-6-luna`, then independently review the result.
- The shared table uses the official legacy hook and model helpers; existing v8-style columns use `LegacyColumnDef`, and the header uses `LegacyColumn`. Existing table rendering and styling remain unchanged.
- No application auth, API, database, or schema behavior changes are in scope.

## Verification

- The initial v9.1.2 typecheck before migration failed with 325 errors, reproducing the incompatibility. After migration, `npm run build` and `npm run typecheck` passed; `npm run lint` reported 0 errors and 59 existing warnings. `npx vitest run` passed 342 suites (2 skipped), with 3,314 tests passed and 42 todo. `npx playwright test` passed 145 tests with 8 existing skips.
- Local browser inspection used `DEMO_MODE=true`, a local demo super-admin cookie, and disposable PostgreSQL database `schoolerp_pr483_v1` on localhost:55432 with remote guards enabled (`route=local`). Against [the design-system reference](../../.claude/standards/design-system.html), existing table layout and sort/pagination interactions were inspected; JSX and CSS were unchanged. No JavaScript errors or uncaught exceptions occurred; only informational localhost-load messages from Vercel Analytics and Speed Insights appeared. No Google/auth flow was exercised or needed because this dependency is UI-only with no auth impact. TanStack row selection is not used by the app.
- Browser evidence: `/admin/students` verified server sort ascending/descending, next page and page-size reset; `/admin/classes` verified client-side sort and row menu; `/admin/employees` verified server sort; `/admin/admissions` verified client-side sort; `/admin/fees` and `/admin/settings/users` verified table rendering and row menus. Interactions were read-only. Screenshots: [students descending sort](screenshots/pr-483-tanstack-table-v9/students-desc.png), [students page 2](screenshots/pr-483-tanstack-table-v9/students-page-2.png), [classes row actions](screenshots/pr-483-tanstack-table-v9/classes-actions.png), [employees row actions](screenshots/pr-483-tanstack-table-v9/employees-actions.png). The production build shared the local demo DB while E2E ran, so row counts could reflect E2E fixtures; no count-stability assertions were made. This is local browser evidence, not CI Playwright or authenticated preview verification.
- Audit: `bash scripts/audit-docs.sh --write` reported 13 ok, 1 existing ADR-age warning, 0 fail. `git diff --check` passed.
- Independent static source review found no actionable issue. Local source commit `391d312929c6c4a8ad52e26ae1a304070f11341e` has tree `24c2e336fd9ddfbf38fa9b994701fe4bfdffd874`, based on staging `54f3fba9b71ee1992cae5ba86fb0ed770ff27a88`. The Git API source commit `b8b6a1c83b6504cdcc0c0a0ae471de779b85a518` has the same source tree with different metadata/history. Publication preserves this exact source tree; current-head CI is checked separately before merge.
- The soft-skip delta is unchanged at 31→31 (0), confirming this change adds no skipped-test delta.
- Required CI checks are `Docs sync`, `Lint, Typecheck & Test`, `Build`, `Playwright E2E`, plus every other required check. Merge only after all are successful for the exact current head and the current-base/head guard passes; actual merge remains pending.

## Ship Notes

No migrations, environment changes, or production auth changes are expected. The v9 compatibility layer is a temporary bridge with all-features bundle cost; plan a separate native-v9 migration before a future breaking release removes it. Roll back by reverting this PR. Production promotion is outside this task.

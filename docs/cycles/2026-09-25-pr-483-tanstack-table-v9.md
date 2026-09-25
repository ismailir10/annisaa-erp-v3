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
- [ ] Migrate the shared table hook/model helpers and all v8 column type consumers to supported legacy exports.
- [ ] Add or adjust regression coverage for sort behavior and client/server pagination without weakening existing assertions.
- [ ] Run full checks and local browser inspection; complete documentation audit and record results.
- [ ] Merge only the current PR head after all required and additional checks succeed and the current-base/head guard passes.

## Implementation

- Subagent plan: driver `gpt-6`; delegate migration, regression tests and audit to `gpt-6-luna`, then independently review the result.
- The shared table uses the official legacy hook and model helpers; existing v8-style columns use `LegacyColumnDef`, and the header uses `LegacyColumn`. Existing table rendering and styling remain unchanged.
- No application auth, API, database, or schema behavior changes are in scope.

## Verification

- Initial v9 typecheck before the migration: failed with 325 errors, reproducing the incompatibility.
- Migration tests, full typecheck/build/lint, unit tests, local browser inspection, and documentation audit: pending; do not treat the initial failure as a passing check.
- Browser inspection will use local demo data to check representative admin tables, sort interaction, and client/server pagination. No signed-in preview is needed unless review finds auth impact.
- Required CI checks are `Docs sync`, `Lint, Typecheck & Test`, `Build`, and `Playwright E2E`; all other required checks must also report success. Merge only the verified current head against the current staging base.

## Ship Notes

No migrations, environment changes, or production auth changes are expected. The v9 compatibility layer is a temporary bridge with all-features bundle cost; plan a separate native-v9 migration before a future breaking release removes it. Roll back by reverting this PR. Production promotion is outside this task.

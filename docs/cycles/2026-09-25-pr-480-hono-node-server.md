# PR #480: update the Hono Node server adapter

## Context

The user approved a sequential queue of existing dependency PRs. This cycle covers PR #480 only, after refreshing its target context to `origin/staging` at `4302e47`. Its lockfile changes `@hono/node-server` from `1.19.13` to `2.1.1` and updates the `fsevents` dev metadata. The current local candidate is `c5ced484c2b35c22ce8ed659b067a2855889c7ca`.

## Spec

- Review the existing PR #480 dependency update and repair verification failures it exposes.
- Preserve application authentication behavior and all required CI checks.
- Do not make production changes. Do not treat preliminary install or dependency-tree checks as a substitute for the required gates or upstream review.

## Tasks

- [x] Refresh staging and update the lockfile candidate for `@hono/node-server` 2.1.1.
- [x] Complete the build, Vitest, and upstream release/consumer review.
- [ ] Complete renewed verification after staging integration and repair the ambiguous billing-test selector.

## Implementation

- Subagent plan: driver=`gpt-6`; dirty-work=`gpt-6-luna` traces dependency consumers and audits upstream release changes.
- Changed `package-lock.json` only: `@hono/node-server` `1.19.13` → `2.1.1`; `fsevents` dev metadata was updated. The package manifest range already accepts the new version.
- Consumer trace places the adapter in the MCP SDK's HTTP transport, reached through the shadcn development tool dependency. The shadcn CLI uses the separate stdio transport; application code imports only `shadcn/tailwind.css`, not the adapter.
- Scope remains PR #480; no application or authentication code changed.
- Staging moved to `f5fef3d` when another task merged #556. Integrated it and reran build, typecheck, lint, all unit tests (3311 passed), and the MCP handshake successfully.
- That integration's browser run exposed an existing name-only billing-test selector: the API chose an enrolled ACTIVE-year TKIT B class, but `.first()` clicked a same-named PLANNING-year class with zero enrollments. The wizard request retained the ACTIVE year, correctly yielding no rows. The test now searches by name and selects the exact API class ID from the existing option value; no application behavior or assertions changed.

## Verification

- Local verification route: non-UI development tooling. Candidate SHA: `c5ced484c2b35c22ce8ed659b067a2855889c7ca`, tree `b50be2f755fed42588ab07affc1fca060c9da6b2`; target staging was refreshed to `4302e47`. No application OAuth, cookie, session, or auth-guard consumer is affected.
- GitHub integration commit `ac58b402199300277297776dd17c4cb32efc8fbd` has that exact verified tree. Later documentation-only evidence changes do not change the tested dependency or runtime source.
- `npm ci`: passed.
- `npm ls`: the sole resolved chain is `shadcn@4.18.0` → `@modelcontextprotocol/sdk@1.30.0` → `@hono/node-server@2.1.1`; the parent range `^1.19.9 || ^2.0.5` accepts 2.1.1.
- `npm run build`: passed.
- `npx vitest run`: passed, 341 suites, 3308 tests; 42 todo and 2 skipped.
- Upstream review: [Hono Node Server v2.0.0 release notes](https://github.com/honojs/node-server/releases/tag/v2.0.0) drop Node 18 support and the Vercel adapter; this project targets Node 20+ and does not use that adapter. The SDK's `getRequestListener` consumer remains compatible.
- `npm run typecheck`: passed. `npm run lint`: 0 errors, 59 existing warnings. Installed shadcn CLI `--help` smoke: passed on Node 24.
- `npx playwright test` against disposable localhost PostgreSQL and Chromium: 145 passed, 8 existing skips (2.4 minutes). No new skip was introduced. Google OAuth is not exercised or claimed.
- Actual SDK `StreamableHTTPServerTransport` smoke on Node 24.19.0: localhost MCP `initialize` returned HTTP 200, an SSE JSON-RPC response, and protocol version `2025-11-25` through `@hono/node-server` 2.1.1. Server and transport closed after the assertion.
- Documentation audit: 13 ok, 1 existing ADR-age warning, 0 fail. `git diff --check`: passed. Browser screenshots are unnecessary for this non-UI tooling change; the relevant consumer check is the MCP handshake.
- All required CI must pass on the final published head before squash merge. The branch includes staging; head and base must be refreshed immediately before merge.
- Renewed source before the selector repair: local `dff207aef369cb9f127c4163bd311725d785e483`, equivalent GitHub integration `4394e7787b335bcb38f3b45d22dcec96cdcf0aed`, tree `2b25639ede3025181a521b4744f8bb48b8f393de`. Build, typecheck, lint (0 errors/59 warnings), 3311 unit tests, and MCP HTTP smoke passed. Browser result was 144 passed/8 skipped/1 failed; the trace and local database query confirmed the wrong class ID rather than an application regression.
- Focused billing test after the selector repair passed against the same contaminated fixture data. A complete browser run after resetting and seeding the guarded task-local database is pending; no failed test is being waived.

## Ship Notes

No production or environment changes. Continue the existing PR flow and merge to staging only after required local review and protected CI checks are green. Production promotion remains a separate user instruction.

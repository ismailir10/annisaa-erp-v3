# Local verification for /ship

## Context

This computer has no signed-in Google testing accounts. The user approved a local verification route for changes that do not affect authentication, followed by sequential review, repair and merge of existing dependency PRs into staging. Auth-sensitive PRs remain open if authenticated preview verification is unavailable.

## Spec

- Non-auth changes may satisfy the interactive ship gate locally with demo identities and disposable local PostgreSQL.
- Google login, callbacks, sessions, cookies, auth guards and auth-impacting dependency changes require authenticated preview verification; uncertainty selects preview.
- Genuine docs-only changes may record a browser-verification skip; package, lockfile, build and configuration changes cannot qualify automatically.
- Preserve required CI, hooks, isolated PR flow and separate production promotion.
- No application API, schema, authentication, or runtime behavior changes in this workflow PR. The backup self-test's CI image source changes only; its database, MinIO-backed S3 flow, and assertions remain intact.

## Tasks

- [x] Update canonical ship procedure and align the operating manual across classification, verification, fix loop and merge.
- [x] Validate the skill, audit documentation and independently review the verification routes before shipping.

## Implementation

- Subagent plan: driver=gpt-6, dirty-work=gpt-6-luna; delegate the interlocking ship/manual edits, then independently review; environment setup proceeds separately.
- User approved the complete implementation plan in this task before changes began.
- Updated actual-diff routing, tool capability selection, scoped local demo verification, evidence recording, blocker fix loops and guarded merge/post-merge steps in the canonical skill; aligned operating-manual claims.
- Simplification: preserve existing CI/skip-delta/preview flow details, share blocker classification between browser routes, and keep production promotion a separate hand-off.
- CI repair: point the backup self-test at a public Docker Hub mirror serving the same digest-pinned official MinIO image bytes; anonymous Quay pulls are currently denied.

## Verification

- Original source runtime baseline: `e630a23` (`origin/staging` at checkout) remains unchanged. The PR also changes `.github/workflows/ci.yml` to source the identical pinned MinIO manifest from its verified mirror; application runtime files remain unchanged. Build-generated `next-env.d.ts` was restored and is excluded.
- `npm run build`: passed; production build and embedded TypeScript check completed.
- `npm run typecheck`: passed. `npm run lint`: passed, 0 errors and 59 existing warnings.
- `npx vitest run` with normal unit-test environment: 341 suites passed, 2 skipped; 3308 tests passed and 42 todo. An initial misconfigured run inherited DEMO_MODE and failed 19 assertions; rerunning without that browser-only setting passed.
- Baseline `npx playwright test` on disposable localhost PostgreSQL 15: 145 passed, 8 existing skips, 3.1 minutes. This setup check does not claim Google OAuth coverage.
- Skill frontmatter validator: `Skill is valid!`. Documentation audit: 13 ok, 1 existing ADR-age warning, 0 fail. `git diff --check`: passed.
- Scenario review covers non-auth UI, auth callback/session dependency, dependency-only, pure docs, unavailable signed-in profile, failed local checks and moved PR heads; it also checks a wrong-worktree resume preserves dirty work, local-ahead commits reach the existing PR, and clean evidence is published without duplicate empty commits. Required check conclusions and expected-head merge conditions remain mandatory.
- Baseline browser smoke: seeded local SUPER_ADMIN identity opened `/admin`; dashboard content and primary navigation rendered. Local production demo login correctly returned 403; existing E2E fixture cookies were used only on localhost. Screenshot captured in task-local test artifacts.
- Registry verification (2026-09-25 02:07 UTC): anonymous Docker Registry API GET of `docker.io/bbquerre/minio@sha256:a1a8bd4ac40ad7881a245bab97323e18f971e4d4cba2c2007ec1bedd21cbaba2` returned HTTP 200; `Docker-Content-Digest` and SHA-256 of the response matched that digest. The schema v2 manifest references one config and nine layers; anonymous HEAD checks returned HTTP 200 for all ten blobs. Quay returned HTTP 401 for this digest, `latest`, and a historical release tag after the anonymous bearer-token flow, confirming registry-wide pull denial at check time.
- Docker execution is deferred to the Linux CI job because this machine has no local Docker runtime. The existing Backup Pipeline Self-Test still runs its real S3-compatible upload, read-back, freshness, and prune checks against MinIO. This workflow config change has no authentication impact.
- Playwright/UI was not rerun: the application tree is unchanged and the cycle's local Playwright baseline already passed. Local non-UI checks cover workflow YAML and shell command parsing, registry manifest/blob availability, `git diff --check`, and the docs audit. CI execution remains pending; this cycle does not claim the repaired job has passed.

## Ship Notes

No migrations or environment changes for the application. New instructions use existing demo authentication and local database guards. Roll back by reverting this PR. Production promotion is outside this task.

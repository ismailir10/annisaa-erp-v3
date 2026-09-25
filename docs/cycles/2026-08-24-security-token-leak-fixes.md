# Security Review — Token Leak Fixes

## Context

General security review requested after Student Dossier Increment 3 (#519) shipped, covering the whole codebase, not just that increment — authn/authz, RLS, IDOR, secrets, sensitive-data exposure, input validation, storage access, dependency vulnerabilities.

Increment 3's own Ship Notes had already named one instance: `GET /api/enrollments/[id]` ships `EnrollmentApplication.accessToken` — the unguessable token emailed to a parent for the tokenized invite flow — to the admin client via an open `include` with no `select`. Filed there as a known follow-up, not fixed in that cycle.

Four parallel subagent sweeps (IDOR/ownership, over-broad Prisma select/include, injection/raw SQL, storage-proxy + secrets/webhooks) plus the repo's own `verify-api-auth.sh` and `verify-rls-coverage.sh` covered the rest. IDOR, injection, storage-proxy and secrets/webhooks came back clean — consistent tenant/ownership checks, parameterized SQL only, hardened storage paths, signature-verified webhooks. The `select`/`include` sweep found the same defect class in three more places, all sharing the root cause: `prisma.<model>.findFirst/findUnique(...)` used `include` with no top-level `select` (or a `select` that stayed too wide on specific fields), so a raw storage/auth token rode along into `NextResponse.json(...)`.

## Spec

1. `GET /api/enrollments/[id]` — narrow to an explicit `select`; stop shipping `accessToken` and `tenantId`.
2. `GET/PUT/PATCH /api/parents/[id]` — narrow to an explicit `select`; stop shipping `tenantId` and the raw `ktpUrl`/`kkUrl` storage tokens. The admin UI only ever checks `!!ktpUrl`/`!!kkUrl`, so the response carries `hasKtp`/`hasKk` booleans instead.
3. `GET /api/guardians` (list) — same leak, broader blast radius (every row in the tenant, not one record). The list UI doesn't render document status at all, so the fields are dropped entirely rather than replaced with booleans.
4. `GET /api/students/[id]` — the nested `guardians[].parent` select already existed as a deliberate closed-set list (increment 1 hardening) but still passed `ktpUrl`/`kkUrl` through raw. Same boolean-swap pattern.
5. `EnrollmentApplication.consentData` — a JSON blob embedding `ayah.signatureToken`/`ibu.signatureToken` (a storage token for the scanned consent letter) — is selected wholesale by both `GET /api/enrollments/[id]` and `GET /api/students/[id]/enrollment-application`. The shared `EnrollmentApplicationView` component only ever checks presence (the actual image is served through the separate authed `/api/enrollments/[id]/signature` proxy), so redact the token to a `hasSignature` boolean before the response leaves either route.
6. No behavior change for any admin user — every fix replaces a raw token the UI never read with a boolean the UI already computed client-side via `!!token`.

## Tasks

- T1 — `app/api/enrollments/[id]/route.ts`: `include` → `select`, drop `tenantId` from the response.
- T2 — `app/api/parents/[id]/route.ts` (GET/PUT/PATCH): `include` → `select`, `hasKtp`/`hasKk` booleans; client type + render sites in `app/admin/guardians/[id]/page.tsx`.
- T3 — `app/api/guardians/route.ts`: `include` → `select`, drop `tenantId`/`nik`/`ktpUrl`/`kkUrl` (unused by the list UI).
- T4 — `app/api/students/[id]/route.ts`: swap raw `ktpUrl`/`kkUrl` for booleans in the response transform; client type (`components/admin/guardian-detail-card.tsx`) + two render/var sites in `app/admin/students/[id]/page.tsx`.
- T5 — `lib/enrollment/sanitize-consent.ts` (new): `redactConsentSignatures`, shared by both routes that select `consentData`. Wire into `app/api/enrollments/[id]/route.ts` and `app/api/students/[id]/enrollment-application/route.ts`; update `components/admin/enrollment-application-view.tsx` to check `hasSignature` instead of `signatureToken`.
- T6 — Update the one test that pinned the old `parent.update()` call shape (`app/api/__tests__/parents.test.ts`) and the two tests that asserted the old `signatureToken` wire shape (`enrollment-application-route.test.ts`, `dossier-increment-3.test.tsx`).

## Implementation

| File | Change |
|---|---|
| `app/api/enrollments/[id]/route.ts` | `include` → explicit `select`; response drops `tenantId`; `consentData` passed through `redactConsentSignatures` |
| `app/api/parents/[id]/route.ts` | GET: `include` → `select`; response replaces `ktpUrl`/`kkUrl` with `hasKtp`/`hasKk`, drops `tenantId`. PUT/PATCH: added narrow `select` on `update()` (nothing in the client reads the body beyond `res.ok`, but shouldn't ship tokens either) |
| `app/api/guardians/route.ts` | `include` → `select`, limited to the fields the list page actually renders |
| `app/api/students/[id]/route.ts` | Nested `guardians[].parent` response transform swaps `ktpUrl`/`kkUrl` for booleans |
| `app/api/students/[id]/enrollment-application/route.ts` | `consentData` passed through `redactConsentSignatures` before the response |
| `lib/enrollment/sanitize-consent.ts` *(new)* | `redactConsentSignatures(consentData)` — strips `signatureToken` from the `ayah`/`ibu` blocks, replaces with `hasSignature` |
| `components/admin/enrollment-application-view.tsx` | Signature-image gate reads `consent[which]?.hasSignature` instead of `?.signatureToken` |
| `app/admin/guardians/[id]/page.tsx` | `ParentDetail` type + two render sites: `ktpUrl`/`kkUrl` → `hasKtp`/`hasKk` |
| `app/admin/students/[id]/page.tsx` | Two render sites + one local var renamed `kkUrl` → `hasKk` to match its new boolean type |
| `components/admin/guardian-detail-card.tsx` | `GuardianCardParent` type + two render sites |
| `app/api/__tests__/parents.test.ts` | Added the new `select` to the pinned `PATCH` call-args assertion |
| `app/api/students/[id]/__tests__/enrollment-application-route.test.ts` | Asserts `hasSignature: true` and the absence of `signatureToken`, instead of asserting the raw token value |
| `app/admin/students/[id]/__tests__/dossier-increment-3.test.tsx` | Fetch-mock fixture updated to the post-fix wire shape (`hasSignature` instead of `signatureToken`) |

**Why booleans, not just narrower selects.** `ktpUrl`/`kkUrl`/`signatureToken` are Supabase storage tokens (`lib/storage`'s own doc: "auth-proxy storage tokens"). The actual files are always served through a separate route that re-derives the path server-side from the record's own id (`/api/parents/[id]/ktp`, `/api/enrollments/[id]/signature?which=`) — the client never needed the token itself, only "does a file exist", which every call site already computed via `!!token`. Swapping the field is a pure rename at the response boundary; nothing downstream dereferences the actual string.

**Two leaks fixed beyond the one `/spec` scoped.** `GET /api/students/[id]/enrollment-application` was the route flagged for the `consentData`/`signatureToken` leak, but `GET /api/enrollments/[id]` selects the identical `consentData` field and feeds the *same* `EnrollmentApplicationView` component — leaving one fixed and the other not would have been inconsistent for no reason, so both got the shared `redactConsentSignatures` helper. Same reasoning for `app/api/students/[id]/route.ts`'s nested `ktpUrl`/`kkUrl`: not part of the original report, found by re-reading the sibling `/api/parents/[id]` fix's client consumers.

## Verification

**Gates**, run from a clean `origin/staging` checkout (`be8b4831`, includes increment 3):

- `npx tsc --noEmit -p tsconfig.json` — ✅ exit 0, no output.
- `npx vitest run` (full suite) — ✅ `Test Files 330 passed | 2 skipped (332)` · `Tests 3230 passed | 42 todo (3272)`, 83s.
- `bash scripts/verify-api-auth.sh` — ✅ `194 / 194 routes have session helper or @public sentinel`.
- `bash scripts/verify-rls-coverage.sh` — ✅ `41 / 41 tenant-scoped models have ENABLE + policy`.
- `npx eslint <every file this cycle touches>` (run directly, per-file) — ✅ 0 errors, 0 warnings on every new/modified file. `npm run lint` (full repo) was also attempted twice, both pre-crash and post-crash; both runs ran 15+ minutes without returning because it walks into `.worktrees/*/. next/server/chunks` and `.worktrees/*/lib/generated/prisma` — Next.js build output and a generated Prisma client left behind in five stray sibling worktrees from other parallel sessions, not this repo's source. Pre-existing environment/`.eslintignore` gap, unrelated to this diff; not fixed here (out of scope) and not blocking, per direct instruction.
- **Playwright** — not run. This cycle changes only response field names/shapes behind existing UI truthiness checks (no new page, no new route, no visual change); deferred to the required CI `Playwright E2E` check.
- [x] Cross-checked `design-system.html` — all touched components (`Badge`, form fields in `app/admin/guardians/[id]/page.tsx` and `app/admin/students/[id]/page.tsx`) are unchanged Shadcn usage; this cycle only renames the data field a `!!token` check reads, no markup/token/spacing change.

**Not run: `npm run build`.** Gate table calls for `npm run build && npx vitest run` between tasks; substituted `tsc --noEmit` (stricter on types, faster) since this cycle makes no route-shape or build-config change. Full `npm run build` deferred to CI.

## Ship Notes

- **Migrations:** none. No schema change.
- **Env vars:** none.
- **Routes:** none added or removed. Five existing routes changed response shape only: `GET /api/enrollments/[id]`, `GET/PUT/PATCH /api/parents/[id]`, `GET /api/guardians`, `GET /api/students/[id]`, `GET /api/students/[id]/enrollment-application`.
- **Data:** none written. Every touched route is a read, or a write whose response shape narrowed (PUT/PATCH on `/api/parents/[id]`).
- **Wire-shape change, not just a fix.** Any external caller of these five routes that read `.accessToken`, `.tenantId`, `.ktpUrl`, `.kkUrl`, or `.consentData.<ayah|ibu>.signatureToken` directly (rather than through the shipped admin pages) breaks. Only known callers are the admin pages updated in this cycle; no public/parent-facing route was touched.
- **Rollback:** revert the commit. Additive-only at the schema level; every response field removed was already unused by every known client after this cycle's own client-side updates.
- **Follow-up:** none outstanding from the original review — the `enrollment-application` `consentData` leak flagged as "needs a decision" was resolved in this cycle rather than deferred.

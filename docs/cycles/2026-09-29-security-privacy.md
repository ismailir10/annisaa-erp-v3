# Security and privacy fixes — role escalation, sign-out cache, deactivated logins, read APIs

## Context
Findings from the full-portal E2E review (`docs/uat/reports/2026-09-29-full-e2e.md`, held by the lead — not yet committed to this base; ids below are the review's). Cycle C1 of the fix series. All four are auth-impacting.

- **HR-1 (blocker):** `POST /api/roles` and `PUT /api/users/[id]` only check `isAdminRole()`. A SCHOOL_ADMIN can create a role holding `hr.view` / `payroll.*`, assign it to their own user, and `derivePermissions` replaces their enum defaults with it, so `/api/payroll`, `/api/employees`, salary and leave APIs go 403 to 200. `PUT /api/users/[id]` also has no target check, so a SCHOOL_ADMIN can deactivate or reassign a SUPER_ADMIN. Contradicts `.claude/standards/security.md`.
- **PAR-1 (major):** after Keluar the app runs `router.push("/")`; browser Back re-renders the signed-in `/parent/profile` (name, phone, email, children) from the Next client router cache with no server request. `Cache-Control: no-store` is already correct on the responses — this is client state, not HTTP caching.
- **HR-4 (major):** `POST /api/employees/[id]/deactivate` flips only `Employee.status`. The linked `User` stays ACTIVE and can still sign in, although the confirm dialog promises otherwise. Reading `lib/auth.ts` also shows a second hole: the Supabase reconcile-by-`employeeId` path returns the linked User **without checking its status**, so even a manually INACTIVE user whose Employee email matches would be handed a session.
- **HR-16 (minor):** read APIs return data to roles that never need it (`config/org`, `config/campuses`, `config/holidays`, `class-sections`, `fee-components`, `academic-years`); anonymous `GET /api/admissions` returns 200 with an empty list.

## Spec
- [x] **HR-1a** A non-SUPER_ADMIN can create/edit a role only if its permissions (and, on edit, the stored permissions too) are a subset of `session.permissions`; otherwise 403 with an Indonesian message naming the permissions.
- [x] **HR-1b** A non-SUPER_ADMIN cannot change their own `customRoleId` or `status`, cannot edit/deactivate/assign roles to a SUPER_ADMIN user, and cannot assign a role (or clear to enum defaults) that carries permissions they lack. A resubmitted unchanged value is a no-op, not an error.
- [x] **HR-1c** Editing the role currently assigned to the actor is covered by 1a.
- [x] **HR-1d** SUPER_ADMIN behaviour unchanged. Role/user mutations also require `users.edit` (SUPER_ADMIN always passes). The auth session cache is invalidated when a user's role/status or a role's permissions change.
- [ ] **PAR-1** Every sign-out control (admin sidebar, teacher header, parent header, parent profile button) POSTs `/api/auth/logout`, then does a full document navigation (`window.location.replace("/")`) so client router state is discarded. `Cache-Control` headers unchanged. e2e spec: sign in, in-app navigate to `/parent/profile`, sign out via UI, `goBack()`, profile content not visible.
- [ ] **HR-4** Deactivating an employee sets the linked User INACTIVE (except the acting user and SUPER_ADMIN users) and drops its cached session; restoring sets it ACTIVE. `getSession` refuses an INACTIVE linked User and an INACTIVE Employee with no User yet.
- [ ] **HR-16** Restrict only endpoints no teacher/parent portal legitimately calls; anonymous gets 401 JSON. Decision per endpoint recorded in Implementation.

### Non-goals
Google OAuth, `app/auth/callback`, `proxy.ts` matcher, schema changes, new dependencies, UI redesign of the users/roles pages.

### Assumptions
1. `session.permissions` is the authoritative "currently held" set (enum defaults or custom role), per `lib/auth.ts`.
2. Requiring `users.edit` on role/user mutations is intended by the finding ("not users.edit"). SCHOOL_ADMIN defaults include it, so the default admin is unaffected.
3. Deactivating an employee must not lock out the acting admin or a SUPER_ADMIN (owner) via the employee record; those linked users are left ACTIVE.
4. The in-memory session cache is per server instance; invalidation is best-effort within an instance and the 10 s TTL still bounds other instances.

## Tasks
- [x] **T1 — HR-1 escalation guards** in `app/api/roles/**`, `app/api/users/[id]`, shared helper `lib/security/role-escalation.ts`, `invalidateUserCache` in `lib/auth.ts`. Route tests for subset violation, self-assign, super-admin target, allowed path.
- [ ] **T2 — HR-4 deactivate/restore revoke login** + `getSession` INACTIVE guard. Tests.
- [ ] **T3 — PAR-1 full-navigation sign-out** helper + four call sites + e2e spec + unit test.
- [ ] **T4 — HR-16 read API authorization** for endpoints with no portal caller; anonymous 401. Tests.
- [ ] **T5 — Verify locally, Ship Notes** (Preview verification checklist).

## Implementation
- Subagent plan: driver=claude-sonnet-5-5, dirty-work=none — inline. Four small, security-interlocking slices on shared auth files (`lib/auth.ts`, session cache); a subagent would need the whole threat model as context, so fan-out costs more than it saves.
- Task 1: HR-1 — `lib/security/role-escalation.ts` (new: `permissionsActorLacks`, `parseRolePermissions`, `enumRolePermissions`, `escalationForbidden`), `lib/auth.ts` (`invalidateUserCache(...emails)` exported next to the private `userCache`), `app/api/roles/route.ts`, `app/api/roles/[id]/route.ts`, `app/api/users/[id]/route.ts`. POST/PUT/DELETE on roles and PUT on users now require `users.edit` (SUPER_ADMIN always passes). Role create/edit: permissions must be a subset of `session.permissions`; on edit the stored permissions must be too, which also blocks widening — or even renaming — the role assigned to the actor when it exceeds their grant. User PUT: non-SUPER_ADMIN gets 403 on a SUPER_ADMIN target, on a self role/status *change* (unchanged resubmits pass, because the edit dialog always sends both fields), and on assigning a role — or clearing to enum defaults — that carries permissions they lack. Role edits invalidate every holder's cached session; user edits invalidate the target's. Tests: `app/api/roles/__tests__/route.test.ts`, `app/api/roles/[id]/__tests__/route.test.ts`, `app/api/users/[id]/__tests__/route.test.ts` (22 tests; 14 fail against the old routes).
- Env note: the worktree's `node_modules` symlink to the main checkout makes Turbopack abort ("points out of the filesystem root"), so `npm run build` cannot run here as set up. Replaced the symlink with an empty directory `mount --bind`-ed onto the main checkout's `node_modules` (untracked, ignored). Unmount before removing the worktree.

## Verification
- Task 1: `DATABASE_URL=…/schoolerp_c1 npm run build` exit 0; `npx vitest run` 425 files passed / 2 skipped, 3955 tests passed / 42 todo; eslint clean on touched files. Manual review of the diff (feature-dev / superpowers reviewer agents are not installed here; `code-review` skill not run): checked that GET handlers are unchanged, that `users.edit` gating does not affect SUPER_ADMIN, that a no-op self edit passes, and that clearing a role for a target with broader enum defaults is refused.

## Ship Notes

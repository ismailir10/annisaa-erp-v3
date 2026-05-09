# Hotfix — `/admin` Landing Page (404 Patch)

## Context

Smoke-test after [#216](https://github.com/ismailir10/annisaa-erp-v3/pull/216) merged: `/admin` returned **404**. Sidebar shell + nested routes (`/admin/akademik/*`) shipped, but no `app/admin/page.tsx` existed — Next.js 404s the index. Post-OAuth callback redirects to `/admin` per design, so the user lands on a broken page right after sign-in.

## Spec

- [x] **AC1 — `/admin` renders a minimal landing page.** Lists 4 wired modules (Penerimaan / Siswa / Wali / Keluarga) as Card links. Full dashboard with KPI cards lands in a dedicated cycle later.
- [x] **AC2 — Build green, design-system shell reused.**

## Tasks

- [x] **T1 — Add `app/admin/page.tsx`.** Card-grid landing page with 4 module shortcuts. Reuses existing `<Card>` chrome from `components/ui/card.tsx`. Cross-checked design-system.html §6 (card grid).

## Implementation

- T1 — `app/admin/page.tsx` (new). Static module list, no DB reads — fast first-paint after OAuth callback. Layout (`app/admin/layout.tsx`) already gates access via `assertPortalAccess('admin')` so this page inherits the auth guard.

## Verification

- `npm run build` ✓ — `/admin` registered as dynamic route alongside the existing `/admin/akademik/*` routes.

## Ship Notes

- No migrations, no env vars.
- After merge: refresh staging preview → `/admin` renders the 4-card landing page.
- Future: replace with full dashboard (KPI cards + recent activity feed via `AuditLog`) in a dedicated `p2-admin-dashboard` cycle.

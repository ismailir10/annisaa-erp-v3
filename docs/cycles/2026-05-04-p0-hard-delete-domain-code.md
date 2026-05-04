# Phase 0 — Hard Delete Domain Code

**Type:** docs + service (no schema, no UI)
**Phase:** p0
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §18.0

## Context

Hard-delete v1 domain code (admin/teacher/parent UI + domain API routes + seeds + validators + e2e) to prepare greenfield for v2 rebuild. Schema preserved until p1 cycle 1. Single revertable PR.

## Spec

Acceptance criteria:
- All deletions per `docs/superpowers/plans/2026-05-04-p0-hard-delete-domain-code.md`
- `npm run build` passes (no orphan imports)
- Dev server boots — homepage shows rebuild placeholder
- `/admin`, `/teacher`, `/parent` return 404
- Auth callback still works (`/auth/callback`)
- Xendit webhook + create-session API still works
- v1 UAT reports archived to `_archive/v1/`
- README + CLAUDE.md updated minimally

## Tasks

(Per plan doc tasks 1-16.)

## Implementation

(Filled by /build per task.)

- **Task 8 — rebuild placeholder homepage:** Replaced `app/page.tsx` (268 LOC v1 login/router) with a 32-LOC minimal landing — Bahasa Indonesia copy, WhatsApp contact link, repo link. No client-side React, no Supabase imports, no framer-motion. Cross-checked design-system.html for typography tokens (`text-3xl font-semibold`, `text-muted-foreground`).
- **Task 12 — canonical v2 rebuild notice in README:** Replaced the partial Task-8 "Status (May 2026)" callout with the canonical block immediately under the title. Surfaces foundation-design spec + teacher-insights + v1-audit research links, names the `v1-final-2026-05-04` git tag, and explicitly marks below-the-fold UI/schema sections as historical while the preserved `lib/` (xendit, payroll, finance, hijri, api, webhook) remains valid.

## Verification

End-of-cycle gate (Task 15) — all green:

- `npm run build` — passed (Next.js production build, 16 routes — only homepage, legal, api/auth, api/cron, api/csp-report, api/health, api/health/xendit, api/xendit/{create-session,webhook}, auth/callback, manifest, opengraph-image).
- `npx vitest run` — 557/557 tests passed across 57 files.
- `npx tsc --noEmit` — clean, no TypeScript errors.
- `npx prisma validate` — schema valid (preserved untouched per phase 0 scope).
- `npx prisma generate` — Prisma Client 7.6.0 generated.

Dev-server smoke (`npm run dev` on `:3000`):

- `/` (homepage) — 200, renders v2 rebuild placeholder ("Sistem versi 2 sedang dalam pengembangan. Peluncuran direncanakan Juli 2026."), `<title>An Nisaa Sekolahku — v2 Rebuild In Progress</title>`.
- `/admin` — 307 redirect to `/` (proxy auth-guard; route directory removed, proxy intercepts before resolution).
- `/teacher` — 307 redirect to `/` (same).
- `/parent` — 307 redirect to `/` (same).
- `/api/students` — 404 (domain API removed).
- `/api/auth/me` — 401 (auth route preserved, returns unauthorized without session).
- `/api/health/xendit` — 503 (Xendit health probe preserved; 503 expected — no live API key in dev `.env`).

Per-task gates: Tasks 1–14 each ran `npm run build && npx vitest run` between commits per the build skill. Cross-checked design-system.html §typography for placeholder text scale (Task 8).

Playwright suite intentionally absent in this worktree (`e2e/` removed alongside domain code in earlier tasks; specs will be re-introduced in p2–p6 cycles as scaffold engine produces real flows). Pure-rebuild cycle — Playwright skip per CLAUDE.md exception for cycles with no user-facing routes to exercise.

## Ship Notes

(Filled by /ship.)

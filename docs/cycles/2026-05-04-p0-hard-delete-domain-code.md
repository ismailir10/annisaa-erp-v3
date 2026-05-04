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

(Filled by /build.)

- Task 8 between-task gate: `npm run build` green, `npx vitest run` 633/633 passing.
- Cross-checked design-system.html §typography for placeholder text scale.

## Ship Notes

(Filled by /ship.)

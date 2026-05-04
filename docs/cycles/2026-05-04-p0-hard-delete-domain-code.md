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

## Verification

(Filled by /build.)

## Ship Notes

(Filled by /ship.)

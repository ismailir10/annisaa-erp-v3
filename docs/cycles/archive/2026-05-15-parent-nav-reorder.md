# Parent Bottom-Nav Reorder

## Context

Parent bottom-nav placed `Capaian` (weekly perkembangan rollup) immediately after `Beranda`, ahead of higher-frequency tabs. The CTO's UX read: parents check `Tagihan` and `Kehadiran` daily, `Penghubung` daily, `Capaian` weekly, `Rapor` once per semester. Putting a semester-cadence card second pushed the daily/financial tabs further from thumb reach.

Hot fix: reorder per frequency-of-use — `Beranda > Tagihan > Kehadiran > Penghubung > Capaian > Rapor`.

## Spec

### Acceptance
- [ ] `components/parent/bottom-nav.tsx` `baseTabs` array reflects the new order.
- [ ] No route, URL, label, or icon changes — only ordering.
- [ ] No test/spec relies on tab order (verified: every existing e2e check is by role+name, not position).
- [ ] `npm run typecheck`, `npm run build`, `npx vitest run` all pass.

### Non-goals
- Merging `Capaian` and `Rapor` (they serve different cadences — keep both).
- Renaming or re-iconing any tab.
- Touching the admin or teacher portal nav.

## Tasks

- [x] **1. Reorder `baseTabs`** in `components/parent/bottom-nav.tsx`. Add a comment explaining the frequency-of-use ordering rationale. _Accept: lint + typecheck + build + vitest green._

## Implementation

- Task 1: `components/parent/bottom-nav.tsx` — moved `Tagihan` from position 5 to position 2; `Capaian` from position 2 to position 5. Comment documents the ordering rule.

## Verification

- `npm run typecheck` exit 0.
- `npm run build` exit 0.
- `npx vitest run` 1502 passed / 0 failed.
- No e2e changes needed (all parent-spec assertions are role+name based, not position-based).
- [x] Cross-checked design-system.html §Bottom navigation — order is content, not visual chrome; Shadcn portal-bottom-nav + lucide icons + label sizing unchanged.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none.
- **API contract changes:** none.
- **Manual smoke (preview):** sign in as `rightjet.hq@gmail.com`, scroll the bottom nav — order should now read Beranda · Tagihan · Kehadiran · Penghubung · Capaian · Rapor.
- **Rollback:** `git revert <merge-commit>`. No data implications.

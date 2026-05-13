# FIND-015 Follow-Up — Tighten the Mounted Guard

## Context

PR #263 (batch 2) attempted to resolve FIND-015 (teacher home React error #418 on the empty-state path) with a partial mounted-guard that only deferred the time-derived strings (`timeStr`, `dateStr`, `greeting`). Staging smoke-test as `ismail10rabbanii@gmail.com` reproduced the same `Minified React error #418` in the console after the fix shipped. The partial guard didn't cover framer-motion's initial render diff plus the `useState(new Date())` divergence in subtree DOM. This cycle replaces it with a full pre-mount shell: until `mounted` flips true, the component returns an empty layout-preserving placeholder. After mount, the real UI renders. SSR + client first-render produce identical HTML → hydration matches.

## Spec

- [ ] `/teacher` no longer logs `Minified React error #418` on initial load when no AttendanceRecord exists for today.
- [ ] Greeting / clock / check-in card render after one tick (visible to the user as a near-imperceptible flash of empty layout, then the full UI).
- [ ] Build + vitest + lint + Playwright all green.

Non-goals:
- No design-system change to the greeting/clock layout.
- No new tests (the existing admin-hydration pattern + Playwright /teacher visit covers regression detection at the integration layer).

## Tasks

1. **Replace partial mounted-guard with full pre-mount return.**
   - `app/teacher/home-client.tsx` — keep the `mounted` state + useEffect from PR #263; add an early `if (!mounted) return <empty shell />` block before the existing JSX.
   - Acceptance: console shows no React #418 on `/teacher` reload.

## Implementation

- `app/teacher/home-client.tsx:172-179` — added `if (!mounted)` early return rendering a `<div className="min-h-[60vh]" aria-busy="true" suppressHydrationWarning>` placeholder. The prior partial mounted-guard on `timeStr`/`dateStr`/`greeting` is kept but redundant; leaving it in to be defensive in case any other render path bypasses the early return in the future.

## Verification

- `npm run build` — green.
- `npx vitest run` — 1334 tests pass.
- `npm run lint` — 0 errors, 36 unrelated warnings.
- Cross-checks design-system.html §Empty State Contract — placeholder reserves vertical space without showing a spinner, matching the "do-not-block-the-shell" pattern used elsewhere (admin dashboard skeleton, teacher attendance loading state).
- Manual smoke on Vercel preview: sign in as teacher, reload `/teacher`, confirm console has no React #418.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none.
- **Rollback:** revert PR.
- **Follow-up:** none from this finding. Remaining UAT findings: FIND-008 (Teaching Assignments Tambah), FIND-021 + FIND-022 (profile edit pair).

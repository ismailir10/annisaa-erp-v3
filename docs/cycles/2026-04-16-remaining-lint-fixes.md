# Remaining Lint Fixes (cherry-picked from PR #34)

## Context

PR #34 fixed 34 TypeScript errors and 4 ESLint errors. Staging independently fixed the TypeScript errors via PR #31, creating merge conflicts. PR #34 was closed. These 3 remaining fixes were not on staging.

## Spec

Cherry-pick the non-conflicting lint/quality fixes from PR #34 that staging still needs.

## Tasks

- [x] T1: Replace `useState(true)` + `useEffect` with derived `const loading = data === null` in `client.tsx`
- [x] T2: Reorder `fetchData` above its `useEffect` caller in `leave-sheet.tsx`
- [x] T3: Add `eslint-disable` on `any`-typed mock render props in `client.test.tsx`

## Implementation

- `app/parent/invoices/client.tsx`: Derived loading state eliminates unnecessary state + render cycle
- `components/teacher/leave-sheet.tsx`: Function declaration moved before usage; eslint-disable on set-state-in-effect (standard fetch-on-open pattern)
- `app/parent/invoices/__tests__/client.test.tsx`: 2 eslint-disable comments on vi.mock render props

## Verification

```
npm run build     → clean (80 routes)
npx vitest run    → 90/90 pass
npm run lint      → 0 errors, 4 warnings (pre-existing unused imports)
```

## Ship Notes

No migrations, no new env vars. Pure lint/quality fix.

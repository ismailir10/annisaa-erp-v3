# Fix TypeScript Errors in Test Mocks

## Context

CI was failing due to 34 pre-existing TypeScript errors across three test files. The errors
fell into three distinct patterns introduced when `SessionUser` gained `email`, `name`, and
`parentId` fields (and when the attendance route was typed as `NextRequest`), but the test
mock objects were never updated to match.

`tsc --noEmit` was the primary gate failing. `npm run build` additionally failed because
`.env` symlinks were missing from the worktree (DATABASE_URL not set), but the TypeScript
check inside the build itself was already clean once Prisma Client had been generated.

## Spec

### Acceptance criteria

- [ ] `npx tsc --noEmit` exits 0 (zero errors)
- [ ] `npx vitest run` exits 0 (all 69 tests pass, none regressed)
- [ ] `npm run build` exits 0 (TypeScript clean, no DATABASE_URL error)
- [ ] No test logic changed — only types fixed

### Error inventory (34 errors)

| File | Count | Root cause |
|------|-------|------------|
| `app/api/__tests__/attendance-my.test.ts` | 9 | `new Request()` passed to `GET(req: NextRequest)` |
| `app/api/__tests__/attendance-my.test.ts` | 8 | Mock session missing `email`, `name`, `parentId` |
| `app/api/__tests__/slips-my.test.ts` | 9 | Mock session missing `email`, `name`, `parentId` |
| `lib/__tests__/parent-helpers.test.ts` | 8 | Mock invoice objects missing required Prisma fields |

## Tasks

- [x] T1: Create cycle doc
- [x] T2: Symlink `.env` + `.env.local` from main checkout into worktree
- [x] T3: Fix `attendance-my.test.ts` — use `NextRequest` + add missing session fields
- [x] T4: Fix `slips-my.test.ts` — add missing session fields to all mock objects
- [x] T5: Fix `parent-helpers.test.ts` — cast mock invoice arrays to satisfy Prisma type
- [x] T6: Run full gate: `npm run build && tsc --noEmit && npx vitest run`
- [x] T7: Commit

## Implementation

### T3 — `app/api/__tests__/attendance-my.test.ts`
- Added `import { NextRequest } from "next/server"`
- Replaced all 9 `new Request(url)` → `new NextRequest(url)` (route handler signature is `GET(req: NextRequest)`)
- Added `email: "test@example.com"`, `name: null`, `parentId: null` to all 8 mock `SessionUser` objects

### T4 — `app/api/__tests__/slips-my.test.ts`
- Added `email: "test@example.com"`, `name: null`, `parentId: null` to all 9 mock `SessionUser` objects
- No `NextRequest` change needed (route has no request param)

### T5 — `lib/__tests__/parent-helpers.test.ts`
- Cast all 9 `mockResolvedValue(mockInvoices...)` calls to `as any` with eslint-disable comment
- Mock invoice objects are intentional partial stubs — they only contain the fields the helper selects; full Prisma `Invoice` shape is not needed at runtime

## Verification

### Between-task gate
```
npx tsc --noEmit     → exit 0 (0 errors)
npx vitest run       → 6 files, 69/69 pass
npm run build        → TypeScript clean, 80 routes compiled
npm run lint         → 0 errors, 4 warnings (warnings only, exit 0)
```

## Ship Notes

No migrations, no new env vars. Pure type + lint fix.
Rollback: `git revert HEAD~1 HEAD` (reverts both commits on this branch).

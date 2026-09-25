# Org Config CSV-Parse Crash Fix

## Context

The staging admin page `/admin/settings/config` ("Pengaturan → Jam Kerja") was hard-stuck on a Skeleton with no visible error. Browser console emitted:

```
SyntaxError: Unexpected token 'M', "MON,TUE,WED,THU,FRI" is not valid JSON
    at JSON.parse (<anonymous>)
    at app/admin/settings/config/page.tsx
```

Root cause: schema drift in `OrgConfig.workingDays`. The current API path stores the value as a JSON-encoded array (`'["MON","TUE","WED","THU","FRI"]'`) — see `app/api/config/org/route.ts:53`. But the staging row was seeded earlier when the value was a comma-separated string (`"MON,TUE,WED,THU,FRI"`). The page does a bare `JSON.parse(data.workingDays)` on load, which throws on the legacy CSV form, the `.then` chain rejects, `loading` is never flipped, and the Skeleton stays on screen forever.

The same fragile bare `JSON.parse(orgConfig.workingDays)` exists in `app/api/payroll/generate/route.ts:57` — payroll generation would 500 on the same legacy row.

A second, structurally identical bug exists at `app/admin/students/[id]/page.tsx:286`: `student.metadata ? JSON.parse(student.metadata) : null` will crash the detail page if any historical row stored a non-JSON metadata blob.

## Spec

- The org-config page must render its form even when `workingDays` is stored in the legacy CSV form, the new JSON form, an empty/null value, or any malformed payload — never a stuck Skeleton.
- Payroll generation must accept the same range of `workingDays` shapes without throwing.
- The student-detail page must not crash on a non-JSON `metadata` value.
- Network failures on the org-config page must be surfaced (toast) and `loading` must always be cleared.
- No DB migration required — the tolerant parser absorbs legacy data; future writes via `PUT /api/config/org` already use `JSON.stringify`, so rows self-heal as admins save.

## Tasks

1. Add a tolerant `parseWorkingDays(stored)` helper to `lib/payroll/working-days.ts` that accepts JSON-array, CSV, empty, and malformed inputs and returns a deduped, uppercased, validated `string[]`.
2. Swap the bare `JSON.parse` in `app/admin/settings/config/page.tsx` for `parseWorkingDays`, add a `.catch` toast, and move `setLoading(false)` into `.finally` so transient fetch errors can never leave the page stuck.
3. Swap the bare `JSON.parse` in `app/api/payroll/generate/route.ts` for `parseWorkingDays`.
4. Wrap the `JSON.parse(student.metadata)` call in `app/admin/students/[id]/page.tsx` in a try/catch via a local `parseStudentMetadata` helper.
5. Add unit coverage in `lib/payroll/__tests__/working-days.test.ts` for all parser branches (JSON array, CSV, whitespace, unknown codes, dupes, null/empty, malformed-JSON-not-array).

## Implementation

- **`lib/payroll/working-days.ts`** — added `parseWorkingDays` plus a `VALID_DAY_CODES` set and a private `normalizeDayCodes` helper. JSON path is gated on a leading `[` to avoid the JSON-then-CSV double parse on every CSV input.
- **`app/admin/settings/config/page.tsx`** — imports `parseWorkingDays`; the `useEffect` now also has a `.catch(toast.error)` and a `.finally(setLoading(false))` so the Skeleton can never wedge again. The `setForm` call falls back to the previous form values for any field the API omits, so a partial response can't blank the form.
- **`app/api/payroll/generate/route.ts`** — single-line swap to `parseWorkingDays(orgConfig.workingDays)`.
- **`app/admin/students/[id]/page.tsx`** — added `parseStudentMetadata` helper above the component; the only call site now uses it.
- **`lib/payroll/__tests__/working-days.test.ts`** — added 8 cases covering every branch of the new parser.

## Verification

- `npx vitest run lib/payroll/__tests__/working-days.test.ts` — 15 tests pass (8 new + 7 prior).
- `npx vitest run` — 96 files / 834 tests pass, 42 todo, 2 skipped, 0 failed.
- `npx tsc --noEmit` — clean (after `npx prisma generate`; the pre-existing `JournalStatus` errors went away once the Prisma client was regenerated).
- `npm run build` — green Next 16 build.
- Browser repro on staging captured the exact error string `"MON,TUE,WED,THU,FRI" is not valid JSON`. The new parser's CSV branch is unit-tested with that literal input and produces the correct array, so the page will render the form on the same row instead of stalling.
- Local browser smoke skipped — Claude Preview MCP `preview_start` failed with `EPERM uv_cwd` in this sandbox; the deterministic unit test against the exact production string is the verification of record.
- Cross-checked `.claude/standards/design-system.html` — no visual change (page still uses the existing Skeleton-then-form recipe; only the data path was fixed).

## Ship Notes

- No migrations.
- No new env vars.
- No new dependencies.
- Rollback: revert the PR. The two fragile call sites resume their old behavior; staging stays as-is (no DB writes were made by this change).
- Self-healing data: once an admin opens `/admin/settings/config` and clicks Simpan, `PUT /api/config/org` rewrites the row as a JSON-encoded array. After that the legacy CSV path is exercised only on the historical preview window.

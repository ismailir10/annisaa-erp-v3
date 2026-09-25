# Fix — Admin admission empty-string + auto-derive age from DOB

> **Branch:** `feat/admin-admissions-empty-string-fix` (off `origin/staging` @ `8215c5c` — post-PR-#242 squash).
> **Parent cycles:** [`2026-05-10-daftar-public-form.md`](2026-05-10-daftar-public-form.md) (Phase 1.1 — introduced `optionalTrimmed` inline on the public schema), [`2026-05-11-admin-admissions-log-rejections.md`](2026-05-11-admin-admissions-log-rejections.md) (PR #242 — added the `console.error` lines that diagnosed THIS bug). Cross-checked `.claude/standards/design-system.html` public-form pattern for the new date input row in the admin admissions dialog.

---

## Context

PR #242 (cycle 2026-05-11) added `console.error` lines on every 400 rejection path under `/api/admissions/*`. Within minutes of staging redeploy, a real failure surfaced in Vercel runtime logs:

```
[admin-admissions PUT] validation failed id=cmp0x2vhf… [{"path":["parentEmail"],"message":"Email tidak valid"}]
```

Root cause: admin edit dialog state sends `parentEmail: ""` (empty string) whenever the field is left blank. The admin-side Zod schema:

```ts
parentEmail: z.string().email("Email tidak valid").optional().nullable()
```

`.optional()` only lets `undefined` pass; `.nullable()` only lets `null` pass. **The empty string `""` falls through to `.email()` and rejects.**

Cycle 1.1 already solved this exact shape on the **public** `/daftar` submit schema via a local `optionalTrimmed` helper that preprocesses `""` → `undefined`. The admin schema in `lib/validations/admission.ts` never got the same fix — every optional `.email()` / regex field on `createAdmissionSchema` + `updateAdmissionSchema` had the same latent bug.

**Adjacent issue surfaced during the fix:** the admin admission form historically used a free-text `childAge` input ("4 tahun") that the admin had to manually keep in sync with `dateOfBirth`. Two columns, one truth, drifts. User flagged the bug. Schema already has `dateOfBirth` (string `YYYY-MM-DD`); auto-derive age at display time, drop the free-text input.

## Scope

7 source files + 1 cycle doc, ~13 staged total (incl. 2 e2e snapshot regenerations from the dialog label swap):

- **`lib/validations/zod-helpers.ts`** (new) — exports shared `optionalTrimmed`. Lifted verbatim from `lib/admission/submit-validation.ts` so both admin + public schemas share one canonical implementation. Closes the cycle 1.1 follow-up note.
- **`lib/admission/submit-validation.ts`** — replace the inline `optionalTrimmed` with `import { optionalTrimmed } from "@/lib/validations/zod-helpers"`. Behavior unchanged; 16 existing vitest cases all green.
- **`lib/validations/admission.ts`** — refactor every optional string field with `optionalTrimmed`. Drop `childAge` from the schema entirely (auto-derived now).
- **`lib/admission/age.ts`** (new) — `formatAgeFromDob(dob, reference?)` returns Indonesian-formatted age (`5 tahun`, `5 tahun 3 bulan`, `6 bulan`). Defensive: returns `null` on missing / malformed / future DOB so the admin UI can render an em-dash cleanly.
- **`lib/admission/age.test.ts`** (new) — 9 vitest cases covering null/malformed/future + exact-birthday + mid-year + under-1-year + month/day rollover + leap-year DOB.
- **`app/admin/admissions/page.tsx`** — drop the `childAge` form input + the `childAge` field from `AdmissionForm` state shape. Add a `<Input type="date">` for `dateOfBirth` in the same grid cell, with an `Usia: <derived>` hint underneath. Display column uses `formatAgeFromDob(a.dateOfBirth) ?? a.childAge` so **legacy rows** (admin admissions created before this cycle) still render their free-text `childAge` if they have one.
- **`app/api/admissions/route.ts`** (POST) — drop `childAge` write (auto-derived now). Comment-explain.
- **`app/api/admissions/[id]/route.ts`** (PUT) — `childAge` write becomes `existing.childAge` pass-through (legacy preserved on update). **Add `dateOfBirth` write path** — previously absent from the update block; admin DOB edits were silently dropped.
- **`e2e/__snapshots__/admin-dialogs/admissions-create-{desktop,mobile}.png`** — regenerated. Dialog now shows "Tanggal Lahir" + date input instead of "Usia" + free-text input.

## What does NOT change

- `prisma/schema.prisma` — `childAge` column stays for backward compatibility with rows created before this cycle. Schema is additive-only across phases per plan §1.
- Public `/daftar` flow — Phase 1.1 cycle already used `optionalTrimmed` correctly + already wrote `dateOfBirth` not `childAge`. Untouched.
- `lib/api/validate.ts` central helper — still untouched (cycle 2026-05-11 reasoning stands).
- Convert-to-student flow (`POST /api/admissions/[id]/convert`) — unchanged. Existing `tx.student.create({ data: { dateOfBirth: admission.dateOfBirth } })` already feeds DOB into the Student row.
- Status machine (`VALID_TRANSITIONS`) — unchanged.

## Verification

```
$ npm run build
✓ build green

$ npx vitest run
Test Files  135 passed | 2 skipped (137)
     Tests  1133 passed | 42 todo (1175)
  Duration  107.35s

$ npx playwright test e2e/admin-dialogs.spec.ts --grep=admissions
2 passed (6.9s) — admissions-create dialog opens with canonical labels (desktop + mobile sheet)
```

Manual API smoke (local prod build, demo-mode admin cookie):

```
# Cycle 1.1 follow-up bug: empty parentEmail
POST /api/admissions  { parentEmail: "" }  → 201 (was 400)
PUT  /api/admissions/<id>  { parentEmail: "" }  → 200 (was 400)

# Still rejects malformed email
POST /api/admissions  { parentEmail: "not-an-email" }  → 400 { "errors": [{ "field": "parentEmail", "message": "Email tidak valid" }] }

# DOB now persists on update (was silently dropped)
PUT  /api/admissions/<id>  { dateOfBirth: "2019-08-22" }  → 200, response.dateOfBirth === "2019-08-22"
```

Browser preview verify skipped — same `EPERM: uv_cwd` harness bug against `.worktrees/<slug>` as the daftar cycle. Bash-launched server + admin-dialogs Playwright spec covered the dialog rendering instead.

design-system check: new date-input row matches `.claude/standards/design-system.html` form-field pattern (same `<Field>` + `<FieldLabel>` + `<Input>` primitives the rest of the dialog uses; `Usia: <derived>` hint uses `text-xs text-muted-foreground` — the canonical helper-text shape).

## Ship Notes

- No migration.
- No env vars.
- Rollback: revert merge commit. Removes new files (`zod-helpers.ts`, `age.ts`, `age.test.ts`); restores inline `optionalTrimmed` in `submit-validation.ts`; restores `childAge` field in admin schema + form + dialog. Legacy `childAge` column rows are unaffected (never touched).
- Carry-over caveats from Phase 1.1: GitHub Actions billing still red on CI; local gates canonical. Admin-tagihan flake set (`e2e/admin.spec.ts:473/524/575/628`) pre-existing — unrelated.
- After merge + staging redeploy, replay the failing admin edit: empty `parentEmail` should save 200 + Vercel runtime logs should be quiet on this surface.

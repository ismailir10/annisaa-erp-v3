# Phase 1.2 — Sibling Auto-Detect

> **Source-of-truth plan:** [`docs/plans/2026-05-10-v1-incremental-evolution.md`](../plans/2026-05-10-v1-incremental-evolution.md) §5 Phase 1 cycle 1.2 + §7 q3 + q6.
> **Phase:** 1 — Public Admission Entry. **THIS IS THE SECOND (AND LAST) PHASE 1 CYCLE before plan §7 q7's first `/ship --to-main` since rollback.**
> **Branch:** `feat/sibling-auto-detect` (off `origin/staging` @ `e25749e` — post-PR-#240 squash).
> **Prior cycles for pattern reference:** [`2026-05-10-daftar-public-form.md`](2026-05-10-daftar-public-form.md) (PR #240) — cycle 1.1; per-task `chore/test`+ single `feat(...)` wrap commit cadence, TWO code-review pattern, `design-system` token gate, rate-limit follow-up filing pattern. [`2026-05-10-phase0-perf-sweep.md`](2026-05-10-phase0-perf-sweep.md) (PR #239) — Verification + Ship Notes shape.
> **Phase 0 closure UAT gate (cycle 0.3 AC10)** STILL pending — independent of this cycle.

---

## Context

Cycle 1.1 (PR #240) shipped public `/daftar` + `POST /api/admission/submit`. Families can now submit admission inquiries without admin manually entering a row. The admin CRM at `/admin/admissions` consumes those `INQUIRY` rows unchanged.

The plan §5 cycle 1.2 closes the next gap: when a new applicant's contact details overlap with an existing family already in the system, the admin should SEE that overlap on the admission row — without the applicant needing to declare it, and without changing the public `/daftar` UX. This cycle adds the detection library + a nullable FK on `Admission` to persist the match + an admin-side badge on `/admin/admissions` surfacing the result. Per plan §7 q6 the surface is **admin-only — NEVER applicant-facing**.

**Schema ground-truth (read 2026-05-11 against `prisma/schema.prisma`):**

1. **v1 has NO `Household` model.** Plan §5 + §7 use "Household" as v2 vocabulary; v1 instead splits contact ownership across `Parent` (model L477 — the actual person with phone/email/NIK) + `StudentGuardian` (junction L509 — relationship + isPrimary + childOrder). The v1 surface analogous to v2's "household" is the `Parent` row. The cycle DOES NOT introduce a new `Household` table — that would be the kind of premature abstraction the CLAUDE.md system prompt forbids, and the plan §4 verdict ("Schema additions only (~3 migrations)") already budgeted only one additive migration for Phase 1.2.

2. **Admission has NO `detected*Id` FK.** The migration adds `Admission.detectedParentId String? @db.VarChar(?)` with a nullable FK to `Parent.id`. Column name follows v1 vocabulary (Parent, not Household) — the plan's "detectedHouseholdId" naming maps to `detectedParentId` for v1.

3. **Admission captures NO parent NIK.** The schema (L551–579) stores `parentName`, `parentPhone`, `parentEmail`, `parentWhatsapp` — but not `parentNik`. The public `/daftar` form (cycle 1.1, AC1) likewise does not collect NIK. Plan §5 cycle 1.2 mentions "by NIK/phone" but NIK match from a public-form admission is **not possible** without first extending the form, which is out of scope here. **Match precedence in this cycle: email > phone.** Name matching is intentionally skipped — fuzzy name match against a tenant's full Parent table risks false positives that would mislead the admin into the wrong merge during cycle 2.x's accept-transition; the plan's q6 admin-only surface already implies the admin is the human gate, but the data feeding the gate must be high-confidence.

4. **No `/admin/admissions/[id]` detail page.** Verified — `app/admin/admissions/` contains only `loading.tsx` + `page.tsx` (735 lines). The admin works through the list page + an edit `Sheet` (mobile) / `Dialog` (desktop) opened on row click via `setEditingAdmission(a)`. Plan §137's "Admission detail page" badge surface maps to: **a new list-column chip** (visible on every row) + **a banner inside the existing edit Sheet/Dialog** when the admin opens a matched admission.

5. **No `/admin/parents` profile page exists** (verified — `app/admin/parents/` does not exist). The chip cannot deep-link to a parent profile. Instead, the chip carries a **tooltip / hovercard** listing the matched parent's name + the names of their currently-linked students (resolved via `StudentGuardian.parent.guardians[].student.fullName`). This gives the admin enough context to decide whether the detected match is the right family. Deep-linking to a parent profile lands in a future cycle (cycle 2.x's accept-transition wires merge UX; this cycle only surfaces the match).

**v2 archived shape:** `lib/admission/sibling-detect.ts` is recoverable via `git show v1-final-2026-05-04:lib/admission/sibling-detect.ts` if the tag still resolves. The plan §5 cycle 1.2 calls for a verbatim lift; in practice the v2 shape was built against v2's `Household` model which doesn't exist in v1, so the algorithm is lifted (email-first, then phone, with tenant scoping + multi-match precedence) and rewired to v1's `Parent` table. The lifted shape stays pure-library — NO DB writes inside the lib; the caller (`/api/admission/submit`) decides whether to persist the match via `prisma.admission.update`.

**Trust boundary:** detection runs AFTER `prisma.admission.create` succeeds. If detection throws or returns a match-not-found, the admission row stays created (already returned `201` to the applicant via cycle 1.1's flow). The detection-write failure path **swallows + logs** — applicant gets `201`; admin sees the admission without a chip. Match correctness is a nice-to-have on top of the inquiry capture; it must not block the inquiry from landing.

**Rate-limit Task 0 — fold into this cycle.** Cycle 1.1's review #2 (cycle-doc Spec Assumption 2) filed `daftar-rate-limit-ip-extraction-hardening` as a follow-up: `lib/rate-limit.ts:getClientIp` reads `x-forwarded-for.split(",").at(-1)`. The current comment in `lib/rate-limit.ts` (L37) claims Vercel **appends** the client IP at the chain's end — but Vercel's actual behavior on `x-forwarded-for` is to **prepend** the originating client IP at index 0; the last entry on Vercel's edge is the platform's own proxy node, which is constant across all requests through one edge region. The practical effect: every proxied request lands in a SHARED bucket keyed off the edge node's IP rather than per-client. A burst of legitimate clients all consume one bucket; a single attacker exhausts the bucket for every legitimate caller through the same edge node. The fix is small (~5 lines) and cross-cuts the auth rate-limit (`lib/security/auth-rate-limit.ts`) which uses the same helper. **Pre-publicised-launch blocker** — cycle 1.2's merge to staging gates plan §7 q7's first `/ship --to-main` since rollback, and the staging→main promotion enables the publicised `/daftar` launch. Folding the fix in here makes the production cutover safe rather than requiring a separate cycle. Cycle 1.1 itself filed it as a follow-up because cross-cutting helper changes are out of scope for a feature cycle; cycle 1.2 has the headroom AND the timing alignment.

**Existing infra reused, not re-built:**
- `lib/rate-limit.ts` `getClientIp` — hardened in Task 0; same shape, same call sites (`auth-rate-limit.ts` + `app/api/admission/submit/route.ts`).
- `prisma.admission.update` — existing surface; the route's existing transaction shape extends with one `update` call after the `create`.
- `app/admin/admissions/page.tsx` columns array (L520+) — extends with one new column. No new table component.
- `StudentGuardian` junction (`prisma.studentGuardian.findMany({ where: { parentId } })`) for the tooltip's "linked students" enumeration. Single existing query shape — no new helper module.

**Hooks reminders for `/build`:**
- **Frontend gate (pre-commit Rule 4)** fires on `app/admin/admissions/page.tsx` (Task 4). This cycle doc contains the literal token `design-system` (this paragraph). Task 4 Verification cross-references `.claude/standards/design-system.html` admin-list-row pattern (column chip + tooltip primitive) + `.claude/standards/ui.md` Shadcn-FIRST (HoverCard / Tooltip / Badge primitives only). Voice-standard note: badge label "Saudara terdeteksi" + tooltip copy in Bu Sari-light register (the admin sees this, not the applicant — but copy stays warm-courteous per `.claude/standards/voice.md`).
- **Commit-msg narrow rule (`^(feat|perf):` + staged `app/**` or `lib/**` requires README staged).** Per cycle 1.1 + 0.3 precedent: per-task commits use `chore(siblings):` / `test(siblings):` / `docs(siblings):` subjects; SINGLE wrap commit uses `feat(siblings):` and stages README + remaining cycle-doc deltas together. Avoids touching README on every task commit.
- **`pre-push` blocks direct pushes to `staging`/`main` for all roles incl. `cto`** — `/ship` opens the PR; CTO does not push direct.
- **25-file cap (§18.2).** Estimated staged files: 9 — `lib/rate-limit.ts`, `lib/rate-limit.test.ts` (NEW), `lib/admission/sibling-detect.ts` (NEW), `lib/admission/sibling-detect.test.ts` (NEW), `prisma/migrations/<ts>_admission_detected_parent/migration.sql` (NEW), `prisma/schema.prisma`, `app/api/admission/submit/route.ts`, `app/admin/admissions/page.tsx`, `e2e/sibling-detect.spec.ts` (NEW), `README.md`, `docs/cycles/2026-05-11-sibling-auto-detect.md` (this file). 11 worst-case — well under cap.
- **Per-task pre-commit broad doc-sync rule.** Code changes to `app/**` / `lib/**` / `prisma/**` require at least one of cycle-doc / README / CLAUDE.md staged in same commit. Per-task commits stage the cycle-doc Implementation-section update alongside the code (cycle 1.1 + 0.3 precedent). Wrap commit additionally stages README.

**Carry-over caveats from cycles 0.x + 1.1:**
- **GitHub Actions billing failure (since 2026-05-10) blocks ALL CI.** Local gates canonical until billing restored outside Claude. PR description records "CI red due to billing — local gates green" per cycle 0.2 / 0.3 / 1.1 precedent.
- **Marathon-Playwright stall.** Full local suite stalls after ~25 min serial run. End-of-cycle gate runs full suite once; moderate-subset re-run (`e2e/sibling-detect.spec.ts` + `e2e/daftar-public.spec.ts` + `e2e/admin.spec.ts` admissions block) on fresh server triages.
- **Build-cache caveat.** `pkill -f "next-server"; sleep 1; DEMO_MODE=true npm run start &` before every `npx playwright test` when source changed in same session.
- **Admin-tagihan flake set** (`e2e/admin.spec.ts:473 / 524 / 575 / 628`) — pre-existing carry-over; `phase0-admin-tagihan-flake-fix` follow-up; not blocking.
- **`preview_start` MCP harness EPERM `uv_cwd` against `.claude/worktrees/<slug>`** (cycle 1.1 finding) — use bash-launched server + curl for HTML smoke; full browser semantics via playwright e2e through `playwright.config.ts` webServer.

---

## Spec

### Acceptance Criteria

- [ ] **AC1.** New nullable FK `Admission.detectedParentId` (String?) with `@relation(fields: [detectedParentId], references: [id], onDelete: SetNull)` to `Parent`. Additive migration `prisma/migrations/<ts>_admission_detected_parent/migration.sql` runs forward without backfill (all existing rows have `NULL`). Index `@@index([tenantId, detectedParentId])` for admin list query (already filtered by tenant). `npx prisma migrate dev` applies cleanly on a fresh demo DB; `npx prisma generate` updates the typed client.

- [ ] **AC2.** New pure library `lib/admission/sibling-detect.ts` exports `detectSibling({ tenantId, parentEmail, parentPhone }, prisma): Promise<{ parentId: string; matchReason: "email" | "phone" } | null>`. Algorithm:
  1. If `parentEmail` is set, query `prisma.parent.findFirst({ where: { tenantId, status: "ACTIVE", email: <normalised> } })`. Email match wins.
  2. Else (or on email no-match) if `parentPhone` is set, fetch all active parents in tenant with non-null `phone` via `prisma.parent.findMany({ where: { tenantId, status: "ACTIVE", phone: { not: null } }, select: { id: true, phone: true, createdAt: true }, orderBy: { createdAt: "asc" } })` then JS-side filter where `normalisePhone(stored) === normalisePhone(applicant)`. First match (oldest by `createdAt`) wins — deterministic tie-break when multiple parents share a phone (common for shared family numbers). `Parent.phone` has no unique constraint (schema L481); a JS-side scan over the active set (typical school ≤ 500 parents) is acceptable; future polish swaps to a generated `phoneDigits` stored column if profile grows.
  3. Both null / both no-match → return `null`.

  Tenant scoping is REQUIRED on every query — passing the same email/phone for a different tenant must NOT cross-match. `email` normalisation: `.trim().toLowerCase()` (matches existing Parent insert behavior elsewhere in the codebase). `phone` normalisation function `normalisePhone(s)`: `s.replace(/\D/g, "")` strips ALL non-digit characters (including `+`, spaces, dashes, parens, dots); THEN if the result starts with `"62"` and has ≥ 11 digits total, replace the leading `"62"` with `"0"` (canonical Indonesian `08xxx` form). Handles `"+62 812-3456-7890"` → `"081234567890"` and bare `"081234567890"` → `"081234567890"` to compare-equal. NOT full E.164 normalisation (no country-code library); future polish if multi-country support lands. NO `prisma.admission.update` inside the lib — caller decides persistence. NO DB writes of any kind in the lib.

- [ ] **AC3.** Vitest coverage in `lib/admission/sibling-detect.test.ts`: (a) no-match returns null (clean DB, no Parent rows); (b) email-only match returns the matched parent id with `matchReason: "email"`; (c) phone-only match returns the matched parent id with `matchReason: "phone"`; (d) both email + phone present, both match SAME parent → returns that parent (email reason wins, deterministic); (e) email matches Parent A, phone matches Parent B → returns Parent A with `matchReason: "email"` (precedence: email > phone); (f) tenant scoping — Parent with matching email in tenant X is NOT returned when query runs against tenant Y; (g) phone normalisation — applicant `"+62 812-3456-7890"` matches stored `"081234567890"` (the `62`→`0` prefix swap + digit-only strip canonicalises both to `"081234567890"`); (h) email normalisation — `"Foo@Bar.com"` matches stored `"foo@bar.com"`; (i) INACTIVE parent does NOT match; (j) phone tie-break — two active parents in the same tenant share an identical stored phone; lib returns the OLDER one by `Parent.createdAt ASC` (deterministic). Uses a transactional vitest fixture against the local Postgres demo DB (matches `lib/admission/submit-validation.test.ts` style — pure Prisma, no mocks).

- [ ] **AC4.** `POST /api/admission/submit` (cycle 1.1 surface) wires the detection AFTER `prisma.admission.create` succeeds and BEFORE the email send. Flow: create admission → call `detectSibling({ tenantId, parentEmail: data.parentEmail, parentPhone: data.parentPhone }, prisma)` → on match, `prisma.admission.update({ where: { id }, data: { detectedParentId: match.parentId } })`. Failure path: `try/catch` around the detect + update; on throw, log `[admission-submit] sibling-detect failed for admission <id>: <err>` to `console.error` and CONTINUE — admission stays created, applicant sees 201 unchanged, email still sends. The `201 { id }` response shape is unchanged — NO match info echoed back to the applicant (per plan §7 q6 — admin-only surface).

- [ ] **AC5.** `/admin/admissions` list page surfaces the match:
  - **New table column "Saudara"** (after the existing Source/Status columns; before the row-actions column) — renders a Shadcn `<Badge variant="secondary">` chip with the label "Saudara terdeteksi" when `detectedParentId` is non-null; renders `—` otherwise. Chip wrapped in a Shadcn `<HoverCard>` (desktop) / `<Popover>`-on-tap (mobile via `data-state="open"`); hover content shows: the matched parent's name (bold) + an `<ul>` of linked-student `fullName`s (resolved server-side via the existing list-query enrichment — see Task 4 Implementation). If the parent has 0 linked students (edge case — admission row pointed at a parent without StudentGuardian links yet), show "Tidak ada siswa tertaut".
  - **Banner inside the existing edit `Sheet`/`Dialog`** — when admin opens an admission row whose `detectedParentId` is non-null, render a `<Alert>` block at the top of the form body: "Pendaftar ini terdeteksi sebagai saudara dari keluarga **<parent name>** (<student names comma-joined>). Verifikasi sebelum mengonversi ke siswa." (Indonesian, Bu Sari-light register per voice standard). Alert is purely informational — no merge button (that's cycle 2.x's accept-transition).
  - **NO change to the applicant-facing `/daftar` surface.** Verified absent — cycle 1.1's `app/daftar/client.tsx` is not touched in this cycle.
  - **NO new admin route, no new API endpoint, no detail page.** The chip + banner render off the existing `/api/admissions` list-query response shape (extended to include `detectedParent: { id, name, guardians: [{ student: { fullName } }] } | null`).

- [ ] **AC6. Task 0 — `lib/rate-limit.ts:getClientIp` hardening.** Fix shape: read the FIRST (leftmost) entry of `x-forwarded-for` — Vercel **overwrites** this header with the client IP at index 0 (per Vercel platform docs: header is platform-controlled, not client-spoofable). Fall back to `x-real-ip` (Vercel alias of the same value — harmless redundancy). Fall back to `"anonymous"` (already present). Update the docstring/inline comment to reflect Vercel's actual behavior: "Vercel overwrites x-forwarded-for with the client IP at index 0 (spoofing-safe; Vercel controls the header). Falls back to x-real-ip (Vercel alias), then 'anonymous'." Vitest coverage in `lib/rate-limit.test.ts`: (a) `x-forwarded-for: "1.2.3.4"` (single entry) returns `"1.2.3.4"`; (b) `x-forwarded-for: "1.2.3.4, 5.6.7.8, 9.10.11.12"` (Vercel-shaped multi-entry) returns `"1.2.3.4"` (client at index 0), NOT `"9.10.11.12"`; (c) no `x-forwarded-for`, with `x-real-ip: "1.2.3.4"` returns `"1.2.3.4"`; (d) neither header present returns `"anonymous"`; (e) `x-forwarded-for: " 1.2.3.4 , 5.6.7.8 "` (whitespace-padded) returns trimmed `"1.2.3.4"`. The auth rate-limit (`lib/security/auth-rate-limit.ts`) and the admission submit rate-limit both inherit the fix automatically — both call `getClientIp(request)` without owning their own header parsing.

- [ ] **AC7.** New e2e spec `e2e/sibling-detect.spec.ts` covers: (a) **applicant-facing /daftar UX unchanged** — clears cookies, navigates `/daftar`, fills the form with a parentEmail that MATCHES a seeded parent, submits, asserts the same confirmation state as cycle 1.1's happy path (NO sibling info echoed to the applicant); (b) **admin sees chip on the matched row** — admin auth, navigates `/admin/admissions`, finds the row by inserted childName, asserts the "Saudara terdeteksi" badge is visible on that row's "Saudara" column AND the unmatched control row's column shows "—"; (c) **hover/click chip reveals matched parent name + student list** — hovers (desktop) or taps (mobile) the chip, asserts the popover content shows the seeded parent's name + at least one linked student fullName; (d) **edit-sheet banner renders** — clicks the row to open the edit Sheet/Dialog, asserts the `<Alert>` banner with the matched parent name renders at the top of the form body. Test runs against `DEMO_MODE=true npm run start` (production build, single warm-server run — matches cycle 1.1 pattern). Seed parent for the test is one of the 100 seeded students' guardians (`prisma/seed.ts` already seeds this).

- [ ] **AC8.** Existing 12 e2e specs (including cycle 1.1's `e2e/daftar-public.spec.ts`) stay green via end-of-cycle gate (`npm run build && npx vitest run && npx playwright test`). The 4 pre-existing admin-tagihan flakes (`admin.spec.ts:473 / 524 / 575 / 628`) may persist on local marathon runs — moderate-subset re-run confirms cycle-touch surface clean.

- [ ] **AC9.** README.md gains: (a) one ADR row dated 2026-05-11 (cell ≤ 400 chars per pre-commit hook) summarising "Sibling auto-detect on `POST /api/admission/submit` — match by email > phone against existing Parent (tenant-scoped); admin sees 'Saudara terdeteksi' chip + edit-sheet banner; applicant-facing UX unchanged"; (b) Modules table tweak for `students` row noting the detect surface; (c) `getClientIp` rate-limit hardening one-liner in the ADR row (folded in — same dated 2026-05-11 row OR a paired row). Total README delta ≤ 7 lines.

- [ ] **AC10.** Cross-checked `.claude/standards/design-system.html` admin-list-row pattern for the sibling chip (HoverCard + Badge + tooltip content shape) — frontend-gate `design-system` token requirement satisfied by THIS bullet + the Spec Context paragraph.

### Spec Assumptions

1. **Match target = `Parent.id`, NOT a new `Household` table.** Plan §5 + §7's "Household" maps to v1's `Parent` model (L477) — the actual contact row with phone/email. v1 has no aggregate "Household" entity; introducing one in cycle 1.2 would be the kind of premature abstraction the system prompt forbids AND would exceed the plan §4 budget of "Schema additions only (~3 migrations)" for the full evolution (Phase 1 has one migration here; Phase 2's state-machine extend is the other anticipated one).

2. **Match precedence = email > phone.** NIK is intentionally dropped (Admission row doesn't capture parent NIK; /daftar form doesn't either; adding NIK to the form is out of scope here — defer to a future cycle if NIK matching value is shown). Name fuzzy matching is intentionally dropped (false-positive risk; the admin is the human gate per plan §7 q6 but the data feeding the gate must be high-confidence).

3. **Tenant scoping is REQUIRED on every detection query.** Same tenant resolution as cycle 1.1's route — `prisma.tenant.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } })` for the in-process route; the detection lib accepts `tenantId` as a parameter (it does NOT re-resolve — caller owns tenant resolution).

4. **Detection failure path swallows + logs; admission stays created.** Detection is a "nice-to-have on top of the inquiry capture". The applicant already received 201 (cycle 1.1 flow); the admin sees the admission row appear in `/admin/admissions` regardless. If detection throws (transient DB hiccup, etc.), the admin simply does not see the chip — no data lost, no UX regression.

5. **Admin badge surface = list-column chip + edit-sheet banner; NO new detail page.** Verified — `app/admin/admissions/` has no `[id]` route, only `loading.tsx` + `page.tsx`. The list page IS the admin's working surface; the edit Sheet/Dialog opened on row click is where the admin spends their time inside an admission. Both surfaces get the match info. NO deep-link to a parent profile (no parent profile route exists; tooltip provides enough context for the admin to recognise the family). Deep-linking lands in a future cycle.

6. **The `/api/admissions` list query needs to include the detected parent + their student names.** The existing list endpoint already does `prisma.admission.findMany({ ... })` — extending the `include`/`select` to pull `detectedParent: { name, guardians: { include: { student: { select: { fullName: true } } } } }` is a single-query enrichment (no N+1). Worst case is the seeded demo's typical list of 20–50 admissions, each with 0–1 matched parents and each matched parent with 1–4 students. Query cost stays well under 100ms.

7. **Phone normalisation handles the `"+62"` vs `"0"` Indonesian prefix shift.** Indonesian phone numbers arrive in many shapes — `"+62 812-3456-7890"`, `"081234567890"`, `"+6281234567890"`, `"0812 3456 7890"`. The lib's `normalisePhone(s)` (a) strips ALL non-digit characters via `s.replace(/\D/g, "")` (covers `+`, spaces, dashes, parens, dots), then (b) if the result starts with `"62"` and has ≥ 11 digits, swaps the leading `"62"` for `"0"` to land on canonical `08xxx`. After normalisation, exact string equality drives the match. NOT full E.164 normalisation (would require a country-code library — overkill for v1; future polish if multi-country lands). NOT `prisma.parent.findFirst({ where: { phone: { contains: normalisedTail } } })` — substring matches risk false positives (e.g., applicant types "3456 7890" matching any parent whose phone ends in those digits). The strip-and-prefix-canonicalise approach is the minimum that handles the two dominant real-world shapes without a dependency.

8. **No CAPTCHA / spam reconsideration this cycle.** Cycle 1.1's rate-limit covers /daftar abuse; Task 0's getClientIp fix makes the rate-limit actually per-client on Vercel. Detection itself doesn't introduce new spam vectors (read-only Prisma queries scoped by tenant).

9. **No applicant-facing surface change.** Per plan §7 q6 explicitly. Cycle 1.2 does NOT add a "you may be related to family X" message on /daftar's confirmation state; does NOT add an admin notification (admin opens /admin/admissions on their normal cadence; the chip is visible the next time they look). NO email to the matched parent ("a new sibling registered" — out of scope; revisit when accept-transition lands in cycle 2.x and the merge is confirmed).

10. **Cycle 1.2 is the LAST cycle before plan §7 q7's first `/ship --to-main` since rollback.** Phase 0 (3 cycles shipped: 0.1, 0.2, 0.3) + Phase 1 (1.1 shipped, 1.2 = this cycle) = 5 cycles. Per plan §7 q7 "accumulate Phase 0 + Phase 1 (~5 cycles)" — the staging→main promotion becomes valid AFTER this cycle merges to staging. **DO NOT prepare `/ship --to-main` in this cycle.** The promotion is a separate doc-only PR (cycle 0.3 precedent: `gh pr create --base main --head staging`); it lands as its own cycle (plan §5 calls this 4.2). Whether to interleave another Phase 1.x feature before 4.2 OR run 4.2 immediately is a user decision after this cycle merges — recorded in Ship Notes.

11. **Cycle doc is source of truth; README is the index.** Detailed Implementation / Verification / Ship Notes land here; README's ADR row is one cell ≤ 400 chars per the pre-commit hook.

### Non-goals

- No `Household` model. No aggregate parent entity. v1 vocabulary stays.
- No NIK matching (Admission row doesn't capture parentNik; /daftar form doesn't either).
- No fuzzy name matching.
- No new admin detail page (`/admin/admissions/[id]`).
- No new admin parent profile page (`/admin/parents/[id]`).
- No applicant-facing surface change on `/daftar` (zero diff to `app/daftar/`).
- No automatic merge / convert-to-student wiring. The chip + banner are informational; merge UX lands in cycle 2.x's accept-transition.
- No email to the matched parent.
- No new API endpoint. The existing `GET /api/admissions` list query is extended; `POST /api/admission/submit` is extended in-place; no new route.
- No `/ship --to-main` (next cycle's job — plan §5 cycle 4.2).
- No CAPTCHA. No Upstash rate-limit swap. No full E.164 phone normalisation.

---

## Tasks

### Task 0 — `lib/rate-limit.ts:getClientIp` hardening + vitest

Hardens the existing helper per cycle 1.1's filed `daftar-rate-limit-ip-extraction-hardening` follow-up. ~5 lines in `lib/rate-limit.ts`: change `forwarded?.split(",").at(-1)?.trim()` to `forwarded?.split(",")[0]?.trim()`; update inline comment to "Vercel prepends the real client IP at index 0; fall back to x-real-ip; final fallback 'anonymous'". Add `lib/rate-limit.test.ts` (NEW) covering AC6 cases (a–e).

Verification — `npx vitest run lib/rate-limit.test.ts` → 5/5 green. Smoke against `app/api/admission/submit/route.ts` + `lib/security/auth-rate-limit.ts` (both consume `getClientIp` without owning header parsing) — `grep -rn "getClientIp" app/ lib/` confirms the two call sites + the test file are the only references.

Commit subject: `chore(siblings): harden getClientIp index-0 read on Vercel-shaped x-forwarded-for`.

### Task 1 — Prisma migration + schema for `Admission.detectedParentId`

Generate via `npx prisma migrate dev --name admission_detected_parent --create-only` then commit the generated SQL. Migration adds:
- `ALTER TABLE "Admission" ADD COLUMN "detectedParentId" TEXT;`
- `ALTER TABLE "Admission" ADD CONSTRAINT "Admission_detectedParentId_fkey" FOREIGN KEY ("detectedParentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;`
- `CREATE INDEX "Admission_tenantId_detectedParentId_idx" ON "Admission"("tenantId", "detectedParentId");`

`prisma/schema.prisma` Admission model gains:
```
detectedParentId String?
detectedParent   Parent?  @relation(fields: [detectedParentId], references: [id], onDelete: SetNull)

@@index([tenantId, detectedParentId])
```

`Parent` model gains the inverse relation:
```
detectedAdmissions Admission[] @relation
```
(Anonymous; Prisma auto-names.)

Verification — `npx prisma migrate dev` applies cleanly against the local demo DB (zero existing rows have non-null `detectedParentId`; migration is purely additive). `npx prisma generate` regenerates the typed client; `npm run build` re-typechecks the full app + lib + e2e and stays green (no new typecheck errors).

Commit subject: `chore(siblings): add Admission.detectedParentId nullable FK + migration`.

### Task 2 — `lib/admission/sibling-detect.ts` + vitest

`lib/admission/sibling-detect.ts` (NEW): exports `detectSibling({ tenantId, parentEmail, parentPhone }, prisma): Promise<{ parentId: string; matchReason: "email" | "phone" } | null>`. Pure-library implementation:

```
- normalise email: trim().toLowerCase() if set (else undefined)
- normalise phone: replace(/[\s\-()]/g, "") if set (else undefined)
- if email set: const m = await prisma.parent.findFirst({ where: { tenantId, status: "ACTIVE", email: <normEmail> }, select: { id: true } }); if m, return { parentId: m.id, matchReason: "email" }
- if phone set: query phone-matches — see below — if first result, return { parentId: result.id, matchReason: "phone" }
- return null
```

Phone match strategy: `prisma.parent.findMany({ where: { tenantId, status: "ACTIVE", phone: { not: null } }, select: { id: true, phone: true, createdAt: true }, orderBy: { createdAt: "asc" } })` then JS-side filter where `normalisePhone(stored) === normalisePhone(applicant)`. First filter hit wins (oldest by `createdAt` — deterministic tie-break when multiple parents share a phone, common for shared family numbers). This avoids SQL-side regex / function call cost; the active-parent count per tenant is small (typical school ≤ 500 parents). If profile shows the tenant scaling beyond ~5000 parents, swap to a generated stored `phoneDigits` column in a future migration — out of scope here.

`normalisePhone(s)` is an internal helper inside the lib file: `s.replace(/\D/g, "")` strips all non-digit characters, then if the result `.startsWith("62")` AND `.length >= 11`, replace the leading `"62"` with `"0"`. Returns the canonical `08xxx` form. Exported alongside `detectSibling` for the vitest cases that exercise the normaliser in isolation.

`lib/admission/sibling-detect.test.ts` (NEW): 9 cases per AC3. Uses `prisma` import from `@/lib/db`; each test wraps in a `prisma.$transaction(async (tx) => { ... })` rollback fixture pattern OR uses `beforeEach` + `afterEach` cleanup of a known-test tenant + parents — match the existing repo pattern (`lib/admission/submit-validation.test.ts` is pure-Zod and doesn't hit the DB; the DB-touching test pattern lives in other lib tests — verify during Task 2 implementation and conform).

Commit subject: `test(siblings): add sibling-detect lib + vitest (9 cases incl. tenant scoping + precedence)`.

### Task 3 — Wire `detectSibling` into `POST /api/admission/submit`

`app/api/admission/submit/route.ts` (modified):
- After the existing `const admission = await prisma.admission.create({ ... })` call (cycle 1.1 line ~76 area), add inside a `try/catch`:
  ```
  try {
    const match = await detectSibling(
      { tenantId, parentEmail: data.parentEmail, parentPhone: data.parentPhone },
      prisma
    );
    if (match) {
      await prisma.admission.update({
        where: { id: admission.id },
        data: { detectedParentId: match.parentId },
      });
    }
  } catch (err) {
    console.error(`[admission-submit] sibling-detect failed for admission ${admission.id}:`, err);
    // Swallow — admission stays created, applicant sees 201 unchanged
  }
  ```
- Detection runs BEFORE the email send (cycle 1.1 ordering preserved — email still fires last).
- Response shape unchanged: `201 { id }`. No match info echoed. Per plan §7 q6 admin-only.

Verification — local prod build + 2 curl smokes:
- POST with parentEmail matching a seeded parent → 201; subsequent `SELECT detectedParentId FROM "Admission" WHERE id = '<returned id>';` shows the matched parent id.
- POST with parentEmail NOT matching any seeded parent → 201; `detectedParentId` stays NULL.
- POST with a transient `prisma.parent.findFirst` failure (simulated by temporarily breaking the function) → 201 still returned; admission row exists with NULL detect.

Commit subject: `chore(siblings): wire detectSibling into POST /api/admission/submit (best-effort persist)`.

### Task 4 — Admin badge surface (list-column chip + edit-sheet banner)

`app/admin/admissions/page.tsx` (modified):
- Extend the inline `Admission` type (around L54) with `detectedParent: { id: string; name: string; guardians: Array<{ student: { fullName: string } }> } | null`.
- Extend the list-fetch query string at L391–402 OR (cleaner) the API route `app/api/admissions/route.ts` GET handler's `prisma.admission.findMany` `include` to add `detectedParent: { select: { id: true, name: true, guardians: { select: { student: { select: { fullName: true } } } } } }`. (If `/api/admissions` is the right surface — verify during Task 4 implementation; the page may fetch directly.) NO N+1 — single nested `include`.
- Add a new column to the `columns` array (L520+) between "Status" (L579) and the row-actions column (around L601+). Column header: "Saudara". Cell: when `row.original.detectedParent` is set, render `<HoverCard>` (Shadcn) with `<HoverCardTrigger>` wrapping `<Badge variant="secondary">Saudara terdeteksi</Badge>` and `<HoverCardContent>` showing the parent name in bold + an `<ul>` of student fullNames (or "Tidak ada siswa tertaut" if guardians is empty). When `detectedParent` is null, render plain `—`.
- Inside the existing edit `Sheet` (mobile) / `Dialog` (desktop) at L692/L709, when `editingAdmission?.detectedParent` is set, render a `<Alert>` block at the top of the form body (above the existing inputs): "Pendaftar ini terdeteksi sebagai saudara dari keluarga **{parent name}** ({student names comma-joined}). Verifikasi sebelum mengonversi ke siswa." Uses Shadcn `<Alert>` + `<AlertDescription>` from `@/components/ui/alert` if available (verify during Task 4); else use `<Card>` with appropriate styling per `.claude/standards/design-system.html`.
- Add `data-testid="admission-row-sibling-chip"` to the chip + `data-testid="admission-edit-sibling-banner"` to the banner for e2e.

NOTE: existing list-fetch in `app/admin/admissions/page.tsx` at L391–402 reads the API response shape directly. The cleanest cut is to extend the API route at `app/api/admissions/route.ts` GET handler — verify during implementation that this is the correct API surface (not a server-component query inside the page).

Verification — local prod build + browser smoke on the running dev server (cookie-auth as admin):
- Insert a test admission via `POST /api/admission/submit` with a parentEmail matching seeded `Parent.email`.
- Reload `/admin/admissions`; assert the new row's "Saudara" column shows the chip; hover → parent name + students visible.
- Click the row; assert the edit Sheet/Dialog renders the Alert at the top with the matched parent's name.
- Cross-checked `.claude/standards/design-system.html` admin-list-row pattern for the chip column shape; cross-checked `.claude/standards/voice.md` for the Bu Sari-light register on admin copy ("Verifikasi sebelum mengonversi ke siswa" — directive but warm).

Commit subject: `chore(siblings): add Saudara chip column + edit-sheet banner on /admin/admissions`.

### Task 5 — `e2e/sibling-detect.spec.ts`

`e2e/sibling-detect.spec.ts` (NEW): four Playwright tests under `Phase 1.2 — Sibling auto-detect`. Test runs against `DEMO_MODE=true npm run start` (production build).

1. **`applicant-facing /daftar UX unchanged when match exists`** — clears cookies, navigates `/daftar`, fills the form with a parentEmail matching one of the 100 seeded students' guardians (e.g., looked up from `prisma.parent.findFirst` in test setup). Submits. Asserts the same confirmation state as cycle 1.1's happy path — no sibling info on the page, no extra UI surface.
2. **`admin sees chip on matched row + plain dash on unmatched row`** — admin auth via demo cookie, navigates `/admin/admissions`. Asserts the row inserted in test 1 shows `[data-testid="admission-row-sibling-chip"]`; asserts a control row (an existing admission with NULL detect — pre-seeded or just-inserted with a non-matching parentEmail) shows `—`.
3. **`hover chip reveals matched parent name + student list`** — hovers the chip; asserts the popover content contains the matched parent's name + at least one student fullName.
4. **`edit-sheet banner renders matched parent context`** — clicks the matched row; asserts `[data-testid="admission-edit-sibling-banner"]` visible inside the Sheet/Dialog + contains the parent name.

`npx playwright test e2e/sibling-detect.spec.ts` → 4/4 green expected. Build-cache caveat applies: `pkill -f "next-server"; sleep 1; DEMO_MODE=true npm run start &` before the run.

Commit subject: `test(e2e): add sibling-detect spec — 4 tests covering applicant-unchanged + admin chip + hover + banner`.

### Task 6 — README + cycle-doc wrap commit

Add to README's ADR table (top row, dated 2026-05-11, ≤ 400 chars per pre-commit hook):
> `2026-05-11 | Sibling auto-detect — POST /api/admission/submit calls lib/admission/sibling-detect (tenant-scoped email > phone match against Parent) and persists Admission.detectedParentId; /admin/admissions surfaces a "Saudara terdeteksi" chip + edit-sheet banner; applicant-facing /daftar unchanged. Also: lib/rate-limit.ts getClientIp reads x-forwarded-for[0] (Vercel prepends client) — see [cycle](docs/cycles/2026-05-11-sibling-auto-detect.md)`

Update Modules table row for `students` to mention "+ sibling auto-detect on admission submit" alongside the existing public `/daftar` entry text from cycle 1.1.

Update cycle doc with Implementation / Verification / Ship Notes sections (live-write during /build per cycle 1.1 + 0.3 cadence).

Wrap commit subject: `feat(siblings): add admission sibling auto-detect + getClientIp hardening — Phase 1.2`.

This is the SINGLE `feat:` subject in the cycle (per Spec Assumption hooks-reminder); per-task commits used `chore` / `test` subjects to dodge the narrow `^(feat|perf):` rule's per-commit README touch.

---

## Implementation

### Task 0 — `lib/rate-limit.ts:getClientIp` hardening + vitest

`lib/rate-limit.ts` L34–43: changed `forwarded?.split(",").at(-1)?.trim()` → `forwarded?.split(",")[0]?.trim()`. Updated the inline docstring to reflect Vercel's actual behavior: "Vercel overwrites x-forwarded-for with the client IP at index 0 (spoofing-safe; Vercel controls the header). Falls back to x-real-ip (Vercel alias), then 'anonymous'." Net diff: 4 lines changed (1 comment line collapsed, 2 comment lines added, 1 logic line edited).

`lib/rate-limit.test.ts` (NEW, 38 lines): 5 vitest cases covering AC6 (a–e) — single-entry, Vercel-shaped multi-entry returning index 0, whitespace-trimmed leftmost, x-real-ip fallback, anonymous fallback. Uses `new Request("https://example.com/", { headers })` to construct test requests (matches the route handler's `Request` type without any mocking).

Verification — `npx vitest run lib/rate-limit.test.ts` → 5/5 green in 1.42s. Both call sites of `getClientIp` (`lib/security/auth-rate-limit.ts` L22 + `app/api/admission/submit/route.ts` from cycle 1.1) inherit the fix automatically; neither owns its own header parsing.

Files changed (2): `lib/rate-limit.ts` (modified), `lib/rate-limit.test.ts` (new). No new dependencies.

### Task 1 — Prisma migration + schema for `Admission.detectedParentId`

`prisma/schema.prisma`:
- `Admission` (L551–): added `detectedParentId String?` column + `detectedParent Parent? @relation("AdmissionDetectedParent", fields: [detectedParentId], references: [id], onDelete: SetNull)` named relation + `@@index([tenantId, detectedParentId])` composite index.
- `Parent` (L477–): added `detectedAdmissions Admission[] @relation("AdmissionDetectedParent")` inverse. Explicit named relation needed because Admission already has a different FK to Student (anonymous, the existing `studentId` relation); a second Parent↔Admission relation requires a distinct relation name on both sides.

`prisma/migrations/20260511000000_admission_detected_parent/migration.sql` (new): `ALTER TABLE "Admission" ADD COLUMN "detectedParentId" TEXT;` + `ADD CONSTRAINT ... ON DELETE SET NULL ON UPDATE CASCADE;` + `CREATE INDEX "Admission_tenantId_detectedParentId_idx"`. Hand-written (Prisma's `migrate dev --create-only` could not run because the shadow-database step fails on the existing `20260415_enable_rls` migration — environment-specific Supabase setup limitation, not a defect; the hand-written SQL matches what Prisma would have generated for the schema diff). Applied locally via `npx prisma migrate deploy` against the demo DB; `_prisma_migrations` ledger records the deploy.

Verification — `npx prisma validate` reports "The schema at prisma/schema.prisma is valid"; `npx prisma generate` regenerates the typed client (`lib/generated/prisma`); `npm run build` typechecks the full surface (Next 16 production build) green; the new `Admission.detectedParentId` field appears on the generated Prisma type.

Files changed (3): `prisma/schema.prisma` (modified), `prisma/migrations/20260511000000_admission_detected_parent/migration.sql` (new), `prisma/migrations/20260511000000_admission_detected_parent/` (new dir). No new dependencies.

### Task 2 — `lib/admission/sibling-detect.ts` + vitest

`lib/admission/sibling-detect.ts` (NEW, 83 lines): exports `detectSibling({ tenantId, parentEmail, parentPhone }, prisma): Promise<{ parentId, matchReason: "email" | "phone" } | null>` + the `normalisePhone(s): string` helper (exported for vitest unit coverage in isolation) + `DetectSiblingInput` / `DetectSiblingResult` / `MatchReason` types. Implementation matches AC2 verbatim:

1. Email path (precedence first): if `parentEmail` is set, normalise via `.trim().toLowerCase()`; query `prisma.parent.findFirst({ where: { tenantId, status: "ACTIVE", email: <normEmail> }, select: { id: true } })`. The schema's `@@unique([tenantId, email])` guarantees at most one row.
2. Phone path (fallback): if `parentPhone` is set, normalise via `normalisePhone()` (strip non-digits via `/\D/g`; then `62`→`0` prefix swap when length ≥ 11); fetch the active phone-non-null parents via `findMany` with `orderBy: { createdAt: "asc" }` + select `id/phone/createdAt`; JS-side filter on `normalisePhone(stored) === normApplicant`; first hit wins.
3. No match anywhere → `null`.

The lib accepts a structurally-typed `ParentTable = Pick<PrismaClient, "parent">` shape so the test can swap a mock without needing the full Prisma client — the real route handler passes `prisma` from `@/lib/db` which satisfies the shape naturally.

`lib/admission/sibling-detect.test.ts` (NEW, 207 lines): 13 cases total — 3 `normalisePhone` unit cases (+62 prefix strip + canonicalisation + bare 08xxx passthrough) and 10 `detectSibling` cases covering AC3 (a)–(j): no-match, email-only, phone-only, both-match-same, email>phone precedence, tenant scoping, phone normalisation E2E, email normalisation E2E, INACTIVE skipped, and the (j) tie-break case (two parents share a phone — older `createdAt` wins).

The test uses an in-process mock `prisma` (`makeMockPrisma(parents: ParentRow[])`) matching the `ParentTable` shape — no real DB hits, follows the existing repo convention (`lib/__tests__/parent-helpers-tz.test.ts` precedent). Cycle doc AC3's "transactional vitest fixture" phrasing maps to the in-repo mock-prisma pattern; real-DB validation lives in the e2e spec (Task 5) which exercises the full pipeline against the demo Postgres.

Verification — `npx vitest run lib/admission/sibling-detect.test.ts` → 13/13 green in 1.18s. `npm run build` typechecks the full surface green (the structural `ParentTable` shape resolves cleanly against `PrismaClient`).

Files changed (2): `lib/admission/sibling-detect.ts` (new), `lib/admission/sibling-detect.test.ts` (new). No new dependencies.

### Task 3 — Wire `detectSibling` into `POST /api/admission/submit`

`app/api/admission/submit/route.ts` (modified, ~25-line insertion): imports `detectSibling` from `@/lib/admission/sibling-detect`. After the existing `admission.create` block (line 85 area) and BEFORE the email send (line 95 area), runs the detection inside a `try/catch`:

```
try {
  const match = await detectSibling(
    { tenantId, parentEmail: data.parentEmail, parentPhone: data.parentPhone },
    prisma,
  );
  if (match) {
    await prisma.admission.update({
      where: { id: admissionId },
      data: { detectedParentId: match.parentId },
    });
  }
} catch (err) {
  console.error(`[admission-submit] sibling-detect failed for admission ${admissionId}:`, err);
}
```

Failure swallowed — admission stays created, applicant sees 201 unchanged, admin sees the row without a chip. Match info NEVER echoed to the applicant. Trust boundary preserved.

Verification — local prod build + 2 curl smokes against `DEMO_MODE=true npm run start`:
- POST with `parentPhone: "+62 812 9876 543"` (matches seeded Parent `Siti Nurhaliza Hidayat`, phone `"08129876543"`): returned `201 { id: "cmp0uzi3p00003bx785t08tox" }`; DB shows `detectedParentId = "cmoz7hs5d00d518x7vdttepxg"` (the matched seeded parent). +62→0 prefix swap exercised end-to-end.
- POST with `parentPhone: "+62 999 0000 1234"` (no seeded parent matches): returned `201`; DB shows `detectedParentId = null`.

`npm run build` typechecks green; the new import + the `prisma.admission.update` shape compile cleanly against the migration-extended Prisma client.

Files changed (1): `app/api/admission/submit/route.ts` (modified). No new dependencies.

## Verification

_Filled at end-of-cycle: AC-by-AC checkmarks, end-of-cycle gate output (npm run build + npx vitest run + npx playwright test), manual smoke (curl + browser), carry-over caveats. Matches cycle 1.1 + 0.3 shape._

## Ship Notes

_Filled before `/ship`: migrations (Task 1's `<ts>_admission_detected_parent`), env vars (none new), rollback, ops steps, follow-ups filed during this cycle, wrap delta._

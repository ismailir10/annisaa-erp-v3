# Siswa ↔ Wali Murid Linking

## Context

An admin moving between a student and that student's parents hits a one-way street. From a wali's page the children are clickable ([`app/admin/guardians/[id]/page.tsx:440`](../../app/admin/guardians/[id]/page.tsx)); from a student's page the Orang Tua / Wali tab renders plain `div`s ([`app/admin/students/[id]/page.tsx:861`](../../app/admin/students/[id]/page.tsx)) with the only link in the whole tab being the "Unggah KK di halaman wali" fallback at line 703. The students list Wali column (line 371) prints a name that is not a link, and the guardians list prints `3 siswa` with no names. The admin ends up using the sidebar and the search box to travel two hops that should be one click.

Underneath the navigation gap is a data gap. "Tambah wali" cannot select a parent who already exists — `POST /api/students/[id]/guardians` ([route.ts:52](../../app/api/students/[id]/guardians/route.ts)) dedups only by email, so adding the second child of a family whose parent has no email on file silently creates a **second Parent row**. That family then has two profiles, two KK slots, and invoices split across both. Staging today holds 34 parents for 30 students, 3 parents linked to more than one child, and 1 duplicate-name group; production carries more emailless parents, so the exposure there is larger. Nothing in the product shows siblings, either — a student's page gives no hint that a brother or sister is enrolled.

This cycle makes the link bidirectional, teaches "Tambah wali" to reuse an existing parent, and surfaces siblings. Data model is untouched: `Parent` + `StudentGuardian` already express family correctly. The gap is UI plus one API path.

## Spec

### Acceptance criteria

**Navigation**
- [ ] On student detail, each row in the Orang Tua / Wali tab links to `/admin/guardians/{parentId}`. The Edit and Nonaktifkan buttons sit outside the link element — no nested interactive elements, no `stopPropagation` workaround.
- [ ] Student detail shows a **Saudara** row listing other students who share at least one active guardian, each chip linking to that student. Row is hidden when there are none.
- [ ] Students list Wali column renders the parent name as a link to the guardian's page, and no longer shows `—` for students whose guardians exist but none is flagged primary.
- [ ] Guardians list Siswa column shows the count plus up to two child names.

**Linking an existing parent**
- [ ] `POST /api/students/[id]/guardians` accepts `parentId`. On that path it creates only the `StudentGuardian` row — no parent create, no parent update. Bio fields in the payload are ignored.
- [ ] The `parentId` path rejects a parent outside the caller's tenant with 404.
- [ ] Re-linking a parent already linked to that student returns 409 when the existing link is ACTIVE, and reactivates the link (200) when it is INACTIVE.
- [ ] The create-new path (no `parentId`) checks for an existing parent matching on email, NIK, phone, or normalised name. On a hit it returns 409 with `code: "PARENT_CANDIDATES"` and a `candidates[]` array instead of creating.
- [ ] Sending `confirmNew: true` bypasses the candidate check and creates the new parent.
- [ ] The Tambah Wali dialog opens on a parent search. Selecting a result links it. "Tambah wali baru" reveals the existing form. A `PARENT_CANDIDATES` 409 renders the candidates inline with **Tautkan** and **Tetap Buat Baru**.

**Correctness**
- [ ] Guardian detail saves parent bio through `PUT /api/parents/[id]` rather than `PUT /api/guardians/{junctionId}` of an arbitrary child. The "Wali ini belum tertaut ke siswa manapun" dead-end and the relationship/isPrimary reseed at [`guardians/[id]/page.tsx:214-218`](../../app/admin/guardians/[id]/page.tsx) both disappear.
- [ ] `npx vitest run` and `npm run build` pass. New Vitest coverage for candidate matching, the `parentId` link path, and the primary-wali fallback.
- [ ] Frontend diffs follow `design-system` — link affordance and hover treatment reuse the existing `hover:bg-accent/50 rounded-md px-2 -mx-2` row pattern from the guardians page rather than a new one.

### Non-goals

- **No `Family` / household entity.** Deferred deliberately; `Parent` + `StudentGuardian` carry this cycle.
- **No merge tool.** Parents already duplicated in the database stay duplicated. This cycle stops new ones and warns on the ones that exist; reassigning `Invoice` / `User` / `StudentGuardian` rows between parents is its own cycle with its own billing tests.
- **No schema migration.** Zero Prisma changes.
- **No change to parent-side portals.** `/parent/**` and `/api/parent/**` untouched.
- **No fuzzy name matching.** Exact match on a case- and whitespace-normalised name only.
- **The student-detail Edit Wali dialog keeps editing parent bio.** Its current behaviour is unchanged; only the guardian *detail page* save path is corrected.
- **No NIK search in the picker.** `GET /api/guardians?search=` covers name / email / phone and is reused as-is.

### Assumptions

1. `Parent` + `StudentGuardian` need no schema change — a parent is already shareable across students, the junction already carries `relationship`, `isPrimary`, `childOrder`.
2. Name matching is normalised-exact (lowercase, collapsed whitespace), not fuzzy. Indonesian given names repeat often enough that trigram matching would fire constantly and train admins to dismiss the warning.
3. The candidate check runs only on the create-new path. Choosing a parent from the picker is already an explicit link and needs no confirmation.
4. An INACTIVE link between the same student and parent is reactivated rather than rejected — the admin's intent is unambiguous.
5. "Saudara" means *another student sharing at least one ACTIVE guardian*. Not KK-number based, since `kkNumber` is sparsely populated.
6. Candidates are capped at 5 and ordered by match strength: email → NIK → phone → name.
7. `GET /api/guardians?search=` is already tenant-scoped, admin-gated and paginated, so the picker adds no new route and no new authorization surface.

## Tasks

- [ ] **T1 — Extract parent matching into `lib/parent/match.ts`.**
  Move `normalisePhone` from `lib/admission/sibling-detect.ts` into a new `lib/parent/match.ts`; `sibling-detect.ts` re-exports it so its own imports and `lib/admission/sibling-detect.test.ts` stay untouched. Add `findParentCandidates({ tenantId, name, email, phone, nik }, prisma)` returning up to 5 `{ id, name, phone, email, matchReason, childCount }` ordered email → nik → phone → name, ACTIVE parents only, tenant-scoped.
  *Acceptance:* `npx vitest run lib/parent lib/admission` green, including the pre-existing `normalisePhone` cases.

- [ ] **T2 — `parentId` link-only path on `POST /api/students/[id]/guardians`.** *(depends on nothing)*
  Extend `createGuardianSchema` (or add `linkGuardianSchema`) with optional `parentId`. When present: verify the parent's `tenantId`, skip every parent write, create the junction row, keep the existing first-guardian `isPrimary` auto-default. 404 on cross-tenant or unknown parent; 409 on an existing ACTIVE link; reactivate + 200 on an existing INACTIVE link.
  *Acceptance:* Vitest covers link-created, cross-tenant 404, duplicate-active 409, inactive-reactivated 200.

- [ ] **T3 — Candidate 409 on the create-new path.** *(depends on T1, T2)*
  With no `parentId` and no `confirmNew`, call `findParentCandidates`. Any hit → 409 `{ error, code: "PARENT_CANDIDATES", candidates }`. `confirmNew: true` skips the check and creates as today.
  *Acceptance:* Vitest covers candidate-409, `confirmNew` bypass, and no-match straight-through.

- [ ] **T4 — `components/admin/parent-picker.tsx`.** *(depends on nothing)*
  Mirror `components/admin/student-picker.tsx`: Popover + Command, 250ms debounce, `AbortController`, the same five states (idle / loading / error+retry / empty / ok), querying `/api/guardians?search=&status=ACTIVE&pageSize=20`. Each result shows `Nama · telepon · N anak` from the `_count.guardians` the route already returns.
  *Acceptance:* Vitest render test for the five states; visually matches the student picker.

- [ ] **T5 — Rebuild the Tambah Wali dialog around three modes.** *(depends on T2, T3, T4)*
  One Sheet/Dialog instance, three mutually exclusive bodies, following the enroll dialog's picker → 409-advisory pattern at [`students/[id]/page.tsx:1085`](../../app/admin/students/[id]/page.tsx): **link** (ParentPicker + relationship + Anak ke-), **create** (existing `GuardianFormBody`, reached via "Tidak ketemu? Tambah wali baru"), **candidates** (Alert listing the 409 candidates, each with Tautkan, plus a Tetap Buat Baru button that re-POSTs with `confirmNew: true`). Edit mode is unaffected.
  *Acceptance:* Manual smoke — link an existing parent to a second student and confirm no new Parent row is created.

- [ ] **T6 — Student detail: clickable wali rows + Saudara.** *(depends on nothing)*
  Wrap the name/badges cluster in a `Link` to the guardian page using the guardians-list hover treatment; leave the action buttons outside it. Widen the `GET /api/students/[id]` guardian include so each parent carries its other student links, derive siblings client-side (dedup by student id, drop self, ACTIVE links only), render as chips under the guardian list.
  *Acceptance:* Both directions clickable; Saudara hidden when the student has no siblings.

- [ ] **T7 — List pages: link the Wali column, name the children.** *(depends on nothing)*
  `GET /api/students`: change the guardian include from `where: { isPrimary: true }` to `where: { status: "ACTIVE" }, orderBy: { isPrimary: "desc" }, take: 1` and add `id` to the parent select. Students list Wali column becomes a link (guarding the row's own click handler). `GET /api/guardians`: include up to two ACTIVE child names; Siswa column renders `3 siswa · Aisyah, Fatimah`.
  *Acceptance:* Vitest asserts the fallback picks an active non-primary guardian when no primary exists.

- [ ] **T8 — Guardian detail saves through `PUT /api/parents/[id]`.** *(depends on nothing)*
  Replace the `PUT /api/guardians/${parent.guardians[0].id}` call at [`guardians/[id]/page.tsx:240`](../../app/admin/guardians/[id]/page.tsx); drop the `relationship` / `isPrimary` reseed at lines 214-218 and the "Wali ini belum tertaut ke siswa manapun" guard, since the parent route needs no junction row.
  *Acceptance:* A parent with zero linked students is editable; relationship on existing junctions is unchanged after a bio save.

- [ ] **T9 — e2e round trip.** *(depends on T5, T6, T7)*
  Extend `e2e/admin-guardian-detail.spec.ts`: student detail → click wali → guardian detail → click child → student detail, plus linking an existing parent to a second student and asserting `/api/guardians?pageSize=1` total is unchanged.
  *Acceptance:* `npx playwright test admin-guardian-detail` green, or an explicit deferral to the required CI `Playwright E2E` check recorded in Verification.

## Implementation

<!-- filled by /build -->

## Verification

<!-- filled by /build -->

## Ship Notes

<!-- filled by /ship -->

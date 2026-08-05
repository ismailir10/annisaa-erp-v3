# Jurnal + Penilaian QA — minors follow-up

## Context

PR #451 (`d7b1fc4d`) closed the one blocker and four majors from the 2026-08-04 cross-role QA pass ([`docs/qa/2026-08-04-jurnal-penilaian-cross-role-staging.md`](../qa/2026-08-04-jurnal-penilaian-cross-role-staging.md)) and explicitly deferred the rest. This cycle closes the deferred remainder.

Re-verified every open item against `origin/staging` at `d7b1fc4d` before speccing. Status of the 13 deferred items:

- **m10** (dead `hariKosong`) — already fixed, removed incidentally by #451. Nothing to do.
- **m1–m9, m11, m12** — all still present, code unchanged from what the report described.
- **d1** (staging `Semester` row sits outside its parent `AcademicYear`) — a staging seed defect, not application code.

One item the report filed under MAJOR was only half-fixed by #451 and is picked up here:

- **M1-half — `/admin/raport` class picker is still unscoped.** #451's acceptance covered only `GET /api/student-journal/admin/classes`. `app/admin/raport/page.tsx:87` still fetches `/api/admin/classes?pageSize=200` with no `yearId`, and `app/api/admin/classes/route.ts:81-82` only applies `academicYearId` when the param is present. Staging therefore still offers all 15 sections — 7 from the ARCHIVED 2024/2025 year — with duplicate labels ("TKIT-A" ×4). An admin can still silently draft raport against the archived cohort. This is the same class of defect #451 fixed on the journal side, so it belongs here rather than in a third cycle.

Two of these are the first thing every parent sees on every visit (m1, m2), and one lets an admin write a raport against the wrong cohort (M1-half). The rest are correctness, accessibility and copy debt.

Cross-checked `design-system.html` for the accessible-text token pattern (§ color tokens) before adding one — the codebase already uses a `--<name>-text` companion for tinted surfaces (`--status-*-text`, `--celebration-gold-text`); T6 follows that existing pattern rather than inventing a new one.

## Spec

**T1 — m1 + m2: the parent greeting is wrong in three ways at once.**
`app/parent/page.tsx:194-200` renders `Assalamu'alaikum, {honorific} {firstToken(parent.name)}` plus `timeOfDayGreeting(now)`.

- `lib/hijri.ts:32` `timeOfDayGreeting` calls `date.getHours()`. `app/parent/page.tsx` is a **server** component, so on Vercel that is UTC — observed live as "Selamat siang" at 18:05 WIB. The same file already uses `getYmdInTimezone(now, JAKARTA_TZ)` correctly one line down.
- `parent.name` already carries the honorific ("Ibu Rina", "Bapak Hendra Hakim"), so `split(" ")[0]` yields the honorific itself → observed live: "Assalamu'alaikum, **Bu Ibu**".
- `firstRel === "FATHER"` never matches: `StudentGuardian.relationship` is a free `String` documented in `prisma/schema.prisma:601` as `AYAH | IBU | WALI | OTHER` (staging: 28 IBU / 6 AYAH / 2 WALI). All 6 fathers are addressed "Bu".

Acceptance: greeting resolves the hour in `Asia/Jakarta` regardless of server TZ; a leading honorific token in `Parent.name` is stripped before the first name is taken; `AYAH` → "Pak", `IBU` → "Bu", `WALI`/`OTHER`/missing → "Bu" (the existing default, since 28 of 36 links are mothers). "Bapak Hendra Hakim" + AYAH must render "Assalamu'alaikum, Pak Hendra".

**T2 — m3: teacher "Periode" is derived from the wall clock.**
`app/teacher/assessments/page.tsx:50-52` computes `month >= 7 ? "Semester 1" : "Semester 2"` via `getCurrentPeriod()`. Teacher shows "Semester 1 2025/2026" while `/admin/raport` and `/parent/perkembangan` both show "Semester 2 · 2025/2026" for the same date — and Semester 2 is the row that actually owns the Weeks the page renders.

A correct helper already exists and is **dead code**: `lib/academic-period-db.ts:21` `getCurrentPeriodFromDb(tenantId, now)`, which date-windows `startDate <= today <= endDate` on top of `status = 'ACTIVE'` and falls back to `getCurrentPeriod()`. It has zero call sites, a stale docstring claiming `Semester` is absent from `schema.prisma` (it is at `:1080`), and its own UTC bug at `:25` (`now.toISOString().slice(0,10)` against dates documented as UTC-midnight-of-the-Jakarta-day).

Acceptance: the teacher page reads the period from the DB via that helper; the helper's day resolution uses `Asia/Jakarta`; its docstring matches reality; net-new unit coverage since `lib/academic-period-db.ts` has none today.

**T3 — m4: journal `weekStart` default is UTC.**
`app/api/student-journal/admin/classes/route.ts:44` uses `new Date().toISOString().slice(0,10)`. The sibling `admin/class-roll-up/route.ts` uses `getTodayInTimezone("Asia/Jakarta")`. Between 00:00–06:59 WIB the two disagree; on a Monday that shifts the whole admin monitor a week.

Acceptance: both routes resolve today the same way; a request with no `weekStart` returns the Jakarta week.

**T4 — M1-half: `/admin/raport` class picker is not year-scoped and its labels collide.**
Acceptance: the picker requests only the active academic year's sections. Because a single year can still hold same-named sections across campuses, each option is disambiguated by campus. No archived-cohort section is selectable.

**T5 — m5: no `not-found.tsx` anywhere.**
`notFound()` renders Next.js's raw black-on-white English default with no branding, no Indonesian and no way back. Reachable from the parent portal via any stale or mistyped child link. `error.tsx` boundaries exist for all three portals; `not-found` does not.

Acceptance: a root `app/not-found.tsx` in Indonesian, on-brand, with a link home.

**T6 — m6: checked journal rows fail WCAG AA.**
`components/student-journal/class-day-grid.tsx:178` styles a checked cell `bg-primary/10 border-primary text-primary`. `--primary` is `#5DB4B8` (`app/globals.css:136`) → ~2.2:1 against the tinted near-white background. Unchecked rows use `rgb(28,25,23)`, so the *meaningful* state is the harder one to read. `components/portal/week-grid.tsx:210` has the same problem for the parent-side check glyph, which as a non-text graphic still needs 3:1.

Acceptance: a `--primary-text` token following the existing `--status-*-text` / `--celebration-gold-text` convention, hitting ≥4.5:1 on the tinted surface, applied at both call sites. Contrast asserted in a test, not eyeballed.

**T7 — m7: raport "Tinggi (cm)" / "Berat (kg)" show a required asterisk but are optional.**
`app/admin/raport/raport-editor.tsx:440-458` — `NumField` hardcodes `required` on both `FieldLabel` and `Input`. Publish succeeds with both empty; `StudentMeasurement` fields are nullable.

Acceptance: `NumField` takes an `optional` flag; the two measurement fields drop the asterisk and the `required` / `aria-required` attributes.

**T8 — m8: sentra "Kegiatan" is captured but never surfaced.**
`AssessmentEntry.activity` (`prisma/schema.prisma:1251`) is written by `app/api/teacher/assessment-entries/center/route.ts:145` and read back only by the teacher's own prefill (`center/[center]/route.ts:149`). The parent Capaian "latest this week" query at `lib/curriculum/perkembangan-loader.ts:155-166` does not select it, so `app/parent/perkembangan/[studentId]/page.tsx:122` cannot render it.

Acceptance: `activity` flows through the loader DTO and renders on the parent Capaian entry row when present; absent/empty renders nothing (no empty label).

**T9 — m11: rapor banner interpolates the child's name after the period.**
`app/parent/report-cards-list.tsx:56-58` produces "Rapor Triwulan 1 · Semester 2 · 2025/2026 Zahra sudah terbit".

Acceptance: reads as a sentence with the name first; `childName` absent still reads correctly.

**T10 — m12: one HTTP POST per indicator tap.**
`app/teacher/student-journal/entry/page.tsx:160-168` posts a single-element `entries` array per tap to an endpoint that is already batch-shaped. Four taps → four requests, against an intermittent-4G target.

Acceptance: taps landing inside a short window flush as one POST. Optimistic display stays immediate; a failed flush rolls back exactly the cells in that flush and raises one toast, not one per cell. Per-cell tap ordering is preserved.

**T11 — m9: slow first paint.**
`/admin/student-journal/monitoring` takes ~13–15 s to first data though its own API answers in ~560 ms from the loaded page; `/admin/penilaian` ~10 s; several teacher pages ~8 s, with the teacher home rendering a **fully blank body** while loading.

The blank-body half is a bounded fix. The 13-second half is not diagnosable from source — the page already issues exactly one fetch on mount (`monitoring/page.tsx:91-113`), so the cost is bundle/hydration or platform, and pinning it needs profiling against a deployed preview.

Acceptance: route-level `loading.tsx` skeletons for the routes that render blank; the first-data measurement is taken on this cycle's own preview during `/ship` and the finding recorded. **Non-goal:** an actual bundle-level perf fix, which would be its own cycle with its own budget.

**T12 — d1: staging seed drift.** `Semester` #2 runs 2026-07-19 → 2026-09-10 while `AcademicYear` 2025/2026 ends 2026-06-19, and both semesters are ACTIVE at once. This is staging **data**, not code, and T2's date-windowed resolution will read it. Fixing it means mutating the staging database.

Acceptance: **not applied in this cycle without an explicit go-ahead.** Corrective SQL is written into Ship Notes for review; nothing runs against staging as part of `/build`.

**Non-goals.** A bundle/hydration perf fix (T11's second half). Any schema change — every task above is behavioural. The QA report's "not tested" list (HOME-scope journal entries, raport PDF download, Category-C soft-void, cross-tenant isolation) stays untested; it needs a fresh QA pass, not a code cycle.

## Tasks

- [x] T1 — m1 + m2: Jakarta-hour greeting, strip the honorific already in `Parent.name`, map `AYAH`/`IBU`/`WALI`
- [x] T2 — m3: teacher "Periode" reads the DB semester; fix `getCurrentPeriodFromDb`'s UTC day + stale docstring
- [x] T3 — m4: journal admin `weekStart` default → `Asia/Jakarta`
- [x] T4 — M1-half: scope the `/admin/raport` class picker to the active year; disambiguate duplicate labels by campus
- [x] T5 — m5: branded Indonesian `app/not-found.tsx`
- [ ] T6 — m6: `--primary-text` token; apply to the checked journal cell and the parent week-grid check
- [ ] T7 — m7: `NumField` optional flag; drop the asterisk on Tinggi/Berat
- [ ] T8 — m8: surface `activity` ("Kegiatan") on the parent Capaian entry row
- [ ] T9 — m11: rewrite the rapor-published banner sentence
- [ ] T10 — m12: coalesce journal taps into one batch POST
- [ ] T11 — m9: `loading.tsx` skeletons for the blank-body routes; measure first-data on the preview
- [ ] T12 — d1: write the corrective staging SQL into Ship Notes; do not execute

## Implementation

### T1 — m1 + m2, parent greeting

| File | Change |
|---|---|
| `lib/hijri.ts` | `timeOfDayGreeting(date, timezone?)` — optional IANA zone resolved through `Intl.DateTimeFormat`. Server callers pass one; client callers keep the browser hour. `en-GB` + `hour12: false` renders midnight as "24", normalised back to 0. |
| `lib/parent-greeting.ts` *(new)* | `parentGreetingName` strips a leading honorific already stored in `Parent.name` (Bapak/Bpk./Ibu/Bu/Tn/Ny/Wali…, punctuation-tolerant), but only when a name remains — "Ibu" alone stays "Ibu". `parentHonorific` maps `AYAH` → "Pak" and everything else → "Bu"; `FATHER` still accepted so the old value is not a regression if it exists anywhere. |
| `app/parent/page.tsx` | Uses both helpers; passes `JAKARTA_TZ` to `timeOfDayGreeting`. |

### T2 — m3, teacher "Periode"

| File | Change |
|---|---|
| `lib/academic-period-db.ts` | Swapped `$queryRaw` for `prisma.semester.findFirst` (the model exists at `schema.prisma:1080`; the docstring claiming otherwise was stale). Day resolved in `Asia/Jakarta` — boundaries are UTC midnight of the *Jakarta* day, so a UTC read is off by one for the seven hours after Jakarta midnight. Docstring now explains why the date window, not `status` alone, is what makes the answer single-valued. |
| `app/teacher/assessments/page.tsx` | `period` reads `getCurrentPeriodFromDb(session.tenantId)` instead of the month bracket. This is the helper's first call site — it was dead code. |

### T3 — m4, journal `weekStart`

| File | Change |
|---|---|
| `app/api/student-journal/admin/classes/route.ts` | Default `weekStart` uses `getTodayInTimezone(JAKARTA_TZ)`, matching the sibling `admin/class-roll-up` route. |

### T4 — M1-half, `/admin/raport` class picker

| File | Change |
|---|---|
| `lib/format.ts` | `disambiguateClassLabels(rows)` — appends the campus only to names that collide, so the common case stays short and a collision with no campus name renders no dangling separator. |
| `app/admin/raport/page.tsx` | Filters to `status === "ACTIVE" && academicYear.status === "ACTIVE"` (the route only applies `academicYearId` when `yearId` is passed, and the page passed none), and renders `disambiguateClassLabels` output. Client-side filter rather than a second round trip for the active year id — the payload already carries `academicYear.status`. |

New tests: `lib/__tests__/parent-greeting.test.ts` (12), `lib/__tests__/academic-period-db.test.ts` (4 — the file had no coverage at all), `lib/__tests__/disambiguate-class-labels.test.ts` (4).

### T5 — m5, root 404

| File | Change |
|---|---|
| `app/not-found.tsx` *(new)* | Branded Indonesian 404 mirroring the three portal `error.tsx` boundaries. Placed at the root so every route inherits it; links to `/`, which already redirects each role to its own home, rather than guessing a portal. |


## Verification

_(filled by /build)_

## Ship Notes

_(filled by /ship)_

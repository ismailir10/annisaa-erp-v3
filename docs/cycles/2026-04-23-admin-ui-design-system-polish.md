# Admin UI — Design System Polish (residual gaps)

## Context

Admin portal polished over five cycles in past two weeks. Fresh audit done two ways: (1) code-level vs `.claude/standards/design-system.html` + `.claude/standards/{ui,patterns,colors,voice}.md`; (2) live UI tour through 14 admin pages on staging (logged in via Google SSO, 2026-04-23). Code audit found 3 token-hygiene gaps; UI tour surfaced 4 additional visual/voice drifts affecting multiple pages. This cycle closes both sets so admin is fully conformant before polish work moves to teacher/parent portals.

Out of scope (explicit non-goals): broad `gap-3/4` sweep, `font-currency` rename, 404/not-found recipe rewrite (minor, low-traffic), `/admin/employees/<code>` runtime error (functional bug, separate cycle), Akademik empty-whitespace layout (lower priority visual polish).

## Spec

Acceptance criteria:

**Code-level (original audit):**
- [ ] **Payroll detail hero stat typography** — `app/admin/payroll/[id]/page.tsx:398-400` — three `text-lg` totals → `text-2xl` (closer to canonical `.stat-value` at 1.75rem per `design-system.html:380`).
- [ ] **Students detail mini-tile color symmetry** — `app/admin/students/[id]/page.tsx:516,524` — `text-destructive` → `text-status-absent`, `text-warning` → `text-status-leave` so all four tiles share the status-token vocabulary.
- [ ] **Form field grid tokens (scoped)** — `app/admin/students/page.tsx`, `app/admin/employees/page.tsx` — `gap-4` → `gap-field` only on grids directly wrapping `<Field>` in create/edit Sheet/Dialog bodies. Non-form `gap-4` untouched.

**UI tour findings:**
- [ ] **Raw ENUM strings in attendance tables** → use `<StatusBadge>`. Verified drift: Karyawan detail Kehadiran tab renders raw `PRESENT` / `LATE` / `ABSENT` / `LEAVE` strings in status column. Replace with `<StatusBadge status={…}>` matching the existing admin pattern. Grep for `{r.status}` / `{status}` in JSX across `app/admin/**` to catch other occurrences.
- [ ] **Single-stat stretched-card pattern** — when a page's StatsCardsRow has only one card, the card stretches to fill the full row with excessive whitespace. Affected pages verified on staging: `app/admin/leave/page.tsx` (Pengajuan Cuti), `app/admin/invoices/page.tsx` (Tagihan), `app/admin/admissions/page.tsx` (Pendaftaran), `app/admin/settings/users/page.tsx` (Pengguna). Also borderline: `app/admin/assessments/page.tsx` (two cards, still sparse). Decision: single-card cases use `cols={4}` so the card keeps its compact reference width instead of stretching, leaving the rest of the row as empty grid cells (matches design-system.html §11 stat-card spec where `.stat { padding: 1.25rem }` width is content-driven). Two-card case (`assessments`) likewise uses `cols={4}`.
- [ ] **Uppercase enum values in filter selects** — verified drift: `ACTIVE` in `app/admin/academic/page.tsx` and `app/admin/student-journal/page.tsx` program-status select; `PENDING` default in `app/admin/leave/page.tsx` request-status select. Replace with localized Title Case ("Aktif" / "Menunggu" / "Semua") per `standards/voice.md`. Scope: select *labels* only; enum *values* passed to API stay uppercase.
- [ ] **`Buat Tagihan` button missing leading `+` icon** — `app/admin/invoices/page.tsx` header action. Other admin "Tambah/Buat" buttons use `<Plus />` prefix. Add for consistency.

**Gates:**
- [ ] `npm run build && npx vitest run` green after each task.
- [ ] End-of-cycle Playwright smoke green (`npx playwright test`) — or pre-existing failures from branch base explicitly documented and carried forward.
- [ ] Visual parity — preview-URL screenshots of each affected page via Chrome MCP after build, attached in Verification section.

Non-goals:
- No DB / Prisma / API changes.
- No broad `gap-3`/`gap-4` sweep (deferred).
- No new tokens added to `globals.css`; all changes use existing tokens.
- No teacher/parent portal edits — scope is admin only.
- No 404/not-found page rewrite.
- No fix for `/admin/employees/<code>` runtime error (separate functional-bug cycle).
- No Akademik-page whitespace/layout rework.

Assumptions:
1. `text-2xl` (1.5rem) acceptable proxy for canonical 1.75rem stat-value. Alt: add `--text-stat` token. Going with `text-2xl` to avoid globals.css ripple.
2. Students/employees mini-tiles (compact 4-col grids inside cards) stay at `text-lg`; only color tokens change.
3. Scope of "form field grid": only `gap-4` grids directly wrapping `<Field>` in Sheet/Dialog. Toolbar/stat-row/section `gap-4` untouched.
4. StatsCardsRow `cols={4}` prop already supports "fewer than 4 children" — if not, minimal wrapper edit is part of the task.
5. `<StatusBadge>` from `components/ui/status-badge.tsx` already handles all four attendance enum values (PRESENT/LATE/ABSENT/LEAVE). If any enum missing, extending it is in scope for the task.
6. Voice-fix scope: only `<SelectItem>` labels and default placeholder text; backend enum values stay untouched.

→ Correct me now or `/build` will proceed.

## Tasks

1. [x] **Payroll detail — hero stat typography to `text-2xl`.**
   - File: `app/admin/payroll/[id]/page.tsx` lines 398-400.
   - Change: `text-lg` → `text-2xl` on the three `font-currency font-bold` numeric totals. Keep `font-currency`, `font-bold`, `mt-1`, existing color classes.
   - Depends on: none.

2. [x] **Students detail — mini-tile color symmetry.**
   - File: `app/admin/students/[id]/page.tsx`.
   - Line 516: `text-destructive` → `text-status-absent`.
   - Line 524: `text-warning` → `text-status-leave`.
   - Depends on: none.

3. [x] **Form field grids — `gap-4` → `gap-field` (scoped).**
   - Files: `app/admin/students/page.tsx`, `app/admin/employees/page.tsx`.
   - Only Field-wrapper `gap-4` grids in create/edit Sheet/Dialog bodies; skip any `gap-4` that is NOT a Field grid.
   - Depends on: none.

4. [x] **Attendance enum strings → `<StatusBadge>`.**
   - Primary file: the Kehadiran tab in `app/admin/employees/[id]/page.tsx` (raw enum rendering confirmed at staging URL `/admin/employees/<id>` → Kehadiran tab). Locate the JSX cell rendering `{r.status}` or equivalent and swap for `<StatusBadge status={r.status} />`.
   - Sweep: grep `app/admin/**` for raw ENUM render patterns (`PRESENT|LATE|ABSENT|LEAVE` as displayed text, or `{status}` inside a `<td>` / status-column cell) — fix any other admin pages using the same anti-pattern.
   - If `StatusBadge` does not cover all four states, extend it minimally to do so (and mirror the palette already in use on other admin pages).
   - Depends on: none.

5. [ ] **StatsCardsRow — single-card non-stretch.**
   - Files: `app/admin/leave/page.tsx`, `app/admin/invoices/page.tsx`, `app/admin/admissions/page.tsx`, `app/admin/settings/users/page.tsx`, `app/admin/assessments/page.tsx`.
   - Change: each page's `<StatsCardsRow cols={N}>` passes `cols={4}` so solo or double cards keep their compact reference width instead of stretching across the row.
   - If `StatsCardsRow` doesn't already render empty grid cells to fill the row, the minimal wrapper fix goes here (not a separate primitive-level task — the one-line prop change should do it if the primitive uses CSS grid with `minmax` columns).
   - Acceptance: screenshot each page pre/post to show the stat card reverts from full-row stretch to compact reference width. No other layout shift.
   - Depends on: none.

6. [ ] **Localize uppercase enum select labels.**
   - Files: `app/admin/academic/page.tsx` + `app/admin/student-journal/page.tsx` (program-status filter: `ACTIVE` / `INACTIVE` / `all` → `Aktif` / `Nonaktif` / `Semua`); `app/admin/leave/page.tsx` (leave-status filter: `PENDING` / `APPROVED` / `REJECTED` → `Menunggu` / `Disetujui` / `Ditolak`). Plus any other admin select that renders ENUM values literally — quick grep for `<SelectItem value="ACTIVE"` / `"PENDING"` etc. inside `app/admin/**`.
   - Scope: label text only. `value=` / API payloads stay uppercase.
   - Depends on: none.

7. [ ] **`Buat Tagihan` button — add `<Plus />` icon prefix.**
   - File: `app/admin/invoices/page.tsx`.
   - Change: wrap button label with leading `<Plus className="mr-2 h-4 w-4" />` matching admin `Tambah` pattern.
   - Depends on: none.

8. [ ] **End-of-cycle gate — build + vitest + Playwright + preview screenshots.**
   - Run `npm run build && npx vitest run && npx playwright test`.
   - Capture Chrome MCP screenshots of each affected page post-change (payroll detail, students detail, employee detail Kehadiran, leave list, invoices list, admissions list, users list, assessments list, academic, student-journal, invoices) and attach to Verification.
   - Depends on: tasks 1–7.

## Implementation

- Subagent plan: all 7 tasks independent but small; inline serial execution with one commit per task per CLAUDE.md between-task gate rule. No parallel subagent dispatch.
- Cross-checked design-system.html §11 Stat Cards (`.stat-value` = 1.75rem) for typography scale; `text-2xl` (1.5rem) is the closest Tailwind token without introducing `--text-stat`.
- Task 1: payroll hero stat typography — `app/admin/payroll/[id]/page.tsx:398-400` — `text-lg` → `text-2xl` on the three StatsCardsRow numeric totals.
- Task 2: students detail mini-tile color symmetry — `app/admin/students/[id]/page.tsx:516,524` — `text-destructive` → `text-status-absent`; `text-warning` → `text-status-leave`. All four attendance summary tiles now share the `text-status-*` vocabulary.
- Task 3: form field grids `gap-4` → `gap-field` — 3 Field-grid wrappers in `app/admin/students/page.tsx` (lines 101, 121, 146), 4 Field-grid wrappers in `app/admin/employees/page.tsx` (lines 472, 476, 480, 511). Token-first hygiene per `ui.md §Spacing`. Both tokens resolve to 1rem → zero visual delta, pure token-audit win.
- Task 4: attendance enum render → StatusBadge — `app/admin/employees/[id]/page.tsx:353` — raw `<span>{r.status}</span>` replaced with `<StatusBadge status={r.status} />`. Sweep confirmed every other admin status render was already on StatusBadge. Container widened `w-16 → w-20` to fit the pill. Existing StatusBadge STATUS_MAP covers all four attendance enums (PRESENT/LATE/ABSENT/LEAVE) with Indonesian labels (Hadir/Terlambat/Alpa/Cuti).

## Verification

- Task 1: gates passed (build + vitest run). Staging baseline screenshot taken pre-change; end-of-cycle smoke will capture post-change.
- Task 2: gates passed (build + vitest run). Cross-checked design-system.html voice on status semantics — absent/leave tokens avoid conflating "attendance absent" with generic "destructive error" per colors.md semantic-token rule.
- Task 3: gates passed (build + vitest run). Both tokens resolve to 1rem per `globals.css:262` → no visual shift expected; token-hygiene only.
- Task 4: gates passed (build + vitest run). Staging baseline confirmed raw `PRESENT / LATE / ABSENT` uppercase strings in admin/employees/[id] Kehadiran tab; post-change renders localized pills.

## Ship Notes

<!-- filled by /ship -->

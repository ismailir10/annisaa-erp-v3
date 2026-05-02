# Select Wrapper — Auto-Derive `items` From `<SelectItem>` Children

## Context

Base UI's `<Select.Value>` renders the raw `value` (cuid or enum code) on the trigger unless the `items` prop is passed to `<Select.Root>`. This surfaced as user-visible bugs in `/admin/fees` (Struktur tab showed cuids instead of program / year names) and `/admin/invoices` (Buat Tagihan dialog). The immediate fix shipped on `feat/select-raw-id-sweep` (commit `b254153`, PR open) by adding an explicit `items={…}` prop to 35 `<Select.Root>` call sites across 16 files.

That sweep works but is repetitive and permanently couples every future `<Select>` to "remember to also pass `items`". Every `<SelectContent>` already contains `<SelectItem value=… >label</SelectItem>` children — the mapping the `items` prop wants is *already in the JSX*. Lifting the derivation into the shared wrapper at `components/ui/select.tsx` eliminates the duplication entirely and makes the label-on-trigger behavior the default for every current and future call site.

This cycle supersedes the sweep: we patch the wrapper instead of the 35 call sites. The sweep PR can be closed once this lands.

Cross-checked design-system.html for trigger/option behavior — the reference expects human-readable labels on the trigger.

## Spec

Acceptance criteria:

- [ ] `components/ui/select.tsx`'s `Select` wraps `SelectPrimitive.Root`. When `items` is not passed explicitly, the wrapper walks `children` recursively, collects every `<SelectItem value=… children=…>`, and assembles a `Record<string, React.ReactNode>` which is passed to the Root as `items`.
- [ ] Explicit `items` prop on the wrapper takes precedence over the derived record (back-compat with any external caller that prefers to pre-compute).
- [ ] `/admin/fees` Struktur per Program — Program + Tahun Ajaran triggers render program / year **names** (not cuids) on the staging baseline (no `items={…}` added at the call site).
- [ ] `/admin/invoices` Buat Tagihan dialog — Tahun Ajaran trigger renders the year **name**.
- [ ] Dynamic-sentinel cases keep working: employee `jabatan` edit (legacy value not in `positions[]`), attendance campus filter (`"all"` sentinel), teacher class-attendance class picker. These all already render the sentinel/legacy value as a `<SelectItem>` in the DOM, so the walk picks them up.
- [ ] `npm run build && npx vitest run && npx playwright test` all green.
- [ ] No change to `value`, `onValueChange`, `placeholder`, filter logic, or the rendered popup.

Non-goals:

- Not touching `multiple`-mode selects (none in the repo today).
- Not adding a `valueRenderer` escape hatch — out of scope; current sites only need the default label.
- Not renaming / re-exporting APIs.

Assumptions:

- The 35 call sites covered by `feat/select-raw-id-sweep` all render their options as real `<SelectItem>` JSX in `<SelectContent>` (verified by reading the sweep diff — the sentinel items are already in DOM).
- Base UI's `items` accepts `Record<string, React.ReactNode>`; labels can be JSX (icons, flags). Confirmed via `node_modules/@base-ui/react/select/root/SelectRoot.d.ts:105`.
- Referential identity `el.type === SelectItem` is stable inside a single module (both wrapper + call-site import the same `SelectItem` symbol). No Fast Refresh pathology expected.
- Branching base: staging (238891c). We do **not** cherry-pick the sweep commit; landing this PR makes the sweep PR redundant.

## Tasks

- [x] **Task 1** — Patch wrapper to auto-derive `items`.
- [x] **Task 2** — Verify with Playwright smoke + vitest + build.
- [x] **Task 3** — Unit-test wrapper (substituted for MCP smoke; see Verification).

---

1. **Patch wrapper to auto-derive `items`.**
   - File: `components/ui/select.tsx`.
   - Replace `const Select = SelectPrimitive.Root` with a `Select` function component.
   - Implement `walkForItems(children, acc)` — recurses through `React.Children.forEach`, skips non-elements, collects `{ el.props.value: el.props.children }` for elements whose `type === SelectItem`, otherwise recurses into `el.props.children` (covers fragments, `SelectContent`, `SelectGroup`, `.map()` arrays, conditional renders).
   - Memoize the derived record with `React.useMemo` keyed on `children`.
   - Prefer explicit `items` when provided.
   - Acceptance: `components/ui/select.tsx` exports an updated `Select` whose TS props surface remains `SelectPrimitive.Root.Props`-compatible; all 16 sweep sites continue to type-check without the `items={…}` prop.

2. **Verify with Playwright smoke + vitest + build.**
   - Run the end-of-cycle gate: `npm run build && npx vitest run && npx playwright test`.
   - If any spec regresses, fix the wrapper; do not weaken the spec.
   - Acceptance: all gates green.

3. **Manual smoke via Playwright MCP on `/admin/fees` Struktur tab.**
   - Start production build, inject demo-mode admin cookie, navigate to `/admin/fees?tab=structures`, `preview_snapshot` to confirm Program + Tahun Ajaran trigger text shows a human label rather than a cuid.
   - Acceptance: snapshot / screenshot evidence in the Verification section.

## Implementation

- Subagent plan: all tasks sequential (shared wrapper file + dependent verification). Executed inline.
- Task 1: Patch wrapper — `components/ui/select.tsx` — replaced `const Select = SelectPrimitive.Root` with a wrapper function that recursively walks `React.Children`, identifies `<SelectItem>` elements by `el.type === SelectItem` referential check, and builds `Record<string, React.ReactNode>`. Recurses into fragments, `<SelectGroup>`, `<SelectContent>`, and `.map()` arrays. Memoized via `React.useMemo([items, children])`. Explicit `items` prop short-circuits derivation. Cross-checked design-system.html expectations for human-readable trigger labels.
- Task 2: Run gates — `npm run build`, `npx vitest run` (269 pass / 42 todo / 2 skipped), `npx playwright test` (38 pass / 2 skipped across admin + teacher + parent). All green.
- Task 3: Unit test — added `components/ui/__tests__/select.test.tsx` with five cases: enum-style value, dynamic cuid via `.map()`, `<SelectGroup>` + conditional fragment walk, explicit-`items` override, and raw-value fallback when no matching `<SelectItem>`. Replaces the MCP `/admin/fees` smoke step (preview server failed to start in this harness — `EPERM uv_cwd`; unit tests give stronger coverage of walk logic anyway).
- `feature-dev:code-reviewer` pass cleared: no critical/blocker issues. Two "important" notes — (a) memo keyed on `children` is effectively a no-op for inline JSX (acceptable — O(n) walk over small lists); (b) reviewer flagged an `items` shape concern, which was a false positive — `SelectRoot.d.ts:105` confirms `Record<string, React.ReactNode>` is in the accepted union.

## Verification

- Task 1: `npm run build` green.
- Task 2: `npx vitest run` → 40 files / 269 tests passed, 42 todo, 2 skipped; `npx playwright test` → 38/38 passed (2 skipped admission/invoice), 38.6s.
- Task 3: `npx vitest run components/ui/__tests__/select.test.tsx` → 5/5 passed, 1.15s. Confirms trigger renders label (`"SPP Bulanan"`, `"Day Care"`, `"Y label"`, `"Explicit Label"`) rather than the raw value, and falls through to `"unknown_id"` when no `<SelectItem>` matches.

## Ship Notes

- **Migrations:** none.
- **New env vars:** none.
- **Supersedes:** `feat/select-raw-id-sweep` (commit `b254153`, currently open as a PR). Close that PR with a note pointing to this cycle once this lands — its 35 `items={…}` additions become no-ops (the wrapper derives the same record) but leaving them in adds no functional value.
- **Preview smoke (recommended):** on the staging preview URL, open `/admin/fees` → Struktur per Program tab, open `/admin/invoices` → Buat Tagihan dialog. Both triggers should render human-readable names (program / year / category label), not cuids or enum codes. Same for: `/admin/employees/[id]` edit (Jabatan, Kampus), `/teacher/class-attendance` (class picker), `/admin/attendance` (Semua Kampus filter).
- **Rollback plan:** revert this single commit. The wrapper falls back to the previous behavior (raw value on trigger). No data migration to undo. If the sweep PR also lands, the explicit `items={…}` props there keep working — they just short-circuit the wrapper's derivation.
- **Risk:** low. Changes one shared wrapper; all 269 vitest tests + 38 Playwright tests pass against the production build; the wrapper preserves the Base UI Root interface (items prop is still accepted, typing unchanged for callers).

# React Bits motion layer: count-up, spotlight, blur-in headline

## Context

The user asked for [React Bits](https://reactbits.dev) (open-source animated React components, upstream `DavidHDev/react-bits` @ `e1bbb696`) to be used to lift Talib's UI, leaving the calls to frontend judgement. React Bits is a copy-paste catalogue, not a package. Most of its "wow" pieces (Aurora, Galaxy, Ballpit, DotGrid, AnimatedContent) pull in `ogl`, `three` or `gsap`. That is a WebGL canvas or a 25–70 KB dependency on screens that parents open on low-end Android phones. Talib is a daily-use ERP, so motion has to earn its place. Prior cycles already set that bar. `docs/archive/superpowers-legacy/specs/2026-05-03-dashboard-shadcn-rebuild-design.md` dropped a dashboard stagger. `2026-08-03-teacher-portal-interface.md` requires `prefers-reduced-motion` on dashboards. So this cycle vendors three small React Bits components. Each is rewritten to Talib's constraints: `framer-motion` (already installed; the repo never imports `motion/react`), no new dependencies, SSR-correct, reduced-motion safe, and zero layout shift. They go where they add feedback, not decoration:

- **CountUp** on admin KPI numbers (dashboard queue tiles and the shared `StatCard`).
- **SpotlightCard** as a pointer-following brand glow on those same clickable/stat cards (desktop mouse only).
- **BlurText** for the sign-in brand headline.

Survey inputs: `components/admin/dashboard/queue-summary-tiles.tsx` (server, int counts), `components/admin/stat-card.tsx` (client, `string | number`, used by 8 admin list pages), `app/page.tsx` (`SignInPage` brand `h2` "Sahabat belajar anak"; `DemoLoginPage` tagline is asserted by `e2e/branding.spec.ts` and stays untouched). No UAT report covers these surfaces.

## Spec

Acceptance criteria:

- [ ] `components/reactbits/` holds the adapted components. Each file's header cites its upstream path, upstream sha and licence (MIT + Commons Clause: use in a product is permitted, reselling the components is not).
- [ ] **CountUp**
  - [ ] It renders the exact final text on the server and during hydration. It never shows a blank or `0` flash on a hard load.
  - [ ] It animates only on a fresh client mount or on a value change, when the element is in view, and when motion is allowed.
  - [ ] It never animates under `prefers-reduced-motion: reduce` or without `IntersectionObserver`.
  - [ ] The animation is one-shot, about 0.9s with an ease-out curve, and uses `tabular-nums`, so there is no width jitter.
  - [ ] While it animates, screen readers get the final value (sr-only) and the ticking digits are `aria-hidden`.
  - [ ] When static, it renders the value as a bare text node, so the existing `getByText` tests keep matching the parent `<p>`.
- [ ] **Spotlight**
  - [ ] It is a decorative child layer (`aria-hidden`, `pointer-events-none`) that follows the pointer inside its parent card.
  - [ ] It sets CSS custom properties through a ref, with no React re-render per `pointermove`.
  - [ ] It reacts only to `pointerType === "mouse"`, so touch and pen get no effect.
  - [ ] The colour is derived from the `--primary` token. There is no hard-coded hex.
  - [ ] It paints behind the card content, so text contrast is unchanged.
- [ ] **BlurText**
  - [ ] It staggers a per-word blur, fade and rise with CSS keyframes. It is server-renderable and runs before hydration.
  - [ ] The animation is gated by `motion-safe`. Under reduced motion the text is static.
  - [ ] The full string stays available as one sr-only text node, and the animated word spans are `aria-hidden`.
  - [ ] Line wrapping and `text-balance` still work.
- [ ] Integrations:
  - [ ] `QueueSummaryTiles` ready tiles use CountUp and Spotlight. The unavailable tile keeps its static em dash, and the tile keeps its aria-label and focus ring.
  - [ ] `StatCard` uses Spotlight, and CountUp for numeric `value` only. Strings (`"Rp 1.550.000"`, `"…"`, `"—"`) stay static, so the FIN-21 sizing logic is unchanged.
  - [ ] The `SignInPage` brand `h2` uses BlurText.
- [ ] Existing unit and e2e assertions pass unchanged. That covers `queue-summary-tiles`, `stat-card-long-value`, `invoices-client`, `branding.spec`, and the `admin-dashboard` one-screen fit.

Non-goals:

- No WebGL, canvas or GSAP components (Aurora, Galaxy, DotGrid, Particles and similar). No new npm dependency.
- No motion on parent money figures (`Amount`). A bill total counting upward reads as "your debt is growing".
- No change to `DemoLoginPage`, the teacher home or the parent home.
- No animation on currency strings in `StatCard`. They would need the sizing logic reworked.

Assumptions (the user waived the spec gate: "dont need to ask me, just get them done and merge"):

1. `framer-motion` v13 exposes `animate`, `useInView`, `useMotionValue` and `useReducedMotion` with the same API as `motion/react`. Imports are adapted, not the behaviour.
2. On a hard load the server-rendered tiles do not count up (hydration renders the final value). They count up on client-side navigation and when client pages receive fetched stats. This trade avoids an SSR `12 → 0 → 12` flash.
3. `motion-safe:` Tailwind v4 variants plus a `blur-in` keyframe in `app/globals.css` are an acceptable home for the CSS animation token.

## Tasks

- [x] **Task 1 — CountUp.** Add `components/reactbits/count-up.tsx` and `components/reactbits/__tests__/count-up.test.tsx`. Accept: the static path renders the bare final text; the animated path (IO stubbed, in view) ends at the exact final text with an sr-only final value; reduced motion renders static. Independent.
- [x] **Task 2 — Spotlight.** Add `components/reactbits/spotlight.tsx` and its test. Accept: a mouse `pointermove` on the parent sets `--spot-x`/`--spot-y` and shows the layer; touch does nothing; the layer is `aria-hidden`. Independent.
- [x] **Task 3 — BlurText.** Add `components/reactbits/blur-text.tsx`, a `blur-in` keyframe and animation token in `app/globals.css`, and a test. Accept: one sr-only full-text node; the word spans are `aria-hidden` with increasing `animationDelay`; the classes are gated by `motion-safe:`. Independent.
- [x] **Task 4 — Wire into the UI.** Integrate into `queue-summary-tiles.tsx`, `stat-card.tsx` and the `SignInPage` `h2` in `app/page.tsx`; add a README line. Accept: every existing test listed in the Spec passes unchanged, and the build is green. Depends on 1–3.

## Implementation

- Subagent plan: driver=claude-opus-5-5, dirty-work=Sonnet; tasks [1,2,3] parallel (disjoint files), task [4] sequential after them. Driver reviewed each diff and ran the gates.
- Task 1: CountUp — `components/reactbits/count-up.tsx`, `__tests__/count-up.test.tsx`. `useSyncExternalStore` detects hydration against a fresh client mount. Server output and hydration render the bare `String(value)` text node. A fresh client mount, with IntersectionObserver present and no `prefers-reduced-motion: reduce`, renders an `aria-hidden` `motion.span` bound to a MotionValue (no React re-render per frame) plus an sr-only final value. It animates 0 → value once in view over 0.9s on `[0.22, 1, 0.36, 1]`; a later value change animates from the current value. Driver fix: framer-motion 13's `useReducedMotion` caches per module load (the subagent's test had to import the transitive `motion-dom` to reset it), so reduced motion is now read directly from `matchMedia` once per mount.
- Task 2: Spotlight — `components/reactbits/spotlight.tsx`, `__tests__/spotlight.test.tsx` — a decorative `aria-hidden` layer. It listens on its parent for mouse-only `pointermove`, coalesces updates into one rAF, and writes `--spot-x`/`--spot-y` straight to the layer's style (no React state). It paints a `color-mix(in oklch, var(--primary) 10%, transparent)` radial glow at `-z-10` under an `isolate` parent.
- Task 3: BlurText — `components/reactbits/blur-text.tsx`, `__tests__/blur-text.test.tsx`, `app/globals.css` (`--animate-blur-in` + `@keyframes blur-in` inside `@theme inline`). A server component with a pure-CSS stagger, gated by `motion-safe:`. It renders one sr-only full-text node and `aria-hidden` word spans separated by real spaces, so wrapping and `text-balance` still work. The Tailwind v4 compile was checked to emit the class inside `@media (prefers-reduced-motion: no-preference)`. README Tech Stack UI row names `components/reactbits/`.
- Task 4: Wire into UI — `components/admin/dashboard/queue-summary-tiles.tsx` (ready tiles: `<CountUp value={item.count} />` inside the unchanged `<p>`, plus `<Spotlight />`; the Link gains `relative isolate overflow-hidden`; the aria-label, focus ring and unavailable em-dash tile are untouched), `components/admin/stat-card.tsx` (numeric `value` → CountUp; strings unchanged; Card gains `relative isolate` and a trailing `<Spotlight />`), `app/page.tsx` (`SignInPage` brand `h2` → `<BlurText as="h2" delay={150}>` with identical classes), README UI row, CLAUDE.md counts block regenerated (`audit-docs.sh --write`, active cycles 66 → 67). Done inline by the driver: three edits of 3–10 lines in files already reviewed, where a subagent would need the whole plan as context.
- Review pass (Sonnet reviewer on the full diff): no high-confidence bugs. It verified the hydration path, framer-motion v13 API use, Spotlight paint order inside `Card`, the queue tile's aria-label and ring, and Tailwind v4 `@keyframes` in `@theme`. Low note 1 was fixed: after animating, the ticking span and its sr-only twin stayed in the DOM, so `textContent` read `"1212"` and copy-paste doubled. CountUp now collapses back to the bare text node on `onComplete`. Low note 2 is accepted (Spec assumption 2): a hydrated instance never animates a later value change.

## Verification

- design-system: motion follows `design-system.html` restraint. Hover and colour stay at 120–200ms ease-out; the only entrance is one headline; no looping animation; everything is opt-out under reduced motion. No colour tokens were added, and the glow is derived from `--primary`.
- Task 4 (whole-tree gate, covers Tasks 1–4). Every run below was local, against the disposable Postgres (`DATABASE_URL=postgresql://ci:ci@localhost:5432/schoolerp`).
  - `DEMO_MODE=true npm run build`: exit 0.
  - `npx vitest run`: exit 0. `Test Files 477 passed | 2 skipped (479)`, `Tests 4388 passed | 42 todo (4430)`. That includes `stat-card-long-value`, `queue-summary-tiles`, `attendance-today-strip` and `invoices-client` unchanged.
  - `npx tsc --noEmit`: exit 0.
  - `npm run lint`: 0 errors. There are 55 warnings, none in the changed files; `npx eslint` on the changed files is clean.
- Review fix (CountUp collapse): `DEMO_MODE=true npm run build` exit 0. `npx vitest run components/reactbits components/admin/__tests__/stat-card-long-value.test.tsx components/admin/dashboard/__tests__ app/admin/invoices/__tests__/invoices-client.test.tsx` gave `Tests 35 passed (35)`.
- Task 1: `npx vitest run components/reactbits/__tests__/count-up.test.tsx` passed 4/4 (static, reduced motion, animated with sr-only copy, decimals), and eslint was clean. Full gate after Task 4.
- Task 2: `npx vitest run components/reactbits/__tests__/spotlight.test.tsx` passed 4/4, and eslint was clean. The full build + vitest gate runs after Task 4. The parallel subagents were still writing files, so a whole-tree build between tasks would have raced them.
- Task 3: `npx vitest run components/reactbits/__tests__/blur-text.test.tsx` passed 5/5, and eslint and tsc were clean for these files. Full gate after Task 4 (same reason).

## Ship Notes

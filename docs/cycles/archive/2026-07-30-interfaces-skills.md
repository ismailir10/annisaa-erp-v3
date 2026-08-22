# Vendor the `interfaces` skill collection into the frontend standard

## Context

`.claude/standards/*` encodes **Talib-specific** frontend rules — brand tokens, Shadcn-FIRST, page recipes, the three personas, Indonesian copy with the Islamic courtesy layer. It deliberately says nothing about general interface craft: focus-ring behaviour, focus traps, motion easing and duration, OKLCH gamut clamping, `text-wrap` and widow handling, hit-area minimums, `prefers-reduced-motion`. Every cycle that touched a Dialog or a table cell had to re-derive those from scratch, and the UI audits kept re-finding the same class of defect.

[`jakubkrehel/skills`](https://github.com/jakubkrehel/skills) (the `interfaces` collection, MIT) is seven markdown skills covering exactly that gap — `better-ui`, `better-typography`, `better-colors`, `better-accessibility`, `better-layout`, `better-writing`, plus a `better-interface` orchestrator. No scripts, no network calls, no executable content: pure guidance, safe to read into a build loop.

**Why vendor rather than install.** Upstream ships a Claude Code plugin (`/plugin install`) and a `npx skills add` CLI. Both are harness-local. CLAUDE.md § Parallel harmony requires **one canonical skill set** across Claude, Codex, and opencode — a per-harness install would hand three harnesses three different copies (or none, for opencode). Checking the skills into `.claude/skills/` is the only shape that satisfies that invariant.

## Spec

- Seven `better-*` skills live under `.claude/skills/`, checked in, byte-identical to upstream sha `a673333`.
- Provenance is recorded: upstream URL, license, sha, re-vendor procedure, and a "never hand-edit" rule.
- CLAUDE.md documents what each skill owns and the exact frontend diff that loads it.
- **Project standard wins on conflict.** The skills are craft defaults for where `.claude/standards/*` is *silent* — never an override. Stated explicitly in both CLAUDE.md and the `/build` dispatcher, with concrete examples (Shadcn-FIRST beats a hand-rolled component; brand tokens beat a generated OKLCH palette; `voice.md` beats English microcopy examples).
- `/build` Step 1 loads the union of matching `.claude/standards/*` **and** matching `better-*` skills per task.
- Codex sees all seven (`.agents/skills` symlinks), not just the five workflow skills.
- `/audit-docs` guards the wiring so a bad re-vendor fails loudly instead of silently no-opping.

**Non-goals:** no frontend code changes, no new `.claude/standards/*` file, no edits to upstream skill content, no `better-interface` invocation this cycle.

## Tasks

- [x] 1. Vet upstream (no scripts / network / injected instructions), then vendor `skills/better-*` → `.claude/skills/`.
- [x] 2. Write `.claude/skills/VENDORED.md` — provenance, license, sha, re-vendor steps, no-hand-edit rule.
- [x] 3. CLAUDE.md § Standards — add the Interface-craft skills subsection: per-skill dispatch table + precedence rule.
- [x] 4. `/build` SKILL.md Step 1 — add the frontend dispatch table + conflict rule next to the existing standards dispatcher.
- [x] 5. `link-agent-skills.sh` — extend to link the seven interface skills for Codex.
- [x] 6. `/audit-docs` — add Check 5b (skill exists + is listed in the linker); confirm Check 5 does not false-fail on the new table.

## Implementation

Single-context cycle, no subagent fan-out: six mechanical edits with one shared invariant (the precedence rule), where fan-out would cost more than it saves. Recorded per CLAUDE.md § Mandatory subagent fan-out's stated exception.

| Task | Files |
|---|---|
| 1 | `.claude/skills/better-{accessibility,colors,interface,layout,typography,ui,writing}/**` — 37 files, verbatim upstream |
| 2 | `.claude/skills/VENDORED.md` (new) |
| 3 | `CLAUDE.md` § Standards → new `### Interface-craft skills (vendored)` |
| 4 | `.claude/skills/build/SKILL.md` § The task loop → Step 1 |
| 5 | `scripts/link-agent-skills.sh` |
| 6 | `.claude/skills/audit-docs/SKILL.md` § Check 5b |

Notes:

- Skill names kept as upstream (`better-*`, unprefixed). The six domain skills cross-reference each other by name in their own bodies ("covered by the `better-colors` skill"); renaming would break those pointers.
- `agents/openai.yaml` kept inside each skill dir so a re-vendor stays a clean directory replace.
- The new CLAUDE.md table header is `| Skill | Covers | Load on |` — deliberately *not* `| File | Covers | Loaded when |`, so `/audit-docs` Check 5 does not try to resolve `better-ui` as a file under `.claude/standards/`.

## Verification

- Upstream vetted before copy: `grep -rniE 'curl |wget |http://|eval\(|child_process|subprocess|\.sh\b|npm install|npx '` over `skills/` → zero hits. Pure markdown, MIT, no instructions directed at the agent.
- `bash scripts/link-agent-skills.sh` → `linked 12 skill(s)`; `ls -l .agents/skills/` shows 5 workflow + 7 interface symlinks, all resolving.
- `/audit-docs` Check 5b executed against the worktree: 7 skills checked, zero fails (each has `SKILL.md`, each is named in `link-agent-skills.sh`).
- `/audit-docs` Check 5 re-run to prove no bleed from the adjacent new table: 10 standards files, all `ok`.
- `npm run build` — green.
- `npx vitest run` — green.
- **Playwright: skipped.** Pure docs + skills cycle, zero runtime code touched (`app/**`, `components/**`, `lib/**`, `prisma/**` untouched). Permitted by CLAUDE.md § Testing gates.
- **Preview-verify: skipped.** Same reason — nothing in this diff is observable in a Vercel preview.
- Design-system cross-check: the precedence rule in CLAUDE.md and in `/build` Step 1 names `design-system.html` + `.claude/standards/*` as the winning authority over any vendored `better-*` principle, so the canonical visual reference stays the tie-breaker for frontend work.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none.
- **Runtime impact:** none — no code in the diff reaches a request path. Effect is confined to how AI sessions load context during `/build`.
- **Harness rollout:** Claude picks the skills up from `.claude/skills/` automatically. Codex needs `bash scripts/link-agent-skills.sh` — already run by `install-hooks.sh` at setup and by `SessionStart`, so existing worktrees self-heal on their next session start. opencode reads `AGENTS.md` → `CLAUDE.md` and gets the dispatch table with no extra step.
- **Rollback:** `git revert` the commit, then `bash scripts/link-agent-skills.sh` to drop the stale `.agents/skills/better-*` symlinks (`.agents` is gitignored, so a revert alone leaves them dangling — harmless, but the re-run is clean).
- **Upstream drift:** vendored at sha `a673333` (2026-07-29). No auto-update. Re-vendor procedure in `.claude/skills/VENDORED.md`; `/audit-docs` Check 5b fails loudly if a re-vendor renames or drops a skill without updating the wiring.

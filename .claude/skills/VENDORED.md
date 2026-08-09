# Vendored skills

Skills in this directory that come from an upstream repo, checked in rather than
installed per-harness. Reason: `CLAUDE.md` § Parallel harmony requires **one
canonical skill set** — a `/plugin install` or `npx skills add` is harness-local
and would give Claude, Codex, and opencode three different copies (or none).

**Never hand-edit a vendored skill.** Fix it upstream, or re-vendor and record
the new sha below. Local deviations belong in `.claude/standards/*` instead,
which take precedence over vendored guidance on conflict.

## `interfaces` — `better-*` (7 skills)

| | |
|---|---|
| Upstream | https://github.com/jakubkrehel/skills |
| Homepage | https://interfaces.dev/ |
| License | MIT — © 2026 Jakub Krehel |
| Vendored sha | `a67333399dabbc71d7778962cb9c4fb9b86a00d0` (2026-07-29) |
| Vendored on | 2026-07-30 |
| Paths | `better-accessibility/`, `better-colors/`, `better-interface/`, `better-layout/`, `better-typography/`, `better-ui/`, `better-writing/` |

Six domain skills auto-trigger from their `description` frontmatter;
`better-interface` is the user-invoked orchestrator (`/better-interface [quick|full] <area>`).
Each skill dir also carries an `agents/openai.yaml` — upstream's Codex/OpenAI
manifest, kept so a re-vendor is a clean directory replace.

Precedence, dispatch table, and the `/build` load rule live in **CLAUDE.md
§ Standards → Interface-craft skills**. Codex symlinks are created by
`scripts/link-agent-skills.sh`.

### Re-vendor

```bash
git clone --depth 1 https://github.com/jakubkrehel/skills.git /tmp/jk-skills
rm -rf .claude/skills/better-*
cp -R /tmp/jk-skills/skills/better-* .claude/skills/
git -C /tmp/jk-skills rev-parse HEAD   # update the sha above
bash scripts/link-agent-skills.sh
```

Diff the result before committing — an upstream rename or a new `better-*` skill
needs the CLAUDE.md dispatch table and `link-agent-skills.sh` updated too.

# Color Standard + Brand Tokens

> Loaded on demand by `/build` when staged paths match `app/globals.css`, `tailwind.config.*`, className edits touching `bg-status-*` / `text-status-*`, or files containing arbitrary-color classNames (`text-[#…]`, `bg-[#…]`, `border-[#…]`).

## Color Standard

**Never use hardcoded hex colors.** Use CSS variables defined in `globals.css`:

| Need | Use | NEVER |
|------|-----|-------|
| Success/present | `text-status-present`, `bg-status-present` | `text-[#00B37E]` |
| Warning/late | `text-status-late`, `text-warning` | `text-[#FF8C00]` |
| Error/absent | `text-destructive`, `text-status-absent` | `text-[#FF3B3B]` |
| Leave/info | `text-status-leave`, `text-info` | `text-[#0EA5E9]` |
| Status text (badges) | `text-status-present-text` | `text-[#00875A]` |
| Status backgrounds | `bg-status-present-subtle` | `bg-[#E6F9F1]` |

## Celebration tokens

Distinct from per-row PAID green. Use for "all clear" states — outstanding tagihan zero, full attendance week, full assessment-rubric pass. Implies emotional warmth, not just a status flag.

| Need | Use | NEVER |
|------|-----|-------|
| Celebration background | `bg-celebration-gold-subtle` | `style={{ background: "var(--celebration-gold-subtle)" }}` |
| Celebration accent border | `border-celebration-gold` | inline style |
| Celebration text | `text-celebration-gold-text` | inline style |

Tailwind aliases configured in `app/globals.css` lines 89-91. Tokens defined lines 214-216. Use className utilities only — inline `style={{}}` references are an anti-pattern.

## Brand

| Token | Value |
|-------|-------|
| Primary | `#5DB4B8` (teal) |
| Sidebar | `#1A2E2F` (dark teal) |
| Success | `#00B37E` |
| Warning | `#FF8C00` |
| Error | `#FF3B3B` |
| Celebration gold | `#D4A017` |

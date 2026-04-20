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

## Brand

| Token | Value |
|-------|-------|
| Primary | `#5DB4B8` (teal) |
| Sidebar | `#1A2E2F` (dark teal) |
| Success | `#00B37E` |
| Warning | `#FF8C00` |
| Error | `#FF3B3B` |

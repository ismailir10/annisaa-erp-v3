/**
 * Canonical brand hex tokens for @react-pdf/renderer surfaces.
 *
 * @react-pdf/renderer renders server-side with no DOM / CSS-var access, so hex
 * literals are unavoidable. This module is the single source so the three PDF
 * renderers (invoice-receipt, salary-slip, report-card) never drift from the
 * brand table in `.claude/standards/colors.md` + `design-system.html` §Brand.
 *
 * Keep names aligned to the CSS token they mirror (minus the `--` prefix) so a
 * future grep `--primary` ↔ `TEAL` is obvious.
 */
export const TEAL = "#5DB4B8"; // --primary (brand teal)
export const DARK = "#1A2E2F"; // --sidebar (dark teal) — headers, footers
export const MUTED_FOREGROUND = "#6B7280"; // muted body text
export const BORDER = "#D1D5DB"; // rule / divider
export const LIGHT_BG = "#F3F4F6"; // zebra striping / subtle panel fill

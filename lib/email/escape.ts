/**
 * HTML-escape user-controlled strings before interpolating into email templates.
 *
 * Email HTML is rendered by every recipient's mail client — any unescaped
 * `<script>`, `<img onerror>`, or stray `<` from user-supplied DB fields
 * (employee name, period label, free-text notes) would either render as
 * markup or be silently stripped, both wrong.
 *
 * Returns "" for null/undefined so callers can interpolate optional fields
 * without nullish guards. Numeric / pre-formatted (date, currency) fields
 * do NOT need escaping — pass them through directly.
 */
export function escapeHtml(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

import { StatusBadge } from "@/components/ui/status-badge";

/**
 * Enrollment status chip + metadata.
 *
 * Extracted from `page.tsx` (a Next 16 page module) so the page file only
 * exports the page default — non-page exports from `page.tsx` break
 * `next build --webpack` (latent bug from #365). Sibling module keeps the
 * public shape stable for `../[id]/page.tsx` + the roster column.
 *
 * Palette routed through status tokens (was raw `bg-sky/amber/emerald/red-*`)
 * per .claude/standards/colors.md.
 */
export function StatusChip({ status, studentId }: { status: string; studentId?: string | null }) {
  return <StatusBadge status={studentId ? "REGISTERED" : status} />;
}

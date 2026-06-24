import { Badge } from "@/components/ui/badge";

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
export const STATUS_META: Record<string, { label: string; className: string }> = {
  INVITED: { label: "Diundang", className: "bg-muted text-muted-foreground" },
  SUBMITTED: { label: "Terkirim", className: "bg-status-leave-subtle text-status-leave-text" },
  UNDER_REVIEW: { label: "Ditinjau", className: "bg-status-late-subtle text-status-late-text" },
  ACCEPTED: { label: "Diterima", className: "bg-status-present-subtle text-status-present-text" },
  REJECTED: { label: "Ditolak", className: "bg-status-absent-subtle text-status-absent-text" },
};

export function StatusChip({ status, studentId }: { status: string; studentId?: string | null }) {
  if (studentId) return <Badge className="bg-primary/10 text-primary">Terdaftar</Badge>;
  const m = STATUS_META[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <Badge className={m.className}>{m.label}</Badge>;
}

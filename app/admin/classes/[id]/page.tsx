import { assertPermission } from "@/lib/auth-guards";
import { hasPermission } from "@/lib/permissions";
import { ClassDetailClient } from "./client";

// Admin Kelas detail — the consolidated per-class hub that mirrors the old
// /admin/class-sections/[id] surface and folds in roster + teaching
// assignments + ringkasan health metrics in one flat scroll. ClassTrack stays
// in the schema as plumbing; the UI vocabulary is "Kelas".
//
// Server-side `academic.view` gate; write actions (`academic.edit`) are
// resolved here and passed as `canWrite` so read-only personas see the
// content but not the mutate buttons. Body is client-side because every
// section is interactive (dialogs, calendar, swap drawer).
//
// Cross-checked against .claude/standards/design-system.html §Page header +
// §StatCard + §DataTable + §Dialog + §Calendar grid + §Sheet (frontend gate).
export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await assertPermission("academic.view");
  const { id } = await params;
  return (
    <ClassDetailClient
      classId={id}
      canWrite={hasPermission(session, "academic.edit")}
    />
  );
}

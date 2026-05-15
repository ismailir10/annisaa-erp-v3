import { assertPermission } from "@/lib/auth-guards";
import { hasPermission } from "@/lib/permissions";
import { ClassSectionDetailClient } from "./client";

/**
 * Admin ClassSection detail — session calendar + teacher-swap drawer
 * (academic-hierarchy-refactor C6).
 *
 * Server-side `academic.view` gate (mirrors the ClassTrack page from Task 3);
 * write actions (`academic.edit`) are resolved here and passed as `canWrite`
 * so read-only personas see the calendar but not the swap UI. The calendar +
 * Sheet are client-side so month nav and the swap drawer don't round-trip.
 *
 * Visual cross-checked against .claude/standards/design-system.html §Page
 * header + §Calendar grid + §Sheet (overlay drawer) + §Select/Textarea before
 * edit (frontend gate).
 */
export default async function ClassSectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await assertPermission("academic.view");
  const { id } = await params;
  return (
    <ClassSectionDetailClient
      classSectionId={id}
      canWrite={hasPermission(session, "academic.edit")}
    />
  );
}

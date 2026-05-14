import { assertPermission } from "@/lib/auth-guards";
import { hasPermission } from "@/lib/permissions";
import { ClassTracksClient } from "./client";

/**
 * Admin ClassTrack list — stable multi-year class identity under
 * Campus > Program (academic-hierarchy-refactor C3).
 *
 * Server-side `academic.view` gate; write actions (`academic.edit`) are
 * resolved here and passed as `canWrite` so the client can hide
 * create/edit/deactivate affordances for read-only personas. UI is fully
 * client-side so toolbar filters and the create dialog don't round-trip
 * on every interaction.
 *
 * Visual cross-checked against .claude/standards/design-system.html §Page
 * header + §DataTable + §Dialog before edit (frontend gate).
 */
export default async function ClassTracksPage() {
  const session = await assertPermission("academic.view");
  return (
    <ClassTracksClient canWrite={hasPermission(session, "academic.edit")} />
  );
}

/**
 * Sibling derivation for the student detail page.
 *
 * A student shares a brother or sister exactly when they share a guardian, so
 * this reads the guardian links already loaded with the student rather than
 * issuing a second query. Deliberately not KK-based: `Student.kkNumber` is
 * sparsely populated, and a household key that is null for most rows would
 * hide real siblings.
 */

export type SiblingStudent = { id: string; name: string; status: string };

export type GuardianWithParentLinks = {
  status: string;
  parent: { guardians?: { student: SiblingStudent }[] };
};

/**
 * Other students reachable through this student's ACTIVE guardian links.
 *
 * Deduped by student id — two parents shared with the same sibling (the usual
 * case: both mother and father) must yield one chip, not two. The student
 * themself is always excluded; they appear in every one of their own parents'
 * link lists.
 */
export function deriveSiblings(
  guardians: GuardianWithParentLinks[],
  selfId: string,
): SiblingStudent[] {
  const seen = new Map<string, SiblingStudent>();
  for (const g of guardians) {
    if (g.status === "INACTIVE") continue;
    for (const link of g.parent.guardians ?? []) {
      if (link.student.id === selfId) continue;
      if (!seen.has(link.student.id)) seen.set(link.student.id, link.student);
    }
  }
  return [...seen.values()];
}

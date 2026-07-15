/**
 * Pure planning functions for the roster import
 * (cycle 2026-07-15-roster-import-2526, Task T2).
 *
 * Given parsed xlsx records and a snapshot of existing prod state, works
 * out what needs to be created, what's already imported (idempotency,
 * keyed on `Student.nis`), and which `Parent` rows should be reused
 * instead of duplicated (sibling-family dedup).
 *
 * No DB access here — `run.ts` builds the `ExistingSnapshot` from a real
 * query and calls `planImport` with the result.
 */
import type { RosterRecord } from "./parse-xlsx";

export interface ExistingStudentRef {
  id: string;
  name: string;
}

/**
 * An existing (father, mother) name pair already linked as guardians of
 * the same student in prod — i.e. a known family. This is the ONLY unit
 * `planImport` reuses an existing `Parent` row against. A lone name match
 * (e.g. one "Ahmad" matching an unrelated family's "Ahmad") is never
 * enough on its own — a common first/last name shared across two
 * unrelated families must not cross-wire a child onto the wrong parents.
 * Matches the cycle doc's stated approach (Assumption #2): "matched by
 * (father name + mother name) exact match".
 */
export interface ExistingFamily {
  ayahName: string;
  ibuName: string;
  ayahParentId: string;
  ibuParentId: string;
}

export interface ExistingSnapshot {
  /** Keyed by trimmed `Student.nis` exactly as stored. */
  studentsByNis: Map<string, ExistingStudentRef>;
  /** Keyed by `familyPairKey(ayahName, ibuName)`. */
  familiesByPairKey: Map<string, ExistingFamily>;
}

export type ParentRole = "AYAH" | "IBU";

export interface SkippedStudent {
  record: RosterRecord;
  existingStudentId: string;
  nis: string;
}

export interface ReuseParentPlan {
  record: RosterRecord;
  role: ParentRole;
  name: string;
  /**
   * "existing_prod": `parentId` is a real `Parent.id` already in the DB
   *   — this is the case that matters for the 3 known sibling families.
   *   Only reachable via a full (ayah, ibu) pair match against
   *   `existing.familiesByPairKey` — never from a lone name.
   * "pending_in_run": `parentId` is a placeholder key (not a DB id) for
   *   a parent pair this same `planImport` call is about to create for
   *   an earlier sibling record in the same file — `run.ts` resolves the
   *   placeholder to the real id right after creating it, before this
   *   guardian link is written. Also only reachable via a full pair
   *   match within the batch.
   */
  source: "existing_prod" | "pending_in_run";
  parentId: string;
}

export interface CreateParentPlan {
  record: RosterRecord;
  role: ParentRole;
  name: string;
  /** Matches the `parentId` placeholder used by any `ReuseParentPlan`
   *  with `source: "pending_in_run"` that reuses this create. */
  pendingKey: string;
}

export interface ImportPlan {
  toCreateStudents: RosterRecord[];
  toSkipStudents: SkippedStudent[];
  toReuseParents: ReuseParentPlan[];
  toCreateParents: CreateParentPlan[];
}

/** Case/whitespace-insensitive name key. */
export function normalizeParentName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable key for an (ayah, ibu) name pair — order-sensitive (ayah first). */
export function familyPairKey(ayahName: string, ibuName: string): string {
  return `${normalizeParentName(ayahName)}|${normalizeParentName(ibuName)}`;
}

/** Trims a NIS value; blank/"-" placeholders normalise to null (unset). */
export function normalizeNis(nis: string | null | undefined): string | null {
  const t = nis?.trim();
  if (!t || t === "-") return null;
  return t;
}

/**
 * Builds the create/skip/reuse plan for a batch of parsed roster records.
 *
 * Idempotency: a record whose NIS already exists in `existing.studentsByNis`
 * is routed to `toSkipStudents` and nothing else is planned for it (no
 * guardian/parent planning either) — re-running against the same or a
 * future year's file produces zero new inserts for that student.
 *
 * Sibling dedup: reuse of an existing `Parent` pair only happens when
 * BOTH the ayah name AND the ibu name on the source record match an
 * existing family's (ayah, ibu) pair together — never from one name in
 * isolation. A record that has only one parent name present (the other
 * blank) can never be pair-verified, so it always gets a brand-new
 * `Parent` row rather than risking a false-positive single-name match.
 * The same pairing rule applies to within-batch siblings (two records in
 * the same file sharing an identical ayah+ibu pair not yet in prod) —
 * they reuse one single planned create instead of creating a duplicate.
 */
export function planImport(
  records: RosterRecord[],
  existing: ExistingSnapshot,
): ImportPlan {
  const toCreateStudents: RosterRecord[] = [];
  const toSkipStudents: SkippedStudent[] = [];
  const toReuseParents: ReuseParentPlan[] = [];
  const toCreateParents: CreateParentPlan[] = [];

  // Within-batch pending families, keyed the same way as
  // existing.familiesByPairKey, plus a fallback registry for
  // single-parent-only records (never reused across records — see below).
  const pendingFamilyByPairKey = new Map<
    string,
    { ayahPendingKey: string; ibuPendingKey: string }
  >();

  for (const record of records) {
    const nis = normalizeNis(record.nis);
    if (nis) {
      const existingStudent = existing.studentsByNis.get(nis);
      if (existingStudent) {
        toSkipStudents.push({ record, existingStudentId: existingStudent.id, nis });
        continue;
      }
    }

    toCreateStudents.push(record);

    const ayahName = record.ayah.nama?.trim() || null;
    const ibuName = record.ibu.nama?.trim() || null;

    if (ayahName && ibuName) {
      const pairKey = familyPairKey(ayahName, ibuName);

      const existingFamily = existing.familiesByPairKey.get(pairKey);
      if (existingFamily) {
        toReuseParents.push(
          {
            record,
            role: "AYAH",
            name: ayahName,
            source: "existing_prod",
            parentId: existingFamily.ayahParentId,
          },
          {
            record,
            role: "IBU",
            name: ibuName,
            source: "existing_prod",
            parentId: existingFamily.ibuParentId,
          },
        );
        continue;
      }

      const pendingFamily = pendingFamilyByPairKey.get(pairKey);
      if (pendingFamily) {
        toReuseParents.push(
          {
            record,
            role: "AYAH",
            name: ayahName,
            source: "pending_in_run",
            parentId: pendingFamily.ayahPendingKey,
          },
          {
            record,
            role: "IBU",
            name: ibuName,
            source: "pending_in_run",
            parentId: pendingFamily.ibuPendingKey,
          },
        );
        continue;
      }

      // New family — create both parents and register the pair so a
      // later sibling in this same batch reuses them.
      const ayahPendingKey = `pending:ayah:${pairKey}`;
      const ibuPendingKey = `pending:ibu:${pairKey}`;
      pendingFamilyByPairKey.set(pairKey, { ayahPendingKey, ibuPendingKey });
      toCreateParents.push(
        { record, role: "AYAH", name: ayahName, pendingKey: ayahPendingKey },
        { record, role: "IBU", name: ibuName, pendingKey: ibuPendingKey },
      );
      continue;
    }

    // Only one parent name present (or neither) — no pair to verify
    // against, so never attempt a reuse match; always create fresh.
    if (ayahName) {
      toCreateParents.push({
        record,
        role: "AYAH",
        name: ayahName,
        pendingKey: `pending:ayah-solo:${record.kelas}:${record.rowNumber}`,
      });
    }
    if (ibuName) {
      toCreateParents.push({
        record,
        role: "IBU",
        name: ibuName,
        pendingKey: `pending:ibu-solo:${record.kelas}:${record.rowNumber}`,
      });
    }
  }

  return { toCreateStudents, toSkipStudents, toReuseParents, toCreateParents };
}

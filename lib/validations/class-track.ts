import { z } from "zod";

/**
 * ClassTrack validators — academic-hierarchy-refactor C3.
 *
 * `ClassTrack` is the stable multi-year class identity sitting under
 * `Campus > Program`. Status is the canonical CRUD Category A soft-delete
 * pair (ACTIVE | INACTIVE) — see prisma/schema.prisma `ClassTrack.status`.
 * Reactivate = PATCH/PUT { status: "ACTIVE" }; deactivate = DELETE (sets
 * status → INACTIVE).
 *
 * No DB import — pure shape. Display copy is Indonesian per
 * `.claude/standards/voice.md`.
 */

export const classTrackCreateSchema = z.object({
  campusId: z.string().min(1, "Kampus wajib dipilih"),
  programId: z.string().min(1, "Program wajib dipilih"),
  name: z
    .string()
    .trim()
    .min(1, "Nama rombongan belajar wajib diisi")
    .max(120, "Nama rombongan belajar terlalu panjang"),
});

export const classTrackUpdateSchema = z.object({
  // campusId / programId are identity fields — a track's place in the
  // Campus > Program hierarchy is not editable in place. Move semantics =
  // deactivate + recreate under the target parents.
  name: z
    .string()
    .trim()
    .min(1, "Nama rombongan belajar wajib diisi")
    .max(120, "Nama rombongan belajar terlalu panjang")
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type ClassTrackCreateInput = z.infer<typeof classTrackCreateSchema>;
export type ClassTrackUpdateInput = z.infer<typeof classTrackUpdateSchema>;

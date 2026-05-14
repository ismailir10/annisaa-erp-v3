import { z } from "zod";

/**
 * Roll-forward request body — `POST /api/admin/academic-years/[id]/roll-forward`.
 *
 * `[id]` (the route param) is the TARGET academic year; the body names the
 * SOURCE year whose ACTIVE class sections are cloned into the target.
 *
 * `trackIds` is optional: an empty / omitted array means "every ACTIVE track
 * that has an ACTIVE section in the source year". A non-empty array narrows
 * the roll-forward to just those ClassTracks. Capped at 500 to bound the
 * generated `IN` clause.
 */
export const rollForwardSchema = z.object({
  sourceYearId: z.string().min(1, "Tahun ajaran sumber wajib dipilih"),
  trackIds: z
    .array(z.string().min(1))
    .max(500, "Maksimal 500 track per permintaan")
    .optional(),
});

export type RollForwardInput = z.infer<typeof rollForwardSchema>;

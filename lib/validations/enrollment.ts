import { z } from "zod";

export const updateEnrollmentSchema = z.object({
  classSectionId: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "GRADUATED", "WITHDRAWN", "TRANSFERRED"]).optional(),
  notes: z.string().max(500).optional().nullable(),
});

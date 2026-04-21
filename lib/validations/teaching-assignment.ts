import { z } from "zod";

export const updateTeachingAssignmentSchema = z.object({
  role: z.enum(["HOMEROOM", "ASSISTANT"]),
});

export type UpdateTeachingAssignmentInput = z.infer<typeof updateTeachingAssignmentSchema>;

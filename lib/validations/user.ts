import { z } from "zod";

/**
 * PUT /api/users/[id] — shape only, extracted from the route's previous
 * inline `"key" in body` checks.
 *
 * `customRoleId`'s truthy/falsy handling (verify the role belongs to the
 * tenant vs. clear to `null`) and the "can't deactivate your own account"
 * guard stay hand-written in the route: the role lookup needs the DB, and
 * the guard needs the caller's own session id, neither of which a schema
 * has. An unrecognized `status` value silently collapses to "no change"
 * here (via `preprocess`), matching the route's previous
 * `"status" in body && (body.status === "ACTIVE" || body.status ===
 * "INACTIVE")` check, instead of turning into a 400.
 */
export const updateUserSchema = z.object({
  customRoleId: z.string().optional().nullable(),
  status: z.preprocess(
    (v) => (v === "ACTIVE" || v === "INACTIVE" ? v : undefined),
    z.enum(["ACTIVE", "INACTIVE"]).optional(),
  ),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/**
 * Client-only form schema for the users edit dialog. `customRoleId` is
 * modeled with the Select's own `"none"` sentinel (never empty/undefined —
 * the control always has a selection); the submit handler maps `"none"`
 * to `null` before sending the wire body.
 */
export const userEditFormSchema = z.object({
  customRoleId: z.string().min(1, "Peran wajib dipilih"),
  status: z.enum(["ACTIVE", "INACTIVE"], { message: "Status wajib dipilih" }),
});

export type UserEditFormValues = z.infer<typeof userEditFormSchema>;

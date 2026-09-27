import { z } from "zod";

/**
 * Structural shape for POST /api/roles and PUT /api/roles/[id], extracted
 * from their previous inline `if (!body.name?.trim() ...)` checks.
 *
 * The code-format rule lives here so the form flags a bad code inline. The
 * per-tenant code-uniqueness check and the "invalid permission code" check
 * against ALL_PERMISSIONS stay in the route (a DB round trip / a message
 * naming the offending value).
 * `permissions` itself is read from the raw body in-route (not through this
 * schema) so a non-array value keeps silently falling back to `[]`/being
 * ignored exactly as it did before, instead of becoming a 400.
 */
export const ROLE_CODE_REGEX = /^[A-Z][A-Z0-9_]{1,30}$/;

export const createRoleSchema = z.object({
  name: z.string({ message: "Nama peran wajib diisi" }).trim().min(1, "Nama peran wajib diisi"),
  code: z
    .string({ message: "Kode wajib diisi" })
    .trim()
    .min(1, "Kode wajib diisi")
    .regex(ROLE_CODE_REGEX, "Kode harus huruf kapital, angka, atau underscore (contoh: FINANCE_ADMIN)"),
  description: z.string().optional().nullable(),
});

export const updateRoleSchema = z.object({
  name: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

/**
 * Client-only form schema — same required name/code + optional description
 * as `createRoleSchema`, plus the permission checkbox tree modeled as one
 * `permissions: string[]` field (the API reads `permissions` off the raw
 * body, not through a schema — see the note above — so this is additive,
 * never a divergent copy of the wire shape).
 */
export const roleFormSchema = createRoleSchema.extend({
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
});

export type RoleFormValues = z.infer<typeof roleFormSchema>;

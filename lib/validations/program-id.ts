import { z } from "zod";

/**
 * Program.id shape is not guaranteed to be a Prisma `cuid()` — the schema
 * declares `@default(cuid())`, but seed/import tooling has inserted rows
 * with a custom `program_<hex>` prefix instead, and prod data has both
 * shapes coexisting. Do not regex-validate the id's format here; every
 * write path that persists a client-supplied programId already runs
 * `programBelongsToTenant` (lib/enrollment/resolve-token.ts) downstream —
 * that DB existence + tenant-scope check is the real guard, not this shape.
 */
export const programIdSchema = z.string().trim().min(1, "Program tidak valid");

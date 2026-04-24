import { z } from "zod";

// Mirrors lib/validations/program.ts. Status values are the canonical Cat A
// soft-delete pair (ACTIVE | INACTIVE) — see prisma/schema.prisma Campus.status.
// Restore = PUT { status: "ACTIVE" }; deactivate goes through DELETE.
//
// lat/lng accept string OR number — the admin form submits them as strings
// from <Input type="number">, while programmatic callers may send numbers.
// Both pass through z.coerce.number() so the route handler can rely on
// numeric values without a separate parseFloat() ternary.
export const updateCampusSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(120).optional(),
  address: z.string().max(500).optional().nullable(),
  lat: z.coerce.number().optional().nullable(),
  lng: z.coerce.number().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

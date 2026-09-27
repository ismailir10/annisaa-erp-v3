import { z } from "zod";

import { optionalTrimmed } from "@/lib/validations/zod-helpers";

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

// POST /api/config/campuses. `name` is required (create), unlike the PUT
// partial-update schema above. `lat`/`lng` arrive as `""` from the empty
// <Input type="number"> — z.coerce.number() alone would coerce that to `0`
// (`Number("")` is `0`), so an empty coordinate first collapses to
// `undefined` and only then goes through z.coerce.number(), matching the
// route's previous `lat ? parseFloat(lat) : null` (falsy string → null).
const optionalCoercedNumber = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.coerce.number({ message: "Harus berupa angka" }).optional(),
);

export const createCampusSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(120, "Nama maksimal 120 karakter"),
  address: optionalTrimmed(z.string().max(500, "Alamat maksimal 500 karakter")),
  lat: optionalCoercedNumber,
  lng: optionalCoercedNumber,
});

export type CreateCampusInput = z.infer<typeof createCampusSchema>;

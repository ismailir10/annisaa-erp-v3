// Address — Zod input schema. Mirrors Prisma `Address` model.
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T2)
//
// VarChar lengths mirror @db.VarChar(N). BPS-code prefix invariant
// (cycle Spec §1) enforced via .superRefine — DB compound FK is
// defense-in-depth.

import { z } from "zod";

export const addressSchema = z
  .object({
    provinceId: z.string().regex(/^\d{2}$/, "invalid_province_code"),
    regencyId: z.string().regex(/^\d{4}$/, "invalid_regency_code"),
    districtId: z.string().regex(/^\d{6}$/, "invalid_district_code"),
    villageId: z.string().regex(/^\d{10}$/, "invalid_village_code").optional(),
    streetLine: z.string().min(1).max(500),
    rt: z.string().regex(/^\d{1,3}$/).max(3).optional(),
    rw: z.string().regex(/^\d{1,3}$/).max(3).optional(),
    postalCode: z.string().regex(/^\d{5}$/).max(5).optional(),
    notes: z.string().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.regencyId.startsWith(v.provinceId)) {
      ctx.addIssue({
        code: "custom",
        path: ["regencyId"],
        message: "regency_outside_province",
      });
    }
    if (!v.districtId.startsWith(v.regencyId)) {
      ctx.addIssue({
        code: "custom",
        path: ["districtId"],
        message: "district_outside_regency",
      });
    }
    if (v.villageId && !v.villageId.startsWith(v.districtId)) {
      ctx.addIssue({
        code: "custom",
        path: ["villageId"],
        message: "village_outside_district",
      });
    }
  });

export type AddressInput = z.infer<typeof addressSchema>;

export const schema = addressSchema;
export default addressSchema;

// Zod schema for the public POST /api/admission/submit payload.
//
// Extends the canonical `admissionSchema` (admin-edit shape) with the public-
// form-only fields:
//   - tenantSlug: resolves the public form to a Tenant (page.tsx forwards
//     either subdomain or ?tenant=<slug> to this endpoint).
//   - notificationEmail: parent's email for the confirmation send.
// And adds a refinement requiring at least one parent contact channel
// (NIK or phone) so the sibling auto-detect has something to chew on and
// the admin has a way to reach the family if email bounces.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T8)

import { z } from "zod";

import { admissionSchema } from "@/lib/entities/admission/schema";

// `.strict()` rejects unknown keys at the door — defense in depth against
// future drift in `admissionSchema` (today it excludes server-managed
// columns, but a future admin-only addition like `status` should never be
// silently accepted on a public endpoint). The route handler also
// explicitly destructures into `submitAdmission`, so this is the second
// layer of mass-assignment protection.
export const publicSubmitSchema = admissionSchema
  .extend({
    tenantSlug: z.string().min(1).max(50),
    notificationEmail: z.string().email().max(255),
  })
  .strict()
  .refine(
    (v) =>
      Boolean(v.fatherNik) ||
      Boolean(v.fatherPhone) ||
      Boolean(v.motherNik) ||
      Boolean(v.motherPhone),
    {
      message:
        "At least one parent contact (NIK or phone) is required so the school can reach the family.",
      path: ["fatherPhone"],
    },
  );

export type PublicSubmitInput = z.infer<typeof publicSubmitSchema>;

import { z } from "zod";

export const createAdmissionSchema = z.object({
  childName: z.string().min(1, "Nama anak wajib diisi"),
  childAge: z.string().optional().nullable(),
  childGender: z.enum(["L", "P"]).optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  parentName: z.string().min(1, "Nama orang tua wajib diisi"),
  parentPhone: z.string().optional().nullable(),
  parentEmail: z.string().email("Email tidak valid").optional().nullable(),
  parentWhatsapp: z.string().optional().nullable(),
  programId: z.string().optional().nullable(),
  source: z.enum(["WHATSAPP", "WALK_IN", "WEBSITE", "REFERRAL", "OTHER"]).default("WALK_IN"),
  notes: z.string().optional().nullable(),
  followUpDate: z.string().optional().nullable(),
});

export const updateAdmissionSchema = createAdmissionSchema.partial().extend({
  status: z.enum(["INQUIRY", "VISIT_SCHEDULED", "VISITED", "ADMITTED", "REGISTERED", "CANCELLED"]).optional(),
});

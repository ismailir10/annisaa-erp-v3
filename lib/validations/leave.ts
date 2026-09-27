import { z } from "zod";

export const createLeaveRequestSchema = z.object({
  leaveType: z.enum(["ANNUAL", "SICK", "PERMISSION", "OTHER"], {
    message: "Jenis cuti tidak valid",
  }),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal mulai tidak valid (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal selesai tidak valid (YYYY-MM-DD)"),
  reason: z.string().trim().min(1, "Alasan wajib diisi"),
});

// POST /api/leave/requests/[id]/reject — admin review. Mirrors the route's
// previous inline `if (!body.note?.trim())` check (rejection reason
// required); POST .../approve keeps `note` optional and stays untouched.
export const rejectLeaveRequestSchema = z.object({
  note: z.string().trim().min(1, "Alasan penolakan wajib diisi"),
});

/**
 * Admin review dialog (app/admin/(hr)/leave-requests/page.tsx) — one
 * Textarea shared by both actions, required only when rejecting. `action`
 * mirrors the dialog's local reviewAction state so a single static schema
 * (superRefine) can express the conditional requirement without swapping
 * the resolver at runtime.
 */
export const leaveReviewFormSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    note: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "reject" && !data.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "Alasan penolakan wajib diisi",
      });
    }
  });

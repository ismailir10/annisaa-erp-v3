import { z } from "zod";

export const parentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(7),
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export type ParentActivityKind =
  | "ATTENDANCE_MARKED"
  | "NOTE_POSTED"
  | "JOURNAL_ENTRY"
  | "INVOICE_ISSUED"
  | "PAYMENT_RECEIVED"
  | "REPORT_PUBLISHED";

export type ParentActivityItem = {
  id: string;
  timestamp: string; // ISO
  kind: ParentActivityKind;
  title: string;
  detail?: string;
  href?: string;
};

// Email send stub — writes an `EmailLog` row with status="QUEUED" so callers
// can enqueue notifications without crashing pre-Resend integration. The
// real SMTP/Resend transport lands in a dedicated `p2-email-infra` cycle;
// until then a background worker (also out of scope) flushes QUEUED rows.
//
// Surface contract: callers pass a `template` (one of the typed slugs
// declared by the templates barrel) + a `data` object matching that
// template's prop type. `renderEmail` runs the template's render fn to
// produce subject + plain-text body; the row records the rendered subject
// so a downstream worker can ship without re-rendering.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T5)

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";

import { renderEmail, type EmailTemplate, type EmailTemplateData } from "./templates";

export type SendEmailInput<T extends EmailTemplate> = {
  tenantId: string;
  recipientEmail: string;
  template: T;
  data: EmailTemplateData<T>;
  actorUserId?: string | null;
};

export type SendEmailResult = {
  emailLogId: string;
  status: "QUEUED";
};

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export async function sendEmail<T extends EmailTemplate>(
  prisma: PrismaLike,
  input: SendEmailInput<T>,
): Promise<SendEmailResult> {
  const rendered = renderEmail(input.template, input.data);

  const row = await prisma.emailLog.create({
    data: {
      tenantId: input.tenantId,
      recipientEmail: input.recipientEmail,
      subject: rendered.subject,
      template: input.template,
      status: "QUEUED",
      createdById: input.actorUserId ?? null,
      updatedById: input.actorUserId ?? null,
    },
    select: { id: true },
  });

  return { emailLogId: row.id, status: "QUEUED" };
}

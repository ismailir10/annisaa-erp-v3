// Email templates barrel — typed slug → template module mapping. Each
// template exports {subject, render} so `lib/email/send.ts` can produce the
// rendered subject + plain-text body via a single typed entry point.
//
// Adding a template: write `<slug>.tsx` exporting `subject(data)` and
// `render(data)`, then register here. The slug becomes a `keyof TEMPLATES`
// literal — `sendEmail`'s `template` param + `data` param are inferred from
// it, so a wrong-shape call fails at compile time, not runtime.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T5)

import * as admissionSubmitted from "./admission-submitted";

export const TEMPLATES = {
  "admission-submitted": admissionSubmitted,
} as const;

export type EmailTemplate = keyof typeof TEMPLATES;

export type EmailTemplateData<T extends EmailTemplate> = Parameters<
  (typeof TEMPLATES)[T]["render"]
>[0];

export type RenderedEmail = {
  subject: string;
  body: string;
};

export function renderEmail<T extends EmailTemplate>(
  template: T,
  data: EmailTemplateData<T>,
): RenderedEmail {
  const mod = TEMPLATES[template] as {
    subject: (d: EmailTemplateData<T>) => string;
    render: (d: EmailTemplateData<T>) => string;
  };
  return {
    subject: mod.subject(data),
    body: mod.render(data),
  };
}

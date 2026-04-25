import type { PrismaClient } from "../../lib/generated/prisma/client";
import {
  createXenditSession,
  type CreateSessionParams,
  type CreateSessionResponse,
} from "../../lib/xendit/client";
import { createRng } from "./rng";
import {
  FEE_COMPONENTS,
  FEE_SCHEDULE,
  type ProgramCode,
  type SeedOrgResult,
  sectionKey,
} from "./org";
import type { SeedPeopleResult, StudentPlan, ParentPlan } from "./people";

export type InvoicePeriod = {
  /** "Jul-2025" style for periodLabel snapshot. */
  label: string;
  /** Year+month for sorting. */
  yearMonth: string; // "2025-07"
  dueDate: string; // YYYY-MM-DD
  /** Pre-Feb-2026 → historical PAID; Feb/Mar/Apr 2026 → live Xendit session. */
  mode: "HISTORICAL_PAID" | "LIVE_XENDIT";
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Build the 10 invoice periods from Jul-2025 to Apr-2026. */
export function buildInvoicePeriods(): InvoicePeriod[] {
  const out: InvoicePeriod[] = [];
  const months: Array<[number, number]> = [
    [2025, 7],
    [2025, 8],
    [2025, 9],
    [2025, 10],
    [2025, 11],
    [2025, 12],
    [2026, 1],
    [2026, 2],
    [2026, 3],
    [2026, 4],
  ];
  for (const [y, m] of months) {
    const isLive = y === 2026 && m >= 2;
    out.push({
      label: `${MONTH_LABELS[m - 1]}-${y}`,
      yearMonth: `${y}-${String(m).padStart(2, "0")}`,
      dueDate: `${y}-${String(m).padStart(2, "0")}-10`,
      mode: isLive ? "LIVE_XENDIT" : "HISTORICAL_PAID",
    });
  }
  return out;
}

/** Sum SPP + Makan + Kegiatan for a program. */
export function computeInvoiceTotal(programCode: ProgramCode): number {
  return (
    FEE_SCHEDULE[programCode].spp +
    FEE_SCHEDULE[programCode].uang_makan +
    FEE_SCHEDULE[programCode].uang_kegiatan
  );
}

export type SeedInvoicesResult = {
  paidInvoiceCount: number;
  liveInvoiceCount: number;
  xenditCallsMade: number;
  xenditCallsSkipped: number;
};

/** Inject Xendit caller for tests. */
export type CreateSessionFn = (
  params: CreateSessionParams,
) => Promise<CreateSessionResponse>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callXenditWithBackoff(
  fn: CreateSessionFn,
  params: CreateSessionParams,
  maxRetries = 3,
): Promise<CreateSessionResponse> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn(params);
    } catch (err) {
      attempt++;
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = /429|rate/i.test(msg);
      if (!isRateLimit || attempt > maxRetries) throw err;
      // Sandbox uses minute-window rate limits; back off generously.
      await sleep(15_000 * 2 ** (attempt - 1));
    }
  }
}

function invoiceNumber(seq: number, year: number): string {
  return `INV-${year}-${String(seq).padStart(5, "0")}`;
}

export async function seedInvoices(
  prisma: PrismaClient,
  org: SeedOrgResult,
  people: SeedPeopleResult,
  studentPlan: StudentPlan[],
  parentPlan: ParentPlan[],
  opts: {
    seed?: number;
    xenditCaller?: CreateSessionFn;
    successReturnUrl?: string;
    cancelReturnUrl?: string;
    /** Concurrency cap for Xendit calls. */
    xenditConcurrency?: number;
  } = {},
): Promise<SeedInvoicesResult> {
  const seed = opts.seed ?? 168;
  const rng = createRng(seed);
  const xenditCaller = opts.xenditCaller ?? createXenditSession;
  const successReturnUrl =
    opts.successReturnUrl ?? "https://annisaa-erp-v3.vercel.app/payment/success";
  const cancelReturnUrl =
    opts.cancelReturnUrl ?? "https://annisaa-erp-v3.vercel.app/payment/cancel";
  const concurrency = opts.xenditConcurrency ?? 2;

  const periods = buildInvoicePeriods();
  const recordedBy = people.userIdByPreservedEmail["ismailir10@gmail.com"];
  if (!recordedBy) {
    throw new Error("seedInvoices: missing SUPER_ADMIN preserved user");
  }

  // Build studentIndex → primary parent email (for Xendit payer_email).
  const primaryParentByStudent = new Map<number, ParentPlan>();
  for (const p of parentPlan) {
    for (const idx of p.childIndexes) {
      if (!primaryParentByStudent.has(idx)) {
        primaryParentByStudent.set(idx, p);
      }
    }
  }

  let paidInvoiceCount = 0;
  let liveInvoiceCount = 0;
  let xenditCallsMade = 0;
  let xenditCallsSkipped = 0;
  let invoiceSeq = 1;

  // Queue of {invoiceId, params} for live Xendit calls — run after all
  // historical PAID inserts complete to keep DB writes batched.
  type LiveJob = { invoiceId: string; params: CreateSessionParams };
  const liveJobs: LiveJob[] = [];

  for (const s of studentPlan.filter((x) => x.status === "ACTIVE")) {
    const sectionId =
      org.classSectionIdByKey[
        sectionKey({
          academicYearName: "2025/2026",
          campusCode: s.campusCode,
          programCode: s.programCode,
          sectionName: "",
          capacity: 0,
        })
      ];
    if (!sectionId) {
      throw new Error(`seedInvoices: no 2025/26 section for student ${s.index}`);
    }

    const studentId = people.studentIdByIndex[s.index];
    const parent = primaryParentByStudent.get(s.index);
    const parentDbId = parent?.email
      ? people.parentIdByEmail[parent.email]
      : undefined;

    const total = computeInvoiceTotal(s.programCode);
    const lineAmounts: Record<string, number> = FEE_SCHEDULE[s.programCode];

    for (const period of periods) {
      const number = invoiceNumber(
        invoiceSeq++,
        Number(period.yearMonth.slice(0, 4)),
      );
      const isLive = period.mode === "LIVE_XENDIT";
      const status = isLive ? "DRAFT" : "PAID";
      const paidAt =
        !isLive
          ? new Date(`${period.dueDate}T09:00:00+07:00`)
          : null;
      if (paidAt && rng.bool(0.5)) {
        // Slight realistic variance: half the historical paid ON or AFTER due.
        paidAt.setUTCDate(paidAt.getUTCDate() + rng.int(0, 5));
      }

      const inv = await prisma.invoice.create({
        data: {
          tenantId: org.tenantId,
          studentId,
          invoiceNumber: number,
          periodLabel: period.label,
          dueDate: period.dueDate,
          totalDue: total,
          totalPaid: isLive ? 0 : total,
          status,
          createdBy: recordedBy,
          parentId: parentDbId ?? null,
          sentAt: isLive ? null : new Date(`${period.dueDate}T08:00:00+07:00`),
          paidAt,
        },
      });

      // Lines per FEE_COMPONENTS (3 rows per invoice).
      for (const fc of FEE_COMPONENTS) {
        const amount = lineAmounts[fc.code] ?? 0;
        await prisma.invoiceLine.create({
          data: {
            invoiceId: inv.id,
            feeComponentId: org.feeComponentIdByCode[fc.code],
            labelSnapshot: fc.label,
            amount,
            finalAmount: amount,
          },
        });
      }

      if (isLive) {
        liveJobs.push({
          invoiceId: inv.id,
          params: {
            // referenceId MUST be the bare invoice.id so the webhook handler's
            // `prisma.invoice.findUnique({ where: { id: data.reference_id } })`
            // lookup succeeds. Matches lib/xendit/helpers.ts (production path).
            referenceId: inv.id,
            amount: total,
            description: `SPP ${s.programCode} ${period.label} — ${s.name}`,
            customerName: parent?.displayName ?? "Wali Murid",
            customerEmail: parent?.email ?? undefined,
            customerPhone: parent?.phone,
            successReturnUrl,
            cancelReturnUrl,
            expiryDays: 7,
            items: FEE_COMPONENTS.map((fc) => ({
              name: fc.label,
              quantity: 1,
              price: lineAmounts[fc.code] ?? 0,
            })),
          },
        });
        liveInvoiceCount++;
      } else {
        // Payment row for historical PAID.
        await prisma.payment.create({
          data: {
            invoiceId: inv.id,
            amount: total,
            method: "BANK_TRANSFER",
            status: "APPROVED",
            paidAt: paidAt ?? new Date(`${period.dueDate}T09:00:00+07:00`),
            createdBy: recordedBy,
          },
        });
        paidInvoiceCount++;
      }
    }
  }

  // Historical PAID invoices for the GRADUATED cohort (2024/25, 10 months).
  const gradPeriods: Array<{ label: string; yearMonth: string; dueDate: string }> = [
    ["Jul", 2024],
    ["Aug", 2024],
    ["Sep", 2024],
    ["Oct", 2024],
    ["Nov", 2024],
    ["Dec", 2024],
    ["Jan", 2025],
    ["Feb", 2025],
    ["Mar", 2025],
    ["Apr", 2025],
  ].map(([m, y]) => {
    const monthIdx = MONTH_LABELS.indexOf(m as string) + 1;
    const ymStr = `${y}-${String(monthIdx).padStart(2, "0")}`;
    return { label: `${m}-${y}`, yearMonth: ymStr, dueDate: `${ymStr}-10` };
  });

  for (const s of studentPlan.filter((x) => x.status === "GRADUATED")) {
    const studentId = people.studentIdByIndex[s.index];
    const parent = primaryParentByStudent.get(s.index);
    const parentDbId = parent?.email
      ? people.parentIdByEmail[parent.email]
      : undefined;
    const total = computeInvoiceTotal("TKIT-B");
    for (const gp of gradPeriods) {
      const number = invoiceNumber(
        invoiceSeq++,
        Number(gp.yearMonth.slice(0, 4)),
      );
      const inv = await prisma.invoice.create({
        data: {
          tenantId: org.tenantId,
          studentId,
          invoiceNumber: number,
          periodLabel: gp.label,
          dueDate: gp.dueDate,
          totalDue: total,
          totalPaid: total,
          status: "PAID",
          createdBy: recordedBy,
          parentId: parentDbId ?? null,
          sentAt: new Date(`${gp.dueDate}T08:00:00+07:00`),
          paidAt: new Date(`${gp.dueDate}T09:00:00+07:00`),
        },
      });
      const lineAmounts = FEE_SCHEDULE["TKIT-B"];
      for (const fc of FEE_COMPONENTS) {
        await prisma.invoiceLine.create({
          data: {
            invoiceId: inv.id,
            feeComponentId: org.feeComponentIdByCode[fc.code],
            labelSnapshot: fc.label,
            amount: lineAmounts[fc.code] ?? 0,
            finalAmount: lineAmounts[fc.code] ?? 0,
          },
        });
      }
      await prisma.payment.create({
        data: {
          invoiceId: inv.id,
          amount: total,
          method: "BANK_TRANSFER",
          status: "APPROVED",
          paidAt: new Date(`${gp.dueDate}T09:00:00+07:00`),
          createdBy: recordedBy,
        },
      });
      paidInvoiceCount++;
    }
  }

  // ── Run live Xendit calls with throttle.
  const queue = [...liveJobs];
  const workers: Promise<void>[] = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push(
      (async () => {
        for (;;) {
          const job = queue.shift();
          if (!job) return;
          // Idempotency: re-fetch Invoice; if xenditSessionId already set, skip.
          const existing = await prisma.invoice.findUnique({
            where: { id: job.invoiceId },
          });
          if (existing?.xenditPaymentUrl) {
            xenditCallsSkipped++;
            continue;
          }
          const session = await callXenditWithBackoff(xenditCaller, job.params);
          await prisma.invoice.update({
            where: { id: job.invoiceId },
            data: {
              xenditSessionId: session.id ?? null,
              xenditPaymentUrl: session.payment_link_url,
              status: "SENT",
              sentAt: new Date(),
            },
          });
          xenditCallsMade++;
          await sleep(600); // safe sandbox pace
        }
      })(),
    );
  }
  await Promise.all(workers);

  return {
    paidInvoiceCount,
    liveInvoiceCount,
    xenditCallsMade,
    xenditCallsSkipped,
  };
}

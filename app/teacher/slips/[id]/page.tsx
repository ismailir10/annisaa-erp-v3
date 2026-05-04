import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatRupiah, formatDate } from "@/lib/format";

// ── Types ─────────────────────────────────────────────────────────────────────

type SlipLine = {
  id: string;
  labelSnapshot: string;
  categorySnapshot: string;
  finalAmount: number;
};

type SlipDetail = {
  id: string;
  grossAmount: number;
  deductions: number;
  netAmount: number;
  employee: {
    id: string;
    nama: string;
    formalName: string | null;
    kode: string;
    jabatan: string;
    bankName: string | null;
    bankAccountNo: string | null;
  };
  payrollRun: {
    id: string;
    periodStart: string;
    periodEnd: string;
    actualWorkDays: number;
    status: string;
    tenantId: string;
  };
  lines: SlipLine[];
};

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchSlipDetail(id: string, tenantId: string): Promise<SlipDetail | null> {
  const raw = await prisma.payrollItem.findFirst({
    where: { id, payrollRun: { tenantId } },
    include: {
      employee: {
        select: {
          id: true,
          nama: true,
          formalName: true,
          kode: true,
          jabatan: true,
          bankName: true,
          bankAccountNo: true,
        },
      },
      payrollRun: {
        select: {
          id: true,
          periodStart: true,
          periodEnd: true,
          actualWorkDays: true,
          status: true,
          tenantId: true,
        },
      },
      lines: {
        orderBy: { componentDef: { sortOrder: "asc" } },
        select: {
          id: true,
          labelSnapshot: true,
          categorySnapshot: true,
          finalAmount: true,
        },
      },
    },
  });

  if (!raw) return null;

  return {
    id: raw.id,
    grossAmount: Number(raw.grossAmount),
    deductions: Number(raw.deductions),
    netAmount: Number(raw.netAmount),
    employee: raw.employee,
    payrollRun: raw.payrollRun,
    lines: raw.lines.map((l) => ({
      id: l.id,
      labelSnapshot: l.labelSnapshot,
      categorySnapshot: l.categorySnapshot,
      finalAmount: Number(l.finalAmount),
    })),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format "2026-03-01 s/d 2026-03-31" → "Maret 2026" */
function formatPeriodHeader(periodStart: string): string {
  return formatDate(periodStart, { month: "long", year: "numeric" });
}

/** Mask bank account number — show last 4 digits only. */
function maskBankAccount(accountNo: string): string {
  if (accountNo.length <= 4) return accountNo;
  const visible = accountNo.slice(-4);
  const masked = "*".repeat(accountNo.length - 4);
  return `${masked}${visible}`;
}

/** Today's date formatted for the footer. */
function todayFormatted(): string {
  return new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SlipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getSession();
  if (!session || session.role !== "TEACHER" || !session.tenantId) notFound();

  const slip = await fetchSlipDetail(id, session.tenantId);
  if (!slip) notFound();

  // Auth check: teacher can only see their own slip
  if (slip.employee.id !== session.employeeId) notFound();

  // Draft block: DRAFT slips are not available yet
  if (slip.payrollRun.status === "DRAFT") notFound();

  const incomeLines = slip.lines.filter((l) => l.categorySnapshot === "INCOME");
  const deductionLines = slip.lines.filter(
    (l) => l.categorySnapshot === "DEDUCTION",
  );

  const employeeName = slip.employee.formalName ?? slip.employee.nama;
  const periodHeader = formatPeriodHeader(slip.payrollRun.periodStart);
  const periodLabel = `${slip.payrollRun.periodStart} s/d ${slip.payrollRun.periodEnd}`;

  return (
    <div className="space-y-4">
      {/* Back link — matches student-journal/students/[id] back pattern */}
      <Link
        href="/teacher/slips"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Kembali ke Slip Gaji
      </Link>

      {/* Period header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-foreground">
            {periodHeader}
          </h1>
          <p className="text-small text-muted-foreground mt-0.5">{periodLabel}</p>
        </div>
        <div className="shrink-0 pt-1">
          <StatusBadge status="APPROVED" label="Tersedia" />
        </div>
      </div>

      {/* Employee info card */}
      <Card className="p-card">
        <h2 className="text-small font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Informasi Karyawan
        </h2>
        {/*
          Two-column grid on >=414 px (sm breakpoint ~640 px, so use
          min-[414px]:grid-cols-2 for exact threshold); single column on 375 px.
        */}
        <dl className="grid grid-cols-1 min-[414px]:grid-cols-2 gap-y-3 gap-x-4">
          <div>
            <dt className="text-small text-muted-foreground">Nama</dt>
            <dd className="text-body font-semibold text-foreground mt-0.5">
              {employeeName}
            </dd>
          </div>
          <div>
            <dt className="text-small text-muted-foreground">NIP</dt>
            <dd className="text-body font-semibold text-foreground mt-0.5">
              {slip.employee.kode}
            </dd>
          </div>
          <div>
            <dt className="text-small text-muted-foreground">Jabatan</dt>
            <dd className="text-body font-semibold text-foreground mt-0.5">
              {slip.employee.jabatan}
            </dd>
          </div>
          <div>
            <dt className="text-small text-muted-foreground">Hari Kerja</dt>
            <dd className="text-body font-semibold text-foreground mt-0.5">
              {slip.payrollRun.actualWorkDays} hari
            </dd>
          </div>
        </dl>
      </Card>

      {/* Pendapatan (Income) section */}
      <Card className="p-card">
        <h2 className="text-small font-semibold uppercase tracking-wide text-primary mb-3">
          Pendapatan
        </h2>

        <div className="space-y-2">
          {incomeLines.map((line, i) => (
            <div
              key={line.id}
              className={`flex items-center justify-between py-1.5 ${
                i < incomeLines.length - 1
                  ? "border-b border-border"
                  : ""
              }`}
            >
              <span className="text-body text-foreground">{line.labelSnapshot}</span>
              <span className="text-body font-medium text-foreground tabular-nums">
                {formatRupiah(line.finalAmount)}
              </span>
            </div>
          ))}
        </div>

        {/* Total Pendapatan */}
        <div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
          <span className="text-body font-semibold text-foreground">
            Total Pendapatan
          </span>
          <span className="text-body font-bold text-foreground tabular-nums">
            {formatRupiah(slip.grossAmount)}
          </span>
        </div>
      </Card>

      {/* Potongan (Deductions) section — hidden if zero deductions */}
      {deductionLines.length > 0 && (
        <Card className="p-card">
          <h2 className="text-small font-semibold uppercase tracking-wide text-primary mb-3">
            Potongan
          </h2>

          <div className="space-y-2">
            {deductionLines.map((line, i) => (
              <div
                key={line.id}
                className={`flex items-center justify-between py-1.5 ${
                  i < deductionLines.length - 1
                    ? "border-b border-border"
                    : ""
                }`}
              >
                <span className="text-body text-foreground">
                  {line.labelSnapshot}
                </span>
                <span className="text-body font-medium text-foreground tabular-nums">
                  {formatRupiah(line.finalAmount)}
                </span>
              </div>
            ))}
          </div>

          {/* Total Potongan */}
          <div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
            <span className="text-body font-semibold text-foreground">
              Total Potongan
            </span>
            <span className="text-body font-bold text-destructive tabular-nums">
              {formatRupiah(slip.deductions)}
            </span>
          </div>
        </Card>
      )}

      {/* Take Home Pay — prominent brand highlight (matches teal netBox in PDF) */}
      <div className="rounded-xl bg-primary p-card flex items-center justify-between">
        <div>
          <p className="text-small font-semibold uppercase tracking-wide text-primary-foreground opacity-80">
            Take Home Pay
          </p>
          <p className="text-caption text-primary-foreground opacity-60 mt-0.5">
            Diterima ke rekening
          </p>
        </div>
        <p className="text-h1 font-bold text-primary-foreground tabular-nums">
          {formatRupiah(slip.netAmount)}
        </p>
      </div>

      {/* Bank transfer details */}
      {slip.employee.bankAccountNo && (
        <Card className="p-card">
          <h2 className="text-small font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Transfer ke Rekening
          </h2>
          <dl className="grid grid-cols-1 min-[414px]:grid-cols-3 gap-y-3 gap-x-4">
            <div>
              <dt className="text-small text-muted-foreground">Bank</dt>
              <dd className="text-body font-semibold text-foreground mt-0.5">
                {slip.employee.bankName ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-small text-muted-foreground">Atas Nama</dt>
              <dd className="text-body font-semibold text-foreground mt-0.5">
                {employeeName}
              </dd>
            </div>
            <div>
              <dt className="text-small text-muted-foreground">No. Rekening</dt>
              <dd className="text-body font-semibold text-foreground mt-0.5 font-mono">
                {maskBankAccount(slip.employee.bankAccountNo)}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      {/* Footer */}
      <div className="pt-2 pb-4 border-t border-border">
        <p className="text-caption text-muted-foreground">
          Tanggal cetak: {todayFormatted()}
        </p>
        <p className="text-caption text-muted-foreground mt-0.5">
          Slip ini dihasilkan otomatis oleh sistem An Nisaa&apos; ERP. Dokumen resmi.
        </p>
      </div>
    </div>
  );
}

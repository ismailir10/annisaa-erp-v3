"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type GenerateBlocker = { id: string; kode: string; nama: string; reason?: string };
export type GenerateBlockers = { error: string; employees: GenerateBlocker[] };

/** Where the admin fixes each kind of blocker on the employee dossier. */
function fixTarget(b: GenerateBlocker): { href: string; label: string } {
  switch (b.reason) {
    case "salary structure missing":
      return { href: `/admin/employees/${b.id}#salary`, label: "Isi struktur gaji" };
    case "rekening missing":
      return { href: `/admin/employees/${b.id}#profile`, label: "Lengkapi rekening" };
    case "negative net pay":
      return { href: `/admin/employees/${b.id}#salary`, label: "Periksa gaji" };
    default:
      return { href: `/admin/employees/${b.id}`, label: "Buka karyawan" };
  }
}

/**
 * HR-3: payroll generation refuses the whole run when some employees are not
 * ready. A toast vanished before the admin could act on it, so the reason and
 * each employee (with a link to where it is fixed) stay on screen until the
 * dialog is retried or closed.
 */
export function PayrollGenerateBlockersAlert({ blockers }: { blockers: GenerateBlockers }) {
  return (
    <Alert variant="destructive" data-testid="payroll-generate-blockers">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Penggajian belum bisa dibuat</AlertTitle>
      <AlertDescription>
        <p>{blockers.error}. Perbaiki karyawan berikut, lalu coba lagi:</p>
        <ul className="mt-2 space-y-1">
          {blockers.employees.map((e) => {
            const fix = fixTarget(e);
            return (
              <li key={`${e.id}-${e.reason}`} className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="text-foreground">
                  {e.nama} <span className="text-muted-foreground">({e.kode})</span>
                </span>
                <Link href={fix.href} className="underline underline-offset-2">
                  {fix.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

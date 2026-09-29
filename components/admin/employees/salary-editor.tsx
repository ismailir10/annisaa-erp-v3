"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Save, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

/** One row of `GET /api/employees/:id/salary` (an existing EmployeeSalaryValue). */
export type SalaryValueRow = {
  id?: string;
  value: number | string;
  componentDefId: string;
  componentDef: { code: string; label: string; category: string; calcType: string; sortOrder: number };
};

/** One row of `GET /api/salary-components`. */
export type SalaryComponentRow = {
  id: string;
  code: string;
  label: string;
  category: string;
  calcType: string;
  sortOrder: number;
  isEnabled?: boolean;
};

export type SalaryEditorRow = {
  componentDefId: string;
  label: string;
  category: string;
  calcType: string;
  sortOrder: number;
  /** null = no EmployeeSalaryValue row yet ("Belum diatur"). */
  value: number | null;
};

/**
 * HR-3 / DOC-2: every active salary component appears on the employee's Gaji
 * section, whether or not a value row exists yet. Components that already have
 * a value row for this employee stay listed even if the component was since
 * disabled, so an existing value is never hidden.
 */
export function buildSalaryRows(
  components: SalaryComponentRow[] | null | undefined,
  values: SalaryValueRow[],
): SalaryEditorRow[] {
  const byComponent = new Map(values.map((v) => [v.componentDefId, v]));
  const rows = new Map<string, SalaryEditorRow>();
  for (const c of components ?? []) {
    if (c.isEnabled === false && !byComponent.has(c.id)) continue;
    const existing = byComponent.get(c.id);
    rows.set(c.id, {
      componentDefId: c.id,
      label: c.label,
      category: c.category,
      calcType: c.calcType,
      sortOrder: c.sortOrder,
      value: existing ? Number(existing.value) : null,
    });
  }
  for (const v of values) {
    if (rows.has(v.componentDefId)) continue;
    rows.set(v.componentDefId, {
      componentDefId: v.componentDefId,
      label: v.componentDef.label,
      category: v.componentDef.category,
      calcType: v.componentDef.calcType,
      sortOrder: v.componentDef.sortOrder,
      value: Number(v.value),
    });
  }
  return [...rows.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

const CALC_LABEL: Record<string, string> = {
  FIXED: "Tetap",
  ATTENDANCE_BASED: "Per hari",
  PCT_OF_BASE: "% Pokok",
};

export function SalaryEditor({
  components,
  values,
  canEdit = true,
  saving,
  onSave,
}: {
  components: SalaryComponentRow[] | null;
  values: SalaryValueRow[];
  canEdit?: boolean;
  saving: boolean;
  onSave: (payload: { componentDefId: string; value: number }[]) => void | Promise<void>;
}) {
  const initial = useMemo(() => buildSalaryRows(components, values), [components, values]);
  const [draft, setDraft] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(initial.map((r) => [r.componentDefId, r.value])),
  );
  // Re-seed when the server rows change (after a save/refetch).
  const [seedKey, setSeedKey] = useState(() => JSON.stringify(initial));
  const nextKey = JSON.stringify(initial);
  if (nextKey !== seedKey) {
    setSeedKey(nextKey);
    setDraft(Object.fromEntries(initial.map((r) => [r.componentDefId, r.value])));
  }

  if (initial.length === 0) {
    return (
      <EmptyState
        title="Belum ada komponen gaji aktif"
        description="Buat komponen gaji lebih dulu, lalu isi nilainya di sini untuk setiap karyawan."
        actionLabel="Buka Komponen Gaji"
        actionHref="/admin/salary-components"
      />
    );
  }

  const setCount = initial.filter((r) => draft[r.componentDefId] !== null && draft[r.componentDefId] !== undefined).length;
  const unsetCount = initial.length - setCount;
  const dirty = initial.some((r) => (draft[r.componentDefId] ?? null) !== r.value);

  const submit = () =>
    onSave(
      initial
        .filter((r) => draft[r.componentDefId] !== null && draft[r.componentDefId] !== undefined)
        .map((r) => ({ componentDefId: r.componentDefId, value: Number(draft[r.componentDefId]) })),
    );

  return (
    <div className="space-y-3">
      {setCount === 0 ? (
        <Alert role="status">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Belum ada struktur gaji</AlertTitle>
          <AlertDescription>
            Isi minimal satu komponen (misalnya Gaji Pokok) lalu simpan. Penggajian tidak bisa dibuat sebelum itu.
          </AlertDescription>
        </Alert>
      ) : unsetCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {unsetCount} komponen belum diisi dan dihitung Rp 0. Kosongkan hanya bila karyawan memang tidak menerimanya.
        </p>
      ) : null}

      {initial.map((row) => {
        const value = draft[row.componentDefId] ?? null;
        const setValue = (v: number | null) => setDraft((d) => ({ ...d, [row.componentDefId]: v }));
        return (
          <div
            key={row.componentDefId}
            className="flex flex-col gap-2 border-b border-border py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{row.label}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={row.category}
                  label={row.category === "INCOME" ? "Pendapatan" : "Potongan"}
                />
                <span className="text-xs text-muted-foreground">{CALC_LABEL[row.calcType] ?? row.calcType}</span>
                {row.value === null && (
                  <span className="text-xs text-muted-foreground">· Belum diatur</span>
                )}
              </div>
            </div>
            <div className="w-full sm:w-40">
              {row.calcType === "PCT_OF_BASE" ? (
                // PCT_OF_BASE is a percentage of gaji_pokok (lib/payroll/engine.ts
                // `amount = gajiPokokAmount * (baseValue / 100)`), not a rupiah
                // amount — RupiahInput would strip "2.5" down to "25"/"2" and
                // stamp an incorrect "Rp" prefix on it.
                <InputGroup>
                  <InputGroupInput
                    aria-label={`Nilai ${row.label}`}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    placeholder="Belum diatur"
                    disabled={!canEdit}
                    value={value ?? ""}
                    onChange={(ev) => {
                      const raw = ev.target.value;
                      if (raw === "") return setValue(null);
                      const n = parseFloat(raw);
                      setValue(Number.isFinite(n) && n >= 0 ? n : 0);
                    }}
                    className="text-right tabular-nums"
                  />
                  <InputGroupAddon align="inline-end">%</InputGroupAddon>
                </InputGroup>
              ) : (
                <RupiahInput
                  aria-label={`Nilai ${row.label}`}
                  placeholder="Belum diatur"
                  disabled={!canEdit}
                  value={value}
                  onChange={setValue}
                />
              )}
            </div>
          </div>
        );
      })}

      {canEdit && (
        <Button onClick={submit} disabled={saving || !dirty} className="mt-2">
          <Save size={14} className="mr-1.5" /> {saving ? "Menyimpan..." : "Simpan Semua Nilai"}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Komponen baru dibuat di{" "}
        <Link href="/admin/salary-components" className="underline underline-offset-2">
          Komponen Gaji
        </Link>
        ; nilainya diisi per karyawan di sini.
      </p>
    </div>
  );
}

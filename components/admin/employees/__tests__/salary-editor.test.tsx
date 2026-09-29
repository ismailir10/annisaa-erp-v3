import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SalaryEditor, buildSalaryRows, type SalaryComponentRow } from "../salary-editor";

const gapok: SalaryComponentRow = { id: "c1", code: "gaji_pokok", label: "Gaji Pokok", category: "INCOME", calcType: "FIXED", sortOrder: 1, isEnabled: true };
const tunj: SalaryComponentRow = { id: "c2", code: "tunjangan", label: "Tunjangan Baru", category: "INCOME", calcType: "FIXED", sortOrder: 2, isEnabled: true };
const off: SalaryComponentRow = { id: "c3", code: "lama", label: "Komponen Lama", category: "INCOME", calcType: "FIXED", sortOrder: 3, isEnabled: false };

describe("buildSalaryRows (HR-3 / DOC-2)", () => {
  it("lists every enabled component, with null for the ones that have no value row yet", () => {
    const rows = buildSalaryRows([tunj, gapok, off], [
      { componentDefId: "c1", value: "5000000.00", componentDef: { code: "gaji_pokok", label: "Gaji Pokok", category: "INCOME", calcType: "FIXED", sortOrder: 1 } },
    ]);
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["Gaji Pokok", 5000000],
      ["Tunjangan Baru", null],
    ]);
  });

  it("keeps a disabled component that already has a value, so nothing is hidden", () => {
    const rows = buildSalaryRows([off], [
      { componentDefId: "c3", value: 100, componentDef: { code: "lama", label: "Komponen Lama", category: "INCOME", calcType: "FIXED", sortOrder: 3 } },
    ]);
    expect(rows).toHaveLength(1);
  });
});

describe("<SalaryEditor>", () => {
  it("a brand-new employee sees all components, a warning, and can save a first value", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SalaryEditor components={[gapok, tunj]} values={[]} saving={false} onSave={onSave} />);

    expect(screen.getByText("Belum ada struktur gaji")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nilai Gaji Pokok" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Nilai Tunjangan Baru" })).toHaveValue("");
    expect(screen.getByRole("button", { name: /Simpan Semua Nilai/ })).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Nilai Gaji Pokok" }), "3500000");
    await user.click(screen.getByRole("button", { name: /Simpan Semua Nilai/ }));

    // Only the component the admin actually filled is sent; the empty one stays "not set".
    expect(onSave).toHaveBeenCalledWith([{ componentDefId: "c1", value: 3500000 }]);
  });

  it("links to Komponen Gaji instead of the old dead-end hint when nothing is enabled", () => {
    render(<SalaryEditor components={[]} values={[]} saving={false} onSave={vi.fn()} />);
    expect(screen.getByText("Belum ada komponen gaji aktif")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buka Komponen Gaji" })).toHaveAttribute("href", "/admin/salary-components");
  });
});

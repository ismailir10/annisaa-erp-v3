import { describe, it, expect } from "vitest";
import {
  validateManualForm,
  type ManualFormState,
} from "../manual-invoice-dialog";

function baseForm(overrides: Partial<ManualFormState> = {}): ManualFormState {
  return {
    studentId: "stu_1",
    periodLabel: "April 2026",
    dueDate: "2026-04-30",
    lines: [{ feeComponentId: "fc_1", amount: "100000" }],
    ...overrides,
  };
}

describe("validateManualForm", () => {
  it("returns null on a fully valid form", () => {
    expect(validateManualForm(baseForm())).toBeNull();
  });

  it("rejects a missing student", () => {
    expect(validateManualForm(baseForm({ studentId: "" }))).toBe(
      "Pilih siswa terlebih dahulu",
    );
  });

  it("rejects an empty / whitespace-only periode", () => {
    expect(validateManualForm(baseForm({ periodLabel: "   " }))).toBe(
      "Periode wajib diisi",
    );
  });

  it("rejects a missing due date", () => {
    expect(validateManualForm(baseForm({ dueDate: "" }))).toBe(
      "Tanggal jatuh tempo wajib diisi",
    );
  });

  it("rejects a malformed due date", () => {
    expect(validateManualForm(baseForm({ dueDate: "30/04/2026" }))).toBe(
      "Tanggal jatuh tempo wajib diisi",
    );
  });

  it("rejects when there are no lines", () => {
    expect(validateManualForm(baseForm({ lines: [] }))).toBe(
      "Tambahkan minimal satu komponen",
    );
  });

  it("rejects a line with no fee component selected", () => {
    expect(
      validateManualForm(
        baseForm({ lines: [{ feeComponentId: "", amount: "100000" }] }),
      ),
    ).toBe("Pilih komponen biaya pada setiap baris");
  });

  it("rejects a zero amount", () => {
    expect(
      validateManualForm(
        baseForm({ lines: [{ feeComponentId: "fc_1", amount: "0" }] }),
      ),
    ).toBe("Jumlah pada setiap baris harus lebih dari 0");
  });

  it("rejects a negative amount", () => {
    expect(
      validateManualForm(
        baseForm({ lines: [{ feeComponentId: "fc_1", amount: "-100" }] }),
      ),
    ).toBe("Jumlah pada setiap baris harus lebih dari 0");
  });

  it("rejects a non-numeric amount string", () => {
    expect(
      validateManualForm(
        baseForm({ lines: [{ feeComponentId: "fc_1", amount: "abc" }] }),
      ),
    ).toBe("Jumlah pada setiap baris harus lebih dari 0");
  });

  it("validates every line — first invalid one wins", () => {
    expect(
      validateManualForm(
        baseForm({
          lines: [
            { feeComponentId: "fc_1", amount: "100000" },
            { feeComponentId: "", amount: "50000" },
          ],
        }),
      ),
    ).toBe("Pilih komponen biaya pada setiap baris");
  });

  it("accepts multiple valid lines", () => {
    expect(
      validateManualForm(
        baseForm({
          lines: [
            { feeComponentId: "fc_1", amount: "100000" },
            { feeComponentId: "fc_2", amount: "50000.50" },
          ],
        }),
      ),
    ).toBeNull();
  });
});

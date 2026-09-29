import { describe, it, expect } from "vitest";
import { componentCodeSchema } from "../component-code";
import { createFeeComponentSchema } from "../fee-component";
import { createSalaryComponentSchema, salaryComponentFormSchema } from "../payroll";
import { saveFeeStructureSchema, MAX_FEE_AMOUNT } from "../fee-structure";

describe("componentCodeSchema (FIN-4 / HR-10)", () => {
  it.each(["spp", "SPP", " Daftar_Ulang ", "gaji_pokok", "insentif-3m", "a1"])("accepts %j and lowercases it", (raw) => {
    const r = componentCodeSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(raw.trim().toLowerCase());
  });

  it.each(["E2E FIN BAD!!", "e2e hr bonus!", "a b", "spp!", "_lead", "-lead", "kode/1", "é"])(
    "rejects %j with the Indonesian format message",
    (raw) => {
      const r = componentCodeSchema.safeParse(raw);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toMatch(/tanpa spasi/);
    },
  );

  it("rejects blank and over-long codes with Indonesian messages", () => {
    const blank = componentCodeSchema.safeParse("   ");
    expect(blank.success ? "" : blank.error.issues[0].message).toBe("Kode wajib diisi");
    const long = componentCodeSchema.safeParse("a".repeat(65));
    expect(long.success ? "" : long.error.issues[0].message).toBe("Kode maksimal 64 karakter");
  });

  it("is enforced by the fee-component and salary-component schemas", () => {
    expect(createFeeComponentSchema.safeParse({ code: "E2E FIN BAD!!", label: "L" }).success).toBe(false);
    const salary = { label: "L", category: "INCOME", calcType: "FIXED" };
    expect(createSalaryComponentSchema.safeParse({ ...salary, code: "E2E HR Bonus!" }).success).toBe(false);
    const ok = createSalaryComponentSchema.safeParse({ ...salary, code: "Bonus_Baru" });
    expect(ok.success && ok.data.code).toBe("bonus_baru");
    expect(salaryComponentFormSchema.safeParse({ ...salary, code: "bad code" }).success).toBe(false);
  });
});

describe("saveFeeStructureSchema amount cap (FIN-5)", () => {
  const body = (amount: number) => ({
    programId: "p",
    academicYearId: "y",
    fees: [{ feeComponentId: "f", amount }],
  });

  it("accepts the cap and rejects anything above it", () => {
    expect(saveFeeStructureSchema.safeParse(body(MAX_FEE_AMOUNT)).success).toBe(true);
    const r = saveFeeStructureSchema.safeParse(body(MAX_FEE_AMOUNT + 1));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Nominal maksimal Rp 10.000.000.000");
    expect(saveFeeStructureSchema.safeParse(body(99999999999999999)).success).toBe(false);
  });

  it("the cap fits numeric(15,2) with room for a 100-line invoice", () => {
    expect(MAX_FEE_AMOUNT * 100).toBeLessThan(1e13);
  });
});

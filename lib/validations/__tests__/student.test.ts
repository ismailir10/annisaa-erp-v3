import { describe, expect, it } from "vitest";
import {
  studentDetailEditFormSchema,
  withdrawalReasonFormSchema,
  studentExtraMetadataFormSchema,
} from "../student";

describe("studentDetailEditFormSchema (students/[id] Data Anak inline edit)", () => {
  const base = {
    name: "Ahmad",
    nickname: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    notes: "",
    nis: "",
    nisn: "",
    birthPlace: "",
    nik: "",
    kkNumber: "",
    livingWith: "",
  };

  it("does not have a status field", () => {
    const parsed = studentDetailEditFormSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect("status" in parsed.data).toBe(false);
  });

  it("a blank gender parses to null, not an empty string (the bug this schema fixes)", () => {
    const parsed = studentDetailEditFormSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.gender).toBeNull();
  });

  it("still requires name", () => {
    const parsed = studentDetailEditFormSchema.safeParse({ ...base, name: "" });
    expect(parsed.success).toBe(false);
  });
});

describe("withdrawalReasonFormSchema (Riwayat Status inline edit)", () => {
  it("trims and requires a non-empty reason", () => {
    const parsed = withdrawalReasonFormSchema.safeParse({ withdrawalReason: "  Pindah domisili  " });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.withdrawalReason).toBe("Pindah domisili");
  });

  it("rejects a whitespace-only reason with the Indonesian inline message", () => {
    const parsed = withdrawalReasonFormSchema.safeParse({ withdrawalReason: "   " });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toBe("Alasan keluar wajib diisi");
  });
});

describe("studentExtraMetadataFormSchema (Informasi Tambahan rows)", () => {
  it("accepts distinct, non-empty keys", () => {
    const parsed = studentExtraMetadataFormSchema.safeParse({
      rows: [
        { key: "hobi", value: "Menggambar" },
        { key: "cita-cita", value: "Dokter" },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty key on that row's own field", () => {
    const parsed = studentExtraMetadataFormSchema.safeParse({
      rows: [{ key: "", value: "x" }],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "rows.0.key");
    expect(issue?.message).toBe("Nama field wajib diisi");
  });

  it("rejects a duplicate key, pointing at the second row's key field", () => {
    const parsed = studentExtraMetadataFormSchema.safeParse({
      rows: [
        { key: "hobi", value: "Menggambar" },
        { key: "hobi", value: "Berenang" },
      ],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "rows.1.key");
    expect(issue?.message).toBe("Nama field harus unik");
    // The first (correct) occurrence gets no issue of its own.
    expect(parsed.error.issues.some((i) => i.path.join(".") === "rows.0.key")).toBe(false);
  });

  it("treats keys with different surrounding whitespace as the same duplicate", () => {
    const parsed = studentExtraMetadataFormSchema.safeParse({
      rows: [
        { key: "hobi", value: "a" },
        { key: " hobi ", value: "b" },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});

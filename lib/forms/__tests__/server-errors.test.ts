import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { applyServerErrors, FIELD_ERRORS_MESSAGE } from "../server-errors";
import { ApiError } from "@/lib/api/client-errors";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function fakeForm() {
  return {
    setError: vi.fn(),
    getValues: () => ({ name: "", nested: { a: 1 }, lines: [{ amount: 0 }] }),
  };
}

describe("applyServerErrors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("maps a known top-level field to setError with focus and shows the field-errors toast", () => {
    const form = fakeForm();
    const err = new ApiError("Validasi gagal", {
      status: 400,
      fieldErrors: [{ field: "name", message: "Nama wajib diisi" }],
    });

    applyServerErrors(form, err, "Gagal menyimpan");

    expect(form.setError).toHaveBeenCalledTimes(1);
    expect(form.setError).toHaveBeenCalledWith(
      "name",
      { type: "server", message: "Nama wajib diisi" },
      { shouldFocus: true },
    );
    expect(toast.error).toHaveBeenCalledWith(FIELD_ERRORS_MESSAGE);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("maps a known dotted-path field (nested.a) the same way", () => {
    const form = fakeForm();
    const err = new ApiError("Validasi gagal", {
      status: 400,
      fieldErrors: [{ field: "nested.a", message: "Tidak valid" }],
    });

    applyServerErrors(form, err, "Gagal menyimpan");

    expect(form.setError).toHaveBeenCalledWith(
      "nested.a",
      { type: "server", message: "Tidak valid" },
      { shouldFocus: true },
    );
    expect(toast.error).toHaveBeenCalledWith(FIELD_ERRORS_MESSAGE);
  });

  it("focuses only the first mapped field when several known fields error", () => {
    const form = fakeForm();
    const err = new ApiError("Validasi gagal", {
      status: 400,
      fieldErrors: [
        { field: "name", message: "Nama wajib diisi" },
        { field: "nested.a", message: "Tidak valid" },
      ],
    });

    applyServerErrors(form, err, "Gagal menyimpan");

    expect(form.setError).toHaveBeenCalledTimes(2);
    expect(form.setError).toHaveBeenNthCalledWith(
      1,
      "name",
      { type: "server", message: "Nama wajib diisi" },
      { shouldFocus: true },
    );
    expect(form.setError).toHaveBeenNthCalledWith(
      2,
      "nested.a",
      { type: "server", message: "Tidak valid" },
      { shouldFocus: false },
    );
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(FIELD_ERRORS_MESSAGE);
  });

  it("normalises a bracket-form field path (lines[0].amount) to the dotted RHF path (lines.0.amount)", () => {
    const form = fakeForm();
    const err = new ApiError("Validasi gagal", {
      status: 400,
      fieldErrors: [{ field: "lines[0].amount", message: "Jumlah tidak valid" }],
    });

    applyServerErrors(form, err, "Gagal menyimpan");

    expect(form.setError).toHaveBeenCalledTimes(1);
    expect(form.setError).toHaveBeenCalledWith(
      "lines.0.amount",
      { type: "server", message: "Jumlah tidak valid" },
      { shouldFocus: true },
    );
    expect(toast.error).toHaveBeenCalledWith(FIELD_ERRORS_MESSAGE);
  });

  it("falls back to root.server with the ApiError message when the field is unknown", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const form = fakeForm();
    const err = new ApiError("Kode sudah dipakai", {
      status: 409,
      fieldErrors: [{ field: "unknownField", message: "Tidak ditemukan di form" }],
    });

    applyServerErrors(form, err, "Gagal menyimpan");

    expect(form.setError).toHaveBeenCalledTimes(1);
    expect(form.setError).toHaveBeenCalledWith("root.server", {
      type: "server",
      message: "Kode sudah dipakai",
    });
    expect(toast.error).toHaveBeenCalledWith("Kode sudah dipakai");
    expect(toast.error).not.toHaveBeenCalledWith(FIELD_ERRORS_MESSAGE);
  });

  it("falls back to root.server with the fallback copy for a non-ApiError, never the raw message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const form = fakeForm();
    const err = new Error("ECONNRESET: socket hang up");

    applyServerErrors(form, err, "Gagal menyimpan");

    expect(form.setError).toHaveBeenCalledTimes(1);
    expect(form.setError).toHaveBeenCalledWith("root.server", {
      type: "server",
      message: "Gagal menyimpan",
    });
    expect(toast.error).toHaveBeenCalledWith("Gagal menyimpan");
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining("ECONNRESET"));
  });
});

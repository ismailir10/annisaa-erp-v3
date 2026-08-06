import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, userMessage } from "../client-errors";

describe("userMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to the Indonesian copy for a real parse-failure exception, never leaking the exception text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Reproduce the real failure: an empty-body 500 response whose
    // `.json()` rejects, exactly like the bug this helper fixes. Browsers
    // reject with `TypeError: Failed to execute 'json' on 'Response':
    // Unexpected end of JSON input`; Node's fetch (undici) rejects with a
    // `SyntaxError` carrying similar text. Either way it is NOT an
    // `ApiError`, which is the property under test.
    let caught: unknown;
    try {
      await new Response("", { status: 500 }).json();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ApiError);

    const message = userMessage(caught, "Gagal memuat kisi-kisi.");
    expect(message).toBe("Gagal memuat kisi-kisi.");
    expect(message).not.toMatch(/Unexpected end of JSON input/i);
  });

  it("passes an API-authored ApiError message through unchanged", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new ApiError("Triwulan tidak ditemukan.");
    expect(userMessage(err, "Gagal memuat kisi-kisi.")).toBe(
      "Triwulan tidak ditemukan.",
    );
  });

  it("always logs the raw error for debuggability", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    userMessage(err, "Gagal memuat data.");
    expect(spy).toHaveBeenCalledWith(err);
  });

  it("falls back for a plain Error that was not authored via ApiError", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("some internal detail");
    expect(userMessage(err, "Gagal memuat data.")).toBe("Gagal memuat data.");
  });
});

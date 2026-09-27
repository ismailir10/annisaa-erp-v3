import { afterEach, describe, expect, it, vi } from "vitest";

import { sendJson } from "../send-json";
import { ApiError } from "../client-errors";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendJson", () => {
  it("resolves with the parsed JSON body on a 2xx response", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "1", name: "Kegiatan A" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendJson(
      "/api/config/holidays",
      { method: "POST", body: { name: "Kegiatan A" } },
      "Gagal menyimpan",
    );

    expect(result).toEqual({ id: "1", name: "Kegiatan A" });
    expect(fetchMock).toHaveBeenCalledWith("/api/config/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Kegiatan A" }),
    });
  });

  it("resolves with null for an ok response with an empty body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      })),
    );

    const result = await sendJson("/api/config/holidays/1", { method: "DELETE" }, "Gagal menghapus");

    expect(result).toBeNull();
  });

  it("throws the ApiError built by readApiError, with fieldErrors, on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: "Validasi gagal",
          errors: [{ field: "name", message: "Nama sudah dipakai" }],
        }),
      })),
    );

    await expect(
      sendJson("/api/config/holidays", { method: "POST", body: { name: "x" } }, "Gagal menyimpan"),
    ).rejects.toMatchObject({
      message: "Validasi gagal",
      status: 400,
      fieldErrors: [{ field: "name", message: "Nama sudah dipakai" }],
    });

    let caught: unknown;
    try {
      await sendJson("/api/config/holidays", { method: "POST", body: { name: "x" } }, "Gagal menyimpan");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
  });

  it("omits the Content-Type header and body when no body is given", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => null }));
    vi.stubGlobal("fetch", fetchMock);

    await sendJson("/api/config/holidays/1", { method: "DELETE" }, "Gagal menghapus");

    expect(fetchMock).toHaveBeenCalledWith("/api/config/holidays/1", {
      method: "DELETE",
      headers: undefined,
      body: undefined,
    });
  });
});

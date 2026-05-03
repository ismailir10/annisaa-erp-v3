import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "../csp-report/route";

describe("POST /api/csp-report", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 204 and logs body on valid JSON", async () => {
    const logSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const req = new Request("http://localhost/api/csp-report", {
      method: "POST",
      body: JSON.stringify({
        "csp-report": { "violated-directive": "script-src" },
      }),
      headers: { "content-type": "application/csp-report" },
    });

    const res = await POST(req as never);

    expect(res.status).toBe(204);
    expect(logSpy).toHaveBeenCalledWith(
      "[csp-report]",
      expect.stringContaining("violated-directive"),
    );
  });

  it("returns 204 silently on malformed body", async () => {
    const logSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const req = new Request("http://localhost/api/csp-report", {
      method: "POST",
      body: "not json",
    });

    const res = await POST(req as never);

    expect(res.status).toBe(204);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("returns 413 when content-length exceeds 8KB cap", async () => {
    const logSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const big = "x".repeat(8 * 1024 + 1);
    const req = new Request("http://localhost/api/csp-report", {
      method: "POST",
      body: big,
      headers: { "content-length": String(big.length) },
    });

    const res = await POST(req as never);

    expect(res.status).toBe(413);
    expect(logSpy).not.toHaveBeenCalled();
  });
});

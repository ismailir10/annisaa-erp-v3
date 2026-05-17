import { describe, it, expect } from "vitest";
import { getClientIp } from "./rate-limit";

function reqWithHeaders(headers: Record<string, string>): Request {
  return new Request("https://example.com/", { headers });
}

describe("getClientIp", () => {
  it("returns the single x-forwarded-for entry", () => {
    expect(getClientIp(reqWithHeaders({ "x-forwarded-for": "1.2.3.4" }))).toBe(
      "1.2.3.4"
    );
  });

  it("returns the leftmost entry of a Vercel-shaped multi-entry x-forwarded-for", () => {
    expect(
      getClientIp(
        reqWithHeaders({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" })
      )
    ).toBe("1.2.3.4");
  });

  it("trims whitespace around the leftmost entry", () => {
    expect(
      getClientIp(reqWithHeaders({ "x-forwarded-for": " 1.2.3.4 , 5.6.7.8 " }))
    ).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    expect(getClientIp(reqWithHeaders({ "x-real-ip": "1.2.3.4" }))).toBe(
      "1.2.3.4"
    );
  });

  it("returns 'anonymous' when no client-IP header is present", () => {
    expect(getClientIp(reqWithHeaders({}))).toBe("anonymous");
  });
});

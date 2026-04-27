import { describe, it, expect } from "vitest";
import { XenditApiError, type XenditErrorCode } from "@/lib/xendit/client";
import {
  formatPaymentLinkError,
  prefixForError,
} from "@/lib/xendit/error-prefix";

describe("prefixForError — XenditApiError shapes", () => {
  it("returns the XenditApiError.code as prefix and preserves message", () => {
    const e = new XenditApiError({
      status: 503,
      code: "5xx",
      retriable: true,
      message: "Xendit API error: 503",
    });
    expect(prefixForError(e)).toEqual({
      prefix: "5xx",
      message: "Xendit API error: 503",
    });
  });

  it("emits the correct prefix for every XenditErrorCode value", () => {
    const codes: XenditErrorCode[] = [
      "5xx",
      "429",
      "408",
      "network",
      "401",
      "403",
      "422",
      "4xx",
      "unknown",
    ];
    for (const code of codes) {
      const e = new XenditApiError({
        status: code === "network" ? null : 500,
        code,
        retriable: false,
        message: `error for ${code}`,
      });
      expect(prefixForError(e).prefix).toBe(code);
    }
  });
});

describe("prefixForError — generic and odd error shapes", () => {
  it("returns prefix 'unknown' for a plain Error and preserves the message", () => {
    expect(prefixForError(new Error("boom"))).toEqual({
      prefix: "unknown",
      message: "boom",
    });
  });

  it("stringifies a non-Error throw (raw string) under 'unknown'", () => {
    expect(prefixForError("oops")).toEqual({
      prefix: "unknown",
      message: "oops",
    });
  });

  it("stringifies null and undefined under 'unknown'", () => {
    expect(prefixForError(null)).toEqual({
      prefix: "unknown",
      message: "null",
    });
    expect(prefixForError(undefined)).toEqual({
      prefix: "unknown",
      message: "undefined",
    });
  });
});

describe("formatPaymentLinkError — persisted string format", () => {
  it("formats XenditApiError as '<code>: <message>'", () => {
    const e = new XenditApiError({
      status: 401,
      code: "401",
      retriable: false,
      message: "Unauthorized",
    });
    expect(formatPaymentLinkError(e)).toBe("401: Unauthorized");
  });

  it("formats a plain Error as 'unknown: <message>'", () => {
    expect(formatPaymentLinkError(new Error("foo"))).toBe("unknown: foo");
  });

  it("formats a non-Error throw under the unknown prefix", () => {
    expect(formatPaymentLinkError("oops")).toBe("unknown: oops");
    expect(formatPaymentLinkError(null)).toBe("unknown: null");
  });
});

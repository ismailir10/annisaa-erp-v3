import { describe, it, expect } from "vitest";
import { escapeHtml } from "../escape";
import { salarySlipEmailHtml } from "../templates/salary-slip";

describe("escapeHtml", () => {
  it("escapes <script> tags", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("escapes ampersand and double quote", () => {
    expect(escapeHtml('Tom & Jerry "best"')).toBe("Tom &amp; Jerry &quot;best&quot;");
  });

  it("escapes single quote and angle brackets", () => {
    expect(escapeHtml("a'<b>c")).toBe("a&#39;&lt;b&gt;c");
  });

  it("returns empty string for null", () => {
    expect(escapeHtml(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeHtml(undefined)).toBe("");
  });

  it("passes safe text through unchanged", () => {
    expect(escapeHtml("Pak Budi")).toBe("Pak Budi");
  });
});

describe("salarySlipEmailHtml — XSS hardening", () => {
  it("escapes <script> in employeeName", () => {
    const html = salarySlipEmailHtml({
      employeeName: 'Ali <script>alert("xss")</script>',
      period: "Januari 2026",
      appUrl: "https://example.com",
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert");
  });

  it("escapes < in period", () => {
    const html = salarySlipEmailHtml({
      employeeName: "Ali",
      period: "<img src=x onerror=alert(1)>",
      appUrl: "https://example.com",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});

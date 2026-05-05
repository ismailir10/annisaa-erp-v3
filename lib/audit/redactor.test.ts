// Unit tests for the auto-generated audit redactor (lib/audit/redactor.ts).
//
// Tests the redact policy + mask:last4 policy + idempotency + edge cases
// (short values, null inputs, unknown models, nested-object passthrough).
// The generated file is checked into git and re-imported here — no
// fixture mocking, no per-test regeneration.
//
// Spec: docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §5.13
// Cycle: docs/cycles/2026-05-05-p1-audit-timeline-files.md
import { describe, expect, it } from "vitest";
import { PII_FIELDS, redact } from "./redactor";

describe("redactor — generated PII map", () => {
  it("contains Employee model with nik + phone fields", () => {
    expect(PII_FIELDS).toHaveProperty("Employee");
    expect(PII_FIELDS.Employee).toHaveProperty("nik");
    expect(PII_FIELDS.Employee).toHaveProperty("phone");
  });

  it("Employee.nik policy is 'redact'", () => {
    expect(PII_FIELDS.Employee.nik).toBe("redact");
  });

  it("Employee.phone policy is 'mask:last4'", () => {
    expect(PII_FIELDS.Employee.phone).toBe("mask:last4");
  });

  it("PII_FIELDS is frozen", () => {
    expect(Object.isFrozen(PII_FIELDS)).toBe(true);
  });
});

describe("redactor — redact policy (NIK)", () => {
  it("replaces NIK with null in `before` shape", () => {
    const input = { nik: "3275010101010001", name: "Bu Sari" };
    const out = redact("Employee", input, null);
    expect(out.before).toEqual({ nik: null, name: "Bu Sari" });
    expect(out.after).toBeNull();
  });

  it("replaces NIK with null in `after` shape", () => {
    const input = { nik: "3275010101010001", name: "Bu Sari" };
    const out = redact("Employee", null, input);
    expect(out.before).toBeNull();
    expect(out.after).toEqual({ nik: null, name: "Bu Sari" });
  });

  it("redacts NIK in both before and after when present", () => {
    const before = { nik: "OLD_NIK_VALUE", name: "Bu Sari" };
    const after = { nik: "NEW_NIK_VALUE", name: "Bu Sari" };
    const out = redact("Employee", before, after);
    expect((out.before as { nik: unknown }).nik).toBeNull();
    expect((out.after as { nik: unknown }).nik).toBeNull();
  });

  it("preserves non-PII fields verbatim alongside redacted NIK", () => {
    const input = {
      nik: "3275010101010001",
      name: "Bu Sari",
      email: "sari@an-nisaa.id",
      jobTitle: "kepala_sekolah",
    };
    const out = redact("Employee", input, null) as {
      before: { nik: unknown; name: string; email: string; jobTitle: string };
    };
    expect(out.before.nik).toBeNull();
    expect(out.before.name).toBe("Bu Sari");
    expect(out.before.email).toBe("sari@an-nisaa.id");
    expect(out.before.jobTitle).toBe("kepala_sekolah");
  });
});

describe("redactor — mask:last4 policy (phone)", () => {
  it("masks all but last 4 digits of an Indonesian mobile number", () => {
    const out = redact("Employee", { phone: "+6281234567890" }, null) as {
      before: { phone: string };
    };
    expect(out.before.phone).toBe("***7890");
  });

  it("preserves last 4 chars of an arbitrary string", () => {
    const out = redact("Employee", { phone: "abcdefghij" }, null) as {
      before: { phone: string };
    };
    expect(out.before.phone).toBe("***ghij");
  });

  it("masks short values (< 4 chars) as full '***' (no partial reveal)", () => {
    const out = redact("Employee", { phone: "12" }, null) as {
      before: { phone: string };
    };
    expect(out.before.phone).toBe("***");
  });

  it("masks empty string as '***'", () => {
    const out = redact("Employee", { phone: "" }, null) as {
      before: { phone: string };
    };
    expect(out.before.phone).toBe("***");
  });

  it("passes through non-string phone values unchanged", () => {
    const out = redact("Employee", { phone: null }, null) as {
      before: { phone: unknown };
    };
    expect(out.before.phone).toBeNull();
  });
});

describe("redactor — non-annotated fields preserved", () => {
  it("does not touch fields without a @PII annotation", () => {
    const input = { name: "Bu Sari", email: "sari@an-nisaa.id" };
    const out = redact("Employee", input, null);
    expect(out.before).toEqual({ name: "Bu Sari", email: "sari@an-nisaa.id" });
  });

  it("preserves nested object fields verbatim (no deep walk)", () => {
    const input = {
      nik: "3275010101010001",
      customFields: { foo: "bar", nested: { nik: "DEEP_NIK" } },
    };
    const out = redact("Employee", input, null) as {
      before: { nik: unknown; customFields: { foo: string; nested: { nik: string } } };
    };
    expect(out.before.nik).toBeNull();
    expect(out.before.customFields).toEqual({
      foo: "bar",
      nested: { nik: "DEEP_NIK" },
    });
  });
});

describe("redactor — idempotency", () => {
  it("re-applying redact to already-redacted NIK leaves null in place", () => {
    const once = redact("Employee", { nik: "3275010101010001" }, null);
    const twice = redact("Employee", once.before, null);
    expect((twice.before as { nik: unknown }).nik).toBeNull();
  });

  it("re-applying mask:last4 to already-masked phone is stable", () => {
    const once = redact("Employee", { phone: "+6281234567890" }, null) as {
      before: { phone: string };
    };
    expect(once.before.phone).toBe("***7890");

    const twice = redact("Employee", once.before, null) as {
      before: { phone: string };
    };
    // Last-4 of "***7890" = "7890" → output "***7890" (unchanged).
    expect(twice.before.phone).toBe("***7890");
  });

  it("re-applying mask:last4 to short '***' value remains '***'", () => {
    const once = redact("Employee", { phone: "12" }, null) as {
      before: { phone: string };
    };
    expect(once.before.phone).toBe("***");

    const twice = redact("Employee", once.before, null) as {
      before: { phone: string };
    };
    // Length 3 < 4 → returns '***' (unchanged).
    expect(twice.before.phone).toBe("***");
  });
});

describe("redactor — null / undefined / unknown-model handling", () => {
  it("returns { before: null, after: null } for null inputs", () => {
    const out = redact("Employee", null, null);
    expect(out).toEqual({ before: null, after: null });
  });

  it("returns { before: undefined, after: undefined } for undefined inputs", () => {
    const out = redact("Employee", undefined, undefined);
    expect(out.before).toBeUndefined();
    expect(out.after).toBeUndefined();
  });

  it("passes through inputs unchanged for unknown model", () => {
    const input = { nik: "EXPOSED_NIK", phone: "+6281234567890" };
    const out = redact("NotAModel", input, null);
    expect(out.before).toEqual(input);
  });

  it("ignores PII fields not present in input", () => {
    // No nik / phone in input — redactor doesn't add them.
    const input = { name: "Bu Sari" };
    const out = redact("Employee", input, null);
    expect(out.before).toEqual({ name: "Bu Sari" });
  });
});

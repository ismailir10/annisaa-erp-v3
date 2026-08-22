import { describe, it, expect } from "vitest";
import { createGuardianSchema, updateGuardianSchema } from "../guardian";
import { updateParentSchema } from "../parent";

/**
 * Found by preview-verify: submitting "Tambah Wali Baru" with the Email box
 * left blank toasted "Email tidak valid" and never reached the handler.
 * Every admin form seeds its text inputs to "", so a blank box submits an
 * empty string — and `z.string().email()` rejects it.
 *
 * That made a wali with no email impossible to create, which is precisely
 * the family the duplicate guard protects: an emailless parent is the one
 * that used to get a fresh Parent row for every child.
 */
describe("blank email is treated as absent, not invalid", () => {
  it("accepts an empty Email box when creating a guardian", () => {
    const parsed = createGuardianSchema.safeParse({
      name: "Dewi Siregar",
      relationship: "WALI",
      email: "",
    });
    expect(parsed.success).toBe(true);
    // undefined, not "" — the handler's `email = null` default then applies,
    // so the column is NULL rather than an empty string.
    expect(parsed.success && parsed.data.email).toBeUndefined();
  });

  it("accepts a whitespace-only Email box", () => {
    const parsed = createGuardianSchema.safeParse({
      name: "Dewi Siregar",
      relationship: "WALI",
      email: "   ",
    });
    expect(parsed.success).toBe(true);
  });

  it("still rejects a genuinely malformed address", () => {
    const parsed = createGuardianSchema.safeParse({
      name: "Dewi Siregar",
      relationship: "WALI",
      email: "not-an-email",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.message).toBe(
      "Email tidak valid",
    );
  });

  it("still accepts a valid address", () => {
    const parsed = createGuardianSchema.safeParse({
      name: "Dewi Siregar",
      relationship: "WALI",
      email: "dewi@example.com",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.email).toBe("dewi@example.com");
  });

  it("applies on the guardian update path too", () => {
    expect(updateGuardianSchema.safeParse({ email: "" }).success).toBe(true);
    expect(updateGuardianSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("applies on the parent update path — a wali with no email stays editable", () => {
    // The guardian detail page hydrates its form from `parent.email ?? ""`,
    // so saving any bio change on an emailless wali sent email: "".
    expect(updateParentSchema.safeParse({ name: "Dewi", email: "" }).success).toBe(true);
    expect(updateParentSchema.safeParse({ name: "Dewi", email: "nope" }).success).toBe(false);
  });

  it("keeps an explicit null working", () => {
    expect(createGuardianSchema.safeParse({
      name: "Dewi",
      relationship: "WALI",
      email: null,
    }).success).toBe(true);
  });
});

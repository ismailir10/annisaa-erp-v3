import { describe, it, expect } from "vitest";
import { updateUserSchema, userEditFormSchema } from "@/lib/validations/user";

describe("updateUserSchema", () => {
  it("accepts a status-only body (the quick activate/deactivate toggle)", () => {
    const res = updateUserSchema.safeParse({ status: "INACTIVE" });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.status).toBe("INACTIVE");
      expect(res.data.customRoleId).toBeUndefined();
    }
  });

  it("accepts a customRoleId-and-status body (the edit dialog)", () => {
    const res = updateUserSchema.safeParse({ customRoleId: "role-1", status: "ACTIVE" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.customRoleId).toBe("role-1");
  });

  it("preserves an explicit null customRoleId (clears the role)", () => {
    const res = updateUserSchema.safeParse({ customRoleId: null });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.customRoleId).toBeNull();
  });

  it("silently drops an unrecognized status instead of erroring (matches the old in-route check)", () => {
    const res = updateUserSchema.safeParse({ status: "DELETED" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.status).toBeUndefined();
  });

  it("accepts an empty body", () => {
    expect(updateUserSchema.safeParse({}).success).toBe(true);
  });
});

describe("userEditFormSchema", () => {
  it("requires a selection for both fields", () => {
    expect(userEditFormSchema.safeParse({ customRoleId: "none", status: "ACTIVE" }).success).toBe(true);
    expect(userEditFormSchema.safeParse({ customRoleId: "", status: "ACTIVE" }).success).toBe(false);
  });
});

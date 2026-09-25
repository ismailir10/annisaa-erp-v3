import { describe, expect, it } from "vitest";
import { adminWorkPermissions, canViewAdminActivity } from "../admin-work-queue";
import { invoiceCapabilities } from "@/lib/finance/invoice-capabilities";

const session = (permissions: string[]) => ({ role: "SCHOOL_ADMIN", permissions });
describe("dashboard destination and finance capabilities", () => {
  it("requires the HR destination gate as well as approval permissions", () => {
    expect(adminWorkPermissions(session(["leave.view", "leave.approve", "payroll.view", "payroll.approve"]))).toMatchObject({ leave: false, payroll: false });
    expect(adminWorkPermissions(session(["hr.view", "leave.view", "leave.approve", "payroll.view", "payroll.approve"]))).toMatchObject({ leave: true, payroll: true });
  });
  it("does not offer approvals to view-only roles", () => {
    expect(adminWorkPermissions(session(["hr.view", "leave.view", "payroll.view", "admissions.view", "invoices.view"]))).toEqual({ enrollments: false, leave: false, payroll: false, invoices: false });
  });
  it("does not reveal employee activity to HR roles lacking directory access", () => {
    expect(canViewAdminActivity(session(["hr.view"]), "/admin/employees")).toBe(false);
    expect(canViewAdminActivity(session(["hr.view", "employees.view"]), "/admin/employees")).toBe(true);
    expect(canViewAdminActivity(session(["employees.view"]), "/admin/employees")).toBe(false);
    expect(canViewAdminActivity(session(["hr.view", "employees.view"]), "/admin/payroll")).toBe(false);
  });
  it("keeps creating invoices, recording payments and voiding independent", () => {
    expect(invoiceCapabilities(session(["payments.record"]))).toEqual({ create: false, recordPayment: true, void: false });
    expect(invoiceCapabilities(session(["invoices.create"]))).toEqual({ create: true, recordPayment: false, void: false });
    expect(invoiceCapabilities(session(["invoices.void"]))).toEqual({ create: false, recordPayment: false, void: true });
  });
});

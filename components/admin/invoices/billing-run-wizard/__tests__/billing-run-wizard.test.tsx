/**
 * Cycle 3 T7 — the wizard shell's hand-rolled `useIsMobile` +
 * Dialog/Sheet branch was replaced with `ResponsiveFormDialog` (size
 * "2xl"). Steps (ScopeStep/ReviewStep/CommitStep) are unchanged — this
 * only covers the shell: title/description render on both the desktop
 * Dialog and the mobile Sheet, and step 1 still mounts and works inside
 * it. `ScopeStep`'s own behaviour is covered directly by
 * `components/admin/invoices/__tests__/billing-scope-year.test.tsx`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BillingRunWizard } from "../billing-run-wizard";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/admin/student-picker", () => ({ StudentPicker: () => null }));
vi.mock("@/components/admin/class-section-picker", () => ({
  ClassSectionMultiPicker: () => <div />,
}));

const YEARS = [{ id: "ay-1", name: "2026/2027", status: "ACTIVE" }];

function stubFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/class-sections")) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("BillingRunWizard shell (ResponsiveFormDialog)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("desktop: renders as a Dialog with the wizard title/description and step 1", async () => {
    vi.stubGlobal("fetch", stubFetch());
    const onOpenChange = vi.fn();
    render(
      <BillingRunWizard
        open
        onOpenChange={onOpenChange}
        resumeRunId={null}
        years={YEARS}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Buat Tagihan (Wizard)" });
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(screen.getByText("Tentukan cakupan, tinjau baris tagihan, lalu komit.")).toBeInTheDocument();
    expect(screen.getByText("Langkah 1: Cakupan")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Batal" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("mobile: renders as a Sheet with the same title", async () => {
    vi.doMock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
    vi.resetModules();
    const { BillingRunWizard: MobileWizard } = await import("../billing-run-wizard");
    vi.stubGlobal("fetch", stubFetch());

    render(
      <MobileWizard
        open
        onOpenChange={vi.fn()}
        resumeRunId={null}
        years={YEARS}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Buat Tagihan (Wizard)" });
    expect(dialog).toHaveAttribute("data-slot", "sheet-content");
    vi.doUnmock("@/hooks/use-mobile");
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DeactivateConfirmDialog } from "@/components/admin/deactivate-confirm-dialog";

describe("DeactivateConfirmDialog", () => {
  it("uses the canonical delete label", () => {
    render(
      <DeactivateConfirmDialog
        open
        onOpenChange={vi.fn()}
        entityName="Admin Keuangan"
        action="delete"
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Ya, Hapus" })).toBeEnabled();
  });

  it("shows the pending state and disables both actions", () => {
    render(
      <DeactivateConfirmDialog
        open
        onOpenChange={vi.fn()}
        entityName="Admin Keuangan"
        action="delete"
        onConfirm={vi.fn()}
        pending
      />,
    );

    expect(screen.getByRole("button", { name: "Memproses..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Batal" })).toBeDisabled();
  });
});

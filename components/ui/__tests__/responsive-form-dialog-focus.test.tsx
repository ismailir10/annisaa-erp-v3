import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResponsiveFormDialog } from "../responsive-form-dialog";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Tambah Siswa</button>
      <ResponsiveFormDialog open={open} onOpenChange={setOpen} title="Tambah Siswa Baru" footer={<button>Simpan</button>}>
        <input aria-label="Nama" />
      </ResponsiveFormDialog>
    </>
  );
}

describe("ResponsiveFormDialog focus return (CORE-12)", () => {
  it("puts focus back on the opener after Escape closes the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Tambah Siswa" });
    opener.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

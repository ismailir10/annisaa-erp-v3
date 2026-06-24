import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DataTableToolbar } from "@/components/ui/data-table-toolbar";

describe("DataTableToolbar", () => {
  it("uses parent-controlled search state", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    const { rerender } = render(
      <DataTableToolbar
        value=""
        onValueChange={onValueChange}
        searchPlaceholder="Cari siswa..."
      />,
    );

    await user.type(screen.getByPlaceholderText("Cari siswa..."), "A");
    expect(onValueChange).toHaveBeenCalledWith("A");

    rerender(
      <DataTableToolbar
        value="Aisyah"
        onValueChange={onValueChange}
        searchPlaceholder="Cari siswa..."
      />,
    );

    expect(screen.getByPlaceholderText("Cari siswa...")).toHaveValue("Aisyah");
  });

  it("keeps controlled value compatible with the legacy onSearchChange callback", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();

    render(
      <DataTableToolbar
        value=""
        onSearchChange={onSearchChange}
        searchPlaceholder="Cari siswa..."
      />,
    );

    await user.type(screen.getByPlaceholderText("Cari siswa..."), "A");

    expect(onSearchChange).toHaveBeenCalledWith("A");
  });

  it("resets search and filters from the toolbar", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onStatusChange = vi.fn();

    render(
      <DataTableToolbar
        value="Aisyah"
        onValueChange={onValueChange}
        filters={[
          {
            key: "status",
            label: "Status",
            value: "ACTIVE",
            onChange: onStatusChange,
            options: [
              { value: "all", label: "Semua Status" },
              { value: "ACTIVE", label: "Aktif" },
            ],
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(onValueChange).toHaveBeenCalledWith("");
    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith("all");
    });
  });
});

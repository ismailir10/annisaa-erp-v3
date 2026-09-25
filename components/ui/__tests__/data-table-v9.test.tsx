import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";

import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";

type Row = { name: string };

const columns: LegacyColumnDef<Row>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => row.original.name,
  },
];

const rowNames = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getByRole("cell").textContent);

const clientPagination = (data: Row[], page = 1, pageSize = 10) => ({
  page,
  pageSize,
  total: data.length,
  totalPages: Math.max(1, Math.ceil(data.length / pageSize)),
});

describe("DataTable with TanStack Table v9 compatibility types", () => {
  it("sorts interactively in both directions and applies sorting to replacement data", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DataTable columns={columns} data={[{ name: "Zaki" }, { name: "Aisyah" }]} />,
    );

    const sortButton = screen.getByRole("button", { name: /name/i });
    await user.click(sortButton);
    expect(rowNames()).toEqual(["Aisyah", "Zaki"]);

    await user.click(sortButton);
    expect(rowNames()).toEqual(["Zaki", "Aisyah"]);

    rerender(
      <DataTable columns={columns} data={[{ name: "Budi" }, { name: "Dina" }]} />,
    );
    expect(rowNames()).toEqual(["Dina", "Budi"]);
  });

  it("reports server sorting and page changes without reordering or reslicing the supplied page", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const onPageChange = vi.fn();
    const serverPage = [{ name: "Server C" }, { name: "Server A" }];

    render(
      <DataTable
        columns={columns}
        data={serverPage}
        pagination={{ page: 2, pageSize: 2, total: 6, totalPages: 3 }}
        onSortChange={onSortChange}
        onPageChange={onPageChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /name/i }));
    expect(onSortChange).toHaveBeenLastCalledWith("name", "asc");
    expect(rowNames()).toEqual(["Server C", "Server A"]);

    await user.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(rowNames()).toEqual(["Server C", "Server A"]);
    expect(screen.getByText("Hal. 2/3")).toBeInTheDocument();
  });

  it("resets client pagination when page size changes and clamps after data shrinks", async () => {
    const user = userEvent.setup();
    const data = Array.from({ length: 25 }, (_, index) => ({
      name: `Student ${String(index + 1).padStart(2, "0")}`,
    }));
    const { rerender } = render(
      <DataTable columns={columns} data={data} pagination={clientPagination(data)} />,
    );

    expect(rowNames()).toHaveLength(10);
    await user.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
    expect(rowNames()[0]).toBe("Student 11");

    await user.click(screen.getByRole("combobox", { name: "Baris per halaman" }));
    await user.click(await screen.findByRole("option", { name: "20" }));
    expect(screen.getByText("Hal. 1/2")).toBeInTheDocument();
    expect(rowNames()).toHaveLength(20);
    expect(rowNames()[0]).toBe("Student 01");

    await user.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
    expect(rowNames()[0]).toBe("Student 21");

    const shorterData = data.slice(0, 12);
    rerender(
      <DataTable
        columns={columns}
        data={shorterData}
        pagination={clientPagination(shorterData, 1, 10)}
      />,
    );
    expect(screen.getByText("Hal. 1/1")).toBeInTheDocument();
    expect(rowNames()).toEqual(shorterData.map((row) => row.name));
  });
});

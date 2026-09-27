import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LegacyColumnDef as ColumnDef } from "@tanstack/react-table/legacy";

import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";

type Row = { name: string };

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nama" />
    ),
    cell: ({ row }) => row.original.name,
  },
];

describe("DataTable", () => {
  it("sorts the full filtered dataset before client-side pagination", async () => {
    const user = userEvent.setup();
    const data = [
      "Zaki",
      "Yusuf",
      "Xavier",
      "Wahid",
      "Vina",
      "Umar",
      "Tara",
      "Sari",
      "Rafi",
      "Qila",
      "Aisyah",
    ].map((name) => ({ name }));

    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{ page: 1, pageSize: 10, total: data.length, totalPages: 2 }}
        defaultSort={{ field: "name", order: "asc" }}
      />,
    );

    expect(screen.getByText("Aisyah")).toBeInTheDocument();
    expect(screen.queryByText("Zaki")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Halaman berikutnya/i }));

    expect(screen.getByText("Zaki")).toBeInTheDocument();
    expect(screen.queryByText("Aisyah")).not.toBeInTheDocument();
  });

  it("omits any CTA on the empty state when emptyAction isn't passed", () => {
    render(<DataTable columns={columns} data={[]} emptyTitle="Belum ada data" />);
    expect(screen.getByText("Belum ada data")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders emptyAction as a click CTA on the empty state (Cycle 3 T7)", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyTitle="Belum ada data"
        emptyAction={{ label: "Tambah Data", onClick }}
      />,
    );
    const button = screen.getByRole("button", { name: "Tambah Data" });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders emptyAction as a link CTA on the empty state when href is passed", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyTitle="Belum ada data"
        emptyAction={{ label: "Buka Halaman", href: "/admin/somewhere" }}
      />,
    );
    const link = screen.getByRole("link", { name: "Buka Halaman" });
    expect(link).toHaveAttribute("href", "/admin/somewhere");
  });
});

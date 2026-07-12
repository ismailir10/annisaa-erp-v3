import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnDef } from "@tanstack/react-table";

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
});

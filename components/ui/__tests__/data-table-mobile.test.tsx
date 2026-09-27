import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";

import { DataTable } from "@/components/ui/data-table";

type Row = { name: string; createdAt: string };

// T1 (cycle 2026-09-26, admin-ui-standard-c1) — the DataTable mobile
// contract: a `meta.priority: "low"` column hides below `md`, and the
// row-actions column (id "actions") sticks to the right edge below `md`.
const columns: LegacyColumnDef<Row>[] = [
  {
    accessorKey: "name",
    header: "Nama",
    cell: ({ row }) => row.original.name,
  },
  {
    accessorKey: "createdAt",
    header: "Dibuat",
    cell: ({ row }) => row.original.createdAt,
    meta: { priority: "low" },
  },
  {
    id: "actions",
    header: "Aksi",
    cell: () => "•••",
  },
];

const data: Row[] = [{ name: "Aisyah", createdAt: "2026-01-01" }];

describe("DataTable mobile contract", () => {
  it("hides a low-priority column's header and cell below md, and shows it back at md+", () => {
    render(<DataTable columns={columns} data={data} />);

    const headerRow = screen.getAllByRole("row")[0];
    const dibuatHeader = headerRow.querySelectorAll("th")[1];
    expect(dibuatHeader).toHaveClass("hidden");
    expect(dibuatHeader).toHaveClass("md:table-cell");

    const bodyRow = screen.getAllByRole("row")[1];
    const dibuatCell = bodyRow.querySelectorAll("td")[1];
    expect(dibuatCell).toHaveClass("hidden");
    expect(dibuatCell).toHaveClass("md:table-cell");
  });

  it("does not hide a normal-priority column", () => {
    render(<DataTable columns={columns} data={data} />);

    const headerRow = screen.getAllByRole("row")[0];
    const namaHeader = headerRow.querySelectorAll("th")[0];
    expect(namaHeader).not.toHaveClass("hidden");
  });

  it("makes the actions column (id: \"actions\") sticky on the right below md", () => {
    render(<DataTable columns={columns} data={data} />);

    const headerRow = screen.getAllByRole("row")[0];
    const actionsHeader = headerRow.querySelectorAll("th")[2];
    expect(actionsHeader).toHaveClass("sticky");
    expect(actionsHeader).toHaveClass("right-0");
    expect(actionsHeader).toHaveClass("md:static");

    const bodyRow = screen.getAllByRole("row")[1];
    const actionsCell = bodyRow.querySelectorAll("td")[2];
    expect(actionsCell).toHaveClass("sticky");
    expect(actionsCell).toHaveClass("right-0");
    expect(actionsCell).toHaveClass("md:static");
  });

  it("also hides low-priority columns and stickies the actions column in the loading skeleton, so layout doesn't jump", () => {
    render(<DataTable columns={columns} data={[]} loading />);

    const headerRow = screen.getAllByRole("row")[0];
    const headers = headerRow.querySelectorAll("th");
    expect(headers[1]).toHaveClass("hidden");
    expect(headers[1]).toHaveClass("md:table-cell");
    expect(headers[2]).toHaveClass("sticky");
    expect(headers[2]).toHaveClass("right-0");
  });
});

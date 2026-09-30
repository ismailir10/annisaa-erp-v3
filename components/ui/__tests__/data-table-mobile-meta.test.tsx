import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable } from "../data-table";
import { DataTableMobileMeta } from "../data-table-mobile-meta";

describe("<DataTableMobileMeta> (CORE-7 / FIN-21 / ACAD-10)", () => {
  it("only shows below md and wraps, so the identity column can shrink", () => {
    render(<DataTableMobileMeta>TKIT A · Aktif</DataTableMobileMeta>);
    const el = screen.getByText("TKIT A · Aktif");
    expect(el).toHaveClass("md:hidden", "whitespace-normal", "flex-wrap");
  });

  it("pairs with priority:low columns: those cells are hidden below md while the meta stays in the identity cell", () => {
    render(
      <DataTable
        columns={[
          { id: "name", header: "Nama", cell: () => <span>Budi<DataTableMobileMeta>Kelas A</DataTableMobileMeta></span> },
          { id: "status", header: "Status", meta: { priority: "low" }, cell: () => <span>Aktif</span> },
        ]}
        data={[{}]}
      />,
    );
    expect(screen.getByText("Aktif").closest("td")).toHaveClass("hidden", "md:table-cell");
    expect(screen.getByText("Kelas A")).toHaveClass("md:hidden");
  });
});

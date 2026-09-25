import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTablePagination } from "../data-table-pagination";
import { DataTableRowActions } from "../data-table-row-actions";

describe("DataTable navigation labels", () => {
  it("names actions for the current row", () => {
    render(<DataTableRowActions rowLabel="Alya Putri" onView={() => {}} onEdit={() => {}} />);
    expect(screen.getByRole("button", { name: "Lihat Alya Putri" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aksi untuk Alya Putri" })).toBeInTheDocument();
  });

  it("keeps stable fallback labels for existing callers", () => {
    render(<DataTableRowActions onView={() => {}} onEdit={() => {}} />);
    expect(screen.getByRole("button", { name: "Lihat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buka menu aksi" })).toBeInTheDocument();
  });

  it("announces page destinations and an empty result range", () => {
    render(<DataTablePagination page={1} pageSize={10} total={0} totalPages={1} />);
    expect(screen.getByText("Menampilkan 0–0 dari 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Halaman berikutnya, 1" })).toBeDisabled();
  });
});

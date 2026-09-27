import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataTableLinkCell } from "../data-table-link-cell";

describe("DataTableLinkCell", () => {
  it("renders the name as a link to the detail page", () => {
    render(<DataTableLinkCell href="/admin/students/s1">Alya Putri</DataTableLinkCell>);
    expect(screen.getByRole("link", { name: "Alya Putri" })).toHaveAttribute("href", "/admin/students/s1");
  });

  it("renders a button when viewing opens an overlay", () => {
    const onClick = vi.fn();
    render(<DataTableLinkCell onClick={onClick}>INV-001</DataTableLinkCell>);
    fireEvent.click(screen.getByRole("button", { name: "INV-001" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows the secondary line outside the link's accessible name", () => {
    render(
      <DataTableLinkCell href="/admin/guardians/g1" description="0812 3456 7890">
        Ibu Sari
      </DataTableLinkCell>,
    );
    expect(screen.getByRole("link", { name: "Ibu Sari" })).toBeInTheDocument();
    expect(screen.getByText("0812 3456 7890")).toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable } from "../data-table";

const columns = [{ id: "name", header: "Nama", cell: () => null }];

describe("DataTable empty state (CORE-9 / FIN-12)", () => {
  it("shows the first-run copy and CTA when nothing is filtered", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyTitle="Belum ada siswa terdaftar"
        emptyDescription="Mulai dengan menambahkan siswa baru."
        emptyAction={{ label: "Tambah Siswa", onClick: () => {} }}
      />,
    );
    expect(screen.getByText("Belum ada siswa terdaftar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tambah Siswa" })).toBeInTheDocument();
  });

  it("says nothing matches (no first-run copy, no add CTA) while a search or filter is active", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        isFiltered
        emptyTitle="Belum ada siswa terdaftar"
        emptyDescription="Mulai dengan menambahkan siswa baru."
        emptyAction={{ label: "Tambah Siswa", onClick: () => {} }}
      />,
    );
    expect(screen.getByText("Tidak ada hasil yang cocok")).toBeInTheDocument();
    expect(screen.queryByText("Belum ada siswa terdaftar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tambah Siswa" })).not.toBeInTheDocument();
  });
});

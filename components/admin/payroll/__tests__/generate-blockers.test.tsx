import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PayrollGenerateBlockersAlert } from "../generate-blockers";

describe("<PayrollGenerateBlockersAlert>", () => {
  it("names each blocked employee with a link to where it is fixed", () => {
    render(
      <PayrollGenerateBlockersAlert
        blockers={{
          error: "Beberapa karyawan belum memiliki struktur gaji",
          employees: [
            { id: "e1", kode: "E1", nama: "Satu", reason: "salary structure missing" },
            { id: "e2", kode: "E2", nama: "Dua", reason: "rekening missing" },
          ],
        }}
      />,
    );
    expect(screen.getByText(/Beberapa karyawan belum memiliki struktur gaji/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Isi struktur gaji" })).toHaveAttribute("href", "/admin/employees/e1#salary");
    expect(screen.getByRole("link", { name: "Lengkapi rekening" })).toHaveAttribute("href", "/admin/employees/e2#profile");
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "../page-header";

describe("PageHeader", () => {
  it("renders the title as an h1", () => {
    render(<PageHeader title="Tagihan" />);
    const heading = screen.getByRole("heading", { level: 1, name: "Tagihan" });
    expect(heading).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(
      <PageHeader
        title="Beranda"
        subtitle="Portal Orang Tua — An Nisaa' Sekolahku"
      />,
    );
    expect(
      screen.getByText("Portal Orang Tua — An Nisaa' Sekolahku"),
    ).toBeInTheDocument();
  });

  it("omits the subtitle paragraph when subtitle is absent", () => {
    const { container } = render(<PageHeader title="Kehadiran" />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("renders actions slot when provided", () => {
    render(
      <PageHeader
        title="Laporan"
        actions={<button type="button">Filter</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Filter" }),
    ).toBeInTheDocument();
  });
});

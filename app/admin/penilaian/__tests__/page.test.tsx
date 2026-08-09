import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AdminPenilaianPage from "../page";

function payload() {
  return {
    data: {
      academicYear: "2026/2027",
      weekDate: "2026-08-03",
      sentraDate: "2026-08-05",
      week: { id: "week-1", number: 1, subThemeName: "Sub Tema", themeName: "Tema" },
      walas: [
        { classSectionId: "cs-1", className: "TK B 1", programName: "TK", enrolled: 10, assessed: 4 },
      ],
      sentra: [{ center: "WORSHIP", entries: 3, studentsAssessed: 3 }],
    },
  };
}

function stubFetchOnce() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload(),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AdminPenilaianPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders an H1 matching the nav label 'Pemantauan', not 'Penilaian'", async () => {
    stubFetchOnce();
    render(<AdminPenilaianPage />);

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Pemantauan");
    expect(heading).not.toHaveTextContent("Penilaian");
  });

  it("renders the sentra entry date as Indonesian formatted text, never the raw YYYY-MM-DD API string", async () => {
    stubFetchOnce();
    render(<AdminPenilaianPage />);

    const dateText = await screen.findByText(/Entri pada/);
    expect(dateText.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(dateText.textContent).toContain("Agustus 2026");
  });

  it("uses the status-late token family (not primary) for an in-progress completion badge", async () => {
    stubFetchOnce();
    render(<AdminPenilaianPage />);

    const badge = await screen.findByText("4/10 dinilai");
    expect(badge.className).toContain("status-late");
    expect(badge.className).not.toContain("text-primary");
  });
});

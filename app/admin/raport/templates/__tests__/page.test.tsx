import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import RaportTemplatesPage from "../page";
import { TOTAL_TEMPLATE_SLOTS } from "@/lib/raport/templates";

function stubFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/admin/terms")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "term-1",
              number: 1,
              semester: { number: 1, academicYear: { name: "2026/2027" } },
            },
          ],
        }),
      });
    }
    // /api/admin/raport/templates
    return Promise.resolve({
      ok: true,
      json: async () => ({ data: { bucketed: {}, closing: {} } }),
    });
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return fetchMock;
}

describe("RaportTemplatesPage header action", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("labels the header link verb-first, matching the sibling Penilaian page", async () => {
    stubFetch();
    render(<RaportTemplatesPage />);

    const link = await screen.findByRole("link", { name: "Susun Raport" });
    expect(link).toHaveAttribute("href", "/admin/raport");
    expect(screen.queryByRole("link", { name: "Ke Raport Siswa" })).not.toBeInTheDocument();
  });

  it("renders the filled-slot counter with tabular figures", async () => {
    stubFetch();
    render(<RaportTemplatesPage />);

    const counter = await screen.findByText(`0/${TOTAL_TEMPLATE_SLOTS}`);
    expect(counter).toHaveClass("font-currency");
  });
});

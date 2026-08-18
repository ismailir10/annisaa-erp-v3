import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WeeklyClient } from "../client";

/**
 * Regression: the walas IKTP picker.
 *
 * The UI Consistency Sweep (#369) wrapped a raw `<select>` inside
 * `<NativeSelect>` — which IS a `<select>` — producing
 * `<select><select>…</select></select>`. The parser collapses that: the visible
 * outer select rendered ZERO options and the real picker got a 0×0 box, so on
 * staging the walas could not change IKTP at all and every level silently wrote
 * against `indicators[0]` (1 of 9 available), with nothing on screen naming the
 * indicator being graded. React also threw hydration error #418 on the page.
 *
 * These pin the shape (one select, all options, selectable) rather than the
 * styling, so a future component swap is free as long as the control works.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const week = {
  id: "week-1",
  number: 3,
  startDate: "2026-05-11",
  endDate: "2026-05-15",
  subTheme: { id: "sub-1", name: "Diriku" },
  theme: { id: "theme-1", name: "Aku" },
};

const indicators = [
  {
    id: "indicator-1",
    content: "Mengucap basmalah sebelum memulai kegiatan",
    order: 1,
    objective: { id: "obj-1", ageGroup: "B", element: "RELIGIOUS_MORAL" },
  },
  {
    id: "indicator-2",
    content: "Menyebutkan nama lengkap dan nama panggilannya",
    order: 2,
    objective: { id: "obj-2", ageGroup: "B", element: "IDENTITY" },
  },
  {
    id: "indicator-3",
    content: "Menggambar bebas dan menceritakan hasil karyanya",
    order: 3,
    objective: { id: "obj-3", ageGroup: "B", element: "ART" },
  },
];

function renderClient(inds = indicators) {
  return render(
    <WeeklyClient
      initialDate="2026-05-11"
      week={week}
      classSection={{ id: "class-1", name: "TK-B Anggur", ageGroup: "B" }}
      students={[
        { id: "student-1", name: "Aisyah", nickname: null, status: "ACTIVE" },
      ]}
      indicators={inds}
      initialEntries={[]}
    />,
  );
}

describe("WeeklyClient IKTP picker", () => {
  it("renders exactly one select — never a select nested in a select", () => {
    const { container } = renderClient();

    const selects = container.querySelectorAll("select");
    expect(selects).toHaveLength(1);
    expect(container.querySelector("select select")).toBeNull();
  });

  it("exposes every indicator as an option on the rendered select", () => {
    const { container } = renderClient();

    const select = container.querySelector("select")!;
    expect(select.options).toHaveLength(indicators.length);
    // The element prefix is rendered through formatCurriculumElement, so the
    // teacher reads an Indonesian element name — never the raw enum key.
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Nilai Agama & Budi Pekerti · Mengucap basmalah sebelum memulai kegiatan",
      "Jati Diri · Menyebutkan nama lengkap dan nama panggilannya",
      "Seni · Menggambar bebas dan menceritakan hasil karyanya",
    ]);
  });

  it("keeps the label wired to the control", () => {
    renderClient();

    const select = screen.getByLabelText("Indikator Ketercapaian (IKTP)");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveAttribute("id", "indicator-picker");
  });

  it("lets the walas switch to another IKTP", async () => {
    const user = userEvent.setup();
    const { container } = renderClient();
    const select = container.querySelector("select")! as HTMLSelectElement;

    // Defaults to the first indicator — that default was the only reachable
    // value while the picker was broken.
    expect(select.value).toBe("indicator-1");

    await user.selectOptions(select, "indicator-3");
    expect(select.value).toBe("indicator-3");
  });

  it("shows the admin-facing empty state instead of a select when no IKTP is linked", () => {
    const { container } = renderClient([]);

    expect(container.querySelector("select")).toBeNull();
    expect(
      screen.getByText(/Belum ada IKTP terhubung untuk tema pekan ini/),
    ).toBeInTheDocument();
  });
});

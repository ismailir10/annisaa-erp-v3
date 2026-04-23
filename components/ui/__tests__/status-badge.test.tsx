import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Star } from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";

describe("StatusBadge", () => {
  it("renders the canonical label in the default (solid) variant", () => {
    render(<StatusBadge status="PRESENT" />);
    expect(screen.getByText("Hadir")).toBeInTheDocument();
  });

  it("renders an auto-selected icon in the intent variant", () => {
    const { container } = render(<StatusBadge status="PRESENT" variant="intent" />);
    // Intent variant uses a <span> wrapper; the icon is an <svg> child.
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(screen.getByText("Hadir")).toBeInTheDocument();
  });

  it("honors an icon override in the intent variant", () => {
    const { container } = render(
      <StatusBadge status="PRESENT" variant="intent" icon={Star} />,
    );
    // Star's lucide class name is "lucide-star".
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class") ?? "").toMatch(/lucide-star/i);
  });

  it("renders SICK with the amber (status-late) tone, not red (status-absent)", () => {
    render(<StatusBadge status="SICK" />);
    const badge = screen.getByText("Sakit");
    expect(badge.className).toContain("status-late-subtle");
    expect(badge.className).not.toContain("status-absent-subtle");
  });

  it("defaults ABSENT label to 'Alpa' per voice.md glossary", () => {
    render(<StatusBadge status="ABSENT" />);
    expect(screen.getByText("Alpa")).toBeInTheDocument();
  });
});

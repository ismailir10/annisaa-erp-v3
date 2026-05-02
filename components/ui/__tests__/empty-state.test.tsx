import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("default (neutral accent) renders icon inside muted circle — byte-equivalent to pre-S2 behavior", () => {
    const { container } = render(<EmptyState title="Belum ada data" />);
    expect(screen.getByText("Belum ada data")).toBeInTheDocument();
    // Muted circle present, accent-specific testids absent.
    const muted = container.querySelector(".bg-muted");
    expect(muted).not.toBeNull();
    expect(screen.queryByTestId("empty-state-icon-warm")).toBeNull();
    expect(screen.queryByTestId("empty-state-icon-celebration")).toBeNull();
    expect(screen.queryByTestId("empty-state-sparkles")).toBeNull();
  });

  it("warm accent renders primary-tinted circle (no muted circle, no sparkles)", () => {
    const { container } = render(
      <EmptyState title="Belum ada tagihan" description="Insyaallah segera muncul" accent="warm" />,
    );
    const warm = screen.getByTestId("empty-state-icon-warm");
    expect(warm).toBeInTheDocument();
    expect(warm.className).toContain("bg-primary/10");
    // No neutral muted circle.
    expect(container.querySelector(".bg-muted")).toBeNull();
    expect(screen.queryByTestId("empty-state-sparkles")).toBeNull();
    expect(screen.getByText("Insyaallah segera muncul")).toBeInTheDocument();
  });

  it("celebration accent renders gold-tinted circle with Sparkles decoration", () => {
    render(<EmptyState title="Alhamdulillah, semua lunas" accent="celebration" />);
    const celebration = screen.getByTestId("empty-state-icon-celebration");
    expect(celebration).toBeInTheDocument();
    expect(celebration.className).toContain("bg-celebration-gold-subtle");
    const sparkles = screen.getByTestId("empty-state-sparkles");
    expect(sparkles).toBeInTheDocument();
    expect(sparkles.getAttribute("class")).toContain("text-celebration-gold");
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { SummaryHero, type SummaryHeroTone } from "../summary-hero";

describe("SummaryHero", () => {
  it("renders as a region landmark with primary text", () => {
    render(<SummaryHero primary="Rp 1.700.000" />);
    const region = screen.getByRole("region");
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent("Rp 1.700.000");
  });

  it("renders secondary meta line when provided", () => {
    render(
      <SummaryHero
        primary="Rp 1.700.000"
        secondary="3 tagihan · jatuh tempo 28 Apr"
      />,
    );
    expect(
      screen.getByText("3 tagihan · jatuh tempo 28 Apr"),
    ).toBeInTheDocument();
  });

  it("renders the icon when provided", () => {
    const { container } = render(
      <SummaryHero tone="danger" icon={AlertTriangle} primary="Attention" />,
    );
    // Lucide icons render as <svg>. Verify presence.
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("omits the icon node when not provided", () => {
    const { container } = render(<SummaryHero primary="No icon" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders the action slot when provided", () => {
    render(
      <SummaryHero
        primary="Rp 0"
        action={<button type="button">Lihat cara bayar</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Lihat cara bayar" }),
    ).toBeInTheDocument();
  });

  // Acceptance: each tone applies its correct bg class.
  const toneBgMap: Array<[SummaryHeroTone, string]> = [
    ["danger", "bg-destructive/8"],
    ["warn", "bg-status-late-subtle"],
    ["success", "bg-status-present-subtle"],
    ["celebration", "bg-celebration-gold-subtle"],
    ["neutral", "bg-card"],
  ];

  it.each(toneBgMap)(
    "applies the correct bg class for tone=%s",
    (tone, expectedBg) => {
      render(<SummaryHero tone={tone} primary="Hero" />);
      const region = screen.getByRole("region");
      expect(region.className).toContain(expectedBg);
    },
  );

  // Acceptance: each tone applies its correct border-left accent class.
  const toneBorderMap: Array<[SummaryHeroTone, string]> = [
    ["danger", "border-l-destructive"],
    ["warn", "border-l-status-late"],
    ["success", "border-l-status-present"],
    ["celebration", "border-l-celebration-gold"],
    ["neutral", "border-l-border"],
  ];

  it.each(toneBorderMap)(
    "applies the correct left-accent class for tone=%s",
    (tone, expectedBorder) => {
      render(<SummaryHero tone={tone} primary="Hero" />);
      const region = screen.getByRole("region");
      expect(region.className).toContain(expectedBorder);
      expect(region.className).toContain("border-l-4");
    },
  );

  it("uses elevated shadow by default", () => {
    render(<SummaryHero primary="Hero" />);
    const region = screen.getByRole("region");
    expect(region.className).toContain("shadow-card-elevated");
  });

  it("uses resting shadow when elevated=false", () => {
    render(<SummaryHero primary="Hero" elevated={false} />);
    const region = screen.getByRole("region");
    expect(region.className).toContain("shadow-card-resting");
    expect(region.className).not.toContain("shadow-card-elevated");
  });

  it("uses p-card spacing token (no raw p-5/p-6)", () => {
    render(<SummaryHero primary="Hero" />);
    const region = screen.getByRole("region");
    expect(region.className).toContain("p-card");
    expect(region.className).not.toContain(" p-5");
    expect(region.className).not.toContain(" p-6");
  });

  it("forwards consumer className without dropping internal classes", () => {
    render(
      <SummaryHero
        primary="Hero"
        tone="celebration"
        icon={Sparkles}
        className="mt-4"
      />,
    );
    const region = screen.getByRole("region");
    expect(region.className).toContain("mt-4");
    expect(region.className).toContain("bg-celebration-gold-subtle");
  });
});

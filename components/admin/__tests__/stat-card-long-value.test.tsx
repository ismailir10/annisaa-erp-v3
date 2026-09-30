import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Wallet } from "lucide-react";
import { StatCard } from "../stat-card";

describe("<StatCard> long money value (FIN-21)", () => {
  it("scales a long figure down on mobile and never breaks inside it", () => {
    render(<StatCard label="Total Penerimaan" value="Rp 12.345.678" icon={Wallet} />);
    expect(screen.getByText("Rp 12.345.678")).toHaveClass("whitespace-nowrap", "text-h2", "sm:text-display");
  });
  it("keeps the display size for a short count", () => {
    render(<StatCard label="Total" value={101} icon={Wallet} />);
    expect(screen.getByText("101")).toHaveClass("text-display");
    expect(screen.getByText("101")).not.toHaveClass("text-h2");
  });
});

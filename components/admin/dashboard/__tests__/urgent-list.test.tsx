import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UrgentList } from "../urgent-list";

const makeItem = (id: string, title: string) => ({
  id, kind: "invoice" as const, title, description: `desc ${id}`, href: `/admin/invoices/${id}`,
  state: "PENDING_PAYMENT_LINK", recordId: id, actionLabel: "Buka tagihan",
});

describe("UrgentList", () => {
  it("renders at most the items it is given and links each action to its destination", () => {
    const items = [makeItem("1", "Pulihkan link Alya"), makeItem("2", "Pulihkan link Bima")];
    render(<UrgentList items={items} total={7} />);
    expect(screen.getByText("Pulihkan link Alya")).toBeVisible();
    expect(screen.getByText("Pulihkan link Bima")).toBeVisible();
    expect(screen.getByRole("link", { name: "Buka tagihan: Pulihkan link Alya" })).toHaveAttribute("href", "/admin/invoices/1");
  });

  it("shows a footer link to the full queue naming the true total, not just the rendered count", () => {
    const items = [makeItem("1", "Pulihkan link Alya")];
    render(<UrgentList items={items} total={12} />);
    expect(screen.getByRole("link", { name: /Lihat semua \(12\)/ })).toHaveAttribute("href", "/admin/work-queue");
  });

  it("renders nothing when the queue is empty", () => {
    const { container } = render(<UrgentList items={[]} total={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

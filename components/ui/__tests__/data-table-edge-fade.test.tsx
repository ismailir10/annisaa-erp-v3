import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";

import { DataTable } from "@/components/ui/data-table";

type Row = { name: string };

const data: Row[] = [{ name: "Aisyah" }];

const columnsWithActions: LegacyColumnDef<Row>[] = [
  { accessorKey: "name", header: "Nama", cell: ({ row }) => row.original.name },
  { id: "actions", header: "Aksi", cell: () => "•••" },
];

const columnsWithoutSticky: LegacyColumnDef<Row>[] = [
  { accessorKey: "name", header: "Nama", cell: ({ row }) => row.original.name },
];

const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const originalScrollLeft = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollLeft");

/** jsdom has no layout, so scrollWidth/clientWidth are always 0 — stub them
 * to simulate a table whose content overflows its scroll container. */
function mockOverflow(scrollWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => scrollWidth });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => clientWidth });
  Object.defineProperty(HTMLElement.prototype, "scrollLeft", { configurable: true, get: () => 0, set: () => {} });
}

afterEach(() => {
  if (originalScrollWidth) Object.defineProperty(HTMLElement.prototype, "scrollWidth", originalScrollWidth);
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
  if (originalScrollLeft) Object.defineProperty(HTMLElement.prototype, "scrollLeft", originalScrollLeft);
});

// Review fix (T1, cycle 2026-09-26, admin-ui-standard-c1) — the edge-fade
// used to render unconditionally on overflow, so it sat *underneath* the
// opaque, higher-z-index sticky actions column and never showed on any of
// the ~24 admin lists that have one. The actions column's own left shadow
// already signals the overflow there, so the fade is now for tables with no
// sticky-right column only.
describe("DataTable edge-fade", () => {
  it("does not render the fade when the table has a sticky actions column, even while overflowing", () => {
    mockOverflow(2000, 300);
    const { container } = render(<DataTable columns={columnsWithActions} data={data} />);

    expect(container.querySelector(".to-background")).not.toBeInTheDocument();
  });

  it("renders the fade when the table overflows and has no sticky-right column", () => {
    mockOverflow(2000, 300);
    const { container } = render(<DataTable columns={columnsWithoutSticky} data={data} />);

    expect(container.querySelector(".to-background")).toBeInTheDocument();
  });

  it("does not render the fade when the table does not overflow", () => {
    mockOverflow(300, 300);
    const { container } = render(<DataTable columns={columnsWithoutSticky} data={data} />);

    expect(container.querySelector(".to-background")).not.toBeInTheDocument();
  });
});

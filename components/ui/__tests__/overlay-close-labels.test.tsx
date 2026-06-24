import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

describe("overlay close labels", () => {
  it("localizes default Dialog close labels", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Tambah Siswa</DialogTitle>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getAllByText("Tutup")).toHaveLength(2);
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("localizes default Sheet close label", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Cuti & Izin</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByText("Tutup")).toBeInTheDocument();
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });
});

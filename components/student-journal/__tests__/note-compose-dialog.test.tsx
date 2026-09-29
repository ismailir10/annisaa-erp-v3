import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NoteComposeDialog } from "@/components/student-journal/note-compose-dialog";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const WEEK = ["2026-09-28", "2026-09-29"];

function setup(props: Partial<React.ComponentProps<typeof NoteComposeDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onSaved = vi.fn();
  render(
    <NoteComposeDialog
      open
      onOpenChange={onOpenChange}
      mode="create"
      studentId="stu-1"
      weekDates={WEEK}
      initialDate="2026-09-29"
      onSaved={onSaved}
      {...props}
    />,
  );
  return { onOpenChange, onSaved };
}

const type = (text: string) =>
  fireEvent.change(screen.getByLabelText("Isi catatan"), { target: { value: text } });

describe("NoteComposeDialog discard guard (TCH-3)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("closes straight away when nothing was typed", () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Buang catatan?")).toBeNull();
  });

  it("asks before dropping a typed draft, and keeps the text when the teacher continues", async () => {
    const { onOpenChange } = setup();
    type("Ananda hari ini sangat semangat");
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(await screen.findByText("Buang catatan?")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Lanjut menulis" }));
    await waitFor(() => expect(screen.queryByText("Buang catatan?")).toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Isi catatan")).toHaveValue("Ananda hari ini sangat semangat");
  });

  it("closes only after an explicit Buang", async () => {
    const { onOpenChange } = setup();
    type("draft");
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    fireEvent.click(await screen.findByRole("button", { name: "Buang" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("guards the Escape / outside-tap path too (they go through the same onOpenChange)", async () => {
    const { onOpenChange } = setup();
    type("draft");
    fireEvent.keyDown(screen.getByLabelText("Isi catatan"), { key: "Escape" });
    expect(await screen.findByText("Buang catatan?")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not treat an untouched edit as a draft, but does treat a changed one as one", async () => {
    const { onOpenChange } = setup({ mode: "edit", noteId: "n1", initialBody: "Catatan lama" });
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    type("Catatan lama diubah");
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(await screen.findByText("Buang catatan?")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not ask after a successful save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const { onOpenChange, onSaved } = setup();
    type("Alhamdulillah");
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Buang catatan?")).toBeNull();
  });
});

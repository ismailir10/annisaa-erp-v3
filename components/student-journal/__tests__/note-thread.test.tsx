import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoteThread } from "../note-thread";

const baseNote = {
  id: "note-1",
  date: "2026-06-25",
  authorRole: "TEACHER",
  authorUserId: "teacher-1",
  body: "Anak aktif hari ini.",
  createdAt: "2026-06-25T07:30:00.000Z",
};

describe("NoteThread", () => {
  it("renders the author name and derived initials when authorName is present", () => {
    render(<NoteThread notes={[{ ...baseNote, authorName: "Bu Sari" }]} />);

    expect(screen.getByText("Bu Sari")).toBeInTheDocument();
    expect(screen.getByText("BS")).toBeInTheDocument();
    // Role badge is still rendered alongside the name.
    expect(screen.getByText("Guru")).toBeInTheDocument();
  });

  it("falls back to the role label (and its initial) when authorName is missing", () => {
    render(<NoteThread notes={[{ ...baseNote, authorName: undefined }]} />);

    // Role label appears twice: once as the author-name fallback text, once as the Badge.
    expect(screen.getAllByText("Guru")).toHaveLength(2);
    expect(screen.getByText("G")).toBeInTheDocument();
  });

  it("renders the created timestamp (time part) alongside the short date", () => {
    render(<NoteThread notes={[{ ...baseNote, authorName: "Bu Sari" }]} />);

    // formatTime renders "HH:mm" in 24h Indonesian locale for the UTC ISO above.
    // We only assert the date+time separator text is present rather than pin
    // an exact wall-clock string (which is TZ-dependent in CI).
    const dateNode = screen.getByText((content) => content.includes("2026") && content.includes("·"));
    expect(dateNode).toBeInTheDocument();
  });

  it("renders delete-only actions when onDelete is passed without onEdit", () => {
    render(
      <NoteThread
        notes={[{ ...baseNote, authorName: "Bu Sari" }]}
        canEdit={() => true}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByLabelText("Hapus catatan")).toBeInTheDocument();
    expect(screen.queryByLabelText("Edit catatan")).not.toBeInTheDocument();
  });

  it("renders an empty-state message when there are no notes", () => {
    render(<NoteThread notes={[]} />);
    expect(screen.getByText("Belum ada catatan.")).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookOpen } from "lucide-react";
import { TaskList, TaskRow } from "../task-list";
import { SaveStatus } from "../save-status";
import { ContextStrip } from "../context-strip";

describe("portal task primitives", () => {
  it("renders navigation, action, and read-only rows with their intended semantics", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TaskList>
        <TaskRow title="Jurnal harian" description="12 dari 20 catatan terisi" icon={<BookOpen />} meta="Lanjutkan" href="/teacher/journal" />
        <TaskRow title="Absensi kelas" onClick={onClick} />
        <TaskRow title="Check-in" description="07.13 · tercatat" />
      </TaskList>,
    );

    expect(screen.getByRole("link", { name: /Jurnal harian/ })).toHaveAttribute("href", "/teacher/journal");
    await user.tab();
    expect(screen.getByRole("link", { name: /Jurnal harian/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /Absensi kelas/ })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: /Absensi kelas/ }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByText("Check-in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Check-in/ })).not.toBeInTheDocument();
  });

  it("exposes save feedback and a read-only child context", () => {
    const { rerender } = render(<SaveStatus state="saving" />);
    expect(screen.getByRole("status")).toHaveTextContent("Menyimpan…");
    rerender(<SaveStatus state="error" message="Periksa koneksi lalu coba lagi" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Periksa koneksi lalu coba lagi");

    render(<ContextStrip name="Alya Putri" detail="TK B Anggur" avatar={<span>AP</span>} />);
    expect(screen.getByText("Alya Putri")).toBeInTheDocument();
    expect(screen.getByText("TK B Anggur")).toBeInTheDocument();
  });
});

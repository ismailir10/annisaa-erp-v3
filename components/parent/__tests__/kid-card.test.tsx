import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KidCard } from "../kid-card";

describe("KidCard", () => {
  it("offers recognizable child-specific destinations without losing context", () => {
    render(
      <KidCard
        id="student-2"
        name="Alya Putri"
        className="TK B Anggrek"
        todayStatus="PRESENT"
        teacherNote="Alya mulai percaya diri memimpin doa bersama teman-temannya."
        foot={{ tone: "ok", text: "Hadir 2 hari pekan ini" }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Alya Putri" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Baca catatan" })).toHaveAttribute(
      "href",
      "/parent/student-journal?child=student-2&view=notes",
    );
    expect(screen.getByRole("link", { name: "Lihat kehadiran" })).toHaveAttribute(
      "href",
      "/parent/attendance?child=student-2",
    );
    expect(screen.getByRole("link", { name: "Perkembangan" })).toHaveAttribute(
      "href",
      "/parent/perkembangan/student-2",
    );
    expect(screen.getByRole("link", { name: "Rapor" })).toHaveAttribute(
      "href",
      "/parent/reports?child=student-2",
    );
    expect(screen.getByRole("link", { name: "Tagihan" })).toHaveAttribute(
      "href",
      "/parent/invoices?child=student-2",
    );
    expect(screen.getByText(/Catatan guru:/).closest("p")).toHaveTextContent("Alya mulai percaya diri");
    expect(screen.getByText("Hadir")).toBeInTheDocument();
  });

  it("does not present an unrecorded attendance day as present", () => {
    render(<KidCard id="student-2" name="Bilal Zhafran" className="TK A" todayStatus={null} teacherNote={null} foot={{ tone: "info", text: "Pekan ini belum tercatat" }} />);
    expect(screen.getByText("Belum dicatat")).toBeInTheDocument();
    expect(screen.queryByText("Hadir")).not.toBeInTheDocument();
    expect(screen.getByText(/Belum ada catatan guru terbaru/)).toBeInTheDocument();
  });
});

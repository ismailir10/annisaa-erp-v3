import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  type MockMotionProps = ComponentProps<"div"> & {
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    transition?: unknown;
    whileHover?: unknown;
    whileTap?: unknown;
  };
  const motion = new Proxy(
    {},
    {
      get: (_, tag: string) => {
        return ({ initial, animate: _animate, exit: _exit, transition: _transition, whileHover: _whileHover, whileTap: _whileTap, ...props }: MockMotionProps) =>
          React.createElement(tag, {
            ...props,
            "data-motion-initial": initial === undefined ? undefined : String(initial),
          });
      },
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => true,
  };
});

import { TeacherHomeClient } from "../home-client";

describe("TeacherHomeClient motion", () => {
  function renderHome() {
    return render(
      <TeacherHomeClient
        userName="Sari"
        todayRecord={null}
        homeroomClassSectionName="TK-B Anggur"
        todaySessions={[
          {
            id: "session-1",
            slot: "MORNING",
            className: "TK-B Anggur",
            rosterCount: 12,
          },
        ]}
      />,
    );
  }

  it("skips all entrance states when the system requests reduced motion", async () => {
    renderHome();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Selamat/ })).toBeInTheDocument();
    });

    expect(document.querySelectorAll('[data-motion-initial="[object Object]"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-motion-initial="false"]')).not.toHaveLength(0);
  });

  it("puts today status before secondary links and gives dashboard links a visible focus ring", async () => {
    renderHome();

    await waitFor(() => {
      expect(screen.getByText("Status Hari Ini")).toBeInTheDocument();
    });

    const status = screen.getByText("Status Hari Ini");
    const quickLinks = screen.getByText("Akses Cepat");
    expect(status.compareDocumentPosition(quickLinks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    for (const link of [
      screen.getByRole("link", { name: /Buku Penghubung/ }),
      screen.getByRole("link", { name: /Penilaian Pekanan/ }),
      screen.getByRole("link", { name: /Pagi.*12 siswa/ }),
    ]) {
      expect(link.className).toContain("focus-visible:ring-2");
      expect(link.className).toContain("focus-visible:ring-ring");
    }
  });
});

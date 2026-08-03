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
  it("skips all entrance states when the system requests reduced motion", async () => {
    render(
      <TeacherHomeClient
        userName="Sari"
        todayRecord={null}
        todaySessions={[]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Selamat/ })).toBeInTheDocument();
    });

    expect(document.querySelectorAll('[data-motion-initial="[object Object]"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-motion-initial="false"]')).not.toHaveLength(0);
  });
});

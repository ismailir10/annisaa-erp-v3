import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CategoryAccordion } from "@/components/student-journal/category-accordion";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}));

describe("CategoryAccordion deactivation confirmation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps the confirmation open after failure and allows retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Kategori masih digunakan" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CategoryAccordion
        categories={[
          {
            id: "category-1",
            name: "Ibadah",
            scope: "SCHOOL",
            order: 1,
            status: "ACTIVE",
            indicators: [],
          },
        ]}
        loading={false}
        onRefresh={vi.fn()}
        onEditCategory={vi.fn()}
        onAddIndicator={vi.fn()}
        onEditIndicator={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Buka menu kategori" }));
    await user.click(await screen.findByRole("menuitem", { name: "Nonaktifkan" }));
    await user.click(screen.getByRole("button", { name: "Ya, Nonaktifkan" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Kategori masih digunakan");
    });
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Ya, Nonaktifkan" }),
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Ya, Nonaktifkan" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Kategori diperbarui");
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Ya, Nonaktifkan" }),
      ).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

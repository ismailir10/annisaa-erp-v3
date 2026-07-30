import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AssessmentDetailPage from "../page";

const toastError = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "assessment-1" }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}));

const assessment = {
  id: "assessment-1",
  status: "DRAFT",
  period: "Semester 1",
  student: { name: "Aisyah", nickname: null },
  template: {
    name: "Perkembangan",
    program: { name: "TK A" },
    categories: [
      {
        id: "category-1",
        name: "Nilai Agama",
        sortOrder: 1,
        indicators: [
          { id: "indicator-1", description: "Berdoa sebelum belajar", sortOrder: 1 },
        ],
      },
    ],
  },
  scores: [{ indicatorId: "indicator-1", score: "BB", notes: null }],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("AssessmentDetailPage score autosave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("optimistically selects and persists the complete score set on tap", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(assessment))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AssessmentDetailPage />);
    const mb = await screen.findByRole("button", { name: "MB: Mulai Berkembang" });
    await userEvent.click(mb);

    expect(mb).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      scores: [{ indicatorId: "indicator-1", score: "MB", notes: null }],
    });
  });

  it("rolls back the still-current optimistic value and gives retry guidance", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(assessment))
      .mockResolvedValueOnce(jsonResponse({ error: "Koneksi terputus" }, 500));
    vi.stubGlobal("fetch", fetchMock);

    render(<AssessmentDetailPage />);
    const mb = await screen.findByRole("button", { name: "MB: Mulai Berkembang" });
    const bb = screen.getByRole("button", { name: "BB: Belum Berkembang" });
    await userEvent.click(mb);

    await waitFor(() => expect(bb).toHaveAttribute("aria-pressed", "true"));
    expect(toastError).toHaveBeenCalledWith(
      "Koneksi terputus. Nilai dikembalikan; pilih lagi untuk mencoba ulang.",
    );
  });

  it("does not let a failed stale request roll back a newer tap", async () => {
    const firstPut = deferred<Response>();
    const secondPut = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(assessment))
      .mockImplementationOnce(() => firstPut.promise)
      .mockImplementationOnce(() => secondPut.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<AssessmentDetailPage />);
    const mb = await screen.findByRole("button", { name: "MB: Mulai Berkembang" });
    const bsh = screen.getByRole("button", { name: "BSH: Berkembang Sesuai Harapan" });

    vi.useFakeTimers();
    vi.setSystemTime(0);
    fireEvent.click(mb);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(bsh);
    expect(bsh).toHaveAttribute("aria-pressed", "true");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstPut.resolve(jsonResponse({ error: "Konflik penyimpanan" }, 409));
      await Promise.resolve();
    });
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const request = fetchMock.mock.calls[2][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      scores: [{ indicatorId: "indicator-1", score: "BSH", notes: null }],
    });
    expect(bsh).toHaveAttribute("aria-pressed", "true");
    expect(toastError).toHaveBeenCalledWith(
      "Konflik penyimpanan. Perubahan terbaru akan dicoba berikutnya.",
    );

    await act(async () => {
      secondPut.resolve(jsonResponse({ ok: true }));
      await Promise.resolve();
    });
  });

  it("uses revisions so an ABA tap survives a stale failure", async () => {
    const firstPut = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(assessment))
      .mockImplementationOnce(() => firstPut.promise)
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AssessmentDetailPage />);
    const mb = await screen.findByRole("button", { name: "MB: Mulai Berkembang" });
    const bb = screen.getByRole("button", { name: "BB: Belum Berkembang" });

    vi.useFakeTimers();
    vi.setSystemTime(0);
    fireEvent.click(mb);
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(bb);
    fireEvent.click(mb);

    await act(async () => {
      firstPut.resolve(jsonResponse({ error: "Konflik penyimpanan" }, 409));
      await Promise.resolve();
    });
    expect(mb).toHaveAttribute("aria-pressed", "true");

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    const request = fetchMock.mock.calls[2][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      scores: [{ indicatorId: "indicator-1", score: "MB", notes: null }],
    });
    expect(toastError).toHaveBeenCalledWith(
      "Konflik penyimpanan. Perubahan terbaru akan dicoba berikutnya.",
    );
  });

  it("coalesces taps to no more than 30 autosave writes per minute", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? jsonResponse({ ok: true })
        : jsonResponse(assessment),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AssessmentDetailPage />);
    await screen.findByRole("button", { name: "MB: Mulai Berkembang" });

    vi.useFakeTimers();
    vi.setSystemTime(0);
    const options = [
      screen.getByRole("button", { name: "MB: Mulai Berkembang" }),
      screen.getByRole("button", { name: "BSH: Berkembang Sesuai Harapan" }),
      screen.getByRole("button", { name: "BSB: Berkembang Sangat Baik" }),
      screen.getByRole("button", { name: "BB: Belum Berkembang" }),
    ];

    fireEvent.click(options[0]);
    await act(() => vi.advanceTimersByTimeAsync(0));
    for (let second = 1; second < 60; second += 1) {
      fireEvent.click(options[second % options.length]);
      await act(() => vi.advanceTimersByTimeAsync(1_000));
    }

    const putCalls = () =>
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(putCalls()).toHaveLength(30);

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(putCalls()).toHaveLength(31);
  });

  it("waits for an in-flight autosave and flushes the latest state with publish", async () => {
    const firstPut = deferred<Response>();
    const publishPut = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(assessment))
      .mockImplementationOnce(() => firstPut.promise)
      .mockImplementationOnce(() => publishPut.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<AssessmentDetailPage />);
    const mb = await screen.findByRole("button", { name: "MB: Mulai Berkembang" });
    const bsh = screen.getByRole("button", { name: "BSH: Berkembang Sesuai Harapan" });
    const publish = screen.getByRole("button", { name: "Publikasi" });

    vi.useFakeTimers();
    vi.setSystemTime(0);
    fireEvent.click(mb);
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(bsh);
    fireEvent.click(publish);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstPut.resolve(jsonResponse({ ok: true }));
      await Promise.resolve();
    });
    await act(() => vi.advanceTimersByTimeAsync(1_999));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const request = fetchMock.mock.calls[2][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      scores: [{ indicatorId: "indicator-1", score: "BSH", notes: null }],
      status: "PUBLISHED",
    });

    await act(async () => {
      publishPut.resolve(jsonResponse({ ok: true }));
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: "Publikasi" })).not.toBeInTheDocument();
  });
});

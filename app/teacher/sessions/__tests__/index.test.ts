import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`redirect:${url}`); }));
vi.mock("next/navigation", () => ({ redirect }));

import TeacherSessionsIndex from "../page";

describe("/teacher/sessions (TCH-13)", () => {
  it("sends the teacher to the sessions list on the home page instead of a 404", () => {
    expect(() => TeacherSessionsIndex()).toThrow("redirect:/teacher#pickup-sessions");
    expect(redirect).toHaveBeenCalledWith("/teacher#pickup-sessions");
  });
});

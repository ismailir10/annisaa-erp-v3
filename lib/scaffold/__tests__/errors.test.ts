import { describe, expect, it } from "vitest";

import { OwnStudentUnresolvedError } from "../errors";

describe("OwnStudentUnresolvedError", () => {
  it("is an instance of Error", () => {
    const e = new OwnStudentUnresolvedError();
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(OwnStudentUnresolvedError);
  });

  it("carries the canonical name 'OwnStudentUnresolvedError'", () => {
    const e = new OwnStudentUnresolvedError();
    expect(e.name).toBe("OwnStudentUnresolvedError");
  });

  it("default message is the sentinel string the page-layer wrapper checks", () => {
    const e = new OwnStudentUnresolvedError();
    expect(e.message).toBe("OWN_STUDENT_UNRESOLVED");
  });

  it("accepts a custom message override", () => {
    const e = new OwnStudentUnresolvedError("studentIds resolver still null");
    expect(e.message).toBe("studentIds resolver still null");
  });

  it("survives instanceof check across plain throw/catch (RSC-render contract)", () => {
    let caught: unknown;
    try {
      throw new OwnStudentUnresolvedError();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OwnStudentUnresolvedError);
  });
});

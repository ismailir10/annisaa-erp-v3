import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import {
  FIELD_KINDS,
  FIELD_RENDERERS,
  getRenderer,
  hasRenderer,
  MissingRendererError,
} from "../field-renderer";
import type { FieldKind } from "../entity";

describe("FIELD_KINDS", () => {
  it("locks the §5.5 fixed registry at exactly 15 entries", () => {
    expect(FIELD_KINDS.length).toBe(15);
  });

  it("contains every kind enumerated in spec §5.5", () => {
    const expected: FieldKind[] = [
      "TEXT",
      "TEXTAREA",
      "NUMBER",
      "DECIMAL",
      "CURRENCY",
      "DATE",
      "DATETIME",
      "BOOLEAN",
      "SELECT",
      "MULTISELECT",
      "EMAIL",
      "PHONE",
      "RELATION",
      "FILE",
      "ENUM",
    ];
    expect([...FIELD_KINDS].sort()).toEqual(expected.sort());
  });

  it("has no duplicate kinds", () => {
    expect(new Set(FIELD_KINDS).size).toBe(FIELD_KINDS.length);
  });
});

describe("FIELD_RENDERERS", () => {
  it("registers only kinds present in FIELD_KINDS", () => {
    for (const key of Object.keys(FIELD_RENDERERS)) {
      expect(FIELD_KINDS).toContain(key);
    }
  });

  it("registers TEXT placeholder this cycle", () => {
    expect(FIELD_RENDERERS.TEXT).toBeDefined();
  });

  it("leaves the other 14 kinds unimplemented (deferred to p1-scaffold-renderers)", () => {
    const unimplemented = FIELD_KINDS.filter((k) => !FIELD_RENDERERS[k]);
    expect(unimplemented.length).toBe(14);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(FIELD_RENDERERS)).toBe(true);
  });
});

describe("getRenderer", () => {
  it("returns TEXT renderer", () => {
    const C = getRenderer("TEXT");
    expect(typeof C).toBe("function");
  });

  it("throws MissingRendererError for unimplemented kinds", () => {
    expect(() => getRenderer("NUMBER")).toThrowError(MissingRendererError);
    expect(() => getRenderer("RELATION")).toThrowError(MissingRendererError);
  });

  it("error message references the follow-up cycle", () => {
    try {
      getRenderer("DATE");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MissingRendererError);
      expect((e as Error).message).toContain("p1-scaffold-renderers");
    }
  });
});

describe("hasRenderer", () => {
  it("returns true for TEXT", () => {
    expect(hasRenderer("TEXT")).toBe(true);
  });
  it("returns false for unimplemented kinds", () => {
    expect(hasRenderer("NUMBER")).toBe(false);
  });
  it("returns false for non-FieldKind strings", () => {
    expect(hasRenderer("BOGUS")).toBe(false);
    expect(hasRenderer("")).toBe(false);
  });
});

describe("TextRenderer (smoke)", () => {
  it("renders a text input with placeholder + value bound to RHF field shape", () => {
    const TEXT = getRenderer("TEXT");
    const field = {
      name: "displayName",
      value: "Pak Budi",
      onChange: () => {},
      onBlur: () => {},
      ref: () => {},
      disabled: false,
    } as React.ComponentProps<typeof TEXT>["field"];
    const { container } = render(
      React.createElement(TEXT, {
        field,
        def: { kind: "TEXT", placeholder: "Nama lengkap", maxLength: 255 },
      }),
    );
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(input?.getAttribute("placeholder")).toBe("Nama lengkap");
    expect(input?.getAttribute("maxlength")).toBe("255");
    expect((input as HTMLInputElement).value).toBe("Pak Budi");
  });

  it("renders empty string when field.value is undefined (no React warning)", () => {
    const TEXT = getRenderer("TEXT");
    const field = {
      name: "displayName",
      value: undefined,
      onChange: () => {},
      onBlur: () => {},
      ref: () => {},
      disabled: false,
    } as React.ComponentProps<typeof TEXT>["field"];
    const { container } = render(
      React.createElement(TEXT, { field, def: { kind: "TEXT" } }),
    );
    expect((container.querySelector("input") as HTMLInputElement).value).toBe("");
  });

  it("throws when given a non-TEXT FieldDef", () => {
    const TEXT = getRenderer("TEXT");
    const field = {
      name: "x",
      value: "",
      onChange: () => {},
      onBlur: () => {},
      ref: () => {},
      disabled: false,
    } as React.ComponentProps<typeof TEXT>["field"];
    // Suppress React error boundary noise for this expected throw.
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        render(
          React.createElement(TEXT, {
            field,
            def: { kind: "EMAIL" } as never,
          }),
        ),
      ).toThrow(/non-TEXT/);
    } finally {
      consoleErr.mockRestore();
    }
  });
});

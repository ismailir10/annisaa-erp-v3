import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as React from "react";

import {
  FIELD_KINDS,
  FIELD_RENDERERS,
  getRenderer,
  hasRenderer,
  MissingRendererError,
} from "../field-renderer";
import type { FieldKind, FieldDef } from "../entity";

type FieldShape = {
  name: string;
  value: unknown;
  onChange: (v: unknown) => void;
  onBlur: () => void;
  ref: () => void;
  disabled: boolean;
};

function makeField(overrides: Partial<FieldShape> = {}): FieldShape {
  return {
    name: "x",
    value: "",
    onChange: () => {},
    onBlur: () => {},
    ref: () => {},
    disabled: false,
    ...overrides,
  };
}

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
  it("registers all 15 kinds", () => {
    expect(Object.keys(FIELD_RENDERERS).length).toBe(15);
    for (const kind of FIELD_KINDS) {
      expect(FIELD_RENDERERS[kind]).toBeDefined();
    }
  });

  it("registers only kinds present in FIELD_KINDS", () => {
    for (const key of Object.keys(FIELD_RENDERERS)) {
      expect(FIELD_KINDS).toContain(key);
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(FIELD_RENDERERS)).toBe(true);
  });
});

describe("getRenderer", () => {
  it("returns a component for every registered FIELD_KINDS member", () => {
    for (const kind of FIELD_KINDS) {
      const C = getRenderer(kind);
      expect(typeof C).toBe("function");
    }
  });

  it("throws MissingRendererError for future-unknown kinds", () => {
    expect(() => getRenderer("BOGUS" as FieldKind)).toThrowError(MissingRendererError);
  });
});

describe("hasRenderer", () => {
  it("returns true for every registered kind", () => {
    for (const kind of FIELD_KINDS) {
      expect(hasRenderer(kind)).toBe(true);
    }
  });
  it("returns false for non-FieldKind strings", () => {
    expect(hasRenderer("BOGUS")).toBe(false);
    expect(hasRenderer("")).toBe(false);
  });
});

// ── Per-renderer smoke ──────────────────────────────────────

describe("TextRenderer (smoke)", () => {
  it("renders an input bound to RHF field", () => {
    const Renderer = getRenderer("TEXT");
    const field = makeField({ value: "Pak Budi" }) as React.ComponentProps<typeof Renderer>["field"];
    const { container } = render(
      React.createElement(Renderer, {
        field,
        def: { kind: "TEXT", placeholder: "Nama", maxLength: 255 } satisfies FieldDef,
      }),
    );
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(input?.getAttribute("placeholder")).toBe("Nama");
    expect((input as HTMLInputElement).value).toBe("Pak Budi");
  });

  it("throws when given a non-TEXT FieldDef", () => {
    const Renderer = getRenderer("TEXT");
    const field = makeField() as React.ComponentProps<typeof Renderer>["field"];
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        render(React.createElement(Renderer, { field, def: { kind: "EMAIL" } satisfies FieldDef })),
      ).toThrow(/non-TEXT/);
    } finally {
      consoleErr.mockRestore();
    }
  });
});

describe("TextareaRenderer (smoke)", () => {
  it("renders a textarea honoring rows + maxLength", () => {
    const Renderer = getRenderer("TEXTAREA");
    const field = makeField({ value: "halo" }) as React.ComponentProps<typeof Renderer>["field"];
    const { container } = render(
      React.createElement(Renderer, {
        field,
        def: { kind: "TEXTAREA", rows: 5, maxLength: 500 } satisfies FieldDef,
      }),
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(ta).not.toBeNull();
    expect(ta?.rows).toBe(5);
    expect(ta?.value).toBe("halo");
  });
});

describe("NumberRenderer (smoke)", () => {
  it("renders type=number and parses int onChange", () => {
    const Renderer = getRenderer("NUMBER");
    const calls: unknown[] = [];
    const field = makeField({ onChange: (v) => calls.push(v) }) as React.ComponentProps<typeof Renderer>["field"];
    const { container } = render(
      React.createElement(Renderer, { field, def: { kind: "NUMBER", min: 0, max: 100 } satisfies FieldDef }),
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("number");
    expect(input.step).toBe("1");
    fireEvent.change(input, { target: { value: "42" } });
    expect(calls).toEqual([42]);
  });
});

describe("DecimalRenderer (smoke)", () => {
  it("uses step computed from precision", () => {
    const Renderer = getRenderer("DECIMAL");
    const field = makeField() as React.ComponentProps<typeof Renderer>["field"];
    const { container } = render(
      React.createElement(Renderer, {
        field,
        def: { kind: "DECIMAL", precision: 3 } satisfies FieldDef,
      }),
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.step).toBe("0.001");
  });
});

describe("CurrencyRenderer (smoke + format-on-blur round-trip)", () => {
  it("renders Rp prefix + formatted display when stored value present", () => {
    const Renderer = getRenderer("CURRENCY");
    const field = makeField({ value: "1500000" }) as React.ComponentProps<typeof Renderer>["field"];
    const { container, getByText } = render(
      React.createElement(Renderer, { field, def: { kind: "CURRENCY" } satisfies FieldDef }),
    );
    expect(getByText("Rp")).not.toBeNull();
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toMatch(/1\.500\.000/);
  });

  it("strips non-digits and writes raw digit string to field state on blur", () => {
    const Renderer = getRenderer("CURRENCY");
    const calls: unknown[] = [];
    const field = makeField({
      value: "",
      onChange: (v) => calls.push(v),
    }) as React.ComponentProps<typeof Renderer>["field"];
    const { container } = render(
      React.createElement(Renderer, { field, def: { kind: "CURRENCY" } satisfies FieldDef }),
    );
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Rp 1.500.000" } });
    fireEvent.blur(input);
    expect(calls).toEqual(["1500000"]);
  });
});

describe("DateRenderer (smoke)", () => {
  it("renders trigger button with placeholder when no value", () => {
    const Renderer = getRenderer("DATE");
    const field = makeField() as React.ComponentProps<typeof Renderer>["field"];
    const { container, getByText } = render(
      React.createElement(Renderer, { field, def: { kind: "DATE" } satisfies FieldDef }),
    );
    expect(getByText("Pilih tanggal")).not.toBeNull();
    expect(container.querySelector("button")).not.toBeNull();
  });
});

describe("DateTimeRenderer (smoke)", () => {
  it("renders trigger button with placeholder when no value", () => {
    const Renderer = getRenderer("DATETIME");
    const field = makeField() as React.ComponentProps<typeof Renderer>["field"];
    const { getByText } = render(
      React.createElement(Renderer, { field, def: { kind: "DATETIME" } satisfies FieldDef }),
    );
    expect(getByText("Pilih tanggal & jam")).not.toBeNull();
  });
});

describe("BooleanRenderer (smoke)", () => {
  it("renders a switch with default trueLabel/falseLabel", () => {
    const Renderer = getRenderer("BOOLEAN");
    const field = makeField({ value: false }) as React.ComponentProps<typeof Renderer>["field"];
    const { getByText } = render(
      React.createElement(Renderer, { field, def: { kind: "BOOLEAN" } satisfies FieldDef }),
    );
    expect(getByText("Tidak aktif")).not.toBeNull();
  });

  it("uses custom labels when provided", () => {
    const Renderer = getRenderer("BOOLEAN");
    const field = makeField({ value: true }) as React.ComponentProps<typeof Renderer>["field"];
    const { getByText } = render(
      React.createElement(Renderer, {
        field,
        def: { kind: "BOOLEAN", trueLabel: "Ya", falseLabel: "Tidak" } satisfies FieldDef,
      }),
    );
    expect(getByText("Ya")).not.toBeNull();
  });
});

describe("SelectRenderer (smoke)", () => {
  it("renders trigger with placeholder when empty", () => {
    const Renderer = getRenderer("SELECT");
    const field = makeField() as React.ComponentProps<typeof Renderer>["field"];
    const { getByText } = render(
      React.createElement(Renderer, {
        field,
        def: {
          kind: "SELECT",
          options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
          ],
        } satisfies FieldDef,
      }),
    );
    expect(getByText("Pilih opsi")).not.toBeNull();
  });
});

describe("MultiselectRenderer (smoke)", () => {
  it("renders chips for stored values", () => {
    const Renderer = getRenderer("MULTISELECT");
    const field = makeField({ value: ["a"] }) as React.ComponentProps<typeof Renderer>["field"];
    const { getByText } = render(
      React.createElement(Renderer, {
        field,
        def: {
          kind: "MULTISELECT",
          options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
          ],
        } satisfies FieldDef,
      }),
    );
    expect(getByText("Alpha")).not.toBeNull();
  });
});

describe("EmailRenderer (smoke)", () => {
  it("renders type=email + inputMode=email", () => {
    const Renderer = getRenderer("EMAIL");
    const field = makeField({ value: "x@y.com" }) as React.ComponentProps<typeof Renderer>["field"];
    const { container } = render(
      React.createElement(Renderer, { field, def: { kind: "EMAIL" } satisfies FieldDef }),
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("email");
    expect(input.getAttribute("inputmode")).toBe("email");
    expect(input.value).toBe("x@y.com");
  });
});

describe("PhoneRenderer (smoke + format-on-blur round-trip)", () => {
  it("renders type=tel + displays formatted phone for stored value", () => {
    const Renderer = getRenderer("PHONE");
    const field = makeField({ value: "+628123456789" }) as React.ComponentProps<typeof Renderer>["field"];
    const { container } = render(
      React.createElement(Renderer, { field, def: { kind: "PHONE" } satisfies FieldDef }),
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("tel");
    expect(input.value).toMatch(/\+62 812-3456-789/);
  });

  it("normalizes 08-prefix input to +62 canonical form on blur", () => {
    const Renderer = getRenderer("PHONE");
    const calls: unknown[] = [];
    const field = makeField({
      value: "",
      onChange: (v) => calls.push(v),
    }) as React.ComponentProps<typeof Renderer>["field"];
    const { container } = render(
      React.createElement(Renderer, { field, def: { kind: "PHONE" } satisfies FieldDef }),
    );
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "08123456789" } });
    fireEvent.blur(input);
    expect(calls).toEqual(["+628123456789"]);
  });
});

describe("RelationRenderer (smoke)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders combobox shell", () => {
    const Renderer = getRenderer("RELATION");
    const field = makeField() as React.ComponentProps<typeof Renderer>["field"];
    const { container } = render(
      React.createElement(Renderer, {
        field,
        def: { kind: "RELATION", resource: "students", labelField: "name" } satisfies FieldDef,
      }),
    );
    expect(container.querySelector("input")).not.toBeNull();
  });
});

describe("FileRenderer (smoke)", () => {
  it("renders type=file with accept", () => {
    const Renderer = getRenderer("FILE");
    const field = makeField() as React.ComponentProps<typeof Renderer>["field"];
    const { container } = render(
      React.createElement(Renderer, {
        field,
        def: { kind: "FILE", accept: "image/*", maxBytes: 1024 } satisfies FieldDef,
      }),
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/*");
  });

  it("rejects file over maxBytes and shows Indonesian error", () => {
    const Renderer = getRenderer("FILE");
    const calls: unknown[] = [];
    const field = makeField({ onChange: (v) => calls.push(v) }) as React.ComponentProps<typeof Renderer>["field"];
    const { container, getByText } = render(
      React.createElement(Renderer, {
        field,
        def: { kind: "FILE", maxBytes: 10 } satisfies FieldDef,
      }),
    );
    const input = container.querySelector("input") as HTMLInputElement;
    const big = new File(["x".repeat(50)], "big.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { value: [big], writable: false });
    fireEvent.change(input);
    expect(calls).toEqual([null]);
    expect(getByText("Berkas terlalu besar")).not.toBeNull();
  });
});

describe("EnumRenderer (smoke)", () => {
  it("renders trigger with enum-name data attribute", () => {
    const Renderer = getRenderer("ENUM");
    const field = makeField() as React.ComponentProps<typeof Renderer>["field"];
    const { container } = render(
      React.createElement(Renderer, {
        field,
        def: {
          kind: "ENUM",
          enumName: "StudentStatus",
          options: [{ value: "ACTIVE", label: "Aktif" }],
        } satisfies FieldDef,
      }),
    );
    const trigger = container.querySelector('[data-enum="StudentStatus"]');
    expect(trigger).not.toBeNull();
  });
});

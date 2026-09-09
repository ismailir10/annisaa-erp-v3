import { describe, it, expect } from "vitest";
import { telHref, whatsappHref } from "@/lib/contact";

describe("telHref", () => {
  it("strips formatting", () => {
    expect(telHref("0812-8877-4402")).toBe("tel:081288774402");
    expect(telHref("(021) 8877 402")).toBe("tel:0218877402");
  });

  it("keeps a leading plus", () => {
    expect(telHref("+62 812 8877 4402")).toBe("tel:+6281288774402");
  });

  it("returns null for nothing dialable", () => {
    expect(telHref(null)).toBeNull();
    expect(telHref("")).toBeNull();
    expect(telHref("-")).toBeNull();
    expect(telHref("12345")).toBeNull();
  });
});

describe("whatsappHref", () => {
  it("swaps the Indonesian trunk 0 for the country code", () => {
    expect(whatsappHref("0812-8877-4402")).toBe("https://wa.me/6281288774402");
  });

  it("passes an already-international number through", () => {
    expect(whatsappHref("+62 812 8877 4402")).toBe("https://wa.me/6281288774402");
    expect(whatsappHref("6281288774402")).toBe("https://wa.me/6281288774402");
  });

  it("returns null for nothing usable", () => {
    expect(whatsappHref(null)).toBeNull();
    expect(whatsappHref("n/a")).toBeNull();
    expect(whatsappHref("0812")).toBeNull();
  });
});

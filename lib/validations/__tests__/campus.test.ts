import { describe, it, expect } from "vitest";
import { createCampusSchema, updateCampusSchema } from "@/lib/validations/campus";

describe("createCampusSchema", () => {
  it("accepts a well-formed campus body", () => {
    const res = createCampusSchema.safeParse({
      name: "Taman Aster",
      address: "Jl. Contoh No.1",
      lat: "-6.2234",
      lng: "106.8432",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.lat).toBeCloseTo(-6.2234);
      expect(res.data.lng).toBeCloseTo(106.8432);
    }
  });

  it("rejects an empty name", () => {
    expect(
      createCampusSchema.safeParse({ name: "", address: "", lat: "", lng: "" }).success,
    ).toBe(false);
  });

  it("treats an empty lat/lng as absent rather than 0", () => {
    const res = createCampusSchema.safeParse({ name: "Kampus Timur", address: "", lat: "", lng: "" });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.lat).toBeUndefined();
      expect(res.data.lng).toBeUndefined();
    }
  });

  it("treats an empty address as absent", () => {
    const res = createCampusSchema.safeParse({ name: "Kampus Timur", address: "  ", lat: "", lng: "" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.address).toBeUndefined();
  });

  it("trims the name", () => {
    const res = createCampusSchema.safeParse({ name: "  Kampus Timur  ", address: "", lat: "", lng: "" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.name).toBe("Kampus Timur");
  });
});

describe("updateCampusSchema (unchanged)", () => {
  it("still accepts a partial body", () => {
    expect(updateCampusSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
  });
});

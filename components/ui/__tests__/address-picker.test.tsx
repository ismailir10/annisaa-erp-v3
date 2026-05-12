import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddressPicker } from "../address-picker";
import { EMPTY_ADDRESS, DEFAULT_PROVINCE_CODE, DEFAULT_PROVINCE_NAME } from "@/lib/address/types";

vi.mock("@/lib/address/resolve", () => ({
  getProvinces: vi.fn(async () => [
    { id: "32", name: "Jawa Barat" },
    { id: "31", name: "DKI Jakarta" },
  ]),
  getRegencies: vi.fn(async (pc: string) =>
    pc === "32"
      ? [{ id: "3216", province_id: "32", name: "Kabupaten Bekasi" }]
      : []),
  getDistricts: vi.fn(async (rc: string) =>
    rc === "3216"
      ? [{ id: "3216081", regency_id: "3216", name: "Cikarang Barat" }]
      : []),
  fetchVillages: vi.fn(async (dc: string) =>
    dc === "3216081"
      ? [{ id: "3216081005", district_id: "3216081", name: "Telagamurni" }]
      : []),
}));

describe("AddressPicker", () => {
  it("renders addressLine textarea + 4 region selects with Indonesian labels", async () => {
    render(
      <AddressPicker
        prefix="address"
        value={EMPTY_ADDRESS}
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText(/jalan/i)).toBeInTheDocument();
    expect(screen.getByText(/provinsi/i)).toBeInTheDocument();
    expect(screen.getByText(/kab\.?\s*\/?\s*kota/i)).toBeInTheDocument();
    expect(screen.getByText(/kecamatan/i)).toBeInTheDocument();
    expect(screen.getByText(/kelurahan/i)).toBeInTheDocument();
  });

  it("defaults provinceCode to Jabar when value is empty", async () => {
    const onChange = vi.fn();
    render(<AddressPicker prefix="address" value={EMPTY_ADDRESS} onChange={onChange} />);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          provinceCode: DEFAULT_PROVINCE_CODE,
          provinceName: DEFAULT_PROVINCE_NAME,
        })
      );
    });
  });

  it("changing addressLine emits onChange with updated value", () => {
    const onChange = vi.fn();
    const populated = { ...EMPTY_ADDRESS, provinceCode: "32", provinceName: "Jawa Barat" };
    render(<AddressPicker prefix="address" value={populated} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/jalan/i), {
      target: { value: "Jl. Anggrek 1" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ addressLine: "Jl. Anggrek 1" })
    );
  });

  it("fetches villages lazily on district selection", async () => {
    const { fetchVillages } = await import("@/lib/address/resolve");
    const populated = {
      ...EMPTY_ADDRESS,
      provinceCode: "32", regencyCode: "3216", districtCode: "3216081",
    };
    render(<AddressPicker prefix="address" value={populated} onChange={() => {}} />);
    await waitFor(() => expect(fetchVillages).toHaveBeenCalledWith("3216081"));
  });
});

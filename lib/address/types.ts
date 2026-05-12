export type Province = { id: string; name: string };
export type Regency  = { id: string; province_id: string; name: string };
export type District = { id: string; regency_id: string; name: string };
export type Village  = { id: string; district_id: string; name: string };

export type AddressValue = {
  addressLine: string;
  villageCode: string;
  villageName: string;
  districtCode: string;
  districtName: string;
  regencyCode: string;
  regencyName: string;
  provinceCode: string;
  provinceName: string;
};

export const EMPTY_ADDRESS: AddressValue = {
  addressLine: "",
  villageCode: "", villageName: "",
  districtCode: "", districtName: "",
  regencyCode: "", regencyName: "",
  provinceCode: "", provinceName: "",
};

// Default initial picker state — Jabar (per spec §2.2)
export const DEFAULT_PROVINCE_CODE = "32";
export const DEFAULT_PROVINCE_NAME = "Jawa Barat";

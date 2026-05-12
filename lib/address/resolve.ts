import type { Province, Regency, District, Village } from "./types";
import provincesJson from "@/public/address/provinces.json";
import regenciesJson from "@/public/address/regencies.json";
import districtsJson from "@/public/address/districts.json";

const provinces = provincesJson as Province[];
const regencies = regenciesJson as Regency[];
const districts = districtsJson as District[];

export async function getProvinces(): Promise<Province[]> {
  return provinces;
}

export async function getRegencies(provinceCode: string): Promise<Regency[]> {
  return regencies.filter((r) => r.province_id === provinceCode);
}

export async function getDistricts(regencyCode: string): Promise<District[]> {
  return districts.filter((d) => d.regency_id === regencyCode);
}

export async function fetchVillages(districtCode: string): Promise<Village[]> {
  try {
    const res = await fetch(`/address/villages/${districtCode}.json`, { cache: "force-cache" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

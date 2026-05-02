// Indonesian + Islamic given-name pools used by the staging reseed.
// Not exhaustive — sized to produce plausible variety across ~200 students
// and ~30 employees without obvious repetition.

export const BOY_FIRST_NAMES = [
  "Ahmad",
  "Muhammad",
  "Abdullah",
  "Abdurrahman",
  "Ali",
  "Umar",
  "Yusuf",
  "Ibrahim",
  "Ismail",
  "Ilham",
  "Faris",
  "Fahri",
  "Hasan",
  "Husein",
  "Zaki",
  "Zaid",
  "Raihan",
  "Rafi",
  "Rizky",
  "Arif",
  "Aziz",
  "Bilal",
  "Daffa",
  "Dzaky",
  "Farel",
  "Hafiz",
  "Hamzah",
  "Kenzie",
  "Luthfi",
  "Malik",
  "Naufal",
  "Rayyan",
  "Rasyid",
  "Salman",
  "Tariq",
  "Ubaid",
  "Wahid",
  "Yazid",
  "Zidan",
  "Aqil",
];

export const GIRL_FIRST_NAMES = [
  "Aisyah",
  "Fatimah",
  "Khadijah",
  "Zahra",
  "Hafsa",
  "Maryam",
  "Safiya",
  "Sarah",
  "Amina",
  "Nadira",
  "Nabila",
  "Nisa",
  "Salsa",
  "Shafira",
  "Anisa",
  "Alya",
  "Bilqis",
  "Dania",
  "Dzakira",
  "Farah",
  "Humaira",
  "Inara",
  "Izzah",
  "Jihan",
  "Kayla",
  "Lubna",
  "Medina",
  "Mutia",
  "Nayla",
  "Putri",
  "Qonita",
  "Raisa",
  "Rania",
  "Salma",
  "Syifa",
  "Tazkia",
  "Umaima",
  "Widad",
  "Yasmin",
  "Zaina",
];

export const FAMILY_NAMES = [
  "Rahman",
  "Nugraha",
  "Saputra",
  "Hakim",
  "Pratama",
  "Wibowo",
  "Santoso",
  "Firmansyah",
  "Abdullah",
  "Kurniawan",
  "Nurhadi",
  "Wijaya",
  "Setiawan",
  "Ramadhan",
  "Hidayat",
  "Hermawan",
  "Siregar",
  "Lubis",
  "Nasution",
  "Harahap",
  "Fauzi",
  "Ridwan",
  "Yudhistira",
  "Permana",
  "Kusuma",
];

export const FEMALE_PARENT_TITLES = ["Ibu"];
export const FEMALE_PARENT_FIRST_NAMES = [
  "Nurul",
  "Rina",
  "Siti",
  "Dewi",
  "Lina",
  "Retno",
  "Widya",
  "Sari",
  "Ratna",
  "Wulan",
  "Indah",
  "Lestari",
  "Yuni",
  "Fitri",
  "Endang",
  "Tuti",
  "Desi",
  "Kartika",
  "Hana",
  "Rahma",
];

export const MALE_PARENT_TITLES = ["Bapak"];
export const MALE_PARENT_FIRST_NAMES = [
  "Agus",
  "Budi",
  "Dedi",
  "Eko",
  "Hadi",
  "Joko",
  "Krisna",
  "Mulyadi",
  "Rudi",
  "Slamet",
  "Tono",
  "Wahyu",
  "Yanto",
  "Zainal",
  "Andi",
  "Bayu",
  "Cahyo",
  "Doni",
  "Fajar",
  "Gilang",
];

export const OCCUPATIONS = [
  "Karyawan Swasta",
  "ASN",
  "Guru",
  "Wiraswasta",
  "Ibu Rumah Tangga",
] as const;

export const INCOME_RANGES = [
  "1-2jt",
  "3-5jt",
  "5-10jt",
  "7-10jt",
  "> 10jt",
] as const;

export const EDUCATION_LEVELS = ["SMA", "D3", "S1", "S2"] as const;

// ── Richer-data pools (Student/Parent/Employee field fill) ─────────────────

export const BIRTH_PLACES = [
  "Bekasi",
  "Jakarta",
  "Cikarang",
  "Bandung",
  "Surabaya",
  "Bogor",
  "Tangerang",
  "Depok",
  "Karawang",
  "Yogyakarta",
] as const;

export const BLOOD_TYPES = ["A", "B", "AB", "O"] as const;

export const HOBBIES = [
  "Menggambar",
  "Membaca buku cerita",
  "Bermain bola",
  "Bersepeda",
  "Memasak bersama ibu",
  "Mewarnai",
  "Bermain musik",
  "Menari",
  "Berenang",
  "Belajar mengaji",
] as const;

export const ALLERGIES = [
  "Tidak ada",
  "Tidak ada",
  "Tidak ada",
  "Susu sapi",
  "Telur",
  "Kacang",
  "Debu",
  "Seafood",
] as const;

/**
 * Bekasi-area address pool. Mixed kompleks/perumahan + RT/RW.
 * Realistic enough for screenshots; not real addresses.
 */
export const BEKASI_ADDRESSES = [
  "Perumahan Taman Aster Blok B2/14, RT 003 RW 005, Telaga Asih, Cikarang Barat",
  "Perum Metland Cibitung Blok M5/22, RT 008 RW 002, Telaga Murni, Cikarang Barat",
  "Jl. Raya Wanasari No. 45, RT 001 RW 004, Wanasari, Cibitung",
  "Perum Bumi Lestari Blok C3/8, RT 005 RW 007, Sukadami, Cikarang Selatan",
  "Jl. Anggrek IV No. 12, RT 002 RW 006, Telaga Asih, Cikarang Barat",
  "Perum Villa Mutiara Blok A1/5, RT 004 RW 003, Mekarwangi, Cikarang Barat",
  "Jl. Mawar Indah No. 27, RT 007 RW 001, Pasirgombong, Cikarang Utara",
  "Perum Cikarang Baru Blok F4/18, RT 003 RW 008, Jatibaru, Cikarang Timur",
  "Jl. Melati VII No. 9, RT 006 RW 005, Telaga Murni, Cikarang Barat",
  "Perumahan Graha Asri Blok D2/11, RT 002 RW 003, Cikarang Kota, Cikarang Utara",
  "Jl. Kenanga III No. 16, RT 005 RW 004, Wanasari, Cibitung",
  "Perum Permata Hijau Blok H6/30, RT 001 RW 002, Sukadami, Cikarang Selatan",
] as const;

export const EMPLOYERS = [
  "PT Astra International Tbk",
  "PT Telkom Indonesia",
  "PT Bank Mandiri Tbk",
  "PT Indofood Sukses Makmur",
  "PT Pertamina (Persero)",
  "PT Unilever Indonesia",
  "PT Toyota Motor Manufacturing Indonesia",
  "PT Indomarco Prismatama",
  "PT Bank Syariah Indonesia",
  "Yayasan An Nisaa' Sekolahku",
  "Wiraswasta",
  "Klinik Pratama Sehat Bersama",
  "PT Garuda Food Putra Putri Jaya",
  "RS Hermina Bekasi",
  "Dinas Pendidikan Kab. Bekasi",
] as const;

export const EMPLOYER_CITIES = [
  "Cikarang",
  "Bekasi",
  "Jakarta",
  "Tangerang",
  "Karawang",
  "Bogor",
] as const;

export const BANKS_WEIGHTED: Array<{ name: string; weight: number }> = [
  { name: "Bank Syariah Indonesia (BSI)", weight: 70 },
  { name: "BCA", weight: 25 },
  { name: "Mandiri", weight: 5 },
];

/**
 * Pick from a weighted list. Caller passes a 0..1 random sample.
 */
export function pickWeightedBank(sample: number): string {
  const total = BANKS_WEIGHTED.reduce((s, b) => s + b.weight, 0);
  let cur = 0;
  const target = sample * total;
  for (const b of BANKS_WEIGHTED) {
    cur += b.weight;
    if (target <= cur) return b.name;
  }
  return BANKS_WEIGHTED[BANKS_WEIGHTED.length - 1]!.name;
}

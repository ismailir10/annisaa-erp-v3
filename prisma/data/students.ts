// Synthetic demo dataset. Every name, date of birth, address, phone number,
// and guardian record below is fabricated for demo and E2E purposes. No real
// student or family appears in this file. Real records are kept locally and
// NEVER committed to this repo. See CONTRIBUTING / README for how to use a
// real dataset in a private deployment.
//
// Shape mirrors the production dataset so seed.ts works unchanged.

type Student = {
  name: string;
  nickname: string;
  dateOfBirth: string;
  gender: "L" | "P";
  address: string;
  classCode: string;
  guardians: {
    name: string;
    relationship: "AYAH" | "IBU";
    phone: string;
    whatsapp: string;
    isPrimary: boolean;
  }[];
};

const handCrafted: Student[] = [
  // ── TKIT A (8 students, born 2019-2020) ─────────────────────
  {
    name: "Ahmad Zafran Hidayat",
    nickname: "Zafran",
    dateOfBirth: "2019-03-15",
    gender: "L",
    address: "Jl. Aster Raya No. 12, Taman Aster, Bekasi",
    classCode: "TKIT_A",
    guardians: [
      { name: "Siti Nurhaliza Hidayat", relationship: "IBU", phone: "08129876543", whatsapp: "08129876543", isPrimary: true },
      { name: "Rudi Hidayat", relationship: "AYAH", phone: "08138765432", whatsapp: "08138765432", isPrimary: false },
    ],
  },
  {
    name: "Aisyah Putri Ramadhani",
    nickname: "Aisyah",
    dateOfBirth: "2019-07-22",
    gender: "P",
    address: "Perum Taman Aster Blok C3/10, Bekasi",
    classCode: "TKIT_A",
    guardians: [
      { name: "Dewi Sartika Ramadhani", relationship: "IBU", phone: "08215678901", whatsapp: "08215678901", isPrimary: true },
      { name: "Fajar Ramadhani", relationship: "AYAH", phone: "08567890123", whatsapp: "08567890123", isPrimary: false },
    ],
  },
  {
    name: "Muhammad Rafif Pratama",
    nickname: "Rafif",
    dateOfBirth: "2020-01-10",
    gender: "L",
    address: "Jl. Dahlia No. 5, Taman Aster, Bekasi",
    classCode: "TKIT_A",
    guardians: [
      { name: "Yuni Astuti Pratama", relationship: "IBU", phone: "08119876001", whatsapp: "08119876001", isPrimary: true },
      { name: "Hendra Pratama", relationship: "AYAH", phone: "08778890012", whatsapp: "08778890012", isPrimary: false },
    ],
  },
  {
    name: "Nayla Azzahra Kusuma",
    nickname: "Nayla",
    dateOfBirth: "2019-11-05",
    gender: "P",
    address: "Perum Taman Aster Blok D7/3, Bekasi",
    classCode: "TKIT_A",
    guardians: [
      { name: "Rina Wulandari Kusuma", relationship: "IBU", phone: "08521234567", whatsapp: "08521234567", isPrimary: true },
      { name: "Agus Kusuma", relationship: "AYAH", phone: "08132345678", whatsapp: "08132345678", isPrimary: false },
    ],
  },
  {
    name: "Khalid Fakhri Nugroho",
    nickname: "Khalid",
    dateOfBirth: "2020-04-18",
    gender: "L",
    address: "Jl. Melati No. 8, Taman Aster, Bekasi",
    classCode: "TKIT_A",
    guardians: [
      { name: "Fitriani Nugroho", relationship: "IBU", phone: "08179012345", whatsapp: "08179012345", isPrimary: true },
      { name: "Budi Nugroho", relationship: "AYAH", phone: "08561230456", whatsapp: "08561230456", isPrimary: false },
    ],
  },
  {
    name: "Zahra Khaira Azzam",
    nickname: "Zahra",
    dateOfBirth: "2019-09-30",
    gender: "P",
    address: "Perum Taman Aster Blok A1/15, Bekasi",
    classCode: "TKIT_A",
    guardians: [
      { name: "Nurul Hidayah Azzam", relationship: "IBU", phone: "08223456789", whatsapp: "08223456789", isPrimary: true },
      { name: "Irfan Azzam", relationship: "AYAH", phone: "08134567890", whatsapp: "08134567890", isPrimary: false },
    ],
  },
  {
    name: "Fatimah Nazwa Aulia",
    nickname: "Nazwa",
    dateOfBirth: "2020-02-14",
    gender: "P",
    address: "Jl. Kenanga No. 21, Taman Aster, Bekasi",
    classCode: "TKIT_A",
    guardians: [
      { name: "Lestari Aulia", relationship: "IBU", phone: "08115678234", whatsapp: "08115678234", isPrimary: true },
      { name: "Dimas Aulia", relationship: "AYAH", phone: "08780123456", whatsapp: "08780123456", isPrimary: false },
    ],
  },
  {
    name: "Gibran Alfarizi Hakim",
    nickname: "Gibran",
    dateOfBirth: "2019-06-08",
    gender: "L",
    address: "Perum Taman Aster Blok E2/7, Bekasi",
    classCode: "TKIT_A",
    guardians: [
      { name: "Anisa Hakim", relationship: "IBU", phone: "08529876123", whatsapp: "08529876123", isPrimary: true },
      { name: "Rizki Hakim", relationship: "AYAH", phone: "08137654321", whatsapp: "08137654321", isPrimary: false },
    ],
  },

  // ── TKIT B (8 students, born 2019-2020) ─────────────────────
  {
    name: "Raditya Arkan Wibowo",
    nickname: "Arkan",
    dateOfBirth: "2019-05-20",
    gender: "L",
    address: "Jl. Anggrek No. 3, Taman Aster, Bekasi",
    classCode: "TKIT_B",
    guardians: [
      { name: "Sri Wahyuni Wibowo", relationship: "IBU", phone: "08211234890", whatsapp: "08211234890", isPrimary: true },
      { name: "Arief Wibowo", relationship: "AYAH", phone: "08568901234", whatsapp: "08568901234", isPrimary: false },
    ],
  },
  {
    name: "Khadijah Salsabila Putra",
    nickname: "Salsa",
    dateOfBirth: "2020-03-12",
    gender: "P",
    address: "Perum Taman Aster Blok B5/9, Bekasi",
    classCode: "TKIT_B",
    guardians: [
      { name: "Mega Purnama Putra", relationship: "IBU", phone: "08123456012", whatsapp: "08123456012", isPrimary: true },
      { name: "Wahyu Putra", relationship: "AYAH", phone: "08779012345", whatsapp: "08779012345", isPrimary: false },
    ],
  },
  {
    name: "Naufal Haidar Syahputra",
    nickname: "Haidar",
    dateOfBirth: "2019-08-25",
    gender: "L",
    address: "Jl. Bougenville No. 14, Taman Aster, Bekasi",
    classCode: "TKIT_B",
    guardians: [
      { name: "Ratna Dewi Syahputra", relationship: "IBU", phone: "08525678901", whatsapp: "08525678901", isPrimary: true },
      { name: "Dani Syahputra", relationship: "AYAH", phone: "08131234567", whatsapp: "08131234567", isPrimary: false },
    ],
  },
  {
    name: "Alya Safira Ramadhan",
    nickname: "Alya",
    dateOfBirth: "2020-06-03",
    gender: "P",
    address: "Perum Taman Aster Blok F1/2, Bekasi",
    classCode: "TKIT_B",
    guardians: [
      { name: "Indah Permata Ramadhan", relationship: "IBU", phone: "08176543210", whatsapp: "08176543210", isPrimary: true },
      { name: "Eko Ramadhan", relationship: "AYAH", phone: "08560987654", whatsapp: "08560987654", isPrimary: false },
    ],
  },
  {
    name: "Dzaki Akbar Firmansyah",
    nickname: "Dzaki",
    dateOfBirth: "2019-12-19",
    gender: "L",
    address: "Jl. Mawar No. 30, Taman Aster, Bekasi",
    classCode: "TKIT_B",
    guardians: [
      { name: "Kartini Firmansyah", relationship: "IBU", phone: "08223456012", whatsapp: "08223456012", isPrimary: true },
      { name: "Teguh Firmansyah", relationship: "AYAH", phone: "08139876012", whatsapp: "08139876012", isPrimary: false },
    ],
  },
  {
    name: "Syifa Amira Santoso",
    nickname: "Syifa",
    dateOfBirth: "2020-05-07",
    gender: "P",
    address: "Perum Taman Aster Blok G3/11, Bekasi",
    classCode: "TKIT_B",
    guardians: [
      { name: "Widiawati Santoso", relationship: "IBU", phone: "08110234567", whatsapp: "08110234567", isPrimary: true },
      { name: "Joko Santoso", relationship: "AYAH", phone: "08782345678", whatsapp: "08782345678", isPrimary: false },
    ],
  },
  {
    name: "Rafa Athallah Setiawan",
    nickname: "Rafa",
    dateOfBirth: "2019-10-14",
    gender: "L",
    address: "Jl. Flamboyan No. 9, Taman Aster, Bekasi",
    classCode: "TKIT_B",
    guardians: [
      { name: "Nur Aisyah Setiawan", relationship: "IBU", phone: "08527890123", whatsapp: "08527890123", isPrimary: true },
      { name: "Prasetyo Setiawan", relationship: "AYAH", phone: "08136789012", whatsapp: "08136789012", isPrimary: false },
    ],
  },
  {
    name: "Hana Maryam Hidayatullah",
    nickname: "Hana",
    dateOfBirth: "2020-01-28",
    gender: "P",
    address: "Perum Taman Aster Blok H2/6, Bekasi",
    classCode: "TKIT_B",
    guardians: [
      { name: "Dian Rahmawati Hidayatullah", relationship: "IBU", phone: "08214567890", whatsapp: "08214567890", isPrimary: true },
      { name: "Muhamad Hidayatullah", relationship: "AYAH", phone: "08563210987", whatsapp: "08563210987", isPrimary: false },
    ],
  },

  // ── KB ASTER (6 students, born 2020-2021) ───────────────────
  {
    name: "Bilal Hafidzh Rahman",
    nickname: "Bilal",
    dateOfBirth: "2021-02-10",
    gender: "L",
    address: "Jl. Teratai No. 6, Taman Aster, Bekasi",
    classCode: "KB_ASTER",
    guardians: [
      { name: "Fatimah Rahman", relationship: "IBU", phone: "08120345678", whatsapp: "08120345678", isPrimary: true },
      { name: "Soleh Rahman", relationship: "AYAH", phone: "08770123456", whatsapp: "08770123456", isPrimary: false },
    ],
  },
  {
    name: "Qanita Zahra Firdaus",
    nickname: "Qanita",
    dateOfBirth: "2020-09-17",
    gender: "P",
    address: "Perum Taman Aster Blok I4/8, Bekasi",
    classCode: "KB_ASTER",
    guardians: [
      { name: "Aminah Firdaus", relationship: "IBU", phone: "08526789012", whatsapp: "08526789012", isPrimary: true },
      { name: "Hasan Firdaus", relationship: "AYAH", phone: "08130456789", whatsapp: "08130456789", isPrimary: false },
    ],
  },
  {
    name: "Yusuf Abdillah Harahap",
    nickname: "Yusuf",
    dateOfBirth: "2021-04-03",
    gender: "L",
    address: "Jl. Cempaka No. 18, Taman Aster, Bekasi",
    classCode: "KB_ASTER",
    guardians: [
      { name: "Khadijah Harahap", relationship: "IBU", phone: "08178901234", whatsapp: "08178901234", isPrimary: true },
      { name: "Abdullah Harahap", relationship: "AYAH", phone: "08564321098", whatsapp: "08564321098", isPrimary: false },
    ],
  },
  {
    name: "Safiya Nadia Wijaya",
    nickname: "Safiya",
    dateOfBirth: "2020-12-25",
    gender: "P",
    address: "Perum Taman Aster Blok J1/4, Bekasi",
    classCode: "KB_ASTER",
    guardians: [
      { name: "Lia Marlina Wijaya", relationship: "IBU", phone: "08219876543", whatsapp: "08219876543", isPrimary: true },
      { name: "Bambang Wijaya", relationship: "AYAH", phone: "08783456789", whatsapp: "08783456789", isPrimary: false },
    ],
  },
  {
    name: "Farhan Muzakki Saputra",
    nickname: "Farhan",
    dateOfBirth: "2021-06-14",
    gender: "L",
    address: "Jl. Seroja No. 22, Taman Aster, Bekasi",
    classCode: "KB_ASTER",
    guardians: [
      { name: "Sulistyowati Saputra", relationship: "IBU", phone: "08112345678", whatsapp: "08112345678", isPrimary: true },
      { name: "Toni Saputra", relationship: "AYAH", phone: "08135678901", whatsapp: "08135678901", isPrimary: false },
    ],
  },
  {
    name: "Maryam Husna Lubis",
    nickname: "Maryam",
    dateOfBirth: "2021-01-08",
    gender: "P",
    address: "Perum Taman Aster Blok K2/12, Bekasi",
    classCode: "KB_ASTER",
    guardians: [
      { name: "Rizka Amalia Lubis", relationship: "IBU", phone: "08524567890", whatsapp: "08524567890", isPrimary: true },
      { name: "Ahmad Lubis", relationship: "AYAH", phone: "08139012345", whatsapp: "08139012345", isPrimary: false },
    ],
  },

  // ── KB METLAND (4 students, born 2021-2022) ─────────────────
  {
    name: "Umar Fadhil Kurniawan",
    nickname: "Umar",
    dateOfBirth: "2021-08-20",
    gender: "L",
    address: "Metland Cibitung Blok AA5/12, Cibitung, Bekasi",
    classCode: "KB_METLAND",
    guardians: [
      { name: "Dina Puspitasari Kurniawan", relationship: "IBU", phone: "08217654321", whatsapp: "08217654321", isPrimary: true },
      { name: "Yanto Kurniawan", relationship: "AYAH", phone: "08567654321", whatsapp: "08567654321", isPrimary: false },
    ],
  },
  {
    name: "Ruqayyah Inara Prasetya",
    nickname: "Inara",
    dateOfBirth: "2022-03-05",
    gender: "P",
    address: "Metland Cibitung Blok BB2/8, Cibitung, Bekasi",
    classCode: "KB_METLAND",
    guardians: [
      { name: "Endah Wahyuni Prasetya", relationship: "IBU", phone: "08121098765", whatsapp: "08121098765", isPrimary: true },
      { name: "Gunawan Prasetya", relationship: "AYAH", phone: "08773210987", whatsapp: "08773210987", isPrimary: false },
    ],
  },
  {
    name: "Ilham Rasyid Utomo",
    nickname: "Ilham",
    dateOfBirth: "2021-11-12",
    gender: "L",
    address: "Metland Cibitung Blok CC7/3, Cibitung, Bekasi",
    classCode: "KB_METLAND",
    guardians: [
      { name: "Sari Mulyani Utomo", relationship: "IBU", phone: "08526543210", whatsapp: "08526543210", isPrimary: true },
      { name: "Hendri Utomo", relationship: "AYAH", phone: "08132109876", whatsapp: "08132109876", isPrimary: false },
    ],
  },
  {
    name: "Kayla Aqila Permana",
    nickname: "Kayla",
    dateOfBirth: "2022-01-18",
    gender: "P",
    address: "Metland Cibitung Blok DD3/5, Cibitung, Bekasi",
    classCode: "KB_METLAND",
    guardians: [
      { name: "Tri Handayani Permana", relationship: "IBU", phone: "08175432109", whatsapp: "08175432109", isPrimary: true },
      { name: "Sigit Permana", relationship: "AYAH", phone: "08564109876", whatsapp: "08564109876", isPrimary: false },
    ],
  },

  // ── DCARE (3 students, born 2022-2023) ──────────────────────
  {
    name: "Hamzah Zain Mahendra",
    nickname: "Hamzah",
    dateOfBirth: "2023-04-09",
    gender: "L",
    address: "Jl. Lotus No. 7, Taman Aster, Bekasi",
    classCode: "DCARE",
    guardians: [
      { name: "Putri Ayu Mahendra", relationship: "IBU", phone: "08218765432", whatsapp: "08218765432", isPrimary: true },
      { name: "Ferry Mahendra", relationship: "AYAH", phone: "08784567012", whatsapp: "08784567012", isPrimary: false },
    ],
  },
  {
    name: "Shafiyya Nur Anggraini",
    nickname: "Shafi",
    dateOfBirth: "2022-10-30",
    gender: "P",
    address: "Perum Taman Aster Blok L3/1, Bekasi",
    classCode: "DCARE",
    guardians: [
      { name: "Wulan Anggraini", relationship: "IBU", phone: "08125432109", whatsapp: "08125432109", isPrimary: true },
      { name: "Ridwan Anggraini", relationship: "AYAH", phone: "08776543210", whatsapp: "08776543210", isPrimary: false },
    ],
  },
  {
    name: "Uwais Abdurrahman Putranto",
    nickname: "Uwais",
    dateOfBirth: "2023-01-15",
    gender: "L",
    address: "Jl. Sakura No. 11, Taman Aster, Bekasi",
    classCode: "DCARE",
    guardians: [
      { name: "Laila Safitri Putranto", relationship: "IBU", phone: "08523456012", whatsapp: "08523456012", isPrimary: true },
      { name: "Andi Putranto", relationship: "AYAH", phone: "08136012345", whatsapp: "08136012345", isPrimary: false },
    ],
  },

  // ── POPUP (1 student, born 2021) ────────────────────────────
  {
    name: "Salman Alfarisi Darmawan",
    nickname: "Salman",
    dateOfBirth: "2021-07-22",
    gender: "L",
    address: "Jl. Kamboja No. 4, Taman Aster, Bekasi",
    classCode: "POPUP",
    guardians: [
      { name: "Nadia Hapsari Darmawan", relationship: "IBU", phone: "08216789012", whatsapp: "08216789012", isPrimary: true },
      { name: "Wahid Darmawan", relationship: "AYAH", phone: "08569876543", whatsapp: "08569876543", isPrimary: false },
    ],
  },
];

// ── Bulk procedural students ───────────────────────────────────
// Scales the synthetic dataset to ~100 students so list pagination,
// filtering, and attendance grids are exercised under realistic volume.
// No stable IDs needed — no e2e test references these by name.
const boyFirstNames = [
  "Ahmad", "Muhammad", "Abdul", "Fahri", "Fikri", "Rafi", "Razan", "Daffa", "Irsyad",
  "Naufal", "Zidan", "Aryan", "Hafiz", "Hakam", "Akmal", "Reyhan", "Syauqi",
  "Luqman", "Hanif", "Yusuf", "Ismail", "Idris", "Ayyub", "Harun", "Zaki",
];
const girlFirstNames = [
  "Aisyah", "Fatimah", "Khadijah", "Hafsah", "Maryam", "Zahra", "Laila",
  "Nadia", "Nabila", "Aira", "Aqila", "Keisha", "Shafira", "Salma", "Humaira",
  "Talita", "Hanna", "Alika", "Naila", "Ranti", "Inaya", "Aliyya", "Syakila",
  "Raisa", "Azzahra",
];
const familyNames = [
  "Santoso", "Wibowo", "Kurniawan", "Suryadi", "Gunawan", "Hidayat", "Rahman",
  "Mahendra", "Prasetyo", "Pratama", "Nugroho", "Wahyudi", "Iskandar", "Hasibuan",
  "Siregar", "Harahap", "Tambunan", "Sitompul", "Lubis", "Saragih", "Permana",
  "Sudirman", "Anggraini", "Firmansyah", "Susanto",
];
const addresses = [
  "Jl. Aster Raya No.", "Jl. Melati Indah No.", "Jl. Dahlia Permai No.",
  "Jl. Kenanga Asri No.", "Perum Taman Aster Blok", "Perum Metland Cibitung Blok",
  "Jl. Cempaka Wangi No.", "Jl. Mawar Merah No.", "Jl. Anggrek Biru No.",
];

const bulkQuota: { classCode: string; n: number; birthYear: [number, number]; campusTag: "aster" | "metland" }[] = [
  { classCode: "TKIT_A",     n: 12, birthYear: [2019, 2020], campusTag: "aster" },
  { classCode: "TKIT_B",     n: 12, birthYear: [2019, 2020], campusTag: "aster" },
  { classCode: "KB_ASTER",   n: 9,  birthYear: [2020, 2021], campusTag: "aster" },
  { classCode: "KB_METLAND", n: 11, birthYear: [2021, 2022], campusTag: "metland" },
  { classCode: "DCARE",      n: 7,  birthYear: [2022, 2023], campusTag: "aster" },
  { classCode: "POPUP",      n: 19, birthYear: [2019, 2022], campusTag: "aster" },
];

const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const pick = <T>(arr: T[], i: number) => arr[i % arr.length];

const bulk: Student[] = [];
let serial = 0;
for (const q of bulkQuota) {
  for (let i = 0; i < q.n; i++) {
    const isBoy = serial % 2 === 0;
    const first = isBoy ? pick(boyFirstNames, serial) : pick(girlFirstNames, serial);
    const mid   = pick(isBoy ? girlFirstNames : boyFirstNames, serial + 3); // filler
    const family = pick(familyNames, serial + 5);
    const name = `${first} ${mid} ${family}`;
    const nickname = first;
    const year = q.birthYear[0] + ((serial + i) % (q.birthYear[1] - q.birthYear[0] + 1));
    const month = pad(((serial * 7 + i * 3) % 12) + 1, 2);
    const day   = pad(((serial * 11 + i) % 27) + 1, 2);
    const dateOfBirth = `${year}-${month}-${day}`;
    const addr = pick(addresses, serial) + ` ${(serial % 80) + 1}, ${q.campusTag === "aster" ? "Taman Aster, Bekasi" : "Metland Cibitung, Bekasi"}`;
    const phoneSuffix = pad(1000 + serial * 17, 8);
    const motherName = `${pick(girlFirstNames, serial + 4)} ${family}`;
    const fatherName = `${pick(boyFirstNames, serial + 7)} ${family}`;
    bulk.push({
      name,
      nickname,
      dateOfBirth,
      gender: isBoy ? "L" : "P",
      address: addr,
      classCode: q.classCode,
      guardians: [
        { name: motherName, relationship: "IBU", phone: `0812${phoneSuffix}`, whatsapp: `0812${phoneSuffix}`, isPrimary: true },
        { name: fatherName, relationship: "AYAH", phone: `0813${phoneSuffix}`, whatsapp: `0813${phoneSuffix}`, isPrimary: false },
      ],
    });
    serial++;
  }
}

export const students: Student[] = [...handCrafted, ...bulk];

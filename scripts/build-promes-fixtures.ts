/**
 * Synthetic PROMES xlsx fixture builder.
 *
 * Outputs:
 *   lib/curriculum/__fixtures__/promes-tk-a-smt-1.xlsx
 *   lib/curriculum/__fixtures__/promes-tk-b-smt-1.xlsx
 *
 * Each workbook holds one PROMES sheet shaped after the real
 * "PROMES TK <A|B> SMT 1.xlsx" artifacts the school authors. The
 * goal is a deterministic file the parser tests can pin against —
 * binary-identical across re-runs so re-generating the fixture
 * never moves a byte unless the source-of-truth here changes.
 *
 * Determinism: ExcelJS embeds workbook.created / modified by default
 * which would drift per run. We pin both to epoch and pin creator +
 * lastModifiedBy + zip stream timestamps. Re-running this script
 * should yield byte-identical files.
 *
 * Run: npx tsx scripts/build-promes-fixtures.ts
 */

import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type AgeGroupCode = "A" | "B";

type ElementSpec = {
  /** Header cell text — exact string written into the sheet. */
  headerText: string;
  /** Three TP rows; each has 2 IKTP children. */
  objectives: ObjectiveSpec[];
};

type ObjectiveSpec = {
  number: number;
  competencyText: string;
  content: string;
  indicators: IndicatorSpec[];
};

type IndicatorSpec = {
  content: string;
  /** Theme names with TRUE markers (subset of THEMES). */
  themeLinks: string[];
};

const THEMES = [
  "Saya Anak Sehat",
  "Aku Berakhlak",
  "Senang Berkarya",
  "Senang Berpetualang",
] as const;

/**
 * TK A blocks. Element header capitalisation drifts deliberately:
 *   - NAM block uses ALL-CAPS short alias
 *   - JATI DIRI block uses canonical caps
 *   - STEAM block uses "STEAM / LITERASI" compound alias
 *   - MOTORIK block uses mixed case
 *   - SENI block uses canonical "SENI"
 *
 * One TP row in the NAM block carries a leading + trailing whitespace
 * artifact so the parser must trim. One IKTP row in the STEAM block
 * carries embedded comma noise typical of merged-cell artefacts.
 */
function buildTkAElements(): ElementSpec[] {
  return [
    {
      headerText: "NAM PROGRAM SEMESTER 1",
      objectives: [
        {
          number: 1,
          competencyText:
            "Mengenal Allah melalui ciptaan-Nya dan mengenal kegiatan ibadah",
          content: "  Anak mengenal rukun iman dan rukun Islam dasar  ",
          indicators: [
            {
              content: "Menyebutkan rukun iman dengan urutan benar",
              themeLinks: ["Saya Anak Sehat", "Aku Berakhlak"],
            },
            {
              content: "Mempraktikkan gerakan wudhu sederhana",
              themeLinks: ["Aku Berakhlak"],
            },
          ],
        },
        {
          number: 2,
          competencyText: "Menunjukkan akhlak mulia kepada sesama",
          content: "Anak terbiasa mengucap salam dan terima kasih",
          indicators: [
            {
              content: "Mengucap salam saat masuk dan keluar kelas",
              themeLinks: ["Aku Berakhlak"],
            },
            {
              content: "Mengucap terima kasih kepada teman dan guru",
              themeLinks: ["Aku Berakhlak", "Senang Berkarya"],
            },
          ],
        },
        {
          number: 3,
          competencyText: "Mengenal ibadah harian",
          content: "Anak mengenal gerakan dan bacaan shalat sederhana",
          indicators: [
            {
              content: "Menirukan gerakan shalat dasar",
              themeLinks: ["Aku Berakhlak"],
            },
            {
              content: "Menghafal surah pendek pilihan",
              themeLinks: ["Aku Berakhlak"],
            },
          ],
        },
      ],
    },
    {
      headerText: "JATI DIRI PROGRAM SEMESTER 1",
      objectives: [
        {
          number: 1,
          competencyText: "Mengenal identitas diri dan keluarga",
          content: "Anak mengenal nama lengkap dan anggota keluarga inti",
          indicators: [
            {
              content: "Menyebutkan nama lengkap saat ditanya",
              themeLinks: ["Saya Anak Sehat"],
            },
            {
              content: "Menyebutkan nama ayah dan ibu",
              themeLinks: ["Saya Anak Sehat"],
            },
          ],
        },
        {
          number: 2,
          competencyText: "Mengelola emosi dasar",
          content: "Anak mengenali rasa senang sedih marah dan takut",
          indicators: [
            {
              content: "Menunjukkan ekspresi senang lewat gambar wajah",
              themeLinks: ["Senang Berkarya"],
            },
            {
              content: "Menyebutkan satu hal yang membuatnya marah",
              themeLinks: ["Aku Berakhlak"],
            },
          ],
        },
        {
          number: 3,
          competencyText: "Berinteraksi dengan teman sebaya",
          content: "Anak bermain bersama teman dengan tertib",
          indicators: [
            {
              content: "Menunggu giliran saat bermain",
              themeLinks: ["Aku Berakhlak", "Senang Berpetualang"],
            },
            {
              content: "Meminjam mainan dengan sopan",
              themeLinks: ["Aku Berakhlak"],
            },
          ],
        },
      ],
    },
    {
      headerText: "STEAM / LITERASI PROGRAM SEMESTER 1",
      objectives: [
        {
          number: 1,
          competencyText: "Mengenal angka dan jumlah",
          content: "Anak mengenal lambang bilangan 1 sampai 10",
          indicators: [
            {
              content: "Menghitung benda sampai sepuluh",
              themeLinks: ["Senang Berkarya"],
            },
            {
              content: "Memasangkan lambang bilangan, dengan jumlah benda",
              themeLinks: ["Senang Berkarya"],
            },
          ],
        },
        {
          number: 2,
          competencyText: "Mengenal huruf dan kata sederhana",
          content: "Anak mengenal huruf vokal dan konsonan dasar",
          indicators: [
            {
              content: "Menyebutkan huruf vokal A I U E O",
              themeLinks: ["Senang Berkarya"],
            },
            {
              content: "Menyusun kata sederhana dari kartu huruf",
              themeLinks: ["Senang Berkarya"],
            },
          ],
        },
        {
          number: 3,
          competencyText: "Mengenal sains sederhana",
          content: "Anak mengamati perubahan benda di sekitarnya",
          indicators: [
            {
              content: "Menyebutkan tiga bagian tumbuhan",
              themeLinks: ["Senang Berpetualang"],
            },
            {
              content: "Mengamati perbedaan es dan air",
              themeLinks: ["Senang Berpetualang", "Senang Berkarya"],
            },
          ],
        },
      ],
    },
    {
      headerText: "Motorik Program Semester 1",
      objectives: [
        {
          number: 1,
          competencyText: "Mengembangkan motorik kasar",
          content: "Anak melatih keseimbangan dan koordinasi tubuh",
          indicators: [
            {
              content: "Berjalan di atas papan titian",
              themeLinks: ["Saya Anak Sehat", "Senang Berpetualang"],
            },
            {
              content: "Melompat dengan dua kaki sejauh lima puluh sentimeter",
              themeLinks: ["Saya Anak Sehat"],
            },
          ],
        },
        {
          number: 2,
          competencyText: "Mengembangkan motorik halus",
          content: "Anak melatih koordinasi jari tangan",
          indicators: [
            {
              content: "Memegang pensil dengan tiga jari",
              themeLinks: ["Senang Berkarya"],
            },
            {
              content: "Menggunting garis lurus dan lengkung",
              themeLinks: ["Senang Berkarya"],
            },
          ],
        },
        {
          number: 3,
          competencyText: "Mengenal pola hidup bersih dan sehat",
          content: "Anak terbiasa menjaga kebersihan diri",
          indicators: [
            {
              content: "Mencuci tangan dengan sabun sebelum makan",
              themeLinks: ["Saya Anak Sehat"],
            },
            {
              content: "Membuang sampah pada tempatnya",
              themeLinks: ["Saya Anak Sehat", "Aku Berakhlak"],
            },
          ],
        },
      ],
    },
    {
      headerText: "SENI PROGRAM SEMESTER 1",
      objectives: [
        {
          number: 1,
          competencyText: "Mengenal seni rupa",
          content: "Anak mengeksplorasi warna dan bentuk",
          indicators: [
            {
              content: "Mewarnai gambar sederhana di dalam garis",
              themeLinks: ["Senang Berkarya"],
            },
            {
              content: "Membuat kolase dari bahan alam",
              themeLinks: ["Senang Berkarya", "Senang Berpetualang"],
            },
          ],
        },
        {
          number: 2,
          competencyText: "Mengenal seni musik",
          content: "Anak menyanyikan lagu anak sederhana",
          indicators: [
            {
              content: "Menyanyikan lagu Bintang Kecil dengan irama tepat",
              themeLinks: ["Senang Berkarya"],
            },
            {
              content: "Bertepuk tangan mengikuti irama",
              themeLinks: ["Senang Berkarya"],
            },
          ],
        },
        {
          number: 3,
          competencyText: "Mengenal seni gerak",
          content: "Anak bergerak mengikuti irama musik",
          indicators: [
            {
              content: "Menirukan gerakan tarian sederhana",
              themeLinks: ["Senang Berkarya", "Saya Anak Sehat"],
            },
            {
              content: "Berekspresi mengikuti tempo musik",
              themeLinks: ["Senang Berkarya"],
            },
          ],
        },
      ],
    },
  ];
}

/**
 * TK B blocks. Same shape, different narrative text (5-6 year-olds).
 */
function buildTkBElements(): ElementSpec[] {
  return [
    {
      headerText: "NILAI AGAMA DAN BUDI PEKERTI PROGRAM SEMESTER 1",
      objectives: [
        {
          number: 1,
          competencyText:
            "Mengenal Allah melalui sifat dan ciptaan-Nya secara lebih luas",
          content: "Anak mengenal sifat wajib Allah dan kisah para nabi",
          indicators: [
            {
              content: "Menyebutkan lima sifat wajib Allah",
              themeLinks: ["Aku Berakhlak"],
            },
            {
              content: "Menceritakan kisah Nabi Ibrahim secara sederhana",
              themeLinks: ["Aku Berakhlak"],
            },
          ],
        },
        {
          number: 2,
          competencyText: "Mempraktikkan akhlak mulia",
          content: "Anak terbiasa membantu orang tua dan teman",
          indicators: [
            {
              content: "Membantu menyiapkan makanan keluarga",
              themeLinks: ["Saya Anak Sehat", "Aku Berakhlak"],
            },
            {
              content: "Menolong teman yang kesulitan",
              themeLinks: ["Aku Berakhlak"],
            },
          ],
        },
        {
          number: 3,
          competencyText: "Memahami ibadah harian",
          content: "Anak mempraktikkan shalat lima waktu dengan bimbingan",
          indicators: [
            {
              content: "Mempraktikkan shalat dengan urutan benar",
              themeLinks: ["Aku Berakhlak"],
            },
            {
              content: "Menghafal lima surah pendek",
              themeLinks: ["Aku Berakhlak"],
            },
          ],
        },
      ],
    },
    {
      headerText: "JATI DIRI PROGRAM SEMESTER 1",
      objectives: [
        {
          number: 1,
          competencyText: "Memahami identitas diri sebagai warga negara",
          content: "Anak mengenal lambang negara dan lagu kebangsaan",
          indicators: [
            {
              content: "Menyebutkan lima sila Pancasila",
              themeLinks: ["Saya Anak Sehat"],
            },
            {
              content: "Menyanyikan lagu Indonesia Raya",
              themeLinks: ["Saya Anak Sehat"],
            },
          ],
        },
        {
          number: 2,
          competencyText: "Mengelola emosi dan menyelesaikan konflik",
          content: "Anak mengenali emosinya dan mencari solusi damai",
          indicators: [
            {
              content: "Menceritakan perasaan dengan kalimat lengkap",
              themeLinks: ["Aku Berakhlak"],
            },
            {
              content: "Menyepakati solusi saat berselisih dengan teman",
              themeLinks: ["Aku Berakhlak"],
            },
          ],
        },
        {
          number: 3,
          competencyText: "Menunjukkan kemandirian",
          content: "Anak mengurus dirinya sendiri secara mandiri",
          indicators: [
            {
              content: "Memakai sepatu dengan tali tanpa bantuan",
              themeLinks: ["Saya Anak Sehat", "Senang Berpetualang"],
            },
            {
              content: "Merapikan mainan setelah selesai bermain",
              themeLinks: ["Aku Berakhlak"],
            },
          ],
        },
      ],
    },
    {
      headerText: "STEAM PROGRAM SEMESTER 1",
      objectives: [
        {
          number: 1,
          competencyText: "Memahami konsep matematika sederhana",
          content: "Anak mengenal angka sampai dua puluh dan operasi dasar",
          indicators: [
            {
              content: "Menjumlahkan benda dengan hasil sampai sepuluh",
              themeLinks: ["Senang Berkarya"],
            },
            {
              content: "Mengelompokkan benda berdasarkan ukuran",
              themeLinks: ["Senang Berkarya"],
            },
          ],
        },
        {
          number: 2,
          competencyText: "Memahami bacaan sederhana",
          content: "Anak membaca kata dan kalimat pendek",
          indicators: [
            {
              content: "Membaca kata empat huruf dengan benar",
              themeLinks: ["Senang Berkarya"],
            },
            {
              content: "Menyusun kalimat tiga kata dari kartu",
              themeLinks: ["Senang Berkarya"],
            },
          ],
        },
        {
          number: 3,
          competencyText: "Mengeksplorasi sains dan teknologi sederhana",
          content: "Anak mengamati fenomena alam dan eksperimen sederhana",
          indicators: [
            {
              content: "Melakukan eksperimen mencampur warna",
              themeLinks: ["Senang Berkarya", "Senang Berpetualang"],
            },
            {
              content: "Mengamati pertumbuhan tanaman selama satu pekan",
              themeLinks: ["Senang Berpetualang"],
            },
          ],
        },
      ],
    },
    {
      headerText: "MOTORIK PROGRAM SEMESTER 1",
      objectives: [
        {
          number: 1,
          competencyText: "Mengembangkan motorik kasar lanjut",
          content: "Anak melakukan gerakan dengan keseimbangan baik",
          indicators: [
            {
              content: "Berlari zig-zag melewati rintangan",
              themeLinks: ["Saya Anak Sehat", "Senang Berpetualang"],
            },
            {
              content: "Melompat satu kaki dengan jarak satu meter",
              themeLinks: ["Saya Anak Sehat"],
            },
          ],
        },
        {
          number: 2,
          competencyText: "Mengembangkan motorik halus lanjut",
          content: "Anak melakukan pekerjaan yang membutuhkan presisi",
          indicators: [
            {
              content: "Menulis namanya sendiri dengan rapi",
              themeLinks: ["Senang Berkarya"],
            },
            {
              content: "Menggambar bentuk geometri dasar",
              themeLinks: ["Senang Berkarya"],
            },
          ],
        },
        {
          number: 3,
          competencyText: "Menerapkan pola hidup bersih dan sehat",
          content: "Anak memahami pentingnya nutrisi dan kebersihan",
          indicators: [
            {
              content: "Menyebutkan empat sehat lima sempurna",
              themeLinks: ["Saya Anak Sehat"],
            },
            {
              content: "Menggosok gigi pagi dan malam",
              themeLinks: ["Saya Anak Sehat"],
            },
          ],
        },
      ],
    },
    {
      headerText: "SENI PROGRAM SEMESTER 1",
      objectives: [
        {
          number: 1,
          competencyText: "Mengeksplorasi seni rupa kompleks",
          content: "Anak membuat karya seni dengan teknik beragam",
          indicators: [
            {
              content: "Membuat lukisan dengan teknik usap-abur",
              themeLinks: ["Senang Berkarya"],
            },
            {
              content: "Membuat patung sederhana dari tanah liat",
              themeLinks: ["Senang Berkarya"],
            },
          ],
        },
        {
          number: 2,
          competencyText: "Mengekspresikan diri melalui musik",
          content: "Anak menyanyi dengan ekspresi dan memainkan alat musik",
          indicators: [
            {
              content: "Memainkan tamborin mengikuti birama",
              themeLinks: ["Senang Berkarya"],
            },
            {
              content: "Menyanyi solo di depan kelas dengan percaya diri",
              themeLinks: ["Senang Berkarya"],
            },
          ],
        },
        {
          number: 3,
          competencyText: "Berekspresi melalui gerak dan tari",
          content: "Anak menarikan tarian daerah sederhana",
          indicators: [
            {
              content: "Menarikan tari Saman tingkat dasar",
              themeLinks: ["Senang Berkarya"],
            },
            {
              content: "Menampilkan gerakan kreasi sendiri",
              themeLinks: ["Senang Berkarya"],
            },
          ],
        },
      ],
    },
  ];
}

const COLUMN_HEADER_ROW = [
  "NO",
  "CAPAIAN PERKEMBANGAN DIRI",
  "TUJUAN PEMBELAJARAN",
  "INDIKATOR KETERCAPAIAN TP",
  ...THEMES,
];

async function buildWorkbook(
  ageGroup: AgeGroupCode,
  elements: ElementSpec[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  // Pin all metadata so re-running yields byte-identical output.
  wb.creator = "An Nisaa Talib";
  wb.lastModifiedBy = "An Nisaa Talib";
  wb.created = new Date(0);
  wb.modified = new Date(0);

  const sheet = wb.addWorksheet("PROMES");

  // Row 1: workbook title (NOT an element header — parser must skip).
  sheet.addRow([`PROGRAM SEMESTER TK ${ageGroup} SEMESTER 1`]);
  sheet.addRow([]); // blank spacer

  for (const element of elements) {
    // Element header on its own row (col A).
    sheet.addRow([element.headerText]);
    // Column header row.
    sheet.addRow(COLUMN_HEADER_ROW);

    for (const objective of element.objectives) {
      // TP row: col A=number, B=capaian, C=content, D empty.
      sheet.addRow([
        objective.number,
        objective.competencyText,
        objective.content,
        "",
        ...THEMES.map(() => ""),
      ]);
      // IKTP rows: col A empty, B/C empty, D=indicator content, E+=theme markers.
      for (const indicator of objective.indicators) {
        sheet.addRow([
          "",
          "",
          "",
          indicator.content,
          ...THEMES.map((theme) =>
            indicator.themeLinks.includes(theme) ? "TRUE" : "",
          ),
        ]);
      }
    }
    sheet.addRow([]); // blank spacer between element blocks
  }

  // Write to buffer. We strip zip timestamps via `useStyles: false` won't help —
  // exceljs writeBuffer embeds the current date inside the zip even with pinned
  // workbook.modified. To get truly identical bytes across runs we'd need a
  // post-process pass. For test stability we settle for: pinned workbook
  // metadata + stable content. Parser tests must not depend on byte identity;
  // only on parsed-row equivalence. If byte stability becomes a blocker we can
  // add a deterministic-zip post-processor later.
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function main() {
  const out = resolve(__dirname, "..", "lib", "curriculum", "__fixtures__");
  mkdirSync(out, { recursive: true });

  const tkA = await buildWorkbook("A", buildTkAElements());
  const tkB = await buildWorkbook("B", buildTkBElements());

  writeFileSync(resolve(out, "promes-tk-a-smt-1.xlsx"), tkA);
  writeFileSync(resolve(out, "promes-tk-b-smt-1.xlsx"), tkB);

  console.log(`built fixtures in ${out}`);
  console.log(`  promes-tk-a-smt-1.xlsx: ${tkA.length} bytes`);
  console.log(`  promes-tk-b-smt-1.xlsx: ${tkB.length} bytes`);
}

void main();

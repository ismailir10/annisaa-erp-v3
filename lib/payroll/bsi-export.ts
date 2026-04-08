export type BsiRow = {
  bankAccountNo: string;
  nama: string;
  netAmount: number;
  description: string;
};

/** Properly quote a CSV field — escape quotes and wrap if contains comma/quote/newline */
function csvField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function generateBsiCsv(rows: BsiRow[]): string {
  const header = "rekening_tujuan,nama_pemilik,nominal,keterangan";
  const lines = rows.map((r) =>
    `${csvField(r.bankAccountNo)},${csvField(r.nama)},${Math.round(r.netAmount)},${csvField(r.description)}`
  );
  return [header, ...lines].join("\r\n") + "\r\n";
}

/** Sanitize a string for use in Content-Disposition filename */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

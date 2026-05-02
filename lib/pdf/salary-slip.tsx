import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { formatRupiah } from "@/lib/format";

const TEAL = "#5DB4B8";
const DARK = "#1A2E2F";
const GRAY = "#6B7280";
const LIGHT_GRAY = "#F3F4F6";
const BORDER = "#D1D5DB";

const s = StyleSheet.create({
  page: {
    padding: 0,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1F2937",
  },

  // Top accent bar
  accentBar: {
    height: 6,
    backgroundColor: TEAL,
  },

  // Content wrapper
  content: {
    padding: 40,
    paddingTop: 28,
  },

  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  schoolName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: DARK,
    letterSpacing: 0.3,
  },
  schoolSubtitle: {
    fontSize: 8,
    color: GRAY,
    marginTop: 2,
  },
  docTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: TEAL,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  docPeriod: {
    fontSize: 8,
    color: GRAY,
    marginTop: 3,
    textAlign: "right" as const,
  },

  // Divider
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginBottom: 16,
  },
  dividerThick: {
    borderBottomWidth: 2,
    borderBottomColor: DARK,
    marginBottom: 16,
  },

  // Employee info card
  infoCard: {
    backgroundColor: LIGHT_GRAY,
    borderRadius: 4,
    padding: 14,
    marginBottom: 20,
  },
  infoGrid: {
    flexDirection: "row",
  },
  infoCol: {
    flex: 1,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  infoLabel: {
    width: 75,
    fontSize: 8,
    color: GRAY,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  infoValue: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: DARK,
  },

  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: DARK,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 2,
    marginBottom: 2,
  },
  tableHeaderText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E5E7EB",
  },
  tableRowAlt: {
    backgroundColor: "#FAFAFA",
  },
  tableNo: { width: 25, fontSize: 8, color: GRAY },
  tableLabel: { flex: 1, fontSize: 9 },
  tableAmount: {
    width: 110,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "right" as const,
  },

  // Subtotal row
  subtotalRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 2,
  },
  subtotalLabel: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: DARK,
  },
  subtotalAmount: {
    width: 110,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "right" as const,
    color: DARK,
  },

  // Net pay box
  netBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: TEAL,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  netLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  netAmount: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
  },

  // Bank info
  bankInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    padding: 10,
    backgroundColor: LIGHT_GRAY,
    borderRadius: 4,
  },
  bankLabel: { fontSize: 8, color: GRAY },
  bankValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  // Footer
  footer: {
    position: "absolute" as const,
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
  footerText: { fontSize: 7, color: "#9CA3AF" },

  // Section title
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: TEAL,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 16,
  },
});

export type SlipData = {
  schoolName: string;
  logoUrl?: string;
  period: string;
  employeeName: string;
  employeeCode: string;
  position: string;
  workingDays: number;
  bankName: string | null;
  bankAccountNo: string | null;
  incomeLines: { label: string; amount: number }[];
  deductionLines: { label: string; amount: number }[];
  totalIncome: number;
  totalDeductions: number;
  netPay: number;
  generatedDate: string;
};

export function SalarySlipPdf({ data }: { data: SlipData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Accent bar */}
        <View style={s.accentBar} />

        <View style={s.content}>
          {/* Header */}
          <View style={s.headerRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {data.logoUrl && (
                // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image has no alt prop
                <Image src={data.logoUrl} style={{ width: 36, height: 36, borderRadius: 6 }} />
              )}
              <View>
                <Text style={s.schoolName}>{data.schoolName}</Text>
                <Text style={s.schoolSubtitle}>Pendidikan Anak Usia Dini Islam Terpadu</Text>
              </View>
            </View>
            <View>
              <Text style={s.docTitle}>Slip Gaji</Text>
              <Text style={s.docPeriod}>Periode: {data.period}</Text>
            </View>
          </View>

          <View style={s.dividerThick} />

          {/* Employee info card */}
          <View style={s.infoCard}>
            <View style={s.infoGrid}>
              <View style={s.infoCol}>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Nama</Text>
                  <Text style={s.infoValue}>{data.employeeName}</Text>
                </View>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>NIP</Text>
                  <Text style={s.infoValue}>{data.employeeCode}</Text>
                </View>
              </View>
              <View style={s.infoCol}>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Jabatan</Text>
                  <Text style={s.infoValue}>{data.position}</Text>
                </View>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Hari Kerja</Text>
                  <Text style={s.infoValue}>{data.workingDays} hari</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Income table */}
          <Text style={s.sectionTitle}>Pendapatan</Text>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderText, { width: 25 }]}>No</Text>
            <Text style={[s.tableHeaderText, { flex: 1 }]}>Komponen</Text>
            <Text style={[s.tableHeaderText, { width: 110, textAlign: "right" }]}>Jumlah</Text>
          </View>
          {data.incomeLines.map((line, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={s.tableNo}>{i + 1}</Text>
              <Text style={s.tableLabel}>{line.label}</Text>
              <Text style={s.tableAmount}>{formatRupiah(line.amount)}</Text>
            </View>
          ))}
          <View style={s.subtotalRow}>
            <Text style={[s.subtotalLabel, { paddingLeft: 25 }]}>Total Pendapatan</Text>
            <Text style={s.subtotalAmount}>{formatRupiah(data.totalIncome)}</Text>
          </View>

          {/* Deductions table */}
          {data.deductionLines.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Potongan</Text>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderText, { width: 25 }]}>No</Text>
                <Text style={[s.tableHeaderText, { flex: 1 }]}>Komponen</Text>
                <Text style={[s.tableHeaderText, { width: 110, textAlign: "right" }]}>Jumlah</Text>
              </View>
              {data.deductionLines.map((line, i) => (
                <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={s.tableNo}>{i + 1}</Text>
                  <Text style={s.tableLabel}>{line.label}</Text>
                  <Text style={s.tableAmount}>{formatRupiah(line.amount)}</Text>
                </View>
              ))}
              <View style={s.subtotalRow}>
                <Text style={[s.subtotalLabel, { paddingLeft: 25 }]}>Total Potongan</Text>
                <Text style={s.subtotalAmount}>{formatRupiah(data.totalDeductions)}</Text>
              </View>
            </>
          )}

          {/* Net pay */}
          <View style={s.netBox}>
            <Text style={s.netLabel}>Gaji Bersih</Text>
            <Text style={s.netAmount}>{formatRupiah(data.netPay)}</Text>
          </View>

          {/* Bank info */}
          {data.bankAccountNo && (
            <View style={s.bankInfo}>
              <View>
                <Text style={s.bankLabel}>Ditransfer ke</Text>
                <Text style={s.bankValue}>{data.bankName ?? "Bank"}</Text>
              </View>
              <View>
                <Text style={s.bankLabel}>No. Rekening</Text>
                <Text style={s.bankValue}>{data.bankAccountNo}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>Diterbitkan: {data.generatedDate}</Text>
          <Text style={s.footerText}>Dokumen resmi — dihasilkan oleh An Nisaa&apos; ERP</Text>
        </View>
      </Page>
    </Document>
  );
}

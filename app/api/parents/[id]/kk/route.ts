import { NextRequest } from "next/server";
import {
  postParentDoc,
  getParentDoc,
  deleteParentDoc,
} from "@/lib/storage/parent-document";

/**
 * Parent KK (Kartu Keluarga / family card) upload + auth-proxied read.
 *
 * Surface (admin-only — KK is sensitive PII):
 *   POST   — multipart upload (≤ 5 MB, JPEG/PNG/PDF magic-byte validated)
 *   GET    — stream with Content-Disposition: inline (referenced by T15
 *            Student detail KK preview — resolves via primary guardian)
 *   DELETE — remove
 *
 * Implementation lives in lib/storage/parent-document.ts — KTP is byte-identical
 * apart from the storage field name + Prisma column.
 */

export function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return postParentDoc(req, ctx.params, "kk");
}

export function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return getParentDoc(req, ctx.params, "kk");
}

export function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return deleteParentDoc(req, ctx.params, "kk");
}

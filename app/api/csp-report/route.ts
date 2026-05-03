// @public — CSP violation report ingestion. No auth, no DB write.
// Logs to stdout (Vercel logs ingest). Reviewed weekly post-launch
// before promoting CSP from Report-Only to enforcing.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Cap to bound log volume from a flooding attacker. Real CSP reports
// are well under 4KB.
const MAX_BODY_BYTES = 8 * 1024;

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }
    const body = JSON.parse(text);
    console.log("[csp-report]", JSON.stringify(body));
  } catch {
    // CSP reports may have unusual content-type or malformed JSON; ignore.
  }
  return new NextResponse(null, { status: 204 });
}

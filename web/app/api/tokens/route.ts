import { NextResponse } from "next/server";
import { fetchTokensWithCurves } from "@/lib/reads";

// Runs on the server. It does the slow Tor-bridged reads ONCE and the response
// is cached at the CDN, so browsers get the token list instantly instead of
// each one waiting on the onion. stale-while-revalidate serves the last good
// list immediately while a fresh one is fetched in the background.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchTokensWithCurves();
    const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, s-maxage=15, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to load tokens" },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}

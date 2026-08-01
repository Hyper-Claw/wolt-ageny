import { NextResponse } from "next/server";
import { fetchTokensWithCurves } from "@/lib/reads";

// Runs on the server. It does the slow Tor-bridged reads ONCE and the response
// is cached at the CDN, so browsers get the token list instantly instead of
// each one waiting on the onion. stale-while-revalidate serves the last good
// list immediately while a fresh one is fetched in the background.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const data = await fetchTokensWithCurves();
    const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/json",
        // Serve instantly from cache; refresh often in the background so new
        // launches appear within seconds, and serve stale for a long time so
        // nobody ever waits on Tor. A launch also purges this via /api/revalidate.
        "cache-control": "public, s-maxage=5, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to load tokens" },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}

import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { fetchTokenFull } from "@/lib/reads";

// Server does the single-token multicall once; the CDN serves it instantly.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: { address: string } }) {
  const a = params.address;
  if (!isAddress(a)) {
    return NextResponse.json({ error: "bad address" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  try {
    const data = await fetchTokenFull(getAddress(a));
    const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, s-maxage=5, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}

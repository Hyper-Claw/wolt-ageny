import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

// Called by the create page right after a launch confirms, so the new token
// shows up on Explore immediately instead of waiting for the cache to expire.
export const runtime = "nodejs";

export async function POST(req: Request) {
  let paths: string[] = ["/api/tokens"];
  try {
    const body = await req.json();
    if (Array.isArray(body?.paths) && body.paths.length) {
      paths = body.paths.filter((p: unknown) => typeof p === "string" && p.startsWith("/api/"));
    }
  } catch {
    /* no body — default to the token list */
  }
  for (const p of paths) revalidatePath(p);
  return NextResponse.json({ revalidated: true, paths }, { headers: { "cache-control": "no-store" } });
}

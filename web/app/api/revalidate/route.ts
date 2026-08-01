import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

// Called by the create page right after a launch confirms, so the new token
// shows up on Explore immediately instead of waiting for the cache to expire.
export const runtime = "nodejs";

export async function POST() {
  revalidatePath("/api/tokens");
  return NextResponse.json({ revalidated: true }, { headers: { "cache-control": "no-store" } });
}

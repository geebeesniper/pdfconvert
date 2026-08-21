import { NextResponse } from "next/server";

/** Authentication is disabled for this deployment; keep a harmless legacy endpoint. */
export async function POST() {
  return NextResponse.json({ ok: true });
}

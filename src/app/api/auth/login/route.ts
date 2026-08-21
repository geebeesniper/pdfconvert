import { NextResponse } from "next/server";

// Authentication is intentionally disabled. This compatibility route exists so
// older deployments that still contain /api/auth/login do not break the build.
export async function POST() {
  return NextResponse.json({ ok: true, authDisabled: true });
}

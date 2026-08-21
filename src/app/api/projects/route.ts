import { NextResponse } from "next/server";

/**
 * Legacy compatibility route.
 * The current flat dashboard no longer creates or lists projects.
 * Keeping this file prevents an older route left in a Git checkout from
 * importing removed repository functions and breaking `next build`.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Project management is not used by the flat COA dashboard." },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Project management is not used by the flat COA dashboard." },
    { status: 410 },
  );
}

import { NextResponse } from "next/server";

/** Legacy compatibility route. Project settings were removed from the UI. */
export async function GET() {
  return NextResponse.json({ error: "Project settings are no longer exposed." }, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Project settings are no longer exposed." }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Project settings are no longer exposed." }, { status: 410 });
}

import { NextResponse } from "next/server";
import { ADMIN_EMAIL, ADMIN_PASSWORD, createSessionToken, sessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.email !== ADMIN_EMAIL || body.password !== ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie(createSessionToken()));
  return response;
}

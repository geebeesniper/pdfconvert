import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_EMAIL = "admin@keyin.local";
export const ADMIN_PASSWORD = "K1N!COA#2026@Vercel$Sup4base^9Qz";
const SESSION_SECRET = "COA-demo-session@2026#qR8!vL3$KeyIn";
const COOKIE_NAME = "coa_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type SessionPayload = { email: string; exp: number };

function b64url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

export function createSessionToken(email = ADMIN_EMAIL) {
  const payload: SessionPayload = {
    email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token?: string | null) {
  if (!token) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    return payload.email === ADMIN_EMAIL && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function isAdmin() {
  const jar = await cookies();
  return verifySessionToken(jar.get(COOKIE_NAME)?.value);
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/login");
}

export function sessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export const sessionCookieName = COOKIE_NAME;

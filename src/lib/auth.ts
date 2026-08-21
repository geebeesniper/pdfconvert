/**
 * Authentication is intentionally disabled for this deployment.
 *
 * Keep isAdmin()/requireAdmin() as stable hooks so real authentication can be
 * restored later without rewriting every API route. Legacy exports are kept
 * only so an older login route left in a Git checkout cannot break a build.
 */
export async function isAdmin() {
  return true;
}

export async function requireAdmin() {
  return;
}

// Build-compatibility only. They are not used for access control.
export const ADMIN_EMAIL = "AUTH_DISABLED";
export const ADMIN_PASSWORD = "AUTH_DISABLED";
export async function createSessionToken() {
  return "auth-disabled";
}
export const sessionCookie = {
  name: "coa_session",
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  },
};

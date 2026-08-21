/**
 * Authentication is intentionally disabled for this internal/simple deployment.
 * API routes keep calling isAdmin() so auth can be restored later without
 * changing every route again.
 */
export async function isAdmin() {
  return true;
}

export async function requireAdmin() {
  return;
}

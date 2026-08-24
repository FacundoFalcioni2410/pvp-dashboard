// Delegates session validation to the Python backend service so this Node
// service never has to know about the session/CSRF cookie format itself.
export async function isAuthenticated(cookieHeader) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl || !cookieHeader) return false;
  try {
    // The binding reaches the FastAPI app directly, bypassing the public
    // /api rewrite prefix - but the app itself still mounts every route
    // under /api regardless of how it's reached.
    const res = await fetch(new URL("api/auth/me", backendUrl), { headers: { cookie: cookieHeader } });
    return res.ok;
  } catch {
    return false;
  }
}

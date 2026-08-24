// Delegates session validation to the Python backend service so this Node
// service never has to know about the session/CSRF cookie format itself.
export async function isAuthenticated(cookieHeader) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl || !cookieHeader) return false;
  try {
    const res = await fetch(`${backendUrl}/auth/me`, { headers: { cookie: cookieHeader } });
    return res.ok;
  } catch {
    return false;
  }
}

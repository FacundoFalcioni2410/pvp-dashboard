// Delegates session validation to the Python backend service so this Node
// service never has to know about the session/CSRF cookie format itself.
export async function isAuthenticated(request) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) return false;
  const cookie = request.headers.get("cookie") || "";
  if (!cookie) return false;
  try {
    const res = await fetch(`${backendUrl}/auth/me`, { headers: { cookie } });
    return res.ok;
  } catch {
    return false;
  }
}

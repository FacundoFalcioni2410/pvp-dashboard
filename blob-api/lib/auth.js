// Delegates session validation to the Python backend service so this Node
// service never has to know about the session/CSRF cookie format itself.
export async function isAuthenticated(cookieHeader) {
  const backendUrl = process.env.BACKEND_URL;
  console.log("[blob-api auth] BACKEND_URL=%s cookie=%s", backendUrl, JSON.stringify(cookieHeader));
  if (!backendUrl || !cookieHeader) return false;
  try {
    const res = await fetch(`${backendUrl}/auth/me`, { headers: { cookie: cookieHeader } });
    const bodyText = await res.text();
    console.log("[blob-api auth] /auth/me status=%s body=%s", res.status, bodyText);
    return res.ok;
  } catch (error) {
    console.log("[blob-api auth] fetch failed: %s", error.message);
    return false;
  }
}

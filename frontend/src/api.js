const configuredApiUrl = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
export const API_BASE_URL = configuredApiUrl
  ? (configuredApiUrl.endsWith("/api") ? configuredApiUrl : `${configuredApiUrl}/api`)
  : "/api";

function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}

function csrfHeaders(method) {
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes((method || "GET").toUpperCase());
  const token = unsafe ? readCookie("pvp_csrf") : "";
  return token ? { "X-CSRF-Token": token } : {};
}

export async function apiFetch(url, options = {}) {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    credentials: "include",
    headers: { ...csrfHeaders(options.method), ...(options.headers || {}) },
  });
  if (response.status === 401) window.dispatchEvent(new Event("pvp:unauthorized"));
  return response;
}

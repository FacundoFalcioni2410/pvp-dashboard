import { del } from "@vercel/blob";
import { isAuthenticated } from "../../lib/auth.js";

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { url } = await request.json();
  if (typeof url !== "string" || !/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(url)) {
    return Response.json({ error: "Invalid blob url" }, { status: 400 });
  }

  try {
    await del(url);
  } catch {
    // Best-effort cleanup; the blob store lifecycle policy is the backstop.
  }
  return Response.json({ ok: true });
}

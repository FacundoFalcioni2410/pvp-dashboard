import http from "node:http";
import { handleUpload } from "@vercel/blob/client";
import { del } from "@vercel/blob";
import { isAuthenticated } from "./lib/auth.js";

const ALLOWED_CONTENT_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
];

const BLOB_URL_PATTERN = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function handleUploadRoute(req, res) {
  const cookie = req.headers.cookie || "";
  const body = await readJsonBody(req);

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        if (!(await isAuthenticated(cookie))) {
          throw new Error("Not authenticated");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          addRandomSuffix: true,
          maximumSizeInBytes: 100 * 1024 * 1024,
          tokenPayload: JSON.stringify({}),
        };
      },
      onUploadCompleted: async () => {},
    });
    sendJson(res, 200, jsonResponse);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleDeleteRoute(req, res) {
  const cookie = req.headers.cookie || "";
  if (!(await isAuthenticated(cookie))) {
    sendJson(res, 401, { error: "Not authenticated" });
    return;
  }

  const { url } = await readJsonBody(req);
  if (typeof url !== "string" || !BLOB_URL_PATTERN.test(url)) {
    sendJson(res, 400, { error: "Invalid blob url" });
    return;
  }

  try {
    await del(url);
  } catch {
    // Best-effort cleanup; the blob store lifecycle policy is the backstop.
  }
  sendJson(res, 200, { ok: true });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  const route = req.method === "POST" && pathname === "/api/blob/upload"
    ? handleUploadRoute
    : req.method === "POST" && pathname === "/api/blob/delete"
      ? handleDeleteRoute
      : null;

  if (!route) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  route(req, res).catch(() => sendJson(res, 500, { error: "Internal error" }));
});

server.listen(process.env.PORT || 3000);

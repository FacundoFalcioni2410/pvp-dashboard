import http from "node:http";
import { handleUpload } from "@vercel/blob/client";
import { isAuthenticated } from "./lib/auth.js";

const ALLOWED_CONTENT_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
];

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

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (req.method !== "POST" || pathname !== "/api/blob/upload") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  handleUploadRoute(req, res).catch(() => sendJson(res, 500, { error: "Internal error" }));
});

server.listen(process.env.PORT || 3000);

#!/usr/bin/env node
/**
 * Tiny upload server for the listing-art generation loop.
 * Pattern from HYPERDRAFT scripts/_mnr_upload_server.py.
 *
 * Listens on 127.0.0.1:17800.
 * Accepts: POST /upload?filename=<name>.png with image/png body.
 * Writes to public/images/lots/<filename>.
 *
 * CORS open so browser fetches from chatgpt.com origin don't get blocked.
 */
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "public/images/lots");
const SAFE = /^[A-Za-z0-9._-]+$/;

await fs.mkdir(OUT_DIR, { recursive: true });

const server = http.createServer(async (req, res) => {
  // CORS + Private Network Access — Chrome requires PNA preflight for HTTPS→127.0.0.1
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Access-Control-Request-Private-Network");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Max-Age", "3600");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, outDir: OUT_DIR }));
    return;
  }
  if (req.method !== "POST" || !req.url?.startsWith("/upload")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const url = new URL(req.url, "http://localhost");
  const filename = url.searchParams.get("filename") ?? "";
  if (!SAFE.test(filename) || !filename.endsWith(".png")) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "bad filename" }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  if (body.length < 10240) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "too small", bytes: body.length }));
    return;
  }
  const target = path.join(OUT_DIR, filename);
  await fs.writeFile(target, body);
  console.log(`saved ${target} (${body.length} bytes)`);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, path: target, bytes: body.length }));
});

server.listen(17800, "127.0.0.1", () => {
  console.log("Listening on http://127.0.0.1:17800 — POST /upload?filename=*.png");
});

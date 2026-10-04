// The server: static files, the README at /readme/, and one WebSocket per
// browser tab. Run directly by node (type stripping); no build step.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { marked } from "marked";
import { WebSocketServer } from "ws";
import type { ToClient, ToServer } from "../game/protocol.ts";
import { openDb } from "./db.ts";
import { type Conn, Lobby } from "./lobby.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DATA = process.env.DATA_DIR ?? (existsSync("/data") ? "/data" : ".data");
const ROOT = process.cwd();

const db = openDb(join(DATA, "rash.db"));
// one structured line per thing that happened, read with `flyctl logs`
const log = (event: Record<string, unknown>): void => console.log(JSON.stringify({ at: new Date().toISOString(), ...event }));
const lobby = new Lobby(db, log);

// ---- pages ----

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

function readme(): string {
  const md = readFileSync(join(ROOT, "README.md"), "utf8");
  const body = marked.parse(md, { async: false }) as string;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>README</title>
<link rel="stylesheet" href="/readme.css">
</head>
<body>
<main>
<p><a href="/">Back to the road</a></p>
${body}
</main>
</body>
</html>`;
}

function serveFile(res: ServerResponse, file: string): void {
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
  res.end(readFileSync(file));
}

function cookieToken(req: IncomingMessage): string | null {
  const m = /(?:^|;\s*)rider=([A-Za-z0-9_-]{20,})/.exec(req.headers.cookie ?? "");
  return m ? m[1] : null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (path === "/" || path === "/index.html") {
    // the rider is remembered by a cookie, set on the first visit (S9)
    if (!cookieToken(req)) {
      const token = randomBytes(18).toString("base64url");
      res.setHeader("set-cookie", `rider=${token}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`);
    }
    return serveFile(res, join(ROOT, "client", "index.html"));
  }
  if (path === "/readme" || path === "/readme/") {
    res.writeHead(200, { "content-type": TYPES[".html"] }).end(readme());
    return;
  }
  if (path === "/favicon.ico") return void res.writeHead(204).end();
  if (path === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  // README images resolve at /readme/ as they do on GitHub (relative docs/)
  const rel = normalize(decodeURIComponent(path.replace(/^\/readme\//, "/"))).replace(/^[\\/]+/, "");
  if (rel.startsWith("..")) return void res.writeHead(400).end();
  if (rel.startsWith("docs")) return serveFile(res, join(ROOT, rel));
  // hand-written files in client/public, the bundle in dist/
  const pub = join(ROOT, "client", "public", rel);
  return serveFile(res, existsSync(pub) ? pub : join(ROOT, "dist", rel));
});

// ---- sockets ----

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });

wss.on("connection", (ws, req) => {
  const token = cookieToken(req);
  if (!token) {
    ws.close(4001, "no rider cookie");
    return;
  }
  const rider = db.rider(token);
  const conn: Conn = {
    rider: rider.id,
    name: rider.name,
    send: (msg: ToClient) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
    pool: null,
    level: 1,
    road: 0,
    race: null,
    local: -1,
    seq: 0,
  };
  log({ ev: "connect", rider: rider.id });
  conn.send({ t: "hello", you: rider, qualified: db.qualified(rider.id) });

  ws.on("message", (data) => {
    let msg: ToServer;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    const now = performance.now() / 1000;
    if (msg.t === "queue" && (msg.mode === "ai" || msg.mode === "human")) lobby.join(conn, msg.mode, Number(msg.level), now, Number(msg.track ?? 0));
    else if (msg.t === "leave") lobby.leave(conn, now);
    else if (msg.t === "in") lobby.input(conn, Number(msg.seq), Number(msg.keys));
    else if (msg.t === "name" && typeof msg.name === "string") {
      const name = msg.name.replace(/\s+/g, " ").trim().slice(0, 20);
      if (name) {
        db.rename(conn.rider, name);
        conn.name = name;
        log({ ev: "rename", rider: conn.rider, name });
        conn.send({ t: "hello", you: { id: conn.rider, name }, qualified: db.qualified(conn.rider) });
      }
    }
  });

  ws.on("close", () => {
    lobby.disconnect(conn, performance.now() / 1000);
    log({ ev: "disconnect", rider: rider.id });
  });
});

setInterval(() => lobby.tick(performance.now() / 1000), 1000 / 120);

server.listen(PORT, "0.0.0.0", () => log({ ev: "listening", port: PORT, data: DATA }));

const stop = (): void => {
  server.close();
  db.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

// The server: static files, the README at /readme/, and one WebSocket per
// browser tab. Run directly by node (type stripping); no build step.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { marked } from "marked";
import { WebSocketServer } from "ws";
import type { ToClient, ToServer } from "../game/protocol.ts";
import { openDb } from "./db.ts";
import { type Conn, Lobby, who } from "./lobby.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DATA = process.env.DATA_DIR ?? (existsSync("/data") ? "/data" : ".data");
const ROOT = process.cwd();

const db = openDb(join(DATA, "rash.db"));
// one structured line per thing that happened: printed, for `flyctl logs`, and
// kept in the database, because Fly holds only a short buffer and a restart
// empties it (read the kept ones with scripts/log.ts)
const log = (event: Record<string, unknown>): void => {
  const at = new Date().toISOString();
  console.log(JSON.stringify({ at, ...event }));
  if (event.ev !== "listening") db.log(at, event);
};
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
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
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

/**
 * A file, revalidated by ETag so an unchanged one is not sent twice, and in
 * byte ranges when asked: Safari will not play an <audio> track from a
 * server that cannot send part of it, and every road's music is one.
 */
function serveFile(res: ServerResponse, file: string, req?: IncomingMessage): void {
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  const st = statSync(file);
  const tag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  const head = { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache", etag: tag, "accept-ranges": "bytes" };
  if (req?.headers["if-none-match"] === tag) {
    res.writeHead(304, head).end();
    return;
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req?.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    const size = st.size;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      res.writeHead(416, { "content-range": `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { ...head, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    res.end(readFileSync(file).subarray(start, end + 1));
    return;
  }
  res.writeHead(200, head);
  res.end(readFileSync(file));
}

function cookieToken(req: IncomingMessage): string | null {
  const m = /(?:^|;\s*)rider=([A-Za-z0-9_-]{20,})/.exec(req.headers.cookie ?? "");
  return m ? m[1] : null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (path === "/" || path === "/index.html" || path === "/live" || path === "/leaderboard") {
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
  if (path === "/api/leaderboard") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(db.leaderboard()));
    return;
  }
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
  return serveFile(res, existsSync(pub) ? pub : join(ROOT, "dist", rel), req);
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
  // a script says it is one by connecting to /ws?probe=1, and its rider stays
  // off the leaderboard for good (N12). A person who does the same only hides
  // themselves
  const probe = new URL(req.url ?? "/", "http://localhost").searchParams.get("probe") === "1";
  if (probe) db.markProbe(rider.id);
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
  log({ ev: "connect", who: who({ name: rider.name, rider: rider.id }), ...(db.isProbe(rider.id) ? { probe: true } : {}) });
  conn.send({ t: "hello", you: rider, qualified: db.qualified(rider.id) });
  lobby.hello(conn);
  log({ ev: "snapshot", who: who(conn), kind: "hello", races: lobby.rooms().length });

  ws.on("message", (data) => {
    let msg: ToServer;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return lobby.reject(conn, "message", "not JSON");
    }
    const now = performance.now() / 1000;
    if (msg.t === "queue" && (msg.mode === "ai" || msg.mode === "human")) lobby.join(conn, msg.mode, Number(msg.level), now, Number(msg.track ?? 0), msg.ai === undefined ? undefined : Number(msg.ai));
    else if (msg.t === "leave") lobby.leave(conn, now);
    else if (msg.t === "quit") lobby.quit(conn);
    else if (msg.t === "accept") lobby.accept(conn, now);
    else if (msg.t === "decline") lobby.decline(conn, now);
    else if (msg.t === "progress") lobby.progress(conn, Number(msg.p));
    else if (msg.t === "pong") lobby.pong(conn, Number(msg.at), now);
    else if (msg.t === "net") lobby.report(conn, msg as unknown as Record<string, unknown>, now);
    else if (msg.t === "jump") lobby.jump(conn, msg as unknown as Record<string, unknown>);
    else if (msg.t === "watch") lobby.watch(conn, Number(msg.race));
    else if (msg.t === "unwatch") lobby.unwatch(conn);
    else if (msg.t === "in") lobby.input(conn, Number(msg.seq), Number(msg.keys));
    else if (msg.t === "name" && typeof msg.name === "string") {
      const name = msg.name.replace(/\s+/g, " ").trim().slice(0, 20);
      if (!name) lobby.reject(conn, "name", "empty");
      else {
        const before = who(conn);
        db.rename(conn.rider, name);
        conn.name = name;
        log({ ev: "rename", who: who(conn), was: before });
        conn.send({ t: "hello", you: { id: conn.rider, name }, qualified: db.qualified(conn.rider) });
      }
    } else lobby.reject(conn, "message", "unknown", { t: String((msg as { t?: unknown })?.t).slice(0, 20) });
  });

  ws.on("close", () => {
    lobby.disconnect(conn, performance.now() / 1000);
    log({ ev: "disconnect", who: who(conn) });
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

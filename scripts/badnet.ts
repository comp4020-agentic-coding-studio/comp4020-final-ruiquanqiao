// A bad network between a browser and the server, made on purpose (ledger
// N14). It sits in front of a running server and holds every WebSocket
// message, both ways, for a delay with jitter; ordinary pages pass straight
// through. TCP cannot lose a message, so "loss" here is what loss does to a
// TCP stream: the message and everything behind it wait one retransmission
// timeout (200 ms), the head-of-line stall a lossy wifi actually causes.
//
//   node scripts/badnet.ts [--to http://localhost:8080] [--port 8090] [--delay 75] [--jitter 25] [--loss 0.01]
//
// --delay is each way, so a round trip is about twice it. Open
// http://localhost:<port>/?probe=1 in a browser to race through it.

import { createServer, request } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const to = new URL(flag("to", "http://localhost:8080"));
const port = Number(flag("port", "8090"));
const delay = Number(flag("delay", "75"));
const jitter = Number(flag("jitter", "25"));
const loss = Number(flag("loss", "0.01"));
const RTO = 200; // ms, the least TCP waits before sending again

/**
 * One direction of one connection: each message leaves `delay ± jitter` ms
 * after it came, never before the one ahead of it (TCP keeps order), and a
 * lost one costs a retransmission timeout for it and everything queued behind.
 */
function lane(deliver: (data: Buffer | string, binary: boolean) => void): (data: Buffer | string, binary: boolean) => void {
  let free = 0; // when the lane next lets something out
  return (data, binary) => {
    const now = performance.now();
    let at = now + Math.max(0, delay + (Math.random() * 2 - 1) * jitter);
    if (Math.random() < loss) at += RTO;
    at = Math.max(at, free);
    free = at;
    setTimeout(() => deliver(data, binary), at - now);
  };
}

const server = createServer((req, res) => {
  // pages, scripts and assets go straight through, so only the game's own traffic is slowed
  const up = request({ host: to.hostname, port: to.port, path: req.url, method: req.method, headers: { ...req.headers, host: to.host } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", () => res.writeHead(502).end("the server behind badnet is not answering"));
  req.pipe(up);
});

const wss = new WebSocketServer({ server });
wss.on("connection", (client, req) => {
  const upstream = new WebSocket(`ws://${to.host}${req.url}`, { headers: { cookie: req.headers.cookie ?? "" } });
  const held: [Buffer | string, boolean][] = [];
  const toServer = lane((d, binary) => (upstream.readyState === WebSocket.OPEN ? upstream.send(d, { binary }) : held.push([d, binary])));
  const toClient = lane((d, binary) => client.readyState === WebSocket.OPEN && client.send(d, { binary }));
  upstream.on("open", () => {
    for (const [d, binary] of held.splice(0)) upstream.send(d, { binary });
  });
  client.on("message", (d, binary) => toServer(d as Buffer, binary));
  upstream.on("message", (d, binary) => toClient(d as Buffer, binary));
  const close = (): void => {
    client.close();
    upstream.close();
  };
  client.on("close", close);
  upstream.on("close", close);
  client.on("error", close);
  upstream.on("error", close);
});

server.listen(port, () => console.log(`badnet: http://localhost:${port} -> ${to.origin}, ${delay}±${jitter} ms each way, ${(loss * 100).toFixed(1)}% loss`));

// Join a race on a running server as a player holding the throttle, and record
// when each snapshot arrives against the race time it carries. This is what a
// browser's interpolation is fed, measured rather than assumed:
//   node scripts/netprobe.ts [url] [seconds]   (default the live site, 20 s)
// Writes .cache/netprobe.json (the arrivals) and prints the jitter.
import { writeFileSync, mkdirSync } from "node:fs";

const base = process.argv[2] ?? "https://comp4020-final-ruiquanqiao.fly.dev";
const seconds = Number(process.argv[3] ?? 20);
// the server only lets a rider with its cookie in: take one the way a browser does
const cookie = ((await fetch(base + "/")).headers.get("set-cookie") ?? "").split(";")[0];
// @ts-expect-error Node's WebSocket takes headers as a second argument
const ws: WebSocket = new WebSocket(base.replace(/^http/, "ws") + "/ws", { headers: { cookie } });
ws.onclose = (e) => {
  if (!racing) console.log(`closed before the race: ${e.code} ${e.reason}`);
};
const arrivals: { at: number; time: number }[] = [];
let racing = false;

ws.onopen = () => ws.send(JSON.stringify({ t: "queue", mode: "ai", level: 1, track: 0 }));
ws.onmessage = (e) => {
  const msg = JSON.parse(String(e.data));
  if (msg.t === "start") {
    racing = true;
    // hold the throttle (bit 1) so the race runs at speed
    setInterval(() => ws.send(JSON.stringify({ t: "in", seq: Date.now(), keys: 1 })), 200);
    setTimeout(done, seconds * 1000);
  }
  if (msg.t === "snap" && racing) arrivals.push({ at: performance.now() / 1000, time: msg.time });
};

function done(): void {
  ws.close();
  mkdirSync(".cache", { recursive: true });
  writeFileSync(".cache/netprobe.json", JSON.stringify(arrivals));
  const gaps = arrivals.slice(1).map((a, i) => a.at - arrivals[i].at);
  const lag = arrivals.map((a) => a.at - a.time);
  const least = Math.min(...lag);
  const late = lag.map((l) => l - least).sort((p, q) => p - q);
  const pct = (xs: number[], p: number): number => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))];
  const sortedGaps = [...gaps].sort((p, q) => p - q);
  console.log(`${arrivals.length} snapshots over ${seconds} s`);
  console.log(`gap between arrivals (ms): min ${(sortedGaps[0] * 1000).toFixed(1)}  median ${(pct(sortedGaps, 0.5) * 1000).toFixed(1)}  p95 ${(pct(sortedGaps, 0.95) * 1000).toFixed(1)}  max ${(sortedGaps.at(-1)! * 1000).toFixed(1)}`);
  console.log(`arrivals under 10 ms apart (bursts): ${gaps.filter((g) => g < 0.01).length}`);
  console.log(`lateness past the earliest (ms): median ${(pct(late, 0.5) * 1000).toFixed(1)}  p95 ${(pct(late, 0.95) * 1000).toFixed(1)}  max ${(late.at(-1)! * 1000).toFixed(1)}`);
  process.exit(0);
}

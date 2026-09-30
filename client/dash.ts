// The instrument panel (ledger V7, V8, H1): the original's black fairing arch
// across the bottom of the screen, with its two cream dials, the position in
// a black box, the odometer, the damage bar, both riders' names with curved
// stamina wedges, and the closest opponent's distance in red ↑ or green ↓.
//
// Every position below is a fraction of a 4:3 frame, measured off 960×720
// captures of the PC version (docs/road-rash-visuals.md §5). On a wider
// screen the frame is centred and the road shows either side of the arch, as
// it did; on a narrow one the frame shrinks to the screen's width.

import { MILE } from "../game/track.ts";

export type Readout = {
  name: string;
  mph: number;
  rpm: number; // 0..1 of the dial
  position: number;
  miles: number;
  damage: number; // 0..1 left
  stamina: number; // 0..1
  opponent: { name: string; stamina: number; gap: number } | null; // gap in metres, + ahead
};

const FONT = "Oswald, 'Arial Narrow', Impact, sans-serif";

export function drawDash(ctx: CanvasRenderingContext2D, w: number, h: number, d: Readout): number {
  ctx.clearRect(0, 0, w, h);
  const W = Math.min(w, (h * 4) / 3); // the 4:3 frame's width
  const H = (W * 3) / 4;
  const ox = (w - W) / 2;
  const oy = h - H;
  const X = (f: number): number => ox + f * W;
  const Y = (f: number): number => oy + f * H;

  // the fairing: an arch whose top is at .77 in the middle, dropping to .95 at
  // the edges, black and glossy
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(X(0.0), Y(1.0));
  ctx.lineTo(X(0.0), Y(0.97));
  ctx.bezierCurveTo(X(0.12), Y(0.8), X(0.3), Y(0.765), X(0.5), Y(0.765));
  ctx.bezierCurveTo(X(0.7), Y(0.765), X(0.88), Y(0.8), X(1.0), Y(0.97));
  ctx.lineTo(X(1.0), Y(1.0));
  ctx.closePath();
  const gloss = ctx.createLinearGradient(0, Y(0.76), 0, Y(1));
  gloss.addColorStop(0, "#3a3a44");
  gloss.addColorStop(0.08, "#0d0000");
  gloss.addColorStop(0.5, "#141418");
  gloss.addColorStop(1, "#050505");
  ctx.fillStyle = gloss;
  ctx.fill();
  ctx.lineWidth = Math.max(1, W * 0.003);
  ctx.strokeStyle = "rgba(200,200,215,0.35)";
  ctx.stroke();
  ctx.restore();

  // the damage bar above the position box: red, then yellow, then green
  const barX = X(0.445);
  const barW = W * 0.11;
  const barY = Y(0.8);
  const barH = H * 0.022;
  ctx.fillStyle = "#000";
  ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const on = i / segs < d.damage;
    const colour = i < 3 ? "#d02020" : i < 6 ? "#c0b040" : "#40c040";
    ctx.fillStyle = on ? colour : "#2a2a2a";
    ctx.fillRect(barX + (i * barW) / segs + 0.5, barY, barW / segs - 1, barH);
  }

  dial(ctx, X(0.39), Y(0.94), W * 0.074, d.mph / 200, [0, 50, 100, 150, 200], "MPH");
  dial(ctx, X(0.615), Y(0.94), W * 0.06, d.rpm, [0, 3, 6, 9, 12], "RPM x 1000");

  // position, in a small black box between the dials
  ctx.fillStyle = "#050505";
  roundRect(ctx, X(0.475), Y(0.835), W * 0.065, H * 0.07, W * 0.008);
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.stroke();
  text(ctx, String(d.position), X(0.5075), Y(0.895), H * 0.055, "#fff", "center");
  // odometer beneath it, one decimal, zero-padded
  text(ctx, (d.miles < 10 ? "0" : "") + d.miles.toFixed(1), X(0.5075), Y(0.985), H * 0.04, "#fff", "center");

  // the player's name bottom-left with a stamina wedge above-right of it
  text(ctx, fit(ctx, d.name, W * 0.17, H * 0.05), X(0.075), Y(0.985), H * 0.05, "#fff", "left");
  wedge(ctx, X(0.235), Y(0.87), W * 0.05, d.stamina, false);

  if (d.opponent) {
    text(ctx, fit(ctx, d.opponent.name, W * 0.17, H * 0.05), X(0.925), Y(0.985), H * 0.05, "#fff", "right");
    wedge(ctx, X(0.765), Y(0.87), W * 0.05, d.opponent.stamina, true);
    // distance in miles: red and up when they are ahead, green and down behind
    const ahead = d.opponent.gap >= 0;
    const miles = Math.abs(d.opponent.gap) / MILE;
    text(ctx, `${ahead ? "↑" : "↓"}${miles.toFixed(3)}`, X(0.71), Y(0.855), H * 0.04, ahead ? "#ff3030" : "#40e040", "center");
  }
  return H * (1 - 0.765); // how much of the screen the arch covers, in px
}

function dial(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, value: number, labels: number[], caption: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const face = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  face.addColorStop(0, "#fbf3dc");
  face.addColorStop(1, "#d9cca6");
  ctx.fillStyle = face;
  ctx.fill();
  // the scale sweeps from lower-left to lower-right over the top
  const a0 = Math.PI * 0.8;
  const a1 = Math.PI * 2.2;
  ctx.strokeStyle = "#111";
  ctx.lineWidth = Math.max(1, r * 0.03);
  for (let i = 0; i <= 20; i++) {
    const a = a0 + ((a1 - a0) * i) / 20;
    const inner = i % 5 === 0 ? 0.78 : 0.86;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * inner, cy + Math.sin(a) * r * inner);
    ctx.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
    ctx.stroke();
  }
  labels.forEach((l, i) => {
    const a = a0 + ((a1 - a0) * i) / (labels.length - 1);
    text(ctx, String(l), cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.58 + r * 0.1, r * 0.26, "#111", "center");
  });
  text(ctx, caption, cx, cy + r * 0.62, r * 0.17, "#111", "center");
  const a = a0 + (a1 - a0) * Math.max(0, Math.min(1, value));
  ctx.strokeStyle = "#d01818";
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12);
  ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
  ctx.stroke();
  ctx.restore();
}

/** A quarter-arc meter graded green at the top through yellow to red. */
function wedge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, value: number, mirror: boolean): void {
  ctx.save();
  ctx.translate(cx, cy);
  if (mirror) ctx.scale(-1, 1);
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    // from red at the bottom-left to green at the top
    const a0 = Math.PI * (1.0 + (i / steps) * 0.5);
    const a1 = Math.PI * (1.0 + ((i + 1) / steps) * 0.5);
    const on = (i + 1) / steps <= value + 0.001;
    ctx.beginPath();
    ctx.arc(0, r, r, a0, a1);
    ctx.arc(0, r, r * 0.55, a1, a0, true);
    ctx.closePath();
    const hue = (i / (steps - 1)) * 120;
    ctx.fillStyle = on ? `hsl(${hue}, 85%, 48%)` : "rgba(40,40,40,0.9)";
    ctx.fill();
  }
  ctx.restore();
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, colour: string, align: CanvasTextAlign): void {
  ctx.font = `500 ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.strokeStyle = colour === "#111" ? "transparent" : "rgba(0,0,0,0.8)";
  ctx.strokeText(s, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(s, x, y);
}

/** Shorten a name with an ellipsis until it fits its place on the fairing. */
function fit(ctx: CanvasRenderingContext2D, s: string, width: number, size: number): string {
  ctx.font = `500 ${Math.round(size)}px ${FONT}`;
  if (ctx.measureText(s).width <= width) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + "…").width > width) t = t.slice(0, -1);
  return t + "…";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

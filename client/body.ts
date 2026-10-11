// The rider's body as one surface. The first puppet was a lathe-turned stick
// per limb with a ball at every joint, in the trim colour, and the sprite
// shader outlines every change of colour: shoulders, elbows and knees came out
// as ringed hinges, a jointed doll rather than a man in leathers. The
// original's riders were pre-rendered from models skinned in one piece, so an
// elbow is a bend in a sleeve. Here every part is a tapered capsule, blended
// into its neighbours (a smooth minimum of their distance fields), and the
// blend is polygonised once per pose, so a joint is a fold, not a seam.

import * as THREE from "three";

export type Prim = {
  a: THREE.Vector3;
  b: THREE.Vector3;
  r1: number;
  r2: number;
  /** what colour it takes: one of the sprite's part numbers */
  part: number;
  /** a panel down the side facing this way takes `stripe` instead */
  out?: THREE.Vector3;
  stripe?: number;
  /** flattened across `squash.axis` by `squash.s` (wider than deep) */
  squash?: { axis: THREE.Vector3; s: number };
  /** how far it blends into what came before, m */
  k: number;
  /**
   * a rounded block centred on `a` instead of a capsule: its axes, half its
   * size along each, and how round its edges are. Gloves and boots are
   * blocks; as capsules they ended in balls, a cartoon's hands and feet
   */
  box?: { u: THREE.Vector3; v: THREE.Vector3; w: THREE.Vector3; half: [number, number, number]; round: number };
};

const v = new THREE.Vector3();
const w = new THREE.Vector3();

/** Distance to a capsule whose radius runs from r1 at a to r2 at b (iq's round cone). */
function roundCone(p: THREE.Vector3, prim: Prim): number {
  const { a, b, r1, r2 } = prim;
  let pa = v.copy(p).sub(a);
  if (prim.squash) {
    const d = pa.dot(prim.squash.axis);
    pa = pa.addScaledVector(prim.squash.axis, d / prim.squash.s - d);
  }
  const ba = w.copy(b).sub(a);
  const l2 = ba.dot(ba);
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const y = pa.dot(ba);
  const z = y - l2;
  const xx = pa.x * l2 - ba.x * y;
  const xy = pa.y * l2 - ba.y * y;
  const xz = pa.z * l2 - ba.z * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/** Distance to a rounded block (iq's round box), in the block's own axes. */
function roundBox(p: THREE.Vector3, prim: Prim): number {
  const b = prim.box!;
  const d = v.copy(p).sub(prim.a);
  const qx = Math.abs(d.dot(b.u)) - (b.half[0] - b.round);
  const qy = Math.abs(d.dot(b.v)) - (b.half[1] - b.round);
  const qz = Math.abs(d.dot(b.w)) - (b.half[2] - b.round);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - b.round;
}

const dist = (p: THREE.Vector3, q: Prim): number => (q.box ? roundBox(p, q) : roundCone(p, q));

const smin = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** The part a point on the surface belongs to: its nearest capsule's, or that capsule's panel. */
function partAt(prims: Prim[], p: THREE.Vector3): number {
  let best = prims[0];
  let bd = Infinity;
  for (const q of prims) {
    const d = dist(p, q);
    if (d < bd) [bd, best] = [d, q];
  }
  if (!best.out || best.stripe === undefined) return best.part;
  // the point's direction off the capsule's axis, against the way the panel faces
  const ab = new THREE.Vector3().subVectors(best.b, best.a);
  const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, best.a).dot(ab) / ab.lengthSq(), 0, 1);
  const radial = new THREE.Vector3().subVectors(p, best.a).addScaledVector(ab, -t);
  return radial.normalize().dot(best.out) > 0.86 ? best.stripe : best.part;
}

/**
 * Polygonise the blend of `prims` (surface nets on an `h`-metre grid).
 * `colour` and `id` give each part its shaded colour and the colour its part
 * number is written in; both are per vertex.
 */
export function meshBody(prims: Prim[], colour: (part: number) => THREE.Color, id: (part: number) => THREE.Color, h = 0.018): THREE.BufferGeometry {
  // the grid covers every capsule and the reach of its blend
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const boxes = prims.map((q) => {
    if (q.box) {
      // the block's reach along each world axis, and the blend's
      const { u, v: vv, w: ww, half } = q.box;
      const e = new THREE.Vector3(
        Math.abs(u.x) * half[0] + Math.abs(vv.x) * half[1] + Math.abs(ww.x) * half[2],
        Math.abs(u.y) * half[0] + Math.abs(vv.y) * half[1] + Math.abs(ww.y) * half[2],
        Math.abs(u.z) * half[0] + Math.abs(vv.z) * half[1] + Math.abs(ww.z) * half[2],
      ).addScalar(q.k + 2 * h);
      const bl = q.a.clone().sub(e);
      const bh = q.a.clone().add(e);
      lo.min(bl);
      hi.max(bh);
      return [bl, bh] as const;
    }
    const r = Math.max(q.r1, q.r2) * (q.squash ? Math.max(1, q.squash.s) : 1) + q.k + 2 * h;
    const bl = new THREE.Vector3().copy(q.a).min(q.b).subScalar(r);
    const bh = new THREE.Vector3().copy(q.a).max(q.b).addScalar(r);
    lo.min(bl);
    hi.max(bh);
    return [bl, bh] as const;
  });
  const nx = Math.ceil((hi.x - lo.x) / h) + 1;
  const ny = Math.ceil((hi.y - lo.y) / h) + 1;
  const nz = Math.ceil((hi.z - lo.z) / h) + 1;
  const at = (i: number, j: number, k: number): number => i + nx * (j + ny * k);
  const f = new Float32Array(nx * ny * nz).fill(1e9);
  const p = new THREE.Vector3();
  // each capsule only touches the nodes it can reach; past its box it adds nothing to the blend
  prims.forEach((q, n) => {
    const [bl, bh] = boxes[n];
    const i0 = Math.max(0, Math.floor((bl.x - lo.x) / h));
    const i1 = Math.min(nx - 1, Math.ceil((bh.x - lo.x) / h));
    const j0 = Math.max(0, Math.floor((bl.y - lo.y) / h));
    const j1 = Math.min(ny - 1, Math.ceil((bh.y - lo.y) / h));
    const k0 = Math.max(0, Math.floor((bl.z - lo.z) / h));
    const k1 = Math.min(nz - 1, Math.ceil((bh.z - lo.z) / h));
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          p.set(lo.x + i * h, lo.y + j * h, lo.z + k * h);
          const o = at(i, j, k);
          f[o] = smin(f[o], dist(p, q), q.k);
        }
  });

  // one vertex per cell the surface passes through, at the mean of its edge crossings
  const cell = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const grad: number[] = [];
  const CORNERS = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const d = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          d[c] = f[at(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2])];
          if (d[c] < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [e0, e1] of EDGES) {
          if (d[e0] < 0 === d[e1] < 0) continue;
          const t = d[e0] / (d[e0] - d[e1]);
          sx += CORNERS[e0][0] + (CORNERS[e1][0] - CORNERS[e0][0]) * t;
          sy += CORNERS[e0][1] + (CORNERS[e1][1] - CORNERS[e0][1]) * t;
          sz += CORNERS[e0][2] + (CORNERS[e1][2] - CORNERS[e0][2]) * t;
          n++;
        }
        cell[at(i, j, k)] = pos.length / 3;
        pos.push(lo.x + (i + sx / n) * h, lo.y + (j + sy / n) * h, lo.z + (k + sz / n) * h);
        // the field's slope across the cell is the surface's normal
        grad.push(
          d[1] + d[3] + d[5] + d[7] - d[0] - d[2] - d[4] - d[6],
          d[2] + d[3] + d[6] + d[7] - d[0] - d[1] - d[4] - d[5],
          d[4] + d[5] + d[6] + d[7] - d[0] - d[1] - d[2] - d[3],
        );
      }

  // a quad across every grid edge the surface crosses, joining the four cells round it
  const index: number[] = [];
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  const quad = (q: number[], axis: number, outward: number): void => {
    if (q.some((x) => x < 0)) return;
    A.fromArray(pos, q[0] * 3);
    B.fromArray(pos, q[1] * 3).sub(A);
    C.fromArray(pos, q[2] * 3).sub(A);
    const nrm = B.cross(C).getComponent(axis);
    // wound so its face points out of the body
    if (nrm * outward >= 0) index.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    else index.push(q[0], q[2], q[1], q[0], q[3], q[2]);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const d0 = f[at(i, j, k)];
        const out = d0 < 0 ? 1 : -1;
        if (d0 < 0 !== f[at(i + 1, j, k)] < 0) quad([cell[at(i, j - 1, k - 1)], cell[at(i, j, k - 1)], cell[at(i, j, k)], cell[at(i, j - 1, k)]], 0, out);
        if (d0 < 0 !== f[at(i, j + 1, k)] < 0) quad([cell[at(i - 1, j, k - 1)], cell[at(i, j, k - 1)], cell[at(i, j, k)], cell[at(i - 1, j, k)]], 1, out);
        if (d0 < 0 !== f[at(i, j, k + 1)] < 0) quad([cell[at(i - 1, j - 1, k)], cell[at(i, j - 1, k)], cell[at(i, j, k)], cell[at(i - 1, j, k)]], 2, out);
      }

  // normals from the blended field itself, so a fold shades as a fold
  const count = pos.length / 3;
  const normal = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const ids = new Float32Array(count * 3);
  for (let n = 0; n < count; n++) {
    C.fromArray(grad, n * 3).normalize().toArray(normal, n * 3);
    const part = partAt(prims, p.fromArray(pos, n * 3));
    colour(part).toArray(col, n * 3);
    id(part).toArray(ids, n * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("idColour", new THREE.BufferAttribute(ids, 3));
  g.userData.shaded = g.attributes.color;
  g.setIndex(index);
  return g;
}

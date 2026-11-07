import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";
import { girth } from "../client/skin.ts";
import { posedBody, useHuman } from "../client/sprites.ts";

// The rider's build, held to the recording. Read off a frame where a rider's
// arm is straight out sideways, seen from straight behind (RRVID 413.82), in
// helmet widths, edge to edge across both colours of the two-tone sleeve:
// the upper arm 0.65 across, the forearm 0.38; the shoulders 2.2 from one
// side of the back to the other (247.64). Legs off the kick at 57.32, across
// both colours of the trouser leg and square to it: thigh 0.68, shin 0.5.
// Measured first over the main colour alone, they came out 0.4, 0.28, 0.6
// and 0.42, and the rider read as thin. The first modelled body was a CC0 bodybuilder stretched
// to the puppet's limbs, and its arms came out twice as thick as these; it
// read as a muscleman in a white suit.
const HELMET = 0.29;

beforeAll(async () => {
  // GLTFLoader reaches for the browser's image decoding even for a model it
  // only needs the mesh of
  const g = globalThis as unknown as Record<string, unknown>;
  g.self ??= globalThis;
  g.createImageBitmap ??= async () => ({});
  const buf = readFileSync("client/public/assets/models/human.glb");
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "");
  useHuman(gltf.scene);
});

describe("the rider's build, against the recording", () => {
  const measured: [string, string, string, number][] = [
    ["upper arm", "shoulderR", "elbowR", 0.65],
    ["forearm", "elbowR", "gloveR", 0.38],
  ];
  for (const [name, a, b, want] of measured)
    it(`is ${want} helmet widths across the ${name}, arm out (413.82)`, () => {
      const body = posedBody("punchOut.R");
      const got = girth(body.pos, body.at(a), body.at(b), 0.2) / HELMET;
      expect(Math.abs(got - want), `${name} ${got.toFixed(2)} helmet widths against ${want}`).toBeLessThan(0.08);
    });

  for (const [name, a, b, want] of [
    ["thigh", "hipR", "kneeR", 0.68],
    ["shin", "kneeR", "bootR", 0.5],
  ] as const)
    it(`is ${want} helmet widths across the ${name}, leg out (57.32)`, () => {
      const body = posedBody("kick.R");
      const got = girth(body.pos, body.at(a), body.at(b), 0.13) / HELMET;
      expect(Math.abs(got - want), `${name} ${got.toFixed(2)} helmet widths against ${want}`).toBeLessThan(0.1);
    });

  it("is 2.2 helmet widths across the shoulders from behind, arms left out (247.64)", () => {
    const body = posedBody("ride.R");
    const s = [body.at("shoulderR"), body.at("shoulderL")];
    const y = (s[0].y + s[1].y) / 2;
    let w = 0;
    const v = new THREE.Vector3();
    for (let i = 0; i < body.pos.count; i++) {
      v.fromBufferAttribute(body.pos, i);
      // a band across the back just under the shoulder joints, inside them
      if (Math.abs(v.y - (y - 0.06)) < 0.03 && Math.abs(v.x) < Math.abs(s[0].x) + 0.08) w = Math.max(w, Math.abs(v.x));
    }
    expect(Math.abs((2 * w) / HELMET - 2.2), `shoulders ${((2 * w) / HELMET).toFixed(2)} helmet widths`).toBeLessThan(0.3);
  });
});

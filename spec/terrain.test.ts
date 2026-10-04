import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Terrain } from "../client/land.ts";
import { groundAt } from "../game/terrain.ts";
import { ROADS, SHOULDER, makeTrack } from "../game/track.ts";
import { frameAt } from "../game/world.ts";

// The first version laid one flat plain under the road at a fixed depth below
// the camera, and over a crest it stood above the road ahead: a hill across
// the asphalt that the bike rode through. These hold the land under the road
// everywhere, on every road, as it is actually drawn.

describe("the land beside the road", () => {
  it("is never above the shoulder within it, on any road", () => {
    for (let road = 0; road < ROADS.length; road++) {
      const track = makeTrack(1, road);
      for (let z = 0; z < track.length; z += 7) for (const x of [-SHOULDER, -4, 0, 4, SHOULDER]) expect(groundAt(track, z, x)).toBeLessThanOrEqual(-0.05);
    }
  });

  it("drawn as a heightfield, never covers any part of the road surface", () => {
    for (let road = 0; road < ROADS.length; road++) {
      const track = makeTrack(1, road);
      const land = new Terrain(track, new THREE.MeshBasicMaterial());
      let worst = -Infinity;
      for (let z = 0; z < track.length; z += 11) {
        for (const x of [-SHOULDER, -ROAD_EDGE, 0, ROAD_EDGE, SHOULDER]) {
          const f = frameAt(track, z, x);
          worst = Math.max(worst, land.surfaceAt(f.px, f.pz) - f.py);
        }
      }
      // at least a metre under the asphalt everywhere
      expect(worst, track.name).toBeLessThan(-1);
    }
  });
});

const ROAD_EDGE = 7;

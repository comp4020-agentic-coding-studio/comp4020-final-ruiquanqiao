// Builds the shipped art from the CC0 source packs, so every file under
// client/public/assets can be regenerated and nothing in it was hand-edited.
// The packs themselves are large and stay outside the repo:
//
//   node scripts/build-assets.ts <packs-dir>
//
// <packs-dir> holds the unzipped Quaternius "Universal Base Characters
// [Standard]" and "Universal Animation Library 1 and 2 [Standard]" (CC0;
// client/public/assets/ASSETS.md says where each came from).

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

const packs = process.argv[2];
if (!packs || !existsSync(packs)) throw new Error("usage: node scripts/build-assets.ts <packs-dir>");
const out = "client/public/assets/models";
mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const UBC = join(packs, "ubc/Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf");
const UAL1 = join(packs, "ual/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb");
const UAL2 = join(packs, "ual2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb");

// The clips the game plays, by what they are for (ledger rows in brackets).
const KEEP: Record<string, string[]> = {
  [UAL1]: [
    "Driving_Loop", // seated, hands forward: the riding pose
    "Punch_Jab", // punch (C2)
    "Punch_Cross", // a second punch, so swings alternate
    "Jog_Fwd_Loop", // running back to the bike (M2, K4)
    "Death01", // thrown off and down (K3)
    "Hit_Chest", // taking a blow
    "Sword_Attack", // a weapon swing (C5)
  ],
  [UAL2]: [
    "Hit_Knockback", // knocked down by a rider (K2)
    "LayToIdle", // getting up off the road (K4)
    "Melee_Hook", // the backhand (C3)
  ],
};

/** Read a .gltf whose image list names files the pack does not ship (one
 * hair normal map is missing): point those at a file that exists, since the
 * hair is dropped anyway. */
async function readTolerant(file: string): Promise<Document> {
  const dir = dirname(file);
  const json = JSON.parse(readFileSync(file, "utf8"));
  const fallback = json.images.find((i: { uri?: string }) => i.uri && existsSync(join(dir, i.uri))).uri;
  for (const img of json.images) if (img.uri && !existsSync(join(dir, img.uri))) img.uri = fallback;
  const resources: Record<string, Uint8Array<ArrayBuffer>> = {};
  for (const r of [...json.buffers, ...json.images]) if (r.uri && !resources[r.uri]) resources[r.uri] = new Uint8Array(readFileSync(join(dir, r.uri)));
  return io.readJSON({ json, resources });
}

async function character(): Promise<void> {
  const doc = await readTolerant(UBC);
  const root = doc.getRoot();
  // the hair and eyebrows sit under a helmet; the eyes behind its visor
  for (const node of root.listNodes()) if (/Eyebrows|Eyes/.test(node.getName())) node.dispose();
  for (const mat of root.listMaterials()) if (/Hair|Eyes/.test(mat.getName())) mat.dispose();

  // bring the clips across, retargeting each channel to the character's bone
  // of the same name (the two rigs share one naming scheme)
  const bones = new Map(root.listNodes().map((n) => [n.getName(), n]));
  for (const [file, names] of Object.entries(KEEP)) {
    const src = await io.read(file);
    for (const anim of src.getRoot().listAnimations()) {
      if (!names.includes(anim.getName())) continue;
      const copy = doc.createAnimation(anim.getName());
      for (const ch of anim.listChannels()) {
        const target = bones.get(ch.getTargetNode()?.getName() ?? "");
        const s = ch.getSampler();
        if (!target || !s) continue;
        // root translation would carry the rider off the bike
        if (ch.getTargetPath() === "translation" && target.getName() !== "pelvis") continue;
        const input = doc.createAccessor().setArray(new Float32Array(s.getInput()!.getArray()!)).setType("SCALAR");
        const output = doc.createAccessor().setArray(new Float32Array(s.getOutput()!.getArray()!)).setType(s.getOutput()!.getType());
        const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
        copy.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()!).setSampler(sampler));
      }
      console.log(`  clip ${anim.getName()}: ${copy.listChannels().length} channels`);
    }
  }
  for (const buffer of root.listBuffers().slice(1)) buffer.dispose();
  const buffer = root.listBuffers()[0];
  for (const acc of root.listAccessors()) acc.setBuffer(buffer);
  await shrink(doc, 1024);
  await io.write(join(out, "rider.glb"), doc);
}

async function shrink(doc: Document, size: number): Promise<void> {
  await doc.transform(
    resample(),
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [size, size], quality: 82 }),
  );
}

console.log("rider.glb");
await character();
console.log("done");

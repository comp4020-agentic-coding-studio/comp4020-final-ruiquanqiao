import { describe, expect, inject, it } from "vitest";
import { MUSIC, sfx, startAudio, updateAudio } from "../client/audio.ts";
import { ROADS } from "../game/track.ts";

// The race music (ledger H5). It was one synthesised drop-D loop on every
// road; now each road has a recorded rock track of its own (Kevin MacLeod,
// CC BY 4.0), and a club landing on a helmet is a recorded wooden crack over
// a hollow ring (Kenney, CC0).

const baseUrl = inject("baseUrl");

describe("the race music", () => {
  it("gives every road a track of its own", () => {
    expect(MUSIC).toHaveLength(ROADS.length);
    expect(new Set(MUSIC).size).toBe(ROADS.length);
  });

  it("is served by the app, every track and every recorded hit", async () => {
    const hits = [0, 1, 2, 3, 4].flatMap((i) => [`/assets/sfx/wood-light-${i}.wav`, `/assets/sfx/tin-medium-${i}.wav`]);
    for (const path of [...MUSIC, ...hits]) {
      const res = await fetch(new URL(path, baseUrl));
      expect(res.status, path).toBe(200);
      const body = new Uint8Array(await res.arrayBuffer());
      // an MP3 opens with an ID3 tag or a frame sync, a WAV with RIFF
      const head = String.fromCharCode(...body.slice(0, 4));
      if (path.endsWith(".mp3")) expect(head.startsWith("ID3") || (body[0] === 0xff && (body[1] & 0xe0) === 0xe0), path).toBe(true);
      else expect(head, path).toBe("RIFF");
    }
  });

  it("sends a track in parts, as Safari asks before it plays one", async () => {
    // the first static server sent every file whole, and Safari plays no
    // <audio> from a server that cannot answer a Range request
    const res = await fetch(new URL(MUSIC[0], baseUrl), { headers: { range: "bytes=0-99" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("content-range")).toMatch(/^bytes 0-99\/\d+$/);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it("stays silent, without throwing, where there is no audio at all", () => {
    expect(() => {
      startAudio();
      updateAudio({ speed: 50, top: 80, throttle: true, riding: true });
      sfx("club");
    }).not.toThrow();
  });
});

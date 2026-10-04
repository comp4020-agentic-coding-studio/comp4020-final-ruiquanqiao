import { describe, expect, it } from "vitest";
import { SONG_SHAPE, sfx, startAudio, updateAudio } from "../client/audio.ts";

// The race music is an original loop written for this game (ledger H5). The
// recorded PC race was measured only for what any track of its kind shares:
// 105 BPM, a loop of more than a minute, several sections.

describe("the race music", () => {
  it("runs at the original's 105 BPM and loops only after more than a minute", () => {
    expect(SONG_SHAPE.bpm).toBe(105);
    expect(SONG_SHAPE.loopSeconds).toBeGreaterThan(60);
    expect(SONG_SHAPE.sections).toBeGreaterThanOrEqual(3);
  });

  it("stays silent, without throwing, where there is no audio at all", () => {
    expect(() => {
      startAudio();
      updateAudio({ speed: 50, top: 80, throttle: true, riding: true });
      sfx("crash");
    }).not.toThrow();
  });
});

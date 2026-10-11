# Asset inventory

Every file in this directory, where it came from and where its licence is
stated. All of it is CC0 (public domain) except the race music, which is CC BY
4.0 and credited below as that licence asks; the CC0 files need no credit and
are credited anyway. Nothing here comes from *Road Rash*.

The bike, the road markings, the mountain skyline and the pines are not files:
they are drawn in code in `client/models.ts` and `client/scene.ts`.

## Rider

| File | What it is | Source | Licence |
|---|---|---|---|
| `models/rider.glb` | Quaternius "Superhero_Male" base character (rigged, about 13k triangles), with ten animation clips merged in from the Universal Animation Library 1 and 2: `Driving_Loop`, `Punch_Jab`, `Punch_Cross`, `Jog_Fwd_Loop`, `Death01`, `Hit_Chest`, `Sword_Attack`, `Hit_Knockback`, `LayToIdle`, `Melee_Hook` | [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html), [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html), [Universal Animation Library 2](https://quaternius.com/packs/universalanimationlibrary2.html) | CC0 1.0, stated on each pack page and in each pack's licence file: https://creativecommons.org/publicdomain/zero/1.0/ |

`rider.glb` is built by `node scripts/build-assets.ts <packs-dir>` from the
Standard (free) downloads of the three packs. The script drops the hair, eyes
and eyebrows (a helmet covers them), copies only the ten clips across (both
rigs use the same bone names), and resizes the textures to 1024 px WebP. The
leathers, gloves, boots and helmet are applied in `client/models.ts`.

## Ground textures

ambientCG, CC0 site-wide (https://docs.ambientcg.com/license). Colour and
normal maps (OpenGL convention) are the 1K JPGs re-encoded smaller; roughness
is resized to 512 px.

| Files | What it is | Source |
|---|---|---|
| `textures/grass_*.jpg` | Meadow | https://ambientcg.com/view?id=Ground037 |
| `textures/dirt_*.jpg` | Dirt shoulders | https://ambientcg.com/view?id=Ground111 |
| `textures/rock_*.jpg` | Rock, used to fill the mountain skyline | https://ambientcg.com/view?id=Rock035 |
| `textures/asphalt_*.jpg` | Road surface, under the painted markings | https://ambientcg.com/view?id=Asphalt033 |

## Sky

| File | What it is | Source | Licence |
|---|---|---|---|
| `sky/sky.jpg` | "Kloofendal 48d Partly Cloudy (pure sky)", tonemapped and resized to 2048x1024 | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0, https://polyhaven.com/license |

## Music

One track per road, by Kevin MacLeod, re-encoded to 96 kbps MP3 and
loudness-normalised to -16 LUFS so every road plays at the same level.

| File | Road | Track | Source |
|---|---|---|---|
| `music/ridge.mp3` | Ridge Road | "Exhilarate" | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Exhilarate.mp3 |
| `music/seawall.mp3` | Seawall Highway | "Riptide" | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Riptide.mp3 |
| `music/orchard.mp3` | Orchard Valley | "Cool Rock" | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cool%20Rock.mp3 |
| `music/goldtown.mp3` | Gold Town | "Hotrock" | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Hotrock.mp3 |
| `music/canyon.mp3` | Red Canyon | "Neolith" | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Neolith.mp3 |

"Exhilarate", "Riptide", "Cool Rock", "Hotrock" and "Neolith" Kevin MacLeod
(incompetech.com). Licensed under Creative Commons: By Attribution 4.0
License, http://creativecommons.org/licenses/by/4.0/

## Sound effects

| Files | What it is | Source | Licence |
|---|---|---|---|
| `sfx/wood-light-0..4.wav` | `impactWood_light_000..004`: the crack of a club on a helmet | Kenney, [Impact Sounds](https://kenney.nl/assets/impact-sounds) 1.0 | CC0 1.0, stated in the pack's License.txt |

Each is trimmed of its leading silence, so the crack lands on the frame the
blow does, cut to 0.3 s and saved as mono 16-bit WAV: an MP3 would start
about 26 ms late. Every other sound in the game is synthesised in
`client/audio.ts`.

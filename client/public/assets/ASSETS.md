# Asset inventory

Every file in this directory, where it came from and where its licence is
stated. All of it is CC0 (public domain): no attribution is required, and it
is credited here anyway. Nothing here comes from *Road Rash*.

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

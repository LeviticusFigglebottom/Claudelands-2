# DECISIONS

Architecture calls for pass 1, and why. Written for the next engineer (probably
future-me) deciding whether to keep, extend, or replace something.

## Stack: TypeScript + Three.js + Vite, zero binary assets

- **Web-first** because the target is *fast iteration on look and feel*: sub-second
  hot reload, trivially screenshotable headless (see `tools/screenshot.mjs`), runs
  anywhere with no install. The identity work (toon shading, ink outlines, juice)
  is shader/feel work, and the tightest tune-render-look loop wins.
- **Three.js over a full engine (Godot/Unity/Bevy)**: the brief demands a custom
  render identity anyway (custom toon ramp + ink post-process). Three gives full
  control of the pipeline without fighting an engine's built-in renderer, and its
  post-processing stack (`EffectComposer`, `UnrealBloomPass`) covers bloom for free.
  Cost: no built-in physics/nav — accepted; this game needs only capsule-vs-AABB
  and straight-line chase AI at this scope (see ROADMAP for the upgrade path).
- **Zero binary assets, everything procedural**: gun meshes are assembled from
  parametric primitives (`src/gen/gunmesh.ts`), textures are canvas-painted at boot
  (`src/render/textures.ts`), and all SFX are WebAudio synthesis
  (`src/audio/synth.ts`). This keeps the repo pure code+data, makes every visual a
  tunable parameter, and means part-based gun visuals *can't* drift from part data —
  they're derived from it. Cost: fidelity ceiling; accepted for pass 1 and the seam
  (swap a builder for a glTF loader per part) is clean.

## Render identity (src/render/)

- **Toon shading**: `MeshToonMaterial` + shared hard-banded gradient ramp, with a
  rim-light term injected via `onBeforeCompile`. Chosen over a fully custom
  ShaderMaterial so *all* of three's light types (sun, hemisphere, barrel point
  lights, muzzle flashes) keep working for free.
- **Ink outlines**: full-screen post pass doing Roberts-cross edge detection on a
  depth+normal prepass — catches silhouettes *and* interior creases, with line
  weight fading by distance. Chosen over inverted-hull because it inks *everything*
  (procedural meshes included) with no per-mesh work. FX (beams, particles, sky)
  live on layer 1, which the prepass skips — glow never gets outlined.
- **Hand-drawn shadow hatching**: screen-space cross-hatch applied below luminance
  thresholds inside the same ink pass (thresholds evaluated in gamma space — the
  composer chain is linear; this bit us once already, see the comment in post.ts).
- **One tuning surface**: every look knob (ink density, hatch, rim, bloom,
  saturation…) is a uniform reachable from the **art sandbox** (`/sandbox.html`) with
  live sliders and a manufacturer-lineup turntable.

## Data-driven everything (src/data/)

The rule enforced across the codebase: **systems code never contains content**.
Manufacturers, weapon parts, rarities, elements, legendaries, shields/grenades/
class-mods/relics, classes/skill-trees, enemies, zone layout/spawn tables, and all
flavor text (posters, graffiti, vendor lines, wire-spool logs, barks) are plain
data modules. Pass 2 adds content by adding rows, not editing generators. The one
data-consumer worth naming: `weapongen.ts` aggregates part `StatMods`
multiplicatively/additively per a declared key list, so new stats are added in one
place (`MULT_KEYS`/`ADD_KEYS`).

## Game architecture (src/game/)

- **Event bus** (`state.ts`): combat emits `kill`; XP, kill-skills, loot, audio, and
  UI all react without importing each other.
- **Stat aggregation** (`stats.ts`): every bonus source (skills, kill-skill buffs,
  class mod, relic, grit ranks, shield gimmicks) folds into one query
  (`statsys.mult('gunDamage')`). Systems never know where a bonus came from.
- **Juice is centralized** (`juice.ts`): trauma-based screenshake, hit-stop,
  FOV kick, recoil — one tunable table, consumed by the camera and viewmodel.
- **Defense layers**: enemies (and the player) are `Damageable` with stacked
  shield→armor→flesh pools; the element matrix lives in `data/elements.ts` and is
  applied in exactly one function (`combat.applyDamage`), which also owns crits,
  DoT procs, volt chaining, and rime slow/amp.
- **Player is never "dead"**: any damage path that zeroes flesh routes into the
  downed state (Fight For Your Life → second wind on kill, or Re-Constructor
  respawn with a cash cut).

## Testing/self-review harness

Headless Chromium (SwiftShader) renders at ~2fps, so wall-clock waits can't drive
gameplay. `main.ts` exposes a `window.__game` seam with `fastForward(seconds)`
(steps the sim at 60Hz without rendering), generator access, and an equip helper.
`tools/screenshot.mjs` uses it to play the actual loop — spawn waves, aim at crit
zones, kill, walk to drops — and screenshot every identity moment. This doubles as
the start of an integration-test harness.

## Known accepted shortcuts (see ROADMAP for the full list)

- Collision is circle-vs-AABB on a flat ground plane; no navmesh (AI walks straight
  lines and can hug obstacles).
- `MeshToonMaterial` ramp applies to sunlight correctly but point lights band less
  visibly at low intensity — acceptable at current light budget.
- Damage numbers are DOM elements — cheap and very stylable; would need pooling
  past a few hundred per second.
- Saved state: only account-wide Grit Rank persists (localStorage). Character
  save/load is a pass-2 item; item instances are already plain serializable data
  by design.

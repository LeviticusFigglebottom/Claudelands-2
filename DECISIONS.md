# DECISIONS

Architecture calls, and why. Written for the next engineer (probably
future-me) deciding whether to keep, extend, or replace something.
Pass-2 additions marked as such.

## Stack: TypeScript + Three.js + Vite, zero binary assets

- **Web-first** because the target is *fast iteration on look and feel*: sub-second
  hot reload, trivially screenshotable headless (see `tools/screenshot.mjs`), runs
  anywhere with no install, and deploys as a static site (see Vercel below).
- **Three.js over a full engine (Godot/Unity/Bevy)**: the brief demands a custom
  render identity anyway (custom toon ramp + ink post-process). Three gives full
  control of the pipeline without fighting an engine's built-in renderer.
- **Zero binary assets, everything procedural**: gun/enemy/world meshes are
  parametric primitives, textures are canvas-painted at boot, all SFX *and music*
  are WebAudio synthesis. The repo stays pure code+data, every visual is a tunable
  parameter, and part-based gun visuals can't drift from part data.

## Rendering (src/render/)

- **Toon shading**: `MeshToonMaterial` + shared banded ramp + injected rim light —
  keeps all of three's light types working (sun, barrel fires, muzzle pools).
- **Ink outlines**: post pass with Roberts-cross edges over a depth+normal prepass;
  FX live on layer 1 which the prepass skips, so glow never gets outlined.
- **Hatching**: screen-space cross-hatch below *gamma-space* luminance thresholds
  (the composer chain is linear — evaluating thresholds in linear space painted
  hatching over the sky once; see the comment in post.ts).
- **Pass 2**: FXAA as the final pass (smooths ink lines), a sun disc that blooms,
  and the sun's shadow frustum follows the player — required once the world grew
  beyond one shadow map's reach.

## World as data + analytic terrain (pass 2)

`data/world.ts` defines the whole overworld: district rows (center/radius/base
height/faction/spawn table/level band) and a POI list. The terrain is an
**analytic heightfield function** (`terrainHeight(x,z)`) — dunes + district
flattening + road ruts + the boss crater — shared by the mesh builder and every
system that asks "how high is the ground here" (player, AI, loot, projectiles,
props, decals). No collision mesh for the ground: hitscan ray-marches the same
function (bisection refine), which is cheaper and can never disagree with
`groundHeight`. Roads are terrain *vertex tint*, not geometry — a draped-mesh
attempt z-fought immediately; vertex colors can't.

**Corridor terrain (pass 9)**: linear maps (the Tangle) set `terrain.corridor`
— a serpentine path polyline + width + arena circles + wall height. The same
analytic heightfield raises impassable ridge walls everywhere the point is far
from both the path and every arena, so "mostly linear, opens into arenas"
costs one distance function and zero new collision code. Districts still sit
on the arenas, so population/quests/dressing all work unchanged.

## Vehicles: grip separation, not spline karts (pass 10)

`game/vehicle.ts` runs one arcade-but-weighted model for every driver,
player or AI: steer FIRST (rotating the nose out from under the world-space
velocity is what creates slip), then decompose velocity against the new
heading, damp the lateral component by a grip constant, recompose. Drifting
is nothing but a lower grip constant + a steering multiplier — the slide,
the counter-steer feel, and the boost-meter economy (fed by |lateral|) all
fall out of one number. Airtime is equally cheap: snap to the analytic
terrain while `pos.y <= ground`, go ballistic the moment a crest drops the
ground away. The AI rival is the same class fed steer/throttle by a
waypoint chaser, so difficulty tuning is data (speed/skill factors), never
a second physics.

## Character voices: prosody over phonemes (pass 11)

No TTS: Web Speech is the robotic monotone the brief forbids, neural TTS
breaks the zero-asset rule. Instead each syllable is an oscillator through
two vowel-formant bandpasses, and ALL the acting lives in prosody rules —
sentence-mood contours (fall/rise/bang), CAPS emphasis, word stress, comma
breaths, jitter — plus a per-character profile (pitch/range/rate/waveform/
formant-shift/breath/vibrato/drawl). Dialogue, holocalls, race barks, and
the pit announcer (same engine + slap-back delay) share it. Lines stay
readable text; the voice is a performance layer, so writing more dialogue
costs nothing.

## Population, not waves (pass 2) → staged encounters (pass 12)

Districts originally self-repopulated on a cadence. Pass 12 replaced the
faucet with **staged encounters**: each hostile district is dormant until
approached, stages a full wave plus 1–2 reinforcement waves as it's thinned
(final wave carries a guaranteed badass), then stays CLEARED until the player
genuinely leaves and returns (range+time, or a map switch). Enemies still
patrol and aggro organically, but they **leash** at their district's edge —
give up, heal to full, walk home — so fights have a shape and a place.
Bosses are `Enemy` subclasses (`boss.ts`) with phased patterns, spawned by
the quest system, never by population. Helix (armor/shield-heavy) vs
Rustborn (flesh-heavy) makes the element matrix matter by geography.

## Enemy tactics: one brain, three verbs (pass 12)

The ranged-AI overhaul deliberately isn't a behavior tree. Gunners/lobbers
run a five-state loop (advance / strafe / toCover / hold / peek) driven by
three queries: line-of-sight (a raycast down the muzzle through the same
statics+terrain the guns use), a fighting band (attackRange fractions), and
`world.coverSpots()` (points on the far side of mid-sized colliders from the
threat — slivers and walls filtered out). Fire control is the honest part:
gunners simply can't shoot without LOS, lobbers explicitly can (arcs go over
cover), and grenades exist to break the player's own cover camping. All the
"organic" reads — flank a covered enemy and it bails, hurt one and it runs,
peek cycles vary — fall out of those queries, not scripted animations.

## Kart physics, not sim physics (pass 13)

The buggy's drift is Mario Kart's grammar on top of the steer-first slip
model: hop (SPACE) locks a slide direction, charge ticks by held time
(steering into the slide charges faster), release pays a tiered mini-turbo
that raises the speed cap without touching the meter. Two tuning rules
proved load-bearing. First, `driftGrip` must stay in the same league as
the drift yaw rate (~3.4 rad/s) — at 1.7 the slip angle grew unbounded
and every drift decayed into a spin-out below the auto-release floor; 4.2
holds a readable ~50° slide. Second, drifts REDIRECT momentum instead of
burning it: most of the lateral speed the grip scrubs off is fed back
into the nose (capped near the soft cap), because a slide that bleeds
34 → 6 m/s is a punishment, not a mechanic. Airtime got the same
arcade treatment — crest launches peak-hold the ground's rise rate
(smooth bump tops have zero slope exactly where you leave them, so the
instantaneous read was always ~0), gravity relaxes 0.72× while rising,
and the ground-snap tolerance only applies while descending so the hop
can't be re-glued on frame one.

## Holocall chains are about geography (pass 13)

Auto-progression (remote turn-in + auto-accept over holocall) keys on
same giver AND same objective map. The point of the mechanic is "you're
already out here, keep moving" — arrive → cull → boss chains. If the next
quest moves the story to a new map, auto-accepting it would teleport the
narrative: instead the old quest completes over holocall and the next
waits at the giver's desk. Same rule, one line:
`(next.objective.mapId ?? base) === (q.objective.mapId ?? base)`.

## Quests (pass 2)

Declarative rows in `data/quests.ts` (goto / kill_faction / collect / boss);
`game/quests.ts` owns progression, gate unlocks, boss spawns, and rewards. UI
(tracker, log, dialogue, compass marker) only reads its state. Turn-in is
accept-at-NPC / auto-complete-on-objective — one NPC visit per step keeps the
loop moving without back-tracking padding.

## Feel & feedback (pass 2 hardening)

- **Damage routing**: anything that damages the player funnels through one
  router (`combat.setPlayerDamageRouter`) so shield-delay reset, hurt vignette,
  and the direction indicator can't be bypassed (enemy splash used to).
- **Debris layer** (`debris.ts`): shell casings, dropped mags, pooled decals
  (bullet holes / scorch / bile), tumbleweeds. Cosmetic, pooled, cheap.
- **Reload animations are manufacturer data**: one keyframe switch per
  `reloadStyle`, with physical mag drops. Elemental deaths likewise switch per
  element (rime freeze, ember ash, volt arcs, bile puddle).
- **Dynamic music** (`audio/music.ts`): a 16-step synth pattern engine with three
  crossfaded intensities (calm/combat/boss) driven per-frame from aggro state.

## Persistence (pass 2)

Items are plain data by design, so the save is direct JSON: state + quests +
discovered stations in localStorage, autosaved on a timer/quest events/tab-hide.
Grit Rank stays in its own key and survives "Abandon run". `loadFrom` is
versioned (`v: 2`) for future migration.

## Vercel deployment (pass 2)

The game is a fully static Vite build (two pages: game + art sandbox) — no
server, no API, no env vars. `vercel.json` pins framework/build/output;
`base: './'` keeps assets relative. Nothing about the game required
sacrificing for this: localStorage persists per-origin, audio unlocks on the
title click (autoplay-policy safe), and all assets are generated client-side.

## Testing/self-review harness

Headless Chromium (SwiftShader) renders at ~2fps, so `window.__game.fastForward`
steps the sim at 60Hz without rendering. `tools/screenshot.mjs` plays the real
loop (quests, combat, bosses, panels) and screenshots every identity moment.
Ad-hoc functional tests drove out real bugs each pass: linear-vs-gamma hatching,
splash bypassing the downed state, stale matrices breaking hitscan, render-loop
game logic missing under fast-forward.

## Known accepted shortcuts (see ROADMAP)

- No navmesh: AI steers straight and can hug props; enemies fire through thin
  cover at long range.
- Circle-vs-AABB collision on props; heightfield has no overhangs.
- Damage numbers are DOM nodes (styled cheaply, capped by CSS lifetime).
- One playable class; three more are data stubs with action-skill designs.

# ROADMAP

Living document. What shipped in pass 1, what's stubbed or shallow, and the
concrete next moves for pass 2+. "Seam" = the extension point already exists in
code/data; the work is content or depth, not refactoring.

## Pass 1 status — the vertical slice

The full loop runs in one hand-dressed arena (Gully Seven): shoot → kill →
loot beam → pick up a part-generated gun → item card reflects parts →
XP/level → spend skill points → Sentry Rig action skill → mini-boss → endless
trickle. Six manufacturers, six weapon types, five elements, five gear kinds,
rarity common→legendary (+opaline tier reserved), one playable class with three
6-tier trees, Grit Rank meta-progression, two vendors, chests, wire-spool audio
logs, FFYL/second wind.

## Stubbed / shallow (explicit debts)

| Area | State in pass 1 | Pass 2+ move |
| --- | --- | --- |
| Other 3 classes | Data stubs (`data/classes.ts`, `playable: false`) | Implement action skills (transform / pet / berserk); class select on title screen. Seam: skills are data; action-skill code is isolated in `game/actionskill.ts`. |
| Opaline (pearl) tier | Rarity row exists, never dropped naturally | Named opaline uniques with build-around effects + world-drop source. |
| Legendary pool | 6 signatures | Grow per manufacturer×type; add drop-source pinning (boss dedicated drops). Seam: `data/legendaries.ts`. |
| Missions/quests | None — kill-the-boss implicit objective | Quest data format + giver NPC with personality + objective HUD. Flavor hooks (`data/flavor.ts`) ready for writers. |
| World scale | One arena | Zone streaming: `ZoneDef` is already data (spawn tables, POIs, waves). Add zone loader + real fast-travel between zones (station UI is stubbed in-world). |
| Nav/AI | Straight-line chase + range hold; no pathfinding | Grid/flow-field nav around colliders; cover use for gunners; leap attacks for mutts. |
| Enemy variety | 5 archetypes + badass + 1 mini-boss | Faction #2 (Helix Combine security bots — armor-heavy to make Bile matter), flying archetype, true boss with phases/mechanics. |
| Save system | Grit Rank only (localStorage) | Serialize `GameState` (items are plain data by design — this is mostly plumbing). |
| Damage number pooling | DOM nodes created per hit | Pool + cap; fine until sustained AoE builds. |
| Gun mesh fidelity | Parametric primitives | Per-part authored meshes (glTF) behind the same `PartLook` recipe interface; add inverted-hull outline pass for chunky first-person line weight. |
| Sounds | WebAudio synth | Keep the synth as the fallback layer; add sample-based layers for shots/impacts. Mix bus exists in `audio/synth.ts`. |
| ADS | FOV zoom + sensitivity scale | True sight alignment (move viewmodel to eye axis), scope overlays for Longeye. |
| Second-wind targets | Any kill revives | Weight toward "the one who downed you" bonus; crawl speed skill hooks exist (`fflTime`). |
| Multiplayer | Not attempted | Out of scope until systems stabilize. |

## Pass 2 priorities (ordered)

1. **Class select + one more playable class** (Stormcaller: shock-transform) —
   proves the class format scales; forces action-skill augment generalization.
2. **Quest system + Gutterlight hub stub** — gives the loop a spine and a place
   for vendors/writers; fast-travel becomes real with a second zone.
3. **Second zone (`data/zone2.ts`) + zone loader** — validates world-as-data.
4. **Boss redesign**: Gutterball phases (crown-off = crit exposed), dedicated
   legendary drop.
5. **Loot feel deepening**: pickup vacuum on hold-E, compare-on-ground diff
   arrows (card compare exists), auto-sort/junk-mark in backpack.
6. **Perf pass**: instanced particles are done; pool damage numbers, merge
   static arena geometry, add quality toggle for the ink prepass at high DPR.

## Tuning debts (small, high-value)

- Recoil/kick curves per weapon type (data exists: `recoil` stat is wired).
- Hatch scale vs. resolution (currently screen-space constant).
- Enemy bark cadence + more lines per archetype.
- Vendor restock timer (currently restocks on level-up only).

## Identity checklist (pass-1 self-review)

- [x] Still frame reads as the genre (outlines + toon + hatching + palette) — see `shots/`
- [x] 3+ manufacturers visibly/mechanically distinct (6 shipped; sandbox lineup shot)
- [x] Kill → rarity-colored loot beam + audio sting
- [x] Picked-up gun's appearance & stats reflect parts on the item card
- [x] Five elements with distinct VFX + status effects
- [x] Comic damage numbers with crit differentiation
- [x] Action skill + skill tree usable, points spendable
- [x] Arena has authored decor, posters/graffiti, ambient audio, wire-spool logs
- [x] This file marks every stub with a concrete next step

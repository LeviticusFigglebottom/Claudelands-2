# ROADMAP

## Pass 5.1 status — instruments that tell the truth, maps that look like maps

**Compass & minimap chirality fixed**: both instruments used a mirrored
screen-relative angle, so a target on your right showed on the left and the
radar rotated *with* your turn instead of against it. The screen-relative
angle is now `facing − bearing` everywhere: compass markers slide to the
correct edge (with a chevron) when off-view and center exactly when you face
them; the minimap rotates like a real radar and its N tick matches.

**Full map is a real chart**: shared painted-terrain module (contour lines
every 2.5m, hillshade, shorelined water, readable dirt-track roads) under
structure line-art stamped from the world's actual collision footprints —
buildings, forts, wrecks, kilns, the Brasshaven hull, tree scatter as dots —
plus labeled discovered stations, POI icons, faction district rings, and a
correctly rotating player arrow. Map orientation now matches the first-person
camera (N up, same chirality as the minimap), and the minimap draws the same
painted terrain rotated to view. One quest line whose "north" contradicted the
compass was corrected.

**Signs actually read**: `posterTexture` now takes the target plane's aspect
ratio (canvas sized to match — no more squashed 5.6:1 banners drawn on a
0.8:1 texture), measures each line and fits it to the sign's text area, and
centers the block with proper baselines per style. Every two-`side`d text
plane (town banner, station boards, Duke flags, city ads, gate sign) is now a
front+back pair so text never renders mirrored.

**Menus behave like an ECHO device**: BACKPACK / SKILLS / MAP / LOG tab strip
on every device panel — click a tab or flip with Q/E; the world FREEZES
completely while any menu is open (enemies, projectiles, damage all hold);
and the HUD now fades out for the intro cutscene exactly like in-game
cinematics.

## Pass 5 status — cinematics, ECHO UI, painted maps, crits, Brasshaven

**In-game cinematic system** (`ui/cinematics.ts`): triggered, gameplay-pausing,
any-key-skippable letterboxed scenes with timed title cards, HUD faded out
while they run. Three kinds, each plays once (seen-set persisted in the save):
*biome entry* (high sweep down to the player on first arrival at a map, name +
tagline card), *character introduction* (dolly toward Quibb/Zaza on first E,
then the dialogue opens), and *boss pre-fight* (slow orbit + epithet card when
you first close with a living boss — the arena is frozen until it ends).

**ECHO-NET menu reskin**: every panel (backpack, skill trees, quest log,
vendors, dialogue, fast travel, map, pause) is now a dark-teal glass terminal —
"ECHO-NET // FIELD TERMINAL" header strip, animated scanlines + flicker, cyan
borders and teal-tinted rows/buttons/tabs — while the in-world HUD keeps its
amber BL look.

**Painted full map**: the M map now renders a real top-down colored terrain
composite per biome (height-shaded palette bands, rock above the treeline,
lake tint, darkened roads, west-east hillshade, vignette), cached per map,
under labeled district rings colored by controlling faction.

**Criticals actually work**: crit zones are assigned explicitly per archetype
(heads for humanoids, the eye for flyers, the fuse housing for bombers — now
protruding above the body sphere so it's physically hittable) instead of
falling back to "last body part pushed" (guns/armor plates were stealing the
slot). Armored brutes get a logical weak point: a glowing boiler valve on the
BACK — flank them. Verified through the real hitscan path headlessly.

**BRASSHAVEN**, the sanctuary city: fourth map, built in the hull of a beached
mega-hauler — lit name sign, multi-floor buildings with glowing windows and
neon ads, market stalls, string lights, seven ambling citizens, both vendors,
no combat. Unlocked by q12 "Key to the City" after the Cinder Throat boss
falls (the quest auto-discovers the Brasshaven Gate Re-Constructor node), then
fast-travelable from anywhere at any time outside combat.

## Pass 4 status — the Cinder Throat, maps & radar, UI polish

**Third main area, THE CINDER THROAT**: a large linear gauntlet (320m map) —
a serpentine walkable corridor carved between impassable ridge walls (slope
blocking on player and AI), opening into arena nodes: Throat Gate → Cinder
Camp → Ash Flats → Kiln Yard → the Foundry Court, culminating in SAINT
FURNACE (meteor rain, ember novas, offering summons, glowing firebox crit
zone). Volcanic biome via the same texture system: basalt ground with
glowing ember cracks, lava pools, brick kilns, burnt snag trees, ash fall,
the Kindled cult (3 new archetypes + reused bombers), quests q9–q11.

**Navigation**: circular minimap radar (enemy/boss/loot-rarity/station/quest
blips, rotating with view) + full map on M (districts, roads/corridor,
stations, boss, quest, player arrow). Compass markers now smooth-clamp with
edge chevrons and layered icons.

**Fixes/polish**: terrain queries are grid-matched to the rendered mesh
(bilinear over the same vertex grid) so props/characters no longer float or
clip — the throne and boneyard placements sit true; scatter (rocks/tufts)
respects keep-out margins around structures, POIs, and roads; BL-style HUD
reskin (skewed plates, segmented bars, amber trim, bigger ammo numerals).

## Pass 3 status — two worlds, two heroes

**The Frosthollow**: a second full map (frozen highland biome — snow terrain,
snow-capped pines and mesas, aurora ribbons, snowfall, a frozen lake with
something vast under the ice) reached by BL2-style cross-map Re-Constructor
travel, unlocked through the story. Districts: Chatterjaw Landing (Zaza's
caravan — she's the second quest giver, in person), the Pinebreak, the Frozen
Fathom, and the Icebox. Three new quests (q6–q8), five Frostborn archetypes,
and a third phased boss (OLD MAN AVALANCHE: charge, freezing rime novas, pack
summons, enrage). Same procedural texture system, parameterized per biome.

**Second playable class**: Sable Anders, the Stormcaller — Tempest Shell
action skill (shots become chaining Volt, periodic arcs off the player) with
three full trees (Static / Squall / Groundwire), augments (Forked Sky, Squall
Line, Thunderclap) and capstones (Live Wire free-ammo shell, Eye of the Storm
kill-extension, Lightning Rod thorns). Class select + difficulty select on new
game; class persists in the save.

**Intro cutscene**: skippable letterboxed camera sweep with title cards and
the character freeze-frame splash.

**Balance**: difficulty tiers (Tourist / Contractor / Badass — enemy hp/damage,
loot luck, xp), leaner trash gun drops, boss drops floored at rare, stronger
luck scaling, player hp growth up, district repopulation that refills fast
when empty and trickles when full. Two new legendaries (The Avalanche, Small
Talk).

Living document. What shipped per pass, what's stubbed or shallow, and the
concrete next moves. "Seam" = the extension point already exists in code/data;
the work is content or depth, not refactoring.

## Pass 2 status — the open wasteland

The world is now a 260m multi-district overworld on analytic heightfield
terrain: **Gutterlight** (hub town: Quibb, vendors, fast travel, string
lights), **Gully Seven** (Rustborn fort), **the Boneyard** (leviathan skeleton,
graves, cacti), **the Slagflats** (Helix crash site, slag pools, crater), and
**Trash Mountain** (gated boss court). A five-quest main line (goto → cull →
salvage → Gutterball → HX-1 Warden Prime) with dialogue, tracker, log, compass
markers, gate unlock, and reward drops. Districts self-repopulate with
patrolling enemies from two factions (8 archetypes + badasses + 2 phased
bosses). New: dynamic music, save/continue, pause menu, fast-travel network,
vendor selling, compass, target nameplates, boss bars, damage-direction arc,
manufacturer reload animations with mag drops, shell casings, bullet-hole /
scorch / bile decals, elemental death variants (rime freeze-shatter, ember ash,
volt arcs, bile puddles), explosive barrels, grenade fuse blink/beep + wall
bounces, footsteps/landing, weapon sway, tumbleweeds, scrap rats, vultures,
FXAA, sun disc, player-following shadows. Deploys to Vercel as a static site.

## Pass 1 recap

Rendering identity (toon + ink + hatch + bloom + grade), part-based weapon
generation (6 manufacturers × 6 types × 7 slots), rarities + legendaries with
red text, shields/grenades/class mods/relics, 5-element damage matrix, Gunsmith
class (Sentry Rig + three 6-tier trees), Grit Rank meta, FFYL, vendors, chests,
wire spools, art sandbox, headless screenshot harness.

## Stubbed / shallow (explicit debts)

| Area | State | Next move |
| --- | --- | --- |
| Other 3 classes | Data stubs (`playable: false`) | Implement Stormcaller (shock transform) first; class select on title. Seam: skills are data, action-skill code isolated. |
| Side quests | Main line only | Add `sideQuests` rows + multiple active quests + per-quest tracker slots. Seam: quest defs are declarative rows. |
| Opaline tier | Rarity row exists, never drops | Named opaline uniques with build-around effects. |
| Legendary pool | 6 signatures | Grow per manufacturer×type; boss-dedicated drops (bosses currently drop a random legendary). |
| Nav/AI | Straight-line steering | Flow-field around colliders; gunner cover use; drone kiting. |
| Enemy LOS | Fires through thin props at range | Cheap LOS raycast vs `staticTargets` before ranged attacks. |
| Second zone | One overworld | The seam is proven (world-as-data); a second map = new `data/world2.ts` + a loader + Re-Constructor network across maps. |
| True save slots | Single autosave slot | Slot UI + export/import string. |
| ADS sights | FOV zoom + centering | True sight alignment per gun; scope overlay for Longeye. |
| Audio | All synth | Keep synth as fallback; optional sample layers. Mix bus exists. |
| Gun mesh fidelity | Parametric primitives | Authored glTF per part behind the same `PartLook` interface. |
| Multiplayer | Not attempted | Out of scope. |

## Pass 3 priorities (ordered)

1. **Stormcaller playable + class select** — proves multi-class end-to-end.
2. **Side-quest layer** (3-4 originals: rat racing, poster defacement tour,
   Zaza's "mystery box" fetch) + multiple-active-quest tracker.
3. **Enemy LOS + cover AI** — biggest remaining combat-feel gap.
4. **Boss dedicated drops + opaline uniques** — completes the loot chase.
5. **Second map** via the world-as-data seam, with cross-map fast travel.
6. **Perf pass**: merge static district geometry, instanced gibs/casings,
   quality toggle for the ink prepass at high DPR.

## Deploy

- `npm run build` → static `dist/` (game at `/`, art sandbox at `/sandbox.html`).
- Vercel: import the repo, defaults apply via `vercel.json` (framework=vite,
  output=dist). No server, no env vars, no functions.

## Identity checklist (pass-2 self-review)

- [x] Still frames read as the genre in every district — see `docs/screenshots/`
- [x] 6 manufacturers visibly/mechanically distinct; reload styles match maker
- [x] Kill → rarity beam + sting; elemental deaths differ per element
- [x] Item cards reflect parts/stats; compare arrows; vendor buy/sell
- [x] 5 elements with distinct VFX + status; matrix matters by faction
- [x] Comic damage numbers with crit flair; hit-direction + nameplates
- [x] Action skill + trees + Grit spendable; saves persist across sessions
- [x] World feels alive: patrols, critters, vultures, tumbleweeds, music,
      barks, quests, bosses, gates, fast travel
- [x] Deployable to Vercel with zero functionality loss

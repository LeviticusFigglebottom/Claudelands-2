# ROADMAP

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

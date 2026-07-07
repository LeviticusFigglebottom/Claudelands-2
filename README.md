# CLAUDELANDS 2

*A rust-bitten, cel-shaded looter-shooter — now an open wasteland.* You are
a contractor hired by Foreman Quibb to de-throne Grand Duke Gutterball,
trash-king of the Claudelands — and to deal with whatever Helix Combine
buried in the Slagflat crater. FOUR PLANETS and a dozen-plus worlds — the
sun-blasted Claudelands, the frozen Frosthollow, the volcanic Cinder Throat
gauntlet, BRASSHAVEN the sanctuary city, THE RUST GULCH (a huge open canyon
with wreck fields to strip and a full RACING CIRCUIT — drive the
JUNKSTALLION dune buggy with drifts, boost, and jumps against an AI rival
at three difficulties), the lush Mangrove Shelf of VELDT MINOR (reached by
scrapship, with a planet-aware launch-and-landing cinematic), THE TANGLE'S
deep-jungle gauntlet, the moon-dark glass of VITRA NULL (low gravity, a
lighthouse two centuries stubborn, and THE UNLIT MILE below it), and now
VOLTHOLM, the storm-harvest world — its sky runs on a schedule (SKYFALL:
sirens, then lightning; hug a conductor rod or be the conductor) and its
GALE CHANNELS shove you, your enemies, and your buggy wherever the weather
is going. FOUR racing circuits including two truly LINEAR point-to-point
runs: THE SHATTERLINE (downhill on glass at one-third gravity, three big
airs, no second lap) and THE JAR RUN (a gale-tailwind straight, a rod
forest under live SKYFALL, a crater hop to the finish). FOUR playable
Vault-Rats, thirty-seven main quests (with BL2-style holocall turn-ins and
auto-accepted chains) plus Brasshaven side jobs with quest-only unique
legendaries, TEN bosses with dedicated signature legendaries, enemies that
strafe, take cover, peek-fire, lob grenades, and leash home instead of
chasing forever, staged POI encounters that stay cleared until you revisit,
baked ElevenLabs CHARACTER VOICES for every questgiver and a Crucible
announcer, in-game cinematics, a digistruct death-and-respawn sequence,
BL2-style zone-edge transitions, per-weapon ADS reticles with true sniper
scopes, THREE SAVE SLOTS with export/import, bazillions of guns — plus
serverless 4-PLAYER CO-OP (shared story and shared enemies with posse
scaling, instanced loot, trade and duels), ENDLESS MODE in the Crucible
fighting pit, and a cinematic attract-mode main menu with graphics settings
and a Veteran Start.

Everything is procedural — meshes, textures, sound, *music* — and everything
that is content (guns, parts, manufacturers, elements, skills, enemies,
districts, quests, jokes) is data. See `DECISIONS.md` for the why and
`ROADMAP.md` for what's next.

![Gully Seven combat](docs/screenshots/gully-combat.png)

| | |
| --- | --- |
| ![Gutterlight hub](docs/screenshots/hub.png) | ![The Boneyard](docs/screenshots/boneyard.png) |
| ![Boss: Gutterball](docs/screenshots/boss.png) | ![Quibb dialogue](docs/screenshots/dialogue.png) |
| ![The Frosthollow](docs/screenshots/frosthollow.png) | ![Pinebreak combat](docs/screenshots/pinebreak.png) |
| ![Brasshaven](docs/screenshots/brasshaven.png) | ![Boss pre-fight cinematic](docs/screenshots/boss-cine.png) |
| ![Redline's Run race grid](docs/screenshots/race-grid.png) | ![Driving the Junkstallion](docs/screenshots/buggy.png) |
| ![Digistruct respawn](docs/screenshots/digistruct.png) | ![ECHO holocall](docs/screenshots/holocall.png) |
| ![The Tangle](docs/screenshots/tangle.png) | ![Lagoon waterfall](docs/screenshots/waterfall.png) |
| ![Interplanetary travel](docs/screenshots/ship-space.png) | ![The Bloom Mother](docs/screenshots/bloom-mother.png) |
| ![Voltholm: the Jarworks](docs/screenshots/voltholm.png) | ![SKYFALL on the Gale Flats](docs/screenshots/skyfall.png) |
| ![The Shatterline (linear GP)](docs/screenshots/shatterline.png) | ![The Jar Run (linear GP)](docs/screenshots/jarrun.png) |
| ![THE AUGER — the spiral](docs/screenshots/auger.png) | ![The Hang Fields' kites](docs/screenshots/hangfields.png) |
| ![ECHO map](docs/screenshots/echo-map.png) | ![ECHO backpack](docs/screenshots/echo-backpack.png) |
| ![Skill trees](docs/screenshots/skill-tree.png) | ![Art sandbox](docs/screenshots/art-sandbox.png) |

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

- `npm run build` — typecheck + production build to `dist/`
- `npm run preview` — serve the production build
- `/sandbox.html` — art sandbox: manufacturer gun lineup + live ink/hatch/rim/bloom sliders
- `npm run screenshot` — headless self-review: plays the real loop via the
  `window.__game` debug seam and drops identity screenshots in `shots/`

## Deploy (Vercel)

Static site, no server, no env vars. Import the repo on Vercel — `vercel.json`
pins `framework: vite`, `buildCommand: npm run build`, `outputDirectory: dist`.
Both pages (`/` and `/sandbox.html`) ship as-is with zero functionality loss;
saves live in the player's browser (localStorage).

## Controls

| Input | Action |
| --- | --- |
| WASD / Space / Shift | Move / jump / sprint (driving: throttle+steer / drift / boost) |
| Mouse / LMB / RMB | Aim / fire / aim-down-sights |
| R | Reload (each manufacturer reloads in its own style; BRISKCO throws the gun) |
| F | Action skill — deploy the Sentry Rig |
| G | Grenade (delivery + element from equipped mod; it blinks and beeps) |
| E | Interact — loot, chests, vendors, wire spools, Quibb, fast travel |
| T | Remote Re-Constructor uplink — fast travel from anywhere, outside combat |
| 1–4 | Weapon slots |
| TAB / K / J | Backpack / skill trees / quest log |
| ESC | Pause (volume, controls, abandon run) |

## The pitch, mechanically

- **Part-based guns**: body fixes one of six manufacturers (gimmick + palette +
  silhouette + reload style); six other part slots carry stats *and* geometry.
  Rarity gates part grades; legendaries stamp signature effects and red text.
- **Five elements** vs shield/armor/flesh — and it matters by geography:
  Rustborn are meat, Helix machines are armor and shields.
- **An inhabited world**: districts patrol and repopulate, vendors patter,
  rats scatter, vultures circle, tumbleweeds roll, music escalates when the
  shooting starts, and the compass points at your next bad decision.
- **A quest chain with a gate, a crown, and a very large filing cabinet.**
- **Progression that sticks**: XP/skill trees + account-wide Grit Rank, with
  autosave and a Continue button.

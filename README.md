# CLAUDELANDS 2

*A rust-bitten, cel-shaded looter-shooter — now an open wasteland.* You are
**Harlan Vex, the Gunsmith**, contracted by Foreman Quibb to de-throne Grand
Duke Gutterball, trash-king of the Claudelands — and to deal with whatever
Helix Combine buried in the Slagflat crater. Two worlds — the sun-blasted Claudelands and the frozen Frosthollow — two
playable Vault-Rats, eight quests, three bosses, bazillions of guns.

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
| WASD / Space / Shift | Move / jump / sprint |
| Mouse / LMB / RMB | Aim / fire / aim-down-sights |
| R | Reload (each manufacturer reloads in its own style; BRISKCO throws the gun) |
| F | Action skill — deploy the Sentry Rig |
| G | Grenade (delivery + element from equipped mod; it blinks and beeps) |
| E | Interact — loot, chests, vendors, wire spools, Quibb, fast travel |
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

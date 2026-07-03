// Boot + game loop — pass 3. Multi-map world (map manager + cross-map fast
// travel), class select + intro cutscene, quests with two givers, dynamic
// music, difficulty, and the save system, all wired into one loop.

import * as THREE from 'three';
import { PostPipeline } from './render/post';
import { World } from './game/world';
import { WORLD, MAPS, setActiveMap, activeMap, districtAt, allStations } from './data/world';
import { Player } from './game/player';
import { state, bus, hasSave, writeSave, readSave, clearSave, setActiveSaveSlot, type SaveSlotId } from './game/state';
import { statsys } from './game/stats';
import { juice } from './game/juice';
import { fx } from './game/particles';
import { debris } from './game/debris';
import { loot } from './game/loot';
import { projectiles } from './game/projectiles';
import { enemySpawner, setEnemyHooks, type Enemy } from './game/enemies';
import { ENEMIES } from './data/enemies';
import { spawnBoss, type BossId } from './game/boss';
import { actionSkill } from './game/actionskill';
import { setNumberSpawner, setTargetProvider, setPlayerDamageRouter, tickCombatClock, applyDamage, type Damageable } from './game/combat';
import { questSystem, type QuestStatus } from './game/quests';
import { setDifficulty, difficulty, type DifficultyId } from './game/settings';
import { setPlayerClass, getPlayerClass } from './data/classes';
import { audio } from './audio/synth';
import { music } from './audio/music';
import { starterWeapon, generateWeapon } from './gen/weapongen';
import { dedicatedFor } from './data/legendaries';
import { generateClassMod } from './gen/geargen';
import { generateShield, generateGrenadeMod, generateRelic } from './gen/geargen';
import { DamageNumberSystem } from './ui/damagenumbers';
import { Hud } from './ui/hud';
import { Compass, type CompassMarker } from './ui/compass';
import { Minimap } from './ui/minimap';
import { FullMapPanel } from './ui/fullmap';
import { InventoryPanel } from './ui/inventory';
import { SkillTreePanel } from './ui/skilltree';
import { VendorPanel } from './ui/vendor';
import { QuestTracker, QuestLogPanel, DialoguePanel } from './ui/quests';
import { PausePanel } from './ui/pause';
import { MainMenu, type StartMode } from './ui/mainmenu';
import { IntroOverlay, INTRO_PATH } from './ui/intro';
import { endless } from './game/endless';
import { vehicles } from './game/vehicle';
import { race, formatRaceTime } from './game/race';
import { RACE_DIFFICULTIES, RITA_GREETINGS, CHECKPOINTS, TRACKS, trackById } from './data/race';
import { respawnCine } from './ui/respawn';
import { holocall } from './ui/holocall';
import { announcer } from './game/announcer';
import { playerVoice } from './game/playervoice';
import { voice, voiceOf } from './audio/voice';
import { shipTravel, PLANET_LOOKS } from './ui/shiptravel';
import { prefs, onPrefsChanged } from './game/prefs';
import { CinematicSystem, bossCine, biomeCine, charCine, BOSS_EPITHETS, NPC_INTROS, type CineDef } from './ui/cinematics';
import { feedPickup, feedText, bark, playWireLog, showInteract, setDownedOverlay, banner } from './ui/misc';
import { itemCardHTML } from './ui/itemcard';
import { pick } from './util/rng';
import { SECOND_WIND_LINES, LEVELUP_LINES, VICTORY_LINES } from './data/flavor';
import type { ItemInstance } from './game/types';
import { GIVERS } from './data/quests';
import type { QuestGiver } from './data/quests';

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 700);
camera.layers.enable(1);
scene.add(camera);

const post = new PostPipeline(renderer, scene, camera, window.innerWidth, window.innerHeight);

// ---------------------------------------------------------------- prefs
function applyPrefs(): void {
  const p = prefs();
  post.ink.uniforms.uInk.value = p.inkOutlines ? 1.0 : 0.0;
  post.ink.uniforms.uHatch.value = p.crossHatch ? 0.5 : 0.0;
  post.ink.uniforms.uGrain.value = p.filmGrain ? 0.035 : 0.0;
  post.ink.uniforms.uVignette.value = p.vignette ? 0.34 : 0.0;
  post.ink.uniforms.uSaturation.value = p.saturation;
  post.bloom.enabled = p.bloom;
  post.fxaa.enabled = p.fxaa;
  camera.fov = p.fov;
  camera.updateProjectionMatrix();
  juice.shakeScale = p.screenShake ? 1 : 0;
  dmgNumbers.enabled = p.damageNumbers;
}
onPrefsChanged(applyPrefs);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- systems
fx.attach(scene);
debris.attach(scene);
projectiles.attach(scene);
loot.attach(scene);
actionSkill.attach(scene);

let world = new World(scene);
loot.groundHeight = (x, z) => world.groundHeight(x, z);
projectiles.groundHeight = (x, z) => world.groundHeight(x, z);
projectiles.collideSphere = (pos, r) => world.collideSphere(pos, r);
actionSkill.groundHeight = (x, z) => world.groundHeight(x, z);

const player = new Player(camera);
player.position.set(WORLD.spawn.x, world.groundHeight(WORLD.spawn.x, WORLD.spawn.z), WORLD.spawn.z);
player.respawnPoint.copy(player.position);
player.world = {
  groundHeight: (x, z) => world.groundHeight(x, z),
  resolveCollision: (p, r) => world.resolveCollision(p, r),
  raycastStatics: (ray) => world.raycastStatics(ray),
  barrels: () => world.barrels,
  arenaHalf: WORLD.size / 2,
};
player.bindInput(canvas);
setPlayerDamageRouter((amount, element, from) => player.damage(amount, element, from));
actionSkill.playerPos = () => player.position;
actionSkill.healPlayer = (amt) => player.heal(amt);
actionSkill.playerMaxHealth = () => player.maxFlesh;

projectiles.player = player;
projectiles.targets = () => [...enemySpawner.enemies, ...world.barrels, player] as unknown as Damageable[];
projectiles.healPlayer = (amt) => {
  player.heal(amt);
  dmgNumbers.spawn(player.position.clone().add(new THREE.Vector3(0, 1.8, 0)), amt, 'kinetic', false, 'heal');
};
actionSkill.enemies = () => enemySpawner.enemies;

const dmgNumbers = new DamageNumberSystem(camera);
setNumberSpawner((pos, amount, element, crit, kind) => dmgNumbers.spawn(pos as THREE.Vector3, amount, element, crit, kind));
setTargetProvider(() => [...enemySpawner.enemies, ...world.barrels, player] as unknown as Damageable[]);

setEnemyHooks({
  playerPos: () => player.position,
  damagePlayer: (amount, element, from) => player.damage(amount, element, from),
  groundHeight: (x, z) => world.groundHeight(x, z),
  tauntTarget: () => actionSkill.tauntTarget(),
  bark,
  hasLOS: (from, to) => {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist < 0.6) return true;
    dir.normalize();
    const ray = new THREE.Raycaster(from, dir, 0.1, dist - 0.5);
    return world.raycastStatics(ray) === null;
  },
  coverSpots: (near, threat, maxDist) => world.coverSpots(near, threat, maxDist),
  spawnBlocked: (x, z) => world.collideSphere(new THREE.Vector3(x, world.groundHeight(x, z) + 0.5, z), 0.7) !== null,
  onKilled: (enemy: Enemy, overkill: number) => {
    enemySpawner.gibBurst(enemy);
    const tier = enemy.badass ? Math.max(2, enemy.def.dropTier) : enemy.def.dropTier;
    loot.dropForTier(tier, enemy.level, enemy.position.clone());
    if (questSystem.wantsCollectDrop(enemy)) {
      loot.spawnQuestItem(enemy.position.clone().add(new THREE.Vector3(0.5, 0.3, 0.5)), 'Helix Drive Core');
    }
    const xp = enemy.def.xp * Math.pow(1.13, enemy.level - 1) * (enemy.badass ? 3 : 1) * difficulty().xpMult;
    state.addXp(xp);
    state.recordGrit('kill');
    questSystem.recordKill(enemy);
    actionSkill.onKillWhileActive();
    bus.emit('kill', { xp, worldPos: enemy.position, crit: false, overkill });
    if (player.downed) player.secondWind();
    if (enemy.def.dropTier >= 3) {
      feedText(`<b style="color:#ffa21f">${enemy.displayName} has fallen!</b>`, '#ffa21f');
      dropBossLoot(enemy);
      audio.victory();
    }
  },
});
enemySpawner.attach(scene);

// ---------------------------------------------------------------- boss loot
// Dedicated drops, BL-style: every boss owns a signature legendary. First
// kill guarantees it (the "oh THAT'S what it does" moment); repeat kills
// roll elevated odds; misses still pay out an epic so the ceremony never
// drops a wet firework. World drops can still roll legendaries — rarely.
const FIRSTKILL_KEY = 'claudelands2.firstkills';

function dropBossLoot(enemy: Enemy): void {
  const pos = enemy.position.clone().add(new THREE.Vector3(1, 1, 0));
  const pool = dedicatedFor(enemy.def.id);
  let firstKills: string[] = [];
  try { firstKills = JSON.parse(localStorage.getItem(FIRSTKILL_KEY) ?? '[]') as string[]; } catch { /* fresh */ }
  const firstKill = pool.length > 0 && !firstKills.includes(enemy.def.id);
  if (pool.length > 0 && (firstKill || Math.random() < 0.38)) {
    const sig = pool[Math.floor(Math.random() * pool.length)];
    loot.spawnItem(generateWeapon({ level: state.level, legendaryId: sig.id }), pos, true);
    feedText(`<b style="color:#ffa21f">SIGNATURE DROP — ${sig.name}</b>${firstKill ? ' (first-kill guarantee)' : ''}`, '#ffa21f');
    if (firstKill) {
      try { localStorage.setItem(FIRSTKILL_KEY, JSON.stringify([...firstKills, enemy.def.id])); } catch { /* private mode */ }
    }
  } else {
    // consolation ceremony: a strong epic, plus the regular tier-3 table
    loot.spawnItem(generateWeapon({ level: state.level, rarityId: 'epic' }), pos, true);
    if (pool.length > 0) feedText(`${enemy.displayName} kept the good one. It re-rolls every kill.`, '#c8b8a8');
  }
}

// ---------------------------------------------------------------- game mode
let gameMode: 'campaign' | 'endless' | 'race' = 'campaign';

// ---------------------------------------------------------------- map manager
const discoveredStations = new Set<string>(['Gutterlight Plaza']);
let mapFadeT = 0;

function discoverStation(name: string): void {
  if (discoveredStations.has(name)) return;
  discoveredStations.add(name);
  feedText(`RE-CONSTRUCTOR DISCOVERED — <b>${name}</b>`, '#54d4ff');
  audio.questAccept();
  autosave();
}

/** Arrivals should look INTO the place, not back where they came from:
 *  face the nearest landmark (people first, then services, then signage). */
function faceArrival(): void {
  const p = player.position;
  const prio: Record<string, number> = { npc: 0, racer: 0, vendor_gun: 1, vendor_med: 1, ship: 1, fast_travel: 2, sign: 3, gate: 3 };
  let bx = 0, bz = 0, bestScore = Infinity;
  for (const poi of WORLD.pois) {
    const pr = prio[poi.kind];
    if (pr === undefined) continue;
    const d = Math.hypot(poi.x - p.x, poi.z - p.z);
    if (d < 2.5 || d > 110) continue;
    const score = pr * 200 + d;
    if (score < bestScore) { bestScore = score; bx = poi.x; bz = poi.z; }
  }
  // nothing notable in range: face the map centre
  player.yaw = Math.atan2(p.x - bx, p.z - bz);
  player.pitch = 0;
}

function switchMap(mapId: string, toX?: number, toZ?: number): void {
  if (activeMap().id === mapId) return;
  race.cancel(false);
  world.dispose(scene);
  enemySpawner.reset();
  loot.reset();
  projectiles.reset();
  setActiveMap(mapId);
  world = new World(scene);
  vehicles.onMapChanged(scene);
  player.viewmodel.visible = true;
  enemySpawner.refreshDistricts();
  questSystem.onMapChanged();
  pruneCollectedCargo();
  player.world.arenaHalf = WORLD.size / 2;
  const x = toX ?? WORLD.spawn.x, z = toZ ?? WORLD.spawn.z;
  player.position.set(x, world.groundHeight(x, z), z);
  player.respawnPoint.copy(player.position);
  faceArrival();
  world.followSun(player.position);
  mapFadeT = 1; // fade-in from the reconstruction flash
  fx.burst(player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x54d4ff, 40, 6, 0.14, 1, 4);
  playCine('map_' + WORLD.id, () => biomeCine(player.position.clone(), WORLD.name.toUpperCase(), WORLD.tagline));
  autosave();
}

/** A revisit rebuilds every crate; re-haul the ones the ledger says are gone. */
function pruneCollectedCargo(): void {
  for (const q of questSystem.quests) {
    if (!q.def.returnToGiver || q.def.objective.kind !== 'collect') continue;
    if ((q.def.objective.mapId ?? 'claudelands') !== activeMap().id) continue;
    const taken = q.status === 'complete' ? q.def.objective.count : q.status === 'active' ? q.progress : 0;
    if (taken <= 0) continue;
    const ids = WORLD.pois.filter((p) => p.kind === 'cargo').map((p) => p.id).sort();
    for (let i = 0; i < Math.min(taken, ids.length); i++) {
      world.consumeCargo(ids[i]);
      const it = world.interactables.find((x) => x.kind === 'cargo' && x.data === ids[i]);
      if (it) world.removeInteractable(it);
    }
  }
}

// ---------------------------------------------------------------- UI
const hud = new Hud();
hud.bossIntroSeen = (bossId) => seenCines.has('boss_' + bossId) && !cinema.active;
const compass = new Compass();
const minimap = new Minimap();
const fullMapPanel = new FullMapPanel();
const questTracker = new QuestTracker();
const intro = new IntroOverlay();
player.onHurtFrom = (rel) => hud.hurtFrom(rel);

// ------------------------------------------------------------- cinematics
// Triggered, gameplay-pausing, any-key-skippable scenes: first entry to a
// biome, first meeting an NPC, and boss pre-fight intros. Each plays once;
// the seen-set rides along in the save.
const cinema = new CinematicSystem();
const seenCines = new Set<string>();

/** Play a one-shot cinematic. `make` is lazy so callers don't build defs for already-seen keys. */
function playCine(key: string, make: () => CineDef, after?: () => void): boolean {
  if (seenCines.has(key) || cinematicT >= 0 || cinema.active || player.downed) return false;
  seenCines.add(key);
  player.viewmodel.visible = false;
  cinema.start(make(), () => {
    player.viewmodel.visible = true;
    player.paused = openPanel !== 'none';
    autosave();
    after?.();
  });
  if (openPanel !== 'none') setPanel('none');
  player.paused = true;
  return true;
}

/** Pre-fight boss scene: fires once when the player first closes with a living boss. */
function maybeBossCine(): void {
  const boss = enemySpawner.boss;
  if (!boss?.alive) return;
  const key = 'boss_' + boss.def.id;
  if (seenCines.has(key) || boss.position.distanceTo(player.position) > 42) return;
  const epithet = BOSS_EPITHETS[boss.def.id] ?? 'unpleasant by appointment';
  playCine(key, () => bossCine(boss.position.clone(), boss.def.scale, boss.displayName.toUpperCase(), epithet));
}

const panelRoot = document.getElementById('panel-root')!;
const inventoryPanel = new InventoryPanel({
  onEquipChange: () => {
    player.recomputeVitals();
    player.equipWeapon(state.activeWeapon, true);
  },
  onDrop: (item: ItemInstance) => {
    const dropPos = player.position.clone().add(player.forward.multiplyScalar(1.5));
    dropPos.y = world.groundHeight(dropPos.x, dropPos.z);
    loot.spawnItem(item, dropPos, true);
  },
});
const skillPanel = new SkillTreePanel();
const vendorPanel = new VendorPanel();
const questLogPanel = new QuestLogPanel();
const dialoguePanel = new DialoguePanel();
const pausePanel = new PausePanel();

type PanelKind = 'none' | 'inventory' | 'skills' | 'vendor_gun' | 'vendor_med' | 'questlog' | 'dialogue' | 'pause' | 'fasttravel' | 'map' | 'race';
let openPanel: PanelKind = 'none';
let dialogueGiver: QuestGiver = 'quibb';

/** The ECHO device's main tabs — click or Q/E to flip between them. */
const PANEL_TABS: { kind: PanelKind; label: string; key: string }[] = [
  { kind: 'inventory', label: 'BACKPACK', key: 'TAB' },
  { kind: 'skills', label: 'SKILLS', key: 'K' },
  { kind: 'map', label: 'MAP', key: 'M' },
  { kind: 'questlog', label: 'LOG', key: 'J' },
];

function attachPanelTabs(panel: HTMLElement, kind: PanelKind): void {
  if (!PANEL_TABS.some((t) => t.kind === kind)) return;
  const strip = document.createElement('div');
  strip.className = 'panel-tabs';
  strip.innerHTML =
    '<span class="ptab-cycle">Q ◂</span>' +
    PANEL_TABS.map((t) => `<button class="ptab${t.kind === kind ? ' ptab-on' : ''}" data-kind="${t.kind}">${t.label}<span class="ptab-key">${t.key}</span></button>`).join('') +
    '<span class="ptab-cycle">▸ E</span>';
  strip.querySelectorAll<HTMLButtonElement>('.ptab').forEach((b) => {
    b.addEventListener('click', () => { audio.uiClick(); setPanel(b.dataset.kind as PanelKind); });
  });
  panel.prepend(strip);
}

function cyclePanelTab(dir: number): void {
  const idx = PANEL_TABS.findIndex((t) => t.kind === openPanel);
  if (idx < 0) return;
  audio.uiClick();
  setPanel(PANEL_TABS[(idx + dir + PANEL_TABS.length) % PANEL_TABS.length].kind);
}

function setPanel(kind: PanelKind): void {
  dialoguePanel.stop();
  openPanel = kind;
  player.paused = kind !== 'none' || cinematicT >= 0 || cinema.active;
  panelRoot.classList.toggle('show', kind !== 'none');
  if (kind === 'none') {
    panelRoot.innerHTML = '';
    if (cinematicT < 0 && !cinema.active) canvas.requestPointerLock();
    return;
  }
  document.exitPointerLock();
  audio.uiOpen();
  const panel = document.createElement('div');
  panel.className = 'panel';
  panelRoot.innerHTML = '';
  panelRoot.appendChild(panel);
  switch (kind) {
    case 'inventory': inventoryPanel.render(panel); break;
    case 'skills': skillPanel.render(panel, () => { player.recomputeVitals(); }); break;
    case 'questlog': questLogPanel.render(panel); break;
    case 'pause': pausePanel.render(panel, () => setPanel('none')); break;
    case 'dialogue':
      dialoguePanel.render(panel, dialogueGiver,
        () => { questSystem.acceptFrom(dialogueGiver); autosave(); setPanel('none'); },
        () => setPanel('none'));
      break;
    case 'fasttravel': renderFastTravel(panel); break;
    case 'race': renderRacePanel(panel); break;
    case 'map': fullMapPanel.render(panel, player.position, player.yaw, fullmapExtras()); break;
    default:
      vendorPanel.render(panel, kind, {
        onBuyItem: (item) => { state.inventory.push(item); feedPickup(item); },
        onBuyAmmo: () => feedText('AMMO & GRENADES REFILLED', '#d8b028'),
        onBuyHealth: (frac) => player.heal(player.maxFlesh * frac),
        playerHealthFrac: () => player.flesh / player.maxFlesh,
      });
  }
  attachPanelTabs(panel, kind);
}

function renderFastTravel(panel: HTMLElement): void {
  const byMap = new Map<string, { mapName: string; rows: string[] }>();
  for (const s of allStations()) {
    const known = discoveredStations.has(s.poi.data ?? '');
    const here = activeMap().id === s.mapId;
    const row = `<button class="ft-row" data-station="${s.poi.data}" data-map="${s.mapId}" ${known ? '' : 'disabled'}>
      ${known ? `◈ ${s.poi.data}${here ? '' : ' <span style="opacity:0.7">(off-world)</span>'}` : '◇ UNDISCOVERED STATION'}
    </button>`;
    if (!byMap.has(s.mapId)) byMap.set(s.mapId, { mapName: s.mapName, rows: [] });
    byMap.get(s.mapId)!.rows.push(row);
  }
  const groups = [...byMap.values()].map((g) => `<div class="ft-map-name">${g.mapName}</div>${g.rows.join('')}`).join('');
  panel.innerHTML = `
    <h1>RE-CONSTRUCTOR NETWORK</h1>
    <div class="p-sub">Matter is a suggestion. Cross-world transit voids most warranties and one or two laws of physics.</div>
    <div class="p-body"><div style="flex:1; display:flex; flex-direction:column; gap:8px; max-width:480px;">${groups}</div></div>
    <div class="p-hint">T / E / ESC to close · every node must be visited ON FOOT once before it answers · uplink refuses mid-combat</div>`;
  panel.querySelectorAll<HTMLButtonElement>('.ft-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.station!;
      const mapId = btn.dataset.map!;
      const target = allStations().find((s) => s.poi.data === name);
      if (!target) return;
      audio.turretDeploy();
      setPanel('none');
      if (mapId !== activeMap().id) {
        switchMap(mapId, target.poi.x + 2, target.poi.z + 2);
      } else {
        player.position.set(target.poi.x + 2, world.groundHeight(target.poi.x + 2, target.poi.z + 2), target.poi.z + 2);
        faceArrival();
        fx.burst(player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x54d4ff, 30, 5, 0.12, 0.8, 4);
      }
      feedText(`RE-CONSTRUCTED AT <b>${name}</b>`, '#54d4ff');
    });
  });
}

// ---------------------------------------------------------------- racing
function renderRacePanel(panel: HTMLElement): void {
  const store = race.store();
  const rows = RACE_DIFFICULTIES.map((d) => {
    const best = store.best[`redline:${d.id}`] ?? store.best[d.id];
    return `
      <button class="ft-row" data-diff="${d.id}">
        <b>${d.name}</b> — $${d.rewardCash} · ${d.rewardXp} XP${d.firstWinItem && !(store.wins[`redline:${d.id}`] ?? store.wins[d.id]) ? ` · first win: <b>${d.firstWinItem.toUpperCase()} GEAR</b>` : ''}
        <div style="opacity:0.72; font-size:12px; font-weight:400;">${d.blurb}${best ? ` · best: ${formatRaceTime(best)}` : ''}${(store.wins[`redline:${d.id}`] ?? store.wins[d.id]) ? ' · ✔ beaten' : ''}</div>
      </button>`;
  }).join('');
  panel.innerHTML = `
    <h1>REDLINE RITA</h1>
    <div class="p-sub">${pick(Math.random as never, RITA_GREETINGS)}</div>
    <div class="p-body"><div style="flex:1; max-width:560px; display:flex; flex-direction:column; gap:8px;">
      <div class="dialogue-box">THREE LAPS of REDLINE’S RUN. Seven gates, two forked sections — outer line’s safe, inner cut’s got AIR. Beat me to the flag and keep the purse. Rerun it whenever your pride recovers.<br><br><b>W/S</b> throttle · <b>A/D</b> steer · <b>SPACE</b> jump · <b>E</b> drift · <b>SHIFT</b> boost (sliding refills it)</div>
      ${rows}
    </div></div>
    <div class="p-hint">E / ESC to close</div>`;
  panel.querySelectorAll<HTMLButtonElement>('.ft-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = RACE_DIFFICULTIES.find((x) => x.id === btn.dataset.diff);
      if (!d) return;
      audio.uiClick();
      setPanel('none');
      race.start(d, trackById('redline'));
    });
  });
}

// ---------------------------------------------------------------- the pit
// The Crucible's front door in Brasshaven: campaign character, endless waves,
// death spits you back onto the street via the house Re-Constructor.
let pitActive = false;
let pitReturn = { x: 34, z: -28 };

function enterPit(): void {
  if (pitActive) return;
  const door = MAPS.brasshaven.pois.find((p) => p.kind === 'pit');
  pitReturn = { x: (door?.x ?? 30) + 4, z: (door?.z ?? -34) + 7 };
  pitActive = true;
  switchMap('crucible');
  endless.start({
    playerPos: () => player.position,
    groundHeight: (x, z) => world.groundHeight(x, z),
    banner,
    toast: feedText,
    healPlayer: () => { player.heal(player.maxFlesh); player.shield = player.maxShield; },
  });
  announcer.enabled = true;
  announcer.welcome();
  feedText('House rules: waves pay <b>cash</b>. Dying pays the <b>door</b>. Walk out between waves any time.', '#ff5a86');
}

function leavePit(): void {
  if (!pitActive) return;
  pitActive = false;
  endless.stop();
  announcer.enabled = false;
  enemySpawner.reset();
  switchMap('brasshaven', pitReturn.x, pitReturn.z);
}

// ---------------------------------------------------------------- bleed-out
// BL2-style death: no instant teleport — the screen whites out and the
// nearest Re-Constructor prints you a new you, on camera.
function handleBleedOut(): void {
  player.downed = false;
  setDownedOverlay(false);
  state.money = Math.floor(state.money * 0.9);
  race.cancel();
  if (vehicles.driving) {
    const out = vehicles.exit();
    if (out) player.position.copy(out);
  }
  if (pitActive) {
    leavePit(); // switchMap places the player at the pit door
  } else {
    player.position.copy(player.respawnPoint);
  }
  player.flesh = player.maxFlesh;
  player.shield = player.maxShield;
  player.paused = true;
  player.viewmodel.visible = false;
  respawnCine.start({
    scene,
    eye: { pos: player.position.clone(), yaw: player.yaw, pitch: player.pitch },
    onDone: () => {
      player.paused = openPanel !== 'none';
      player.viewmodel.visible = true;
      document.dispatchEvent(new CustomEvent('player-respawned'));
      if (openPanel === 'none') canvas.requestPointerLock();
    },
  });
}
player.onBleedOut = handleBleedOut;

// ---------------------------------------------------------------- zone exits
// BL2-style edge transitions: walk under the arch, get the zone screen,
// arrive on the neighbouring map. A short cooldown stops instant bounce-back.
let zoneScreenActive = false;
let zoneCooldown = 0;

function zoneTransition(label: string, targetMap: string, tx: number, tz: number): void {
  if (zoneScreenActive) return;
  zoneScreenActive = true;
  document.exitPointerLock();
  const overlay = document.createElement('div');
  overlay.id = 'zone-screen';
  overlay.innerHTML = `
    <div class="zs-kicker">NOW ENTERING</div>
    <div class="zs-name">${label}</div>
    <div class="zs-tag">${MAPS[targetMap]?.tagline ?? ''}</div>`;
  document.getElementById('ui-root')?.appendChild(overlay);
  audio.turretDeploy();
  requestAnimationFrame(() => overlay.classList.add('zs-in'));
  setTimeout(() => {
    switchMap(targetMap, tx, tz);
    zoneCooldown = 3;
    setTimeout(() => {
      overlay.classList.remove('zs-in');
      setTimeout(() => { overlay.remove(); zoneScreenActive = false; if (!cinema.active && openPanel === 'none') canvas.requestPointerLock(); }, 450);
    }, 900);
  }, 650);
}

function checkZoneExits(dt: number): void {
  if (zoneCooldown > 0) { zoneCooldown -= dt; return; }
  if (zoneScreenActive || cinema.active || shipTravel.active || player.downed) return;
  for (const ex of WORLD.exits ?? []) {
    if (Math.hypot(player.position.x - ex.x, player.position.z - ex.z) < 5.5) {
      if (vehicles.driving) {
        // the Junkstallion stays in the gulch — Rita's one rule
        feedText('The buggy stays in the gulch. Rita’s one rule. Climb out first (E).', '#ff8c5a');
        zoneCooldown = 6;
        return;
      }
      if (ex.sealed) {
        // future map: the doorway is dressed but the way is shut
        feedText(`<b>${ex.label}</b> — ${ex.sealed}`, '#9adc4a');
        zoneCooldown = 8;
        return;
      }
      zoneTransition(ex.label, ex.targetMap, ex.targetX, ex.targetZ);
      return;
    }
  }
}

// ---------------------------------------------------------------- the scrapship
// THE PAPERWEIGHT hops between planet hubs with a full launch/space/landing
// cinematic. Available once q14 (The Signal) is complete.
const SHIP_PADS: Record<string, { x: number; z: number; to: string; planet: string }> = {
  brasshaven: { x: -26, z: 40, to: 'veldt', planet: 'claudeprime' },
  veldt: { x: -16, z: 94, to: 'brasshaven', planet: 'veldtminor' },
};

function setPadShipsVisible(v: boolean): void {
  world.group.traverse((o) => { if (o.name === 'pad_ship') o.visible = v; });
}

function startShipTravel(): void {
  const here = SHIP_PADS[activeMap().id];
  if (!here) return;
  const destPad = SHIP_PADS[here.to];
  seenCines.add('map_' + here.to); // the docking shot IS the arrival cinematic
  player.paused = true;
  player.viewmodel.visible = false;
  setPadShipsVisible(false);
  document.exitPointerLock();
  shipTravel.start({
    scene,
    fromPlanet: PLANET_LOOKS[here.planet],
    toPlanet: PLANET_LOOKS[destPad.planet],
    padPos: () => {
      const pad = SHIP_PADS[activeMap().id];
      const src2 = activeMap().id === here.to ? destPad : here;
      void pad;
      return new THREE.Vector3(src2.x, world.groundHeight(src2.x, src2.z), src2.z);
    },
    setWorldVisible: (v) => { world.group.visible = v; },
    onSwitch: () => {
      switchMap(here.to, destPad.x + 6, destPad.z + 6);
      setPadShipsVisible(false); // the cine ship is still coming down
    },
    onDone: () => {
      setPadShipsVisible(true);
      player.paused = openPanel !== 'none';
      player.viewmodel.visible = true;
      autosave();
      if (openPanel === 'none') canvas.requestPointerLock();
    },
  });
}

// ---------------------------------------------------------------- quests
questSystem.init({
  openGate: (id) => {
    world.openGate(id);
    feedText('A gate rumbles open somewhere. Probably fine.', '#54d4ff');
  },
  // stations bind by WALKING there — story beats only hint at the node
  discoverStation: (name) => {
    if (!discoveredStations.has(name)) feedText(`Re-Constructor node reported at <b>${name}</b> — visit it on foot to bind it.`, '#54d4ff');
  },
  playerPos: () => player.position,
  toast: feedText,
  banner,
  onVictory: () => {
    banner(pick(Math.random as never, VICTORY_LINES));
    audio.victory();
    feedText('<b style="color:#3ddc4e">ALL CONTRACTS COMPLETE.</b> Two worlds, restocking themselves. Happy hunting.', '#3ddc4e');
  },
  spawnElites: (enemyId, count, x, z, levelOffset, tag) => {
    const def = ENEMIES[enemyId];
    if (!def) return;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const px = x + Math.cos(a) * (3 + Math.random() * 5);
      const pz = z + Math.sin(a) * (3 + Math.random() * 5);
      const e = enemySpawner.spawnOne(def, new THREE.Vector3(px, 0, pz), true, levelOffset);
      e.questTag = tag;
    }
  },
  grantUnique: (legendaryId) => {
    const item = generateWeapon({ level: state.level, legendaryId });
    loot.spawnItem(item, player.position.clone().add(new THREE.Vector3(1.2, 0.6, 1.2)), true);
    feedText(`<b style="color:#ffa21f">UNIQUE REWARD — ${item.name}</b>`, '#ffa21f');
    audio.victory();
  },
  holocall: (giver, lines, title) => holocall.call(giver, lines, title ?? null),
});

// ---------------------------------------------------------------- vehicles + racing
vehicles.bind();
vehicles.onMapChanged(scene);
race.init({
  scene,
  world: () => ({ resolveCollision: (p, r) => world.resolveCollision(p, r), arenaHalf: WORLD.size / 2 }),
  playerPos: () => player.position,
  banner,
  toast: feedText,
  grantItem: (rarity) => {
    const item = generateWeapon({ level: state.level, rarityId: rarity });
    loot.spawnItem(item, player.position.clone().add(new THREE.Vector3(1.4, 0.8, 1.4)), true);
    feedText(`<b style="color:#ffa21f">RITA'S TROPHY SHELF — ${item.name}</b> ("I was saving that. Take it.")`, '#ffa21f');
    audio.victory();
  },
  forceDrive: () => {
    if (!vehicles.driving) {
      vehicles.enter(camera);
      player.viewmodel.visible = false;
    }
  },
});

// ---------------------------------------------------------------- events
bus.on('levelup', ({ level }) => {
  audio.levelUp();
  banner(`${pick(Math.random as never, LEVELUP_LINES)} LEVEL ${level}`);
  fx.burst(player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x3ddc4e, 40, 6, 0.14, 1, 4);
  player.recomputeVitals();
  player.heal(player.maxFlesh);
});
bus.on('gritTick', ({ label }) => {
  if (label) feedText(`◆ GRIT RANK UP — <b>${label}</b>`, '#ffd23c');
});
bus.on('downed', () => {
  setDownedOverlay(true, 0);
  // shot out of the driver's seat: the fight-for-your-life happens on foot
  if (vehicles.driving) {
    race.cancel();
    const out = vehicles.exit();
    if (out) player.position.copy(out);
    player.viewmodel.visible = true;
  }
});
bus.on('secondwind', () => {
  setDownedOverlay(false);
  banner(pick(Math.random as never, SECOND_WIND_LINES));
});
document.addEventListener('player-respawned', () => {
  setDownedOverlay(false);
  feedText('RE-CONSTRUCTED — the Re-Constructor kept 10% for “parts”', '#54d4ff');
});

// ---------------------------------------------------------------- save
function autosave(): void {
  if (!started || gameMode !== 'campaign') return; // endless runs never touch the campaign save
  writeSave({
    quests: questSystem.serialize(),
    sidequests: questSystem.serializeSides(),
    stations: [...discoveredStations],
    // a save taken inside the pit resumes on the street outside it
    mapId: pitActive ? 'brasshaven' : activeMap().id,
    classId: getPlayerClass().id,
    difficultyId: difficulty().id,
    cines: [...seenCines],
  });
}
setInterval(autosave, 25000);
document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });
bus.on('levelup', () => autosave());

function restoreSave(): boolean {
  const data = readSave();
  if (!data) return false;
  setPlayerClass((data.classId as string) ?? 'gunsmith');
  setDifficulty((data.difficultyId as string) ?? 'normal');
  hud.setCharacter();
  for (const s of (data.stations as string[]) ?? []) discoveredStations.add(s);
  questSystem.load(
    (data.quests as { i: number; s: QuestStatus; p: number }[]) ?? [],
    (id) => world.openGate(id),
    () => { /* stations persist in the save's own list — walking binds them */ },
  );
  questSystem.loadSides((data.sidequests as { id: string; s: QuestStatus; p: number }[]) ?? []);
  const cines = data.cines as string[] | undefined;
  if (cines) cines.forEach((c) => seenCines.add(c));
  else ['map_claudelands', 'npc_quibb', 'map_' + ((data.mapId as string) ?? 'claudelands')].forEach((c) => seenCines.add(c)); // legacy saves predate cinematics
  const mapId = (data.mapId as string) ?? 'claudelands';
  if (mapId !== activeMap().id) switchMap(mapId);
  player.recomputeVitals();
  player.flesh = player.maxFlesh;
  player.shield = player.maxShield;
  player.equipWeapon(state.activeWeapon, true);
  return true;
}

// ---------------------------------------------------------------- starting kit
function giveStartingKit(): void {
  const starter = starterWeapon();
  state.equippedWeapons[0] = starter;
  state.inventory.push(generateWeapon({ level: 1, rarityId: 'uncommon' }));
  state.shield = generateShield(1, 'common');
  state.grenadeMod = generateGrenadeMod(1, 'common');
  player.recomputeVitals();
  player.shield = player.maxShield;
  player.flesh = player.maxFlesh;
  player.equipWeapon(starter, true);
}

// ---------------------------------------------------------------- cutscene
let cinematicT = -1; // >=0 while the intro runs

function updateCinematic(dt: number): void {
  cinematicT += dt;
  if (!intro.update(cinematicT)) {
    if (!intro.active) endCinematic();
    return;
  }
  // piecewise camera path
  let t = cinematicT;
  let seg = 0;
  while (seg < INTRO_PATH.length - 1 && t > INTRO_PATH[seg + 1].hold) {
    t -= INTRO_PATH[seg + 1].hold;
    seg++;
  }
  const a = INTRO_PATH[seg];
  const b = INTRO_PATH[Math.min(seg + 1, INTRO_PATH.length - 1)];
  const f = b.hold > 0 ? Math.min(1, t / b.hold) : 1;
  const ease = f * f * (3 - 2 * f);
  camera.position.set(
    a.x + (b.x - a.x) * ease,
    a.y + (b.y - a.y) * ease,
    a.z + (b.z - a.z) * ease,
  );
  camera.lookAt(
    a.lookX + (b.lookX - a.lookX) * ease,
    a.lookY + (b.lookY - a.lookY) * ease,
    a.lookZ + (b.lookZ - a.lookZ) * ease,
  );
}

function endCinematic(): void {
  cinematicT = -1;
  intro.end();
  document.getElementById('ui-root')?.classList.remove('cine-on');
  player.paused = false;
  player.viewmodel.visible = true;
  canvas.requestPointerLock();
  setTimeout(() => bark('WIRE SPOOL (AUTO-PLAY)', 'Welcome to the Claudelands, contractor. Foreman Quibb is waiting in Gutterlight — follow the gold diamond.'), 800);
}

// ---------------------------------------------------------------- input glue
document.addEventListener('keydown', (e) => {
  if (!started) return;
  if (respawnCine.active) return; // death costs a beat — no skipping the printer
  if (shipTravel.active) { shipTravel.skip(); return; } // any key skips the hop
  if (cinema.active) { cinema.skip(); return; } // any key skips a cinematic
  if (cinematicT >= 0) { intro.end(); return; } // any key skips the intro
  if (e.code === 'Tab') { e.preventDefault(); setPanel(openPanel === 'inventory' ? 'none' : 'inventory'); return; }
  if (e.code === 'KeyK') { setPanel(openPanel === 'skills' ? 'none' : 'skills'); return; }
  if (e.code === 'KeyJ') { setPanel(openPanel === 'questlog' ? 'none' : 'questlog'); return; }
  if (e.code === 'KeyM') { setPanel(openPanel === 'map' ? 'none' : 'map'); return; }
  if (e.code === 'Escape') {
    if (openPanel !== 'none') setPanel('none');
    else setPanel('pause');
    return;
  }
  if (openPanel !== 'none') {
    // Q/E flip between the ECHO device's tabs
    if (e.code === 'KeyQ') cyclePanelTab(-1);
    if (e.code === 'KeyE' && PANEL_TABS.some((t) => t.kind === openPanel)) cyclePanelTab(1);
    return;
  }

  if (e.code === 'KeyT') {
    // remote Re-Constructor uplink — anywhere, as long as nothing is shooting at you
    if (player.downed || gameMode === 'endless' || pitActive) return;
    if (vehicles.driving) { feedText('The uplink refuses moving vehicles. Park first.', '#ff5a5a'); audio.dryFire(); return; }
    if (enemySpawner.aggroCount() > 0) { feedText('RE-CONSTRUCTOR UPLINK REFUSED — finish the argument first', '#ff5a5a'); audio.dryFire(); return; }
    setPanel('fasttravel');
    return;
  }
  if (vehicles.driving) {
    // behind the wheel: F climbs out (E is the drift), everything else is pedals
    if (e.code === 'KeyF') {
      if (vehicles.raceLock) { feedText('Mid-race! Finish it or crash with dignity.', '#ff8c5a'); return; }
      const out = vehicles.exit();
      if (out) player.position.copy(out);
      player.viewmodel.visible = true;
      return;
    }
    return;
  }
  if (e.code === 'KeyR') player.startReload();
  if (e.code === 'KeyF') { actionSkill.deploy(player.position, player.forward); playerVoice.onSkillCast(); }
  if (e.code === 'KeyG') player.throwGrenade();
  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5)) - 1;
    if (n >= 0 && n < 4 && state.equippedWeapons[n]) {
      state.activeSlot = n;
      player.equipWeapon(state.activeWeapon);
      audio.uiClick();
    }
  }
  if (e.code === 'KeyE') interact();
});

function interact(): void {
  if (vehicles.nearBuggy(player.position)) {
    vehicles.enter(camera);
    player.viewmodel.visible = false;
    feedText('<b>THE JUNKSTALLION</b> — W/S drive · A/D steer · SPACE jump · E drift · SHIFT boost · F out', '#ffd23c');
    return;
  }
  const p = loot.nearestItem(player.position);
  if (p && p.item) {
    loot.take(p);
    state.inventory.push(p.item);
    state.recordGrit('loot');
    feedPickup(p.item);
    audio.pickup();
    bus.emit('pickup', { item: p.item });
    if (p.item.kind === 'weapon' && !state.activeWeapon) {
      state.equippedWeapons[state.activeSlot] = p.item;
      player.equipWeapon(p.item);
    }
    return;
  }
  for (const it of world.interactables) {
    if (it.pos.distanceTo(player.position) > (it.range ?? 3.4)) continue;
    switch (it.kind) {
      case 'chest':
        it.chest?.open(state.level, bark);
        if (it.chest?.opened) world.removeInteractable(it);
        return;
      case 'vendor_gun': setPanel('vendor_gun'); return;
      case 'vendor_med': setPanel('vendor_med'); return;
      case 'npc': {
        const giver: QuestGiver = (it.data && it.data in GIVERS ? it.data : 'quibb') as QuestGiver;
        dialogueGiver = giver;
        const npcInfo = NPC_INTROS[giver];
        // first meeting: character-intro splash, then the dialogue opens
        if (npcInfo && playCine('npc_' + giver, () => charCine(player.position, it.pos, npcInfo.name, npcInfo.sub), () => setPanel('dialogue'))) return;
        setPanel('dialogue');
        return;
      }
      case 'fast_travel': setPanel('fasttravel'); return;
      case 'ship': {
        const q14 = questSystem.quests.find((q) => q.def.id === 'q14_signal');
        if (!q14 || q14.status !== 'complete') {
          bark('THE PAPERWEIGHT', 'Engine status: aspirational. Finish the Mayor\u2019s salvage job first.');
          return;
        }
        startShipTravel();
        return;
      }
      case 'wirelog':
        if (playWireLog(it.data ?? '')) world.removeInteractable(it);
        return;
      case 'wreck': {
        const q14 = questSystem.quests.find((q) => q.def.id === 'q14_signal');
        if (q14?.status === 'active' && q14.progress < q14.def.objective.count) {
          loot.spawnQuestItem(it.pos.clone().add(new THREE.Vector3(0.8, 0.4, 0.8)), 'Scrapship Hull Plate');
          audio.reloadClack(1);
          feedText('Hull plate pried loose — grab it.', '#ffd23c');
          world.removeInteractable(it);
        } else if (q14?.status === 'complete') {
          const scrap = 120 + Math.round(Math.random() * 90) + state.level * 6;
          state.money += scrap;
          audio.cash();
          feedText(`Stripped the wreck for scrap — <b>+$${scrap}</b>`, '#d8b028');
          world.removeInteractable(it);
        } else {
          bark('THE WRECK', 'Bolted down tight. The good plates need a salvage writ — the Mayor of Brasshaven issues those, with strings.');
        }
        return;
      }
      case 'cargo': {
        const q = questSystem.active;
        const wantsIt = q && q.def.objective.kind === 'collect' && q.def.returnToGiver
          && (q.def.objective.mapId ?? 'claudelands') === activeMap().id
          && q.progress < q.def.objective.count;
        if (wantsIt) {
          world.consumeCargo(it.data ?? '');
          world.removeInteractable(it);
          audio.reloadClack(1);
          fx.burst(it.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffd23c, 14, 4, 0.1, 0.5, 5);
          questSystem.recordCollect();
        } else {
          bark('HELIX-9 CRATE', 'Sealed expedition cargo. It’s spoken for — Peg at Driftwood Rest holds the manifest.');
        }
        return;
      }
      case 'racer': {
        const info = NPC_INTROS.rita;
        if (playCine('npc_rita', () => charCine(player.position, it.pos, info.name, info.sub), () => setPanel('race'))) return;
        setPanel('race');
        return;
      }
      case 'pit': {
        if (it.data === 'exit') {
          if (!pitActive) { bark('THE CRUCIBLE', 'You came in through the main menu. That door only opens from Brasshaven.'); return; }
          if (endless.phase === 'combat' && enemySpawner.aliveCount() > 0) {
            feedText('The door bars mid-wave. Finish the argument first.', '#ff5a5a');
            audio.dryFire();
            return;
          }
          leavePit();
        } else {
          enterPit();
        }
        return;
      }
    }
  }
}

// ---------------------------------------------------------------- hover card + prompts
const hoverCard = document.getElementById('item-card-hover')!;
function updatePrompts(): void {
  if (openPanel !== 'none' || cinematicT >= 0) { hoverCard.innerHTML = ''; showInteract(null); return; }
  if (vehicles.driving) {
    hoverCard.innerHTML = '';
    showInteract(vehicles.raceLock ? null : 'CLIMB OUT', 'F');
    return;
  }
  if (vehicles.nearBuggy(player.position)) {
    hoverCard.innerHTML = '';
    showInteract('DRIVE THE JUNKSTALLION');
    return;
  }
  const p = loot.nearestItem(player.position);
  if (p?.item) {
    hoverCard.innerHTML = itemCardHTML(p.item, compareFor(p.item));
    showInteract(`TAKE ${p.item.name.toUpperCase()}`);
    return;
  }
  hoverCard.innerHTML = '';
  for (const it of world.interactables) {
    if (it.pos.distanceTo(player.position) < (it.range ?? 3.4)) {
      showInteract(it.label);
      return;
    }
  }
  showInteract(null);
}

function compareFor(item: ItemInstance): ItemInstance | null {
  switch (item.kind) {
    case 'weapon': return state.activeWeapon;
    case 'shield': return state.shield;
    case 'grenade': return state.grenadeMod;
    case 'classmod': return state.classMod;
    case 'relic': return state.relic;
  }
}

// ---------------------------------------------------------------- map/compass markers
/** First hop of the WALKING route from the current map toward a target map:
 *  the zone exit (or ship pad) that starts the path. BFS over the map graph. */
function routeHopTo(targetMapId: string): { x: number; z: number } | null {
  const start = activeMap().id;
  if (start === targetMapId) return null;
  const shipMaps = Object.values(MAPS).filter((m) => m.pois.some((p) => p.kind === 'ship')).map((m) => m.id);
  const firstHop = new Map<string, { x: number; z: number } | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === targetMapId) return firstHop.get(cur) ?? null;
    const def = MAPS[cur];
    if (!def) continue;
    const inherit = firstHop.get(cur);
    const visit = (next: string, via: { x: number; z: number }): void => {
      if (firstHop.has(next)) return;
      firstHop.set(next, cur === start ? via : inherit ?? via);
      queue.push(next);
    };
    for (const ex of def.exits ?? []) {
      if (!ex.sealed) visit(ex.targetMap, { x: ex.x, z: ex.z });
    }
    if (shipMaps.includes(cur)) {
      const pad = def.pois.find((p) => p.kind === 'ship')!;
      for (const other of shipMaps) if (other !== cur) visit(other, { x: pad.x, z: pad.z });
    }
  }
  return null;
}

/** Active-map quest point: the objective if it's here, otherwise the first
 *  hop of the walking route toward its map (zone exit / ship pad). */
function questPointOnMap(): { x: number; z: number } | null {
  if (gameMode !== 'campaign') return null;
  const qm = questSystem.markerPos();
  if (!qm) return null;
  if (qm.mapId === activeMap().id) return { x: qm.x, z: qm.z };
  return routeHopTo(qm.mapId);
}

function fullmapExtras() {
  return { quest: questPointOnMap(), discovered: discoveredStations, structures: world.colliders };
}

function compassMarkers(): CompassMarker[] {
  const markers: CompassMarker[] = [];
  const qp = questPointOnMap();
  if (qp) markers.push({ x: qp.x, z: qp.z, icon: '◆', color: '#ffd23c', id: 'quest' });
  for (const poi of WORLD.pois) {
    if (poi.kind === 'fast_travel' && discoveredStations.has(poi.data ?? '')) {
      markers.push({ x: poi.x, z: poi.z, icon: '⬡', color: '#54d4ff', id: 'ft_' + poi.id });
    }
  }
  const boss = enemySpawner.boss;
  if (boss?.alive) markers.push({ x: boss.position.x, z: boss.position.z, icon: '☠', color: '#ff5a5a', id: 'boss' });
  return markers;
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let started = false;

function stepSim(dt: number): void {
  tickCombatClock(dt);
  statsys.update(dt);
  playerVoice.update(dt);
  if (vehicles.driving && vehicles.buggy) {
    // the buggy IS the player while driving: physics owns position + camera
    vehicles.update(dt, { resolveCollision: (p, r) => world.resolveCollision(p, r), arenaHalf: WORLD.size / 2 }, race.frozen);
    player.position.copy(vehicles.buggy.pos);
    player.position.y += 0.6; // seat height, so enemies aim at the driver
  } else {
    player.update(dt);
  }
  race.update(dt);
  actionSkill.update(dt);
  enemySpawner.update(dt);
  projectiles.update(dt);
  questSystem.update();
  loot.update(dt, player.position, (p) => {
    if (p.kind === 'cash') { state.money += (p.amount ?? 0) * statsys.mult('cashBonus'); audio.cash(); }
    else if (p.kind === 'quest') { questSystem.recordCollect(); }
    else if (p.kind === 'ammo') {
      const w = state.activeWeapon;
      if (w) {
        const pool = state.ammo.get(w.type) ?? 0;
        state.ammo.set(w.type, Math.min(pool + Math.ceil(w.stats.magSize * 1.5), 999));
      }
      if (Math.random() < 0.3) state.grenades = Math.min(state.maxGrenades, state.grenades + 1);
      audio.pickup();
    } else if (p.kind === 'health') { player.heal(player.maxFlesh * (p.amount ?? 0.25)); audio.pickup(); }
    loot.take(p);
  });
  world.update(dt, player.position);
  debris.update(dt, player.position);
  fx.update(dt);
  if (gameMode === 'endless' || pitActive) endless.update(dt);
  announcer.update(dt);

  // station discovery + respawn point
  let bestD = Infinity;
  for (const poi of WORLD.pois) {
    if (poi.kind !== 'fast_travel') continue;
    const dd = Math.hypot(player.position.x - poi.x, player.position.z - poi.z);
    if (!discoveredStations.has(poi.data ?? '') && dd < 8) discoverStation(poi.data ?? '');
    if (discoveredStations.has(poi.data ?? '') && dd < bestD) {
      bestD = dd;
      player.respawnPoint.set(poi.x + 2, world.groundHeight(poi.x + 2, poi.z + 2), poi.z + 2);
    }
  }
}

function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!started) { updateAttract(dt); post.render(dt); return; }

  const timeScale = juice.update(dt);
  dt *= timeScale;

  if (cinematicT >= 0) {
    // intro: world simulates lightly, camera is scripted
    world.update(dt, player.position);
    fx.update(dt);
    updateCinematic(dt);
    post.render(dt);
    return;
  }

  if (cinema.active) {
    // in-game cinematic: gameplay holds its breath, camera is scripted
    world.update(dt, player.position);
    fx.update(dt);
    cinema.update(dt, camera);
    post.render(dt);
    return;
  }

  if (shipTravel.active) {
    // interplanetary hop: the cinematic owns the camera and the ship
    world.update(dt, player.position);
    fx.update(dt);
    shipTravel.update(dt, camera);
    post.render(dt);
    return;
  }

  if (respawnCine.active) {
    // death sequence: the Re-Constructor prints you a new you, on camera
    world.update(dt, player.position);
    fx.update(dt);
    respawnCine.update(dt, camera);
    post.render(dt);
    return;
  }

  if (openPanel !== 'none') {
    // menus freeze the world completely
    music.update(dt, 0);
    post.render(dt);
    return;
  }

  stepSim(dt);
  if (vehicles.driving) vehicles.updateCamera(camera, dt);
  maybeBossCine();
  checkZoneExits(dt);
  world.followSun(player.position);

  const bossActive = enemySpawner.boss?.alive && enemySpawner.boss.position.distanceTo(player.position) < 70;
  music.update(dt, bossActive ? 2 : enemySpawner.aggroCount() > 0 || race.active ? 1 : 0);

  const d = districtAt(player.position.x, player.position.z);
  if (gameMode === 'endless' || pitActive) hud.setDistrict('THE CRUCIBLE', endless.hudLine);
  else hud.setDistrict(d?.name ?? WORLD.name, d?.subtitle ?? 'The open waste.');

  if (player.downed) setDownedOverlay(true, player.downedT / player.downedMax);
  hud.update(player, dt);
  if (gameMode === 'campaign') questTracker.update();
  compass.update(player.position, player.yaw, compassMarkers());
  minimap.update(player.position, player.yaw, {
    quest: questPointOnMap(),
    stations: WORLD.pois.filter((p) => p.kind === 'fast_travel' && discoveredStations.has(p.data ?? '')).map((p) => ({ x: p.x, z: p.z })),
  });
  updatePrompts();

  // map-switch fade + downed desat share the post knob
  if (mapFadeT > 0) mapFadeT = Math.max(0, mapFadeT - dt * 1.2);
  post.ink.uniforms.uDesat.value = player.downed ? 0.65 : mapFadeT * 0.8;
  post.render(dt);
}

// ---------------------------------------------------------------- attract mode
// While the menu is up, the camera tours the live world: slow orbits over
// the hub, the gully fort, the boneyard, the crash site, and the mountain.
// The (invisible) player is parked high above each shot so districts
// populate and enemies wander without ever aggroing.
const ATTRACT_SHOTS = [
  { x: 0, z: 88, r: 30, h: 12 },     // Gutterlight
  { x: 0, z: 5, r: 34, h: 14 },      // Gully Seven fort
  { x: -85, z: -25, r: 40, h: 16 },  // the Boneyard leviathan
  { x: 82, z: -22, r: 38, h: 14 },   // Slagflats crash site
  { x: 0, z: -98, r: 42, h: 20 },    // Trash Mountain
];
let attractT = 0;
const SHOT_LEN = 11;

function updateAttract(dt: number): void {
  attractT += dt;
  const idx = Math.floor(attractT / SHOT_LEN) % ATTRACT_SHOTS.length;
  const t = attractT % SHOT_LEN;
  const s = ATTRACT_SHOTS[idx];
  // park the player sky-high over the shot so spawners run but nothing aggros
  player.position.set(s.x, 220, s.z);
  const a = t * 0.09 + idx * 1.7;
  const gy = world.groundHeight(s.x, s.z);
  camera.position.set(s.x + Math.sin(a) * s.r, gy + s.h + Math.sin(t * 0.35) * 1.5, s.z + Math.cos(a) * s.r);
  camera.lookAt(s.x, gy + 3, s.z);
  world.update(dt, camera.position);
  world.followSun(camera.position);
  enemySpawner.update(dt);
  fx.update(dt);
  debris.update(dt, camera.position);
  statsys.update(dt);
}

// ---------------------------------------------------------------- boot
const mainMenu = new MainMenu();

/** Level-10 gear spread for veteran/endless starts: common → epic. */
function giveVeteranKit(): void {
  const starter = generateWeapon({ level: 10, rarityId: 'rare' });
  state.equippedWeapons[0] = starter;
  const rarities = ['uncommon', 'rare', 'rare', 'epic'];
  for (const r of rarities) state.inventory.push(generateWeapon({ level: 10, rarityId: r }));
  state.shield = generateShield(10, Math.random() < 0.4 ? 'rare' : 'uncommon');
  state.grenadeMod = generateGrenadeMod(10, 'rare');
  state.classMod = generateClassMod(10, Math.random() < 0.3 ? 'epic' : 'rare');
  state.level = 10;
  state.skillPoints = 9;
  state.money = 2500;
  player.recomputeVitals();
  player.shield = player.maxShield;
  player.flesh = player.maxFlesh;
  player.equipWeapon(starter, true);
}

/** Skip-tutorial: Brasshaven open, the Mayor waiting, starter chain still playable. */
function veteranQuestState(): void {
  const q12 = questSystem.quests.find((q) => q.def.id === 'q12_city');
  const q13 = questSystem.quests.find((q) => q.def.id === 'q13_notoriety');
  if (q12) q12.status = 'complete';
  if (q13) q13.status = 'available';
  for (const s of questSystem.sides) if (s.status === 'locked') s.status = 'available';
  for (const name of ['Gutterlight Plaza', 'Chatterjaw Landing', 'Throat Gate', 'Brasshaven Gate']) discoveredStations.add(name);
}

function startRun(mode: StartMode, classId: string, difficultyId: DifficultyId, slot: SaveSlotId = 's1'): void {
  if (mode !== 'endless') setActiveSaveSlot(slot);
  setPlayerClass(classId);
  setDifficulty(difficultyId);
  hud.setCharacter();
  if (mode === 'new') {
    clearSave();
    gameMode = 'campaign';
    giveStartingKit();
    started = true;
    cinematicT = 0;
    player.paused = true;
    player.viewmodel.visible = false;
    seenCines.add('map_claudelands'); // the full intro already covers the first biome
    document.getElementById('ui-root')?.classList.add('cine-on'); // HUD hides for the cutscene
    intro.start();
    autosave();
    return;
  }
  if (mode === 'veteran') {
    document.getElementById('ui-root')?.classList.remove('cine-on');
    clearSave();
    gameMode = 'campaign';
    giveVeteranKit();
    veteranQuestState();
    seenCines.add('map_claudelands');
    started = true;
    switchMap('brasshaven', 0, 54);
    feedText('VETERAN CONTRACT — the city knows your name. The Mayor is waiting.', '#ffd23c');
    autosave();
    canvas.requestPointerLock();
    return;
  }
  // endless: never touches the campaign save
  document.getElementById('ui-root')?.classList.remove('cine-on');
  gameMode = 'endless';
  giveVeteranKit();
  seenCines.add('map_claudelands');
  started = true;
  switchMap('crucible');
  announcer.enabled = true;
  announcer.welcome();
  endless.start({
    playerPos: () => player.position,
    groundHeight: (x, z) => world.groundHeight(x, z),
    banner,
    toast: feedText,
    healPlayer: () => { player.heal(player.maxFlesh); player.shield = player.maxShield; },
  });
  document.getElementById('quest-tracker')!.innerHTML = '';
  canvas.requestPointerLock();
}

/** RACE mode: straight from the menu onto a circuit — practice (solo clock)
 *  or a full grid race against any AI tier. Never touches campaign saves. */
function startRaceMode(trackId: string, tier: string): void {
  const track = trackById(trackId);
  document.getElementById('ui-root')?.classList.remove('cine-on');
  gameMode = 'race';
  setPlayerClass('gunsmith');
  hud.setCharacter();
  giveVeteranKit();
  seenCines.add('map_claudelands');
  seenCines.add('map_' + track.mapId);
  started = true;
  switchMap(track.mapId);
  document.getElementById('quest-tracker')!.innerHTML = '';
  // grid up once the map exists: climb in, roll the countdown
  const buggy = vehicles.buggy;
  if (buggy) {
    player.position.copy(buggy.pos);
    vehicles.enter(camera);
    player.viewmodel.visible = false;
  }
  const diff = RACE_DIFFICULTIES.find((d) => d.id === tier) ?? RACE_DIFFICULTIES[0];
  race.start(diff, track, tier === 'practice');
  feedText(tier === 'practice'
    ? `<b>${track.name}</b> — ${track.laps} laps against the clock. F climbs out when you're done.`
    : `<b>${track.name}</b> — ${track.laps} laps vs ${diff.name}. Good luck.`, '#ffd23c');
  canvas.requestPointerLock();
}

// HUD hides behind the menu; the attract world pre-warms so enemies are
// already wandering in the first shot.
document.getElementById('ui-root')?.classList.add('cine-on');
for (let i = 0; i < 240; i++) enemySpawner.update(0.05);

mainMenu.show({
  hasSave: () => hasSave(),
  bestWave: () => endless.bestWave(),
  onRace: (trackId, tier) => { audio.unlock(); startRaceMode(trackId, tier); },
  onContinue: (slot) => {
    document.getElementById('ui-root')?.classList.remove('cine-on');
    audio.unlock();
    setActiveSaveSlot(slot);
    gameMode = 'campaign';
    if (restoreSave()) {
      started = true;
      feedText('CONTRACT RESUMED. The paperwork missed you.', '#ffd23c');
      canvas.requestPointerLock();
    }
  },
  onStart: (mode, classId, difficultyId, slot) => {
    audio.unlock();
    startRun(mode, classId, difficultyId, slot);
  },
});
applyPrefs();
canvas.addEventListener('click', () => {
  if (started && cinematicT < 0 && openPanel === 'none' && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});

// ---------------------------------------------------------------- debug seam
// Used by tools/screenshot.mjs and integration tests. fastForward steps the
// sim without rendering (headless CI runs at ~2fps).
(window as unknown as Record<string, unknown>).__game = {
  player, camera, state, enemySpawner, loot, questSystem, actionSkill, endless,
  startRunDebug: startRun,
  get world() { return world; },
  gen: { generateWeapon, generateShield, generateGrenadeMod, generateClassMod, generateRelic },
  equip: (w: import('./game/types').WeaponInstance) => {
    state.equippedWeapons[state.activeSlot] = w;
    player.equipWeapon(w, true);
  },
  setPanelDebug: setPanel,
  openDialogueDebug: (giver: QuestGiver) => { dialogueGiver = giver; setPanel('dialogue'); },
  get mapId() { return activeMap().id; },
  maps: MAPS,
  vehicles, race, respawnCine,
  get pitActive() { return pitActive; },
  enterBuggyDebug: () => {
    if (!vehicles.buggy) return false;
    player.position.copy(vehicles.buggy.pos);
    vehicles.enter(camera);
    player.viewmodel.visible = false;
    return true;
  },
  exitBuggyDebug: () => {
    const out = vehicles.exit();
    if (out) player.position.copy(out);
    player.viewmodel.visible = true;
  },
  startRaceDebug: (id: string, trackId = 'redline', practice = false) => {
    const d = RACE_DIFFICULTIES.find((x) => x.id === id) ?? RACE_DIFFICULTIES[0];
    race.start(d, trackById(trackId), practice);
  },
  raceCheckpoints: CHECKPOINTS,
  raceTracks: TRACKS,
  startRaceModeDebug: (trackId: string, tier: string) => startRaceMode(trackId, tier),
  killPlayerDebug: () => handleBleedOut(),
  enterPitDebug: () => enterPit(),
  leavePitDebug: () => leavePit(),
  interactDebug: () => interact(),
  holocall, announcer, voice, playerVoice, audio, music,
  speakDebug: (text: string, who: string) => voice.speak(text, voiceOf(who)),
  switchMapDebug: switchMap,
  skipIntro: () => { if (cinematicT >= 0) intro.end(); },
  cinema, seenCines, shipTravel,
  startShipTravelDebug: startShipTravel,
  skipCine: () => { if (cinema.active) cinema.skip(); },
  enemyDefs: ENEMIES,
  applyDamageDebug: applyDamage,
  spawnBossDebug: (id: string, x: number, z: number) => spawnBoss(id as BossId, new THREE.Vector3(x, 0, z)),
  setClassDebug: (id: string) => { setPlayerClass(id); hud.setCharacter(); },
  fastForward: (seconds: number) => {
    if (!started) return;
    const h = 1 / 60;
    for (let t = 0; t < seconds; t += h) stepSim(h);
  },
  losDebug: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
    const from = new THREE.Vector3(x1, y1, z1);
    const dir = new THREE.Vector3(x2, y2, z2).sub(from);
    const dist = dir.length();
    dir.normalize();
    const ray = new THREE.Raycaster(from, dir, 0.1, dist - 0.1);
    return world.raycastStatics(ray) === null;
  },
  routeHopDebug: (mapId: string) => routeHopTo(mapId),
  faceArrivalDebug: () => faceArrival(),
  get stations() { return discoveredStations; },
};

// intro end handler (skip or natural finish)
document.addEventListener('intro-finished', () => {
  if (cinematicT >= 0) endCinematic();
});

// kick the loop off last — everything above (attract shots, menu, seam) must exist first
frame();

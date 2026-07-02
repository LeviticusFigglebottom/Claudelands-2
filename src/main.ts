// Boot + game loop — pass 2. Wires renderer, post stack, the multi-district
// overworld, player, enemies/bosses, quests, loot, debris, dynamic music,
// compass, panels (inventory/skills/vendor/quest log/dialogue/pause/fast
// travel), and the save system into one loop.

import * as THREE from 'three';
import { PostPipeline } from './render/post';
import { World } from './game/world';
import { WORLD, PLAYER_SPAWN, districtAt } from './data/world';
import { Player } from './game/player';
import { state, bus, hasSave, writeSave, readSave, clearSave } from './game/state';
import { statsys } from './game/stats';
import { juice } from './game/juice';
import { fx } from './game/particles';
import { debris } from './game/debris';
import { loot } from './game/loot';
import { projectiles } from './game/projectiles';
import { enemySpawner, setEnemyHooks, type Enemy } from './game/enemies';
import { actionSkill } from './game/actionskill';
import { setNumberSpawner, setTargetProvider, setPlayerDamageRouter, tickCombatClock, type Damageable } from './game/combat';
import { questSystem } from './game/quests';
import { audio } from './audio/synth';
import { music } from './audio/music';
import { starterWeapon, generateWeapon } from './gen/weapongen';
import { generateShield, generateGrenadeMod } from './gen/geargen';
import { DamageNumberSystem } from './ui/damagenumbers';
import { Hud } from './ui/hud';
import { Compass, type CompassMarker } from './ui/compass';
import { InventoryPanel } from './ui/inventory';
import { SkillTreePanel } from './ui/skilltree';
import { VendorPanel } from './ui/vendor';
import { QuestTracker, QuestLogPanel, DialoguePanel } from './ui/quests';
import { PausePanel } from './ui/pause';
import { feedPickup, feedText, bark, playWireLog, showInteract, setDownedOverlay, banner, buildTitleScreen } from './ui/misc';
import { itemCardHTML } from './ui/itemcard';
import { pick } from './util/rng';
import { SECOND_WIND_LINES, LEVELUP_LINES, VICTORY_LINES } from './data/flavor';
import type { ItemInstance } from './game/types';
import type { QuestStatus } from './game/quests';

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

const world = new World(scene);
loot.groundHeight = (x, z) => world.groundHeight(x, z);
projectiles.groundHeight = (x, z) => world.groundHeight(x, z);
projectiles.collideSphere = (pos, r) => world.collideSphere(pos, r);
actionSkill.groundHeight = (x, z) => world.groundHeight(x, z);

const player = new Player(camera);
player.position.set(PLAYER_SPAWN.x, world.groundHeight(PLAYER_SPAWN.x, PLAYER_SPAWN.z), PLAYER_SPAWN.z);
player.respawnPoint.copy(player.position);
player.world = {
  groundHeight: (x, z) => world.groundHeight(x, z),
  resolveCollision: (p, r) => world.resolveCollision(p, r),
  raycastStatics: (ray) => world.raycastStatics(ray),
  barrels: () => world.barrels,
  arenaHalf: world.arenaHalf,
};
player.bindInput(canvas);
setPlayerDamageRouter((amount, element, from) => player.damage(amount, element, from));

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
  onKilled: (enemy: Enemy, overkill: number) => {
    enemySpawner.gibBurst(enemy);
    const tier = enemy.badass ? Math.max(2, enemy.def.dropTier) : enemy.def.dropTier;
    loot.dropForTier(tier, enemy.level, enemy.position.clone());
    if (questSystem.wantsCollectDrop(enemy)) {
      loot.spawnQuestItem(enemy.position.clone().add(new THREE.Vector3(0.5, 0.3, 0.5)), 'Helix Drive Core');
    }
    const xp = enemy.def.xp * Math.pow(1.13, enemy.level - 1) * (enemy.badass ? 3 : 1);
    state.addXp(xp);
    state.recordGrit('kill');
    questSystem.recordKill(enemy);
    bus.emit('kill', { xp, worldPos: enemy.position, crit: false, overkill });
    if (player.downed) player.secondWind();
    if (enemy.def.dropTier >= 3) {
      // boss death ceremony: legendary shower
      feedText(`<b style="color:#ffa21f">${enemy.displayName} has fallen!</b>`, '#ffa21f');
      loot.spawnItem(generateWeapon({ level: state.level, rarityId: 'legendary' }), enemy.position.clone().add(new THREE.Vector3(1, 1, 0)), true);
      audio.victory();
    }
  },
});
enemySpawner.attach(scene);

// ---------------------------------------------------------------- UI
const hud = new Hud();
const compass = new Compass();
const questTracker = new QuestTracker();
player.onHurtFrom = (rel) => hud.hurtFrom(rel);

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

type PanelKind = 'none' | 'inventory' | 'skills' | 'vendor_gun' | 'vendor_med' | 'questlog' | 'dialogue' | 'pause' | 'fasttravel';
let openPanel: PanelKind = 'none';

const discoveredStations = new Set<string>(['Gutterlight Plaza']);

function setPanel(kind: PanelKind): void {
  dialoguePanel.stop();
  openPanel = kind;
  player.paused = kind !== 'none';
  panelRoot.classList.toggle('show', kind !== 'none');
  if (kind === 'none') {
    panelRoot.innerHTML = '';
    canvas.requestPointerLock();
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
      dialoguePanel.render(panel,
        () => { questSystem.accept(); autosave(); setPanel('none'); },
        () => setPanel('none'));
      break;
    case 'fasttravel': renderFastTravel(panel); break;
    default:
      vendorPanel.render(panel, kind, {
        onBuyItem: (item) => { state.inventory.push(item); feedPickup(item); },
        onBuyAmmo: () => feedText('AMMO & GRENADES REFILLED', '#d8b028'),
        onBuyHealth: (frac) => player.heal(player.maxFlesh * frac),
        playerHealthFrac: () => player.flesh / player.maxFlesh,
      });
  }
}

function renderFastTravel(panel: HTMLElement): void {
  const stations = WORLD.pois.filter((p) => p.kind === 'fast_travel');
  const rows = stations.map((s) => {
    const known = discoveredStations.has(s.data ?? '');
    return `<button class="ft-row" data-station="${s.data}" ${known ? '' : 'disabled'}>
      ${known ? '◈ ' + s.data : '◇ UNDISCOVERED STATION'}
    </button>`;
  }).join('');
  panel.innerHTML = `
    <h1>RE-CONSTRUCTOR NETWORK</h1>
    <div class="p-sub">Matter is a suggestion. Warranty void during transit. Undiscovered nodes must be visited on foot first.</div>
    <div class="p-body"><div style="flex:1; display:flex; flex-direction:column; gap:10px; max-width:460px;">${rows}</div></div>
    <div class="p-hint">E / ESC to close</div>`;
  panel.querySelectorAll<HTMLButtonElement>('.ft-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.station!;
      const poi = stations.find((s) => s.data === name);
      if (!poi) return;
      audio.turretDeploy();
      player.position.set(poi.x + 2, world.groundHeight(poi.x + 2, poi.z + 2), poi.z + 2);
      fx.burst(player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x54d4ff, 30, 5, 0.12, 0.8, 4);
      feedText(`RE-CONSTRUCTED AT <b>${name}</b>`, '#54d4ff');
      setPanel('none');
    });
  });
}

// ---------------------------------------------------------------- quests
questSystem.init({
  openGate: (id) => {
    world.openGate(id);
    feedText('A gate rumbles open somewhere. Probably fine.', '#54d4ff');
  },
  playerPos: () => player.position,
  toast: feedText,
  banner,
  onVictory: () => {
    banner(pick(Math.random as never, VICTORY_LINES));
    audio.victory();
    feedText('<b style="color:#3ddc4e">MAIN CONTRACT COMPLETE.</b> The districts keep restocking — happy hunting, contractor.', '#3ddc4e');
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
bus.on('downed', () => setDownedOverlay(true, 0));
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
  if (!started) return;
  writeSave({
    quests: questSystem.serialize(),
    stations: [...discoveredStations],
  });
}
setInterval(autosave, 25000);
document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });
bus.on('levelup', () => autosave());

function restoreSave(): boolean {
  const data = readSave();
  if (!data) return false;
  questSystem.load((data.quests as { i: number; s: QuestStatus; p: number }[]) ?? [], (id) => world.openGate(id));
  for (const s of (data.stations as string[]) ?? []) discoveredStations.add(s);
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

// ---------------------------------------------------------------- input glue
document.addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.code === 'Tab') { e.preventDefault(); setPanel(openPanel === 'inventory' ? 'none' : 'inventory'); return; }
  if (e.code === 'KeyK') { setPanel(openPanel === 'skills' ? 'none' : 'skills'); return; }
  if (e.code === 'KeyJ') { setPanel(openPanel === 'questlog' ? 'none' : 'questlog'); return; }
  if (e.code === 'Escape') {
    if (openPanel !== 'none') setPanel('none');
    else setPanel('pause');
    return;
  }
  if (openPanel !== 'none') return;

  if (e.code === 'KeyR') player.startReload();
  if (e.code === 'KeyF') actionSkill.deploy(player.position, player.forward);
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
    if (it.pos.distanceTo(player.position) > 3.4) continue;
    switch (it.kind) {
      case 'chest':
        it.chest?.open(state.level, bark);
        if (it.chest?.opened) world.removeInteractable(it);
        return;
      case 'vendor_gun': setPanel('vendor_gun'); return;
      case 'vendor_med': setPanel('vendor_med'); return;
      case 'npc': setPanel('dialogue'); return;
      case 'fast_travel': setPanel('fasttravel'); return;
      case 'wirelog':
        if (playWireLog(it.data ?? '')) world.removeInteractable(it);
        return;
    }
  }
}

// ---------------------------------------------------------------- hover card + prompts
const hoverCard = document.getElementById('item-card-hover')!;
function updatePrompts(): void {
  if (openPanel !== 'none') { hoverCard.innerHTML = ''; showInteract(null); return; }
  const p = loot.nearestItem(player.position);
  if (p?.item) {
    hoverCard.innerHTML = itemCardHTML(p.item, compareFor(p.item));
    showInteract(`TAKE ${p.item.name.toUpperCase()}`);
    return;
  }
  hoverCard.innerHTML = '';
  for (const it of world.interactables) {
    if (it.pos.distanceTo(player.position) < 3.4) {
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

// ---------------------------------------------------------------- compass markers
function compassMarkers(): CompassMarker[] {
  const markers: CompassMarker[] = [];
  const qm = questSystem.markerPos();
  if (qm) markers.push({ x: qm.x, z: qm.z, icon: '◆', color: '#ffd23c', id: 'quest' });
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
  player.update(dt);
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

  // station discovery + respawn point (game logic — lives in the sim step)
  let bestD = Infinity;
  for (const poi of WORLD.pois) {
    if (poi.kind !== 'fast_travel') continue;
    const dd = Math.hypot(player.position.x - poi.x, player.position.z - poi.z);
    if (!discoveredStations.has(poi.data ?? '') && dd < 8) {
      discoveredStations.add(poi.data ?? '');
      feedText(`RE-CONSTRUCTOR DISCOVERED — <b>${poi.data}</b>`, '#54d4ff');
      audio.questAccept();
      autosave();
    }
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
  if (!started) { post.render(dt); return; }

  const timeScale = juice.update(dt);
  dt *= timeScale;

  stepSim(dt);
  world.followSun(player.position);

  // dynamic music: calm → combat → boss
  const bossActive = enemySpawner.boss?.alive && enemySpawner.boss.position.distanceTo(player.position) < 70;
  music.update(dt, bossActive ? 2 : enemySpawner.aggroCount() > 0 ? 1 : 0);

  // district plate
  const d = districtAt(player.position.x, player.position.z);
  hud.setDistrict(d?.name ?? WORLD.name, d?.subtitle ?? 'The open waste.');

  if (player.downed) setDownedOverlay(true, player.downedT / player.downedMax);
  hud.update(player, dt);
  questTracker.update();
  compass.update(player.position, player.yaw, compassMarkers());
  updatePrompts();

  post.ink.uniforms.uDesat.value = player.downed ? 0.65 : 0;
  post.render(dt);
}
frame();

// ---------------------------------------------------------------- boot
buildTitleScreen(hasSave(), (continueRun) => {
  audio.unlock();
  if (continueRun && restoreSave()) {
    feedText('CONTRACT RESUMED. The paperwork missed you.', '#ffd23c');
  } else {
    clearSave();
    giveStartingKit();
    setTimeout(() => bark('WIRE SPOOL (AUTO-PLAY)', 'Welcome to the Claudelands, contractor. Foreman Quibb is waiting in Gutterlight — follow the gold diamond.'), 1200);
  }
  started = true;
  canvas.requestPointerLock();
});
canvas.addEventListener('click', () => {
  if (started && openPanel === 'none' && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});

// ---------------------------------------------------------------- debug seam
// Used by tools/screenshot.mjs and integration tests. fastForward steps the
// sim without rendering (headless CI runs at ~2fps).
(window as unknown as Record<string, unknown>).__game = {
  player, camera, state, world, enemySpawner, loot, questSystem,
  gen: { generateWeapon, generateShield, generateGrenadeMod },
  equip: (w: import('./game/types').WeaponInstance) => {
    state.equippedWeapons[state.activeSlot] = w;
    player.equipWeapon(w, true);
  },
  setPanelDebug: setPanel,
  fastForward: (seconds: number) => {
    if (!started) return;
    const h = 1 / 60;
    for (let t = 0; t < seconds; t += h) stepSim(h);
  },
};

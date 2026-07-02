// Boot + game loop. Wires renderer, post stack, world, player, enemies,
// loot, UI panels, and the event bus into the vertical-slice loop:
// shoot -> kill -> loot beam -> pick up -> level -> spend point -> action skill.

import * as THREE from 'three';
import { PostPipeline } from './render/post';
import { World } from './game/world';
import { GULLY_SEVEN } from './data/zone';
import { Player } from './game/player';
import { state, bus, xpForLevel } from './game/state';
import { statsys } from './game/stats';
import { juice } from './game/juice';
import { fx } from './game/particles';
import { loot } from './game/loot';
import { projectiles } from './game/projectiles';
import { enemySpawner, setEnemyHooks, type Enemy } from './game/enemies';
import { actionSkill } from './game/actionskill';
import { setNumberSpawner, setTargetProvider, tickCombatClock, type Damageable } from './game/combat';
import { audio } from './audio/synth';
import { starterWeapon, generateWeapon } from './gen/weapongen';
import { generateShield, generateGrenadeMod } from './gen/geargen';
import { DamageNumberSystem } from './ui/damagenumbers';
import { Hud } from './ui/hud';
import { InventoryPanel } from './ui/inventory';
import { SkillTreePanel } from './ui/skilltree';
import { VendorPanel } from './ui/vendor';
import { feedPickup, feedText, bark, playWireLog, showInteract, setDownedOverlay, banner, buildTitleScreen } from './ui/misc';
import { itemCardHTML } from './ui/itemcard';
import { pick } from './util/rng';
import { SECOND_WIND_LINES, LEVELUP_LINES } from './data/flavor';
import { rarityById } from './data/rarity';
import type { ItemInstance } from './game/types';

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 500);
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
projectiles.attach(scene);
loot.attach(scene);
actionSkill.attach(scene);

const world = new World(GULLY_SEVEN, scene);
loot.groundHeight = (x, z) => world.groundHeight(x, z);
projectiles.groundHeight = (x, z) => world.groundHeight(x, z);

const player = new Player(camera);
player.world = {
  groundHeight: (x, z) => world.groundHeight(x, z),
  resolveCollision: (p, r) => world.resolveCollision(p, r),
  raycastStatics: (ray) => world.raycastStatics(ray),
  arenaHalf: world.arenaHalf,
};
player.bindInput(canvas);

projectiles.player = player;
projectiles.targets = () => [...enemySpawner.enemies, player] as unknown as Damageable[];
projectiles.healPlayer = (amt) => {
  player.heal(amt);
  dmgNumbers.spawn(player.position.clone().add(new THREE.Vector3(0, 1.8, 0)), amt, 'kinetic', false, 'heal');
};
actionSkill.enemies = () => enemySpawner.enemies;

const dmgNumbers = new DamageNumberSystem(camera);
setNumberSpawner((pos, amount, element, crit, kind) => dmgNumbers.spawn(pos as THREE.Vector3, amount, element, crit, kind));
setTargetProvider(() => [...enemySpawner.enemies, player] as unknown as Damageable[]);

setEnemyHooks({
  playerPos: () => player.position,
  damagePlayer: (amount, element) => player.damage(amount, element),
  groundHeight: (x, z) => world.groundHeight(x, z),
  tauntTarget: () => actionSkill.tauntTarget(),
  bark,
  onKilled: (enemy: Enemy, overkill: number) => {
    enemySpawner.gibBurst(enemy);
    const tier = enemy.badass ? Math.max(2, enemy.def.dropTier) : enemy.def.dropTier;
    loot.dropForTier(tier, enemy.level, enemy.position.clone());
    const xp = enemy.def.xp * Math.pow(1.13, enemy.level - 1) * (enemy.badass ? 3 : 1);
    state.addXp(xp);
    state.recordGrit('kill');
    bus.emit('kill', { xp, worldPos: enemy.position, crit: false, overkill });
    if (player.downed) player.secondWind();
    if (enemy.def.dropTier >= 3) {
      feedText('<b style="color:#ffa21f">GRAND DUKE GUTTERBALL has been de-throned!</b>', '#ffa21f');
      bark('GUTTERBALL', 'tell my trash... it was... load-bearing...');
    }
  },
});
enemySpawner.attach(scene, GULLY_SEVEN);

// ---------------------------------------------------------------- UI
const hud = new Hud();
const panelRoot = document.getElementById('panel-root')!;
const inventoryPanel = new InventoryPanel({
  onEquipChange: () => {
    player.recomputeVitals();
    player.equipWeapon(state.activeWeapon, true);
  },
  onDrop: (item: ItemInstance) => {
    const dropPos = player.position.clone().add(player.forward.multiplyScalar(1.5));
    dropPos.y = 0;
    loot.spawnItem(item, dropPos, true);
  },
});
const skillPanel = new SkillTreePanel();
const vendorPanel = new VendorPanel();

type PanelKind = 'none' | 'inventory' | 'skills' | 'vendor_gun' | 'vendor_med';
let openPanel: PanelKind = 'none';

function setPanel(kind: PanelKind): void {
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
  if (kind === 'inventory') inventoryPanel.render(panel);
  else if (kind === 'skills') skillPanel.render(panel, () => { player.recomputeVitals(); hud.update(player); });
  else vendorPanel.render(panel, kind, {
    onBuyItem: (item) => { state.inventory.push(item); feedPickup(item); },
    onBuyAmmo: () => feedText('AMMO & GRENADES REFILLED', '#d8b028'),
    onBuyHealth: (frac) => player.heal(player.maxFlesh * frac),
    playerHealthFrac: () => player.flesh / player.maxFlesh,
  });
}

// ---------------------------------------------------------------- events
bus.on('levelup', ({ level }) => {
  audio.levelUp();
  banner(`${pick(Math.random as never, LEVELUP_LINES)} LEVEL ${level}`);
  fx.burst(player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x3ddc4e, 40, 6, 0.14, 1, 4);
  player.recomputeVitals();
  player.heal(player.maxFlesh); // ding = full tank, classic
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
  feedText('RE-CONSTRUCTED AT STATION — the Re-Constructor kept 10% for “parts”', '#54d4ff');
});

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
  if (e.code === 'Tab') { e.preventDefault(); setPanel(openPanel === 'inventory' ? 'none' : 'inventory'); return; }
  if (e.code === 'KeyK') { setPanel(openPanel === 'skills' ? 'none' : 'skills'); return; }
  if (e.code === 'Escape' && openPanel !== 'none') { setPanel('none'); return; }
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
  // item pickups take priority
  const p = loot.nearestItem(player.position);
  if (p && p.item) {
    loot.take(p);
    state.inventory.push(p.item);
    state.recordGrit('loot');
    feedPickup(p.item);
    audio.pickup();
    bus.emit('pickup', { item: p.item });
    // auto-equip if hands are empty
    if (p.item.kind === 'weapon' && !state.activeWeapon) {
      state.equippedWeapons[state.activeSlot] = p.item;
      player.equipWeapon(p.item);
    }
    return;
  }
  // world interactables
  for (const it of world.interactables) {
    if (it.pos.distanceTo(player.position) > 3.2) continue;
    switch (it.kind) {
      case 'chest':
        it.chest?.open(state.level, bark);
        if (it.chest?.opened) world.removeInteractable(it);
        return;
      case 'vendor_gun': setPanel('vendor_gun'); return;
      case 'vendor_med': setPanel('vendor_med'); return;
      case 'fast_travel':
        feedText('RE-CONSTRUCTOR: network offline. You are already at the only node. Story of your life.', '#54d4ff');
        audio.uiOpen();
        return;
      case 'wirelog':
        if (playWireLog(it.data ?? '')) {
          world.removeInteractable(it);
          const spool = world.interactables.find(() => false); // spool mesh stays as dressing
          void spool;
        }
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
    if (it.pos.distanceTo(player.position) < 3.2) {
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

// ---------------------------------------------------------------- loop
let last = performance.now();
let started = false;

function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!started) { post.render(dt); return; }

  const timeScale = juice.update(dt);
  dt *= timeScale;

  tickCombatClock(dt);
  statsys.update(dt);
  player.update(dt);
  actionSkill.update(dt);
  enemySpawner.update(dt);
  projectiles.update(dt);
  loot.update(dt, player.position, (p) => {
    if (p.kind === 'cash') { state.money += (p.amount ?? 0) * statsys.mult('cashBonus'); audio.cash(); }
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
  world.update(dt);
  fx.update(dt);

  if (player.downed) setDownedOverlay(true, player.downedT / player.downedMax);
  hud.update(player);
  updatePrompts();

  // downed post FX
  post.ink.uniforms.uDesat.value = player.downed ? 0.65 : 0;

  post.render(dt);
}

frame();

// ---------------------------------------------------------------- boot
buildTitleScreen(() => {
  audio.unlock();
  giveStartingKit();
  started = true;
  canvas.requestPointerLock();
  setTimeout(() => bark('WIRE SPOOL (AUTO-PLAY)', 'Welcome to Gully Seven, contractor. Kill the Duke, keep whatever falls out.'), 1200);
  setTimeout(() => feedText('Find the <b>WIRE SPOOLS</b> — the previous contractor left notes.', '#54d4ff'), 5000);
});
canvas.addEventListener('click', () => {
  if (started && openPanel === 'none' && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});

// keep the reference alive for future zone streaming (documented seam)
void xpForLevel;

// debug/testing seam (used by tools/screenshot.mjs and future integration tests):
// fastForward steps the sim without rendering — headless CI runs at ~2fps,
// so wall-clock waits alone can't reach wave timers.
function stepSim(dt: number): void {
  tickCombatClock(dt);
  statsys.update(dt);
  player.update(dt);
  actionSkill.update(dt);
  enemySpawner.update(dt);
  projectiles.update(dt);
  world.update(dt);
  fx.update(dt);
}
(window as unknown as Record<string, unknown>).__game = {
  player, camera, state, world, enemySpawner, loot,
  gen: { generateWeapon, generateShield, generateGrenadeMod },
  equip: (w: import('./game/types').WeaponInstance) => {
    state.equippedWeapons[state.activeSlot] = w;
    player.equipWeapon(w, true);
  },
  fastForward: (seconds: number) => {
    if (!started) return;
    const h = 1 / 60;
    for (let t = 0; t < seconds; t += h) stepSim(h);
  },
};

// Self-review harness: serves dist/, boots the game in headless Chromium,
// drives the full loop via the __game debug seam (headless GPU is ~2fps, so
// simulation advances through fastForward), and captures the key identity
// moments: spawn vista, combat, elements, loot beams, item card, skill tree,
// inventory, art sandbox.
// Usage: npm run build && npm run screenshot [outdir]

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { extname, join, resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('/opt/node22/lib/node_modules/playwright');
}

const OUT = resolve(process.argv[2] ?? 'shots');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const DIST = resolve('dist');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  let path = (req.url ?? '/').split('?')[0];
  if (path === '/') path = '/index.html';
  try {
    const data = await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('nope');
  }
});
await new Promise((ok) => server.listen(4519, ok));

const browser = await playwright.chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });

const shot = async (name) => {
  await page.waitForTimeout(1800); // headless swiftshader ≈2fps: let frames present
  await page.screenshot({ path: join(OUT, name + '.png') });
  console.log('shot:', name);
};
const ff = (s) => page.evaluate((sec) => window.__game.fastForward(sec), s);

/** Point the player at the nearest living enemy's crit zone. */
const aim = () => page.evaluate(() => {
  const g = window.__game;
  const es = g.enemySpawner.enemies.filter((e) => e.alive);
  if (!es.length) return 0;
  const p = g.player;
  es.sort((a, b) => a.position.distanceTo(p.position) - b.position.distanceTo(p.position));
  const e = es[0];
  e.group.updateMatrixWorld(true);
  const V = Object.getPrototypeOf(p.position).constructor;
  const t = new V();
  e.critZone.getWorldPosition(t);
  const eye = p.camera.position;
  const dx = t.x - eye.x, dy = t.y - eye.y, dz = t.z - eye.z;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  return es.length;
});
const burst = async (sim = 0.12) => {
  await page.evaluate((s) => {
    const g = window.__game;
    g.player.mouseDown = true;
    g.fastForward(s);
    g.player.mouseDown = false;
    g.fastForward(0.05);
  }, sim);
};

await page.goto('http://127.0.0.1:4519/');
await page.waitForTimeout(2500);
await shot('01-title');

await page.click('#title-screen');
await page.waitForTimeout(3500); // headless present-lag: let post-click frames actually reach the canvas
await shot('02-spawn-vista');

// waves up + enemies close
await ff(10);
await aim();
await shot('03-enemies');

// real-time firing for muzzle flash + tracer + damage numbers in frame
await aim();
await page.evaluate(() => { window.__game.player.mouseDown = true; });
await page.evaluate(() => window.__game.fastForward(0.06));
await page.screenshot({ path: join(OUT, '04-firing.png') });
console.log('shot: 04-firing');
await page.evaluate(() => { window.__game.player.mouseDown = false; });

// grind kills until loot beams exist
for (let i = 0; i < 80; i++) {
  const n = await aim();
  if (n === 0) { await ff(2); continue; }
  await burst();
  const beams = await page.evaluate(() => window.__game.loot.pickups.filter((p) => p.kind === 'item').length);
  if (beams >= 2) break;
}
// look at the beams
await page.evaluate(() => {
  const g = window.__game;
  const items = g.loot.pickups.filter((p) => p.kind === 'item');
  if (!items.length) return;
  const t = items[0].pos;
  const eye = g.player.camera.position;
  // stand back 6m from the drop
  g.player.position.set(t.x + 5, 0, t.z + 4);
  const dx = t.x - eye.x, dz = t.z - eye.z;
  g.player.yaw = Math.atan2(-dx, -dz);
  g.player.pitch = -0.12;
  g.fastForward(0.1);
});
await shot('05-loot-beams');

// walk onto the item for the hover card
await page.evaluate(() => {
  const g = window.__game;
  const items = g.loot.pickups.filter((p) => p.kind === 'item');
  if (!items.length) return;
  const t = items[0].pos;
  g.player.position.set(t.x + 0.8, 0, t.z + 0.8);
  g.player.pitch = -0.5;
  g.fastForward(0.1);
});
await shot('06-item-card');

// elemental showcase: volt SMG + ember shots at a fresh target
await page.evaluate(() => {
  const g = window.__game;
  const gun = g.gen.generateWeapon({ level: 8, rarityId: 'epic', type: 'smg', makerId: 'aetheric', seed: 4242 });
  gun.element = 'volt';
  gun.stats.elemChance = 1;
  g.equip(gun);
});
await aim();
await page.evaluate(() => { window.__game.player.mouseDown = true; window.__game.fastForward(0.4); });
await page.screenshot({ path: join(OUT, '07-volt.png') });
console.log('shot: 07-volt');
await page.evaluate(() => {
  const g = window.__game;
  g.player.mouseDown = false;
  const gun = g.gen.generateWeapon({ level: 8, rarityId: 'rare', type: 'shotgun', makerId: 'vulkram', seed: 777 });
  gun.element = 'ember';
  gun.stats.elemChance = 1;
  g.equip(gun);
});
await aim();
await page.evaluate(() => { window.__game.player.mouseDown = true; window.__game.fastForward(0.2); window.__game.player.mouseDown = false; window.__game.fastForward(0.5); });
await page.screenshot({ path: join(OUT, '08-ember-burning.png') });
console.log('shot: 08-ember-burning');

// action skill
await page.evaluate(() => {
  const g = window.__game;
  g.player.pitch = -0.05;
});
await page.keyboard.press('f');
await ff(1.2);
await shot('09-sentry-rig');

// panels: give a couple skill points for the tree shot
await page.evaluate(() => { window.__game.state.skillPoints += 3; });
await page.keyboard.press('k');
await page.waitForTimeout(500);
await page.click('[data-skill="hi_racket"]').catch(() => {});
await page.click('[data-skill="hi_trigger"]').catch(() => {});
await page.waitForTimeout(300);
await shot('10-skilltree');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('Tab');
await page.waitForTimeout(500);
await page.evaluate(() => {
  // select the first backpack item so the card shows
  document.querySelector('.inv-row')?.click();
});
await page.waitForTimeout(300);
await shot('11-inventory');
await page.keyboard.press('Escape');

// sandbox page
await page.goto('http://127.0.0.1:4519/sandbox.html');
await page.waitForTimeout(3000);
await shot('12-sandbox');

await browser.close();
server.close();
console.log('done ->', OUT);

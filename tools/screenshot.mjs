// Self-review harness — pass 2. Serves dist/, boots the game headless,
// drives the full loop via the __game seam (fastForward steps the sim since
// headless GPU renders ~2fps), and captures every identity moment: hub,
// districts, combat, elements, loot, quests, bosses, panels, sandbox.
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
  await page.waitForTimeout(2200); // headless present-lag
  await page.screenshot({ path: join(OUT, name + '.png') });
  console.log('shot:', name);
};
const ff = (s) => page.evaluate((sec) => window.__game.fastForward(sec), s);
const teleport = (x, z, yaw = 0, pitch = -0.06) => page.evaluate(([x, z, yaw, pitch]) => {
  const g = window.__game;
  g.player.position.set(x, g.world.groundHeight(x, z), z);
  g.player.yaw = yaw; g.player.pitch = pitch;
  g.fastForward(0.1);
}, [x, z, yaw, pitch]);

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
  p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  return es.length;
});
const burst = (sim = 0.12) => page.evaluate((s) => {
  const g = window.__game;
  g.player.mouseDown = true;
  g.fastForward(s);
  g.player.mouseDown = false;
  g.fastForward(0.05);
}, sim);

await page.goto('http://127.0.0.1:4519/');
await page.waitForTimeout(2500);
await shot('01-title');

await page.evaluate(() => document.getElementById('t-new')?.click()); // pulse anim makes it "unstable" for page.click
await page.waitForTimeout(500);
await shot('02-class-select');
await page.evaluate(() => document.getElementById('cs-go')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(2600); // intro cinematic sweeping the hub
await shot('02b-intro-cutscene');
await page.evaluate(() => window.__game.skipIntro());
await page.waitForTimeout(3200);
await shot('03-hub-gutterlight');

// talk to Quibb, accept quest 1
await teleport(-3, 77, Math.PI * 0.98);
await page.keyboard.press('e');
await page.waitForTimeout(2200);
await shot('04-quibb-dialogue');
await page.click('#dlg-accept').catch(() => {});
await page.waitForTimeout(400);

// walk the road south — vista over the gully
await teleport(0, 58, Math.PI, -0.04);
await ff(2);
await shot('05-road-south');

// into the gully: quest 1 completes, enemies populate
await teleport(0, 20, Math.PI, -0.03);
await ff(6);
await aim();
await shot('06-gully-combat');

// fight: kills, loot beams
for (let i = 0; i < 60; i++) {
  const n = await aim();
  if (n === 0) { await ff(2); continue; }
  await burst();
  const beams = await page.evaluate(() => window.__game.loot.pickups.filter((p) => p.kind === 'item').length);
  const kills = await page.evaluate(() => window.__game.state.grit.killCount);
  if (beams >= 2 && kills >= 3) break;
}
await page.evaluate(() => {
  const g = window.__game;
  const items = g.loot.pickups.filter((p) => p.kind === 'item');
  if (!items.length) return;
  const t = items[0].pos;
  g.player.position.set(t.x + 5, g.world.groundHeight(t.x + 5, t.z + 4), t.z + 4);
  const eye = g.player.camera.position;
  g.player.yaw = Math.atan2(-(t.x - eye.x), -(t.z - eye.z));
  g.player.pitch = -0.12;
  g.fastForward(0.1);
});
await shot('07-loot-beams');
await page.evaluate(() => {
  const g = window.__game;
  const items = g.loot.pickups.filter((p) => p.kind === 'item');
  if (!items.length) return;
  g.player.position.set(items[0].pos.x + 0.8, g.world.groundHeight(items[0].pos.x, items[0].pos.z), items[0].pos.z + 0.8);
  g.player.pitch = -0.5;
  g.fastForward(0.1);
});
await shot('08-item-card');

// boneyard vista
await teleport(-58, -12, Math.PI / 2 + 0.3, -0.02);
await ff(3);
await shot('09-boneyard');

// slagflats + helix combat with a volt SMG
await teleport(62, -18, -Math.PI / 2 - 0.4, -0.02);
await page.evaluate(() => {
  const g = window.__game;
  const gun = g.gen.generateWeapon({ level: 10, rarityId: 'epic', type: 'smg', makerId: 'aetheric', seed: 4242 });
  gun.element = 'volt';
  gun.stats.elemChance = 1;
  g.equip(gun);
});
await ff(6);
await aim();
await burst(0.3);
await shot('10-slagflats');

// sentry rig + skill points spent
await page.evaluate(() => { window.__game.state.skillPoints += 5; });
await page.keyboard.press('f');
await ff(1);
await shot('11-sentry-rig');

// boss: force-start Gutterball quest chain
await page.evaluate(() => {
  const g = window.__game;
  for (const q of g.questSystem.quests) if (q.status !== 'complete' && q.def.id !== 'q4_regicide') { q.status = 'complete'; }
  const q4 = g.questSystem.quests.find((q) => q.def.id === 'q4_regicide');
  q4.status = 'available';
  g.questSystem.accept();
});
await teleport(0, -78, Math.PI, -0.02);
await ff(2);
await aim();
await shot('12-gutterball-boss');

// panels
await page.keyboard.press('j');
await page.waitForTimeout(1600);
await shot('13-quest-log');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('k');
await page.waitForTimeout(600);
await page.click('[data-skill="hi_racket"]').catch(() => {});
await page.click('[data-skill="hi_trigger"]').catch(() => {});
await page.waitForTimeout(300);
await shot('14-skilltree');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('Tab');
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('.inv-row')?.click());
await page.waitForTimeout(300);
await shot('15-inventory');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// FROSTHOLLOW — switch map, tour the biome
await page.evaluate(() => { window.__game.switchMapDebug('frosthollow'); window.__game.fastForward(1); });
await teleport(0, 100, Math.PI, -0.04);
await ff(2);
await shot('16-frosthollow-chatterjaw');
await teleport(-40, 12, Math.PI * 0.65, -0.03);
await ff(8);
await aim();
await shot('17-pinebreak-combat');
await teleport(30, -6, -Math.PI / 2 - 0.4, -0.05);
await ff(3);
await shot('18-frozen-fathom');

// sandbox
await page.goto('http://127.0.0.1:4519/sandbox.html');
await page.waitForTimeout(3000);
await shot('19-sandbox');

await browser.close();
server.close();
console.log('done ->', OUT);

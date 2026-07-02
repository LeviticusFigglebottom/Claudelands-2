// Art sandbox: a turntable scene for tuning the look in isolation —
// generated guns of every manufacturer, a prop cluster, and live sliders
// for the ink/hatch/bloom/rim knobs. Open /sandbox.html.

import * as THREE from 'three';
import { PostPipeline } from './render/post';
import { toonMat, setRim, LOOK } from './render/toon';
import { groundTexture, rockTexture } from './render/textures';
import { generateWeapon } from './gen/weapongen';
import { buildGunMesh } from './gen/gunmesh';
import { MAKER_LIST } from './data/manufacturers';
import { fx } from './game/particles';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.layers.enable(1);
camera.position.set(0, 2.2, 6);
camera.lookAt(0, 1, 0);

const post = new PostPipeline(renderer, scene, camera, window.innerWidth, window.innerHeight);
fx.attach(scene);

scene.background = new THREE.Color(0xd8b070);
const sun = new THREE.DirectionalLight(0xffe8c0, 2.6);
sun.position.set(-40, 70, 30);
sun.castShadow = true;
scene.add(sun, new THREE.HemisphereLight(0x9ab4d8, 0x8a6a48, 1.1));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), toonMat({ map: groundTexture() }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const rock = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 3, 6), toonMat({ map: rockTexture() }));
rock.position.set(-4, 1.5, -3);
rock.castShadow = true;
scene.add(rock);

// one gun per manufacturer on a turntable
const table = new THREE.Group();
let level = 12;
function respawnGuns(): void {
  table.clear();
  MAKER_LIST.forEach((m, i) => {
    const a = (i / MAKER_LIST.length) * Math.PI * 2;
    const gun = buildGunMesh(generateWeapon({ level, makerId: m.id, rarityId: ['rare', 'epic', 'legendary'][i % 3] }));
    gun.scale.setScalar(2.4);
    gun.position.set(Math.cos(a) * 2.4, 1.3, Math.sin(a) * 2.4);
    gun.rotation.y = -a + Math.PI / 2;
    table.add(gun);
  });
}
respawnGuns();
scene.add(table);

const beam = fx.lootBeam(new THREE.Vector3(0, 0, 0), 0xff9500, 4);
scene.add(beam);

// ---------------------------------------------------------------- controls
const ui = document.getElementById('sandbox-ui')!;
ui.innerHTML = `
  <b>ART SANDBOX — Gully Seven lighting rig</b>
  <label>Ink density <input type="range" id="s-ink" min="0" max="2" step="0.05" value="${LOOK.inkDensity}"></label>
  <label>Hatch strength <input type="range" id="s-hatch" min="0" max="1" step="0.05" value="${LOOK.hatchStrength}"></label>
  <label>Rim light <input type="range" id="s-rim" min="0" max="2" step="0.05" value="${LOOK.rimStrength}"></label>
  <label>Bloom <input type="range" id="s-bloom" min="0" max="2" step="0.05" value="0.55"></label>
  <label>Saturation <input type="range" id="s-sat" min="0.5" max="2" step="0.05" value="${LOOK.saturation}"></label>
  <button id="s-reroll">REROLL GUNS</button>
`;
const bind = (id: string, fn: (v: number) => void) => {
  document.getElementById(id)!.addEventListener('input', (e) => fn(Number((e.target as HTMLInputElement).value)));
};
bind('s-ink', (v) => (post.ink.uniforms.uInk.value = v));
bind('s-hatch', (v) => (post.ink.uniforms.uHatch.value = v));
bind('s-rim', (v) => setRim(v));
bind('s-bloom', (v) => (post.bloom.strength = v));
bind('s-sat', (v) => (post.ink.uniforms.uSaturation.value = v));
document.getElementById('s-reroll')!.addEventListener('click', () => respawnGuns());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  table.rotation.y += dt * 0.4;
  fx.update(dt);
  if (Math.random() < 0.3) fx.emit(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4), new THREE.Vector3(0, 1.5, 0), 0xff9500, 0.1, 1.2, 0);
  post.render(dt);
}
frame();

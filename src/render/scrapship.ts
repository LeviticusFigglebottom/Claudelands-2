// THE PAPERWEIGHT — the scrapship, built once and shared by the launch pads
// and the travel cinematic. A welded brick with delusions of aerodynamics.

import * as THREE from 'three';
import { toonMat, glowMat } from './toon';
import { swatch } from './textures';

export function buildScrapship(): THREE.Group {
  const g = new THREE.Group();
  const hullMat = toonMat({ color: 0xffffff, map: swatch('#8a7a5a', 80) });
  const plateMat = toonMat({ color: 0xffffff, map: swatch('#5a6a6a', 70) });
  const darkMat = toonMat({ color: 0x3a3632 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 5.2), hullMat);
  hull.position.y = 1.4;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.35, 2.2, 4), plateMat);
  nose.rotation.x = -Math.PI / 2;
  nose.rotation.y = Math.PI / 4;
  nose.position.set(0, 1.4, -3.6);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), glowMat(0x54d4ff, 0.5));
  canopy.position.set(0, 2.2, -1.5);
  const finL = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 1.6), plateMat);
  finL.position.set(-2.1, 1.2, 1.6);
  finL.rotation.z = 0.2;
  const finR = finL.clone();
  finR.position.x = 2.1;
  finR.rotation.z = -0.2;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 1.3), plateMat);
  tail.position.set(0, 2.6, 2.2);
  // welded cargo junk
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.1), darkMat);
  crate.position.set(0.9, 2.35, 0.6);
  crate.rotation.y = 0.4;
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.4, 8), darkMat);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(-0.9, 2.3, 0.9);
  // thrusters
  const thrusters = new THREE.Group();
  thrusters.name = 'thrusters';
  for (const sx of [-0.8, 0.8]) {
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 0.8, 8), darkMat);
    bell.rotation.x = Math.PI / 2;
    bell.position.set(sx, 1.3, 2.9);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), glowMat(0xff8c2a, 1));
    glow.position.set(sx, 1.3, 3.2);
    glow.name = 'thruster_glow';
    thrusters.add(bell, glow);
  }
  // landing legs
  for (const [lx, lz] of [[-1.2, -1.6], [1.2, -1.6], [-1.2, 1.8], [1.2, 1.8]] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.2, 6), darkMat);
    leg.position.set(lx, 0.55, lz);
    leg.rotation.z = lx > 0 ? -0.25 : 0.25;
    g.add(leg);
  }
  const name = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 2.2), glowMat(0xffd23c, 0.55));
  name.position.set(-1.33, 1.5, 0);
  g.add(hull, nose, canopy, finL, finR, tail, crate, tank, thrusters, name);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

// Top-center compass strip: cardinal ticks + world markers (quest objective,
// fast-travel stations, vendors, active boss) that slide across as the
// player turns. Pure DOM, updated per frame.

import * as THREE from 'three';

export interface CompassMarker {
  x: number; z: number;
  icon: string;
  color: string;
  id: string;
}

const HALF_FOV = THREE.MathUtils.degToRad(58); // markers visible within this half-angle

export class Compass {
  private root = document.getElementById('compass')!;
  private markerEls = new Map<string, HTMLElement>();
  private tickEls: { el: HTMLElement; bearing: number }[] = [];

  constructor() {
    this.root.innerHTML = '<div class="compass-line"></div>';
    const dirs: [string, number][] = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
    for (const [label, deg] of dirs) {
      const el = document.createElement('div');
      el.className = 'compass-tick' + (label.length === 1 ? ' major' : '');
      el.textContent = label;
      this.root.appendChild(el);
      this.tickEls.push({ el, bearing: THREE.MathUtils.degToRad(deg) });
    }
  }

  private wrap(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  update(playerPos: THREE.Vector3, yaw: number, markers: CompassMarker[]): void {
    const width = this.root.clientWidth;
    const facing = yaw + Math.PI; // bearing the camera looks toward (atan2(x,z) convention)

    for (const t of this.tickEls) {
      const rel = this.wrap(t.bearing - facing);
      if (Math.abs(rel) > HALF_FOV) { t.el.style.display = 'none'; continue; }
      t.el.style.display = 'block';
      t.el.style.left = `${(0.5 + rel / (HALF_FOV * 2)) * width}px`;
      t.el.style.opacity = `${1 - Math.abs(rel) / HALF_FOV * 0.6}`;
    }

    // sync marker elements
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      let el = this.markerEls.get(m.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'compass-marker';
        this.root.appendChild(el);
        this.markerEls.set(m.id, el);
      }
      el.textContent = m.icon;
      el.style.color = m.color;
      const bearing = Math.atan2(m.x - playerPos.x, m.z - playerPos.z);
      const rel = this.wrap(bearing - facing);
      if (Math.abs(rel) > HALF_FOV) {
        // clamp to edge as an arrow hint
        el.style.left = `${(rel > 0 ? width - 10 : 10)}px`;
        el.style.opacity = '0.45';
      } else {
        el.style.left = `${(0.5 + rel / (HALF_FOV * 2)) * width}px`;
        el.style.opacity = '1';
      }
      const dist = Math.hypot(m.x - playerPos.x, m.z - playerPos.z);
      el.dataset.dist = `${Math.round(dist)}m`;
    }
    for (const [id, el] of this.markerEls) {
      if (!seen.has(id)) { el.remove(); this.markerEls.delete(id); }
    }
  }
}

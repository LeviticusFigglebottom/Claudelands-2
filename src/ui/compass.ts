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
      // screen-relative angle: positive = right of view (camera right = (cos yaw, -sin yaw))
      const rel = this.wrap(facing - t.bearing);
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
      const rel = this.wrap(facing - bearing);
      // smooth clamp: markers slide continuously to the bar's edge, and get
      // a direction chevron when the target is outside the view cone
      const clamped = Math.max(-HALF_FOV, Math.min(HALF_FOV, rel));
      el.style.left = `${(0.5 + clamped / (HALF_FOV * 2)) * (width - 24) + 12}px`;
      const off = Math.abs(rel) > HALF_FOV;
      el.style.opacity = off ? '0.55' : '1';
      el.classList.toggle('off-l', off && rel < 0);
      el.classList.toggle('off-r', off && rel > 0);
      const dist = Math.hypot(m.x - playerPos.x, m.z - playerPos.z);
      el.dataset.dist = `${Math.round(dist)}m`;
      // quest diamond rides above other icons so overlaps never hide it
      el.style.zIndex = m.id === 'quest' ? '3' : m.id === 'boss' ? '2' : '1';
    }
    for (const [id, el] of this.markerEls) {
      if (!seen.has(id)) { el.remove(); this.markerEls.delete(id); }
    }
  }
}

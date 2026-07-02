// Comic-pop damage numbers: world position projected to screen, HTML divs
// animated via CSS (pop, arc, fade). Size/color keyed to damage type and
// magnitude; crits get the big treatment.

import * as THREE from 'three';
import { ELEMENTS } from '../data/elements';
import type { ElementId } from '../game/types';
import { fmtNum } from '../util/maff';

const container = () => document.getElementById('damage-numbers')!;

export class DamageNumberSystem {
  private camera: THREE.PerspectiveCamera;
  private v = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  spawn(worldPos: THREE.Vector3, amount: number, element: ElementId, crit: boolean, kind: 'damage' | 'heal' | 'immune' = 'damage'): void {
    if (amount < 1 && kind === 'damage') return;
    this.v.copy(worldPos).project(this.camera);
    if (this.v.z > 1) return; // behind camera
    const x = (this.v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;

    const el = document.createElement('div');
    el.className = 'dmg' + (crit ? ' crit' : '') + (kind === 'heal' ? ' heal' : '');
    el.textContent = kind === 'immune' ? 'IMMUNE' : (crit ? fmtNum(amount) + '!' : fmtNum(amount));
    const e = ELEMENTS[element];
    el.style.color = kind === 'heal' ? '#3ddc4e' : e.css;
    // size scales with magnitude (log) and crit
    const mag = Math.min(1, Math.log10(Math.max(1, amount)) / 4);
    const size = (crit ? 30 : 17) + mag * 26;
    el.style.fontSize = `${size}px`;
    // small random offset so stacked hits don't overlap perfectly
    el.style.left = `${x + (Math.random() - 0.5) * 46}px`;
    el.style.top = `${y + (Math.random() - 0.5) * 20}px`;
    container().appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
}

// Toon material factory. MeshToonMaterial gives us hard-banded diffuse via a
// gradient ramp and plays nicely with all of three's lights; we inject a rim
// light term with onBeforeCompile. Global "ink density"/rim knobs live here
// so the whole look is dialable from one place (see also post.ts).

import * as THREE from 'three';
import { toonRamp } from './textures';

export const LOOK = {
  rampSteps: 3,
  rimStrength: 0.55,
  rimPower: 2.4,
  inkDensity: 1.0,      // consumed by post.ts edge pass
  hatchStrength: 0.5,   // consumed by post.ts
  saturation: 1.22,     // consumed by post.ts grade
};

let ramp: THREE.DataTexture | null = null;
function sharedRamp(): THREE.DataTexture {
  if (!ramp) ramp = toonRamp(LOOK.rampSteps);
  return ramp;
}

export interface ToonOpts {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  rim?: number;          // per-material rim override (0 disables)
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

const rimUniforms = { uRimStrength: { value: LOOK.rimStrength }, uRimPower: { value: LOOK.rimPower } };

export function setRim(strength: number, power = LOOK.rimPower): void {
  LOOK.rimStrength = strength;
  LOOK.rimPower = power;
  rimUniforms.uRimStrength.value = strength;
  rimUniforms.uRimPower.value = power;
}

export function toonMat(opts: ToonOpts = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    map: opts.map ?? null,
    gradientMap: sharedRamp(),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  const rimMul = opts.rim ?? 1;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRimStrength = rimUniforms.uRimStrength;
    shader.uniforms.uRimPower = rimUniforms.uRimPower;
    shader.uniforms.uRimMul = { value: rimMul };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uRimStrength; uniform float uRimPower; uniform float uRimMul;`
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // Cool rim light on silhouettes facing away from the eye — the
          // comic-book "backlight" that pops characters off the background.
          vec3 nrm = normalize( normal );
          vec3 viewDir = normalize( vViewPosition );
          float rim = pow( 1.0 - max( dot( nrm, viewDir ), 0.0 ), uRimPower );
          outgoingLight += rim * uRimStrength * uRimMul * vec3(0.55, 0.62, 0.75);
        }
        #include <opaque_fragment>`
      );
  };
  return m;
}

/** Unlit additive material for beams / glows / tracers. */
export function glowMat(color: THREE.ColorRepresentation, opacity = 1, map: THREE.Texture | null = null): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, map,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** Flat unlit material (skydome, decals). */
export function flatMat(color: THREE.ColorRepresentation, map: THREE.Texture | null = null): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, map });
}

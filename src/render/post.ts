// The post stack — where the comic-book identity is enforced frame-wide:
//   1. Bloom (loot beams, muzzle flash, elemental glow)
//   2. Ink pass: silhouette + interior edges from a depth+normal prepass,
//      screen-space cross-hatching in shadowed regions, color grade,
//      vignette, paper grain.
// All knobs are uniforms on `ink.uniforms` — tune in one place (or in the
// art sandbox). FX objects (beams/particles/sky) live on layer 1 so they are
// skipped by the normal/depth prepass and never get outlined.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { LOOK } from './toon';

export const FX_LAYER = 1; // no-outline layer

const InkShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 300 },
    uInk: { value: 1.0 },          // outline density/strength
    uHatch: { value: 0.5 },        // cross-hatch strength in shadows
    uHatchScale: { value: 140.0 }, // stripes across screen height
    uSaturation: { value: 1.22 },
    uContrast: { value: 1.06 },
    uWarmth: { value: 0.03 },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.035 },
    uDesat: { value: 0.0 },        // driven up when player is downed
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform float cameraNear, cameraFar;
    uniform float uInk, uHatch, uHatchScale, uSaturation, uContrast, uWarmth, uVignette, uGrain, uDesat, uTime;
    varying vec2 vUv;

    float readDepth(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      float viewZ = perspectiveDepthToViewZ(d, cameraNear, cameraFar);
      return viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);
    }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 texel = 1.0 / resolution;
      vec3 col = texture2D(tDiffuse, vUv).rgb;

      // ---- Edge detection (Roberts cross on depth + normals) ----
      float d00 = readDepth(vUv);
      float d10 = readDepth(vUv + vec2(texel.x, 0.0));
      float d01 = readDepth(vUv + vec2(0.0, texel.y));
      float d11 = readDepth(vUv + texel);
      float depthEdge = abs(d00 - d11) + abs(d10 - d01);
      // scale threshold by depth so distant geometry doesn't dissolve into ink
      float depthLine = smoothstep(0.0012 + d00 * 0.02, 0.004 + d00 * 0.05, depthEdge);

      vec3 n00 = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
      vec3 n10 = texture2D(tNormal, vUv + vec2(texel.x, 0.0)).xyz * 2.0 - 1.0;
      vec3 n01 = texture2D(tNormal, vUv + vec2(0.0, texel.y)).xyz * 2.0 - 1.0;
      vec3 n11 = texture2D(tNormal, vUv + texel).xyz * 2.0 - 1.0;
      float normalEdge = (1.0 - dot(n00, n11)) + (1.0 - dot(n10, n01));
      float normalLine = smoothstep(0.25, 0.7, normalEdge) * (1.0 - smoothstep(0.6, 0.95, d00)); // fade interior lines far away

      float line = clamp(max(depthLine, normalLine) * uInk, 0.0, 1.0);
      // ink is warm-black, not pure black — reads hand-drawn
      col = mix(col, vec3(0.045, 0.03, 0.04), line * 0.92);

      // ---- Cross-hatching in shadows ----
      // The composer chain runs in linear space; hatch thresholds are
      // perceptual, so evaluate luminance in gamma space.
      float lum = pow(max(dot(col, vec3(0.299, 0.587, 0.114)), 0.0), 0.4545);
      vec2 sc = vUv * resolution / resolution.y; // square coords
      float h1 = step(0.5, fract((sc.x + sc.y) * uHatchScale * 0.5));
      float h2 = step(0.5, fract((sc.x - sc.y) * uHatchScale * 0.5));
      float hatch = 0.0;
      hatch += (1.0 - smoothstep(0.18, 0.34, lum)) * h1;      // dark: first direction
      hatch += (1.0 - smoothstep(0.08, 0.2, lum)) * h2;       // darker: crossed
      col *= 1.0 - clamp(hatch, 0.0, 1.0) * uHatch * (1.0 - line);

      // ---- Grade ----
      float l2 = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l2), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      col += vec3(uWarmth, uWarmth * 0.45, -uWarmth * 0.6);
      col = mix(col, vec3(l2) * vec3(1.0, 0.35, 0.3), uDesat); // downed: blood-drain

      // ---- Vignette + paper grain ----
      vec2 vc = vUv - 0.5;
      col *= 1.0 - dot(vc, vc) * uVignette * 2.0;
      col += (hash(vUv * resolution + fract(uTime) * 371.0) - 0.5) * uGrain;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostPipeline {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  ink: ShaderPass;
  private fxaa: ShaderPass;
  private normalRT: THREE.WebGLRenderTarget;
  private normalMat = new THREE.MeshNormalMaterial();
  private time = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
  ) {
    const depthTexture = new THREE.DepthTexture(width, height);
    this.normalRT = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture,
    });

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.ink = new ShaderPass(InkShader);
    this.ink.uniforms.tNormal.value = this.normalRT.texture;
    this.ink.uniforms.tDepth.value = depthTexture;
    this.ink.uniforms.resolution.value.set(width, height);
    this.ink.uniforms.cameraNear.value = camera.near;
    this.ink.uniforms.cameraFar.value = camera.far;
    this.ink.uniforms.uInk.value = LOOK.inkDensity;
    this.ink.uniforms.uHatch.value = LOOK.hatchStrength;
    this.ink.uniforms.uSaturation.value = LOOK.saturation;
    this.composer.addPass(this.ink);
    this.composer.addPass(new OutputPass());
    // FXAA last: smooths ink lines and geometry edges after tonemap/encode
    this.fxaa = new ShaderPass(FXAAShader);
    const pr = renderer.getPixelRatio();
    this.fxaa.material.uniforms.resolution.value.set(1 / (width * pr), 1 / (height * pr));
    this.composer.addPass(this.fxaa);
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.normalRT.setSize(width, height);
    this.ink.uniforms.resolution.value.set(width, height);
    const pr = this.renderer.getPixelRatio();
    this.fxaa.material.uniforms.resolution.value.set(1 / (width * pr), 1 / (height * pr));
  }

  render(dt: number): void {
    this.time += dt;
    this.ink.uniforms.uTime.value = this.time;

    // Normal/depth prepass — layer 0 only (FX layer never gets ink).
    const prevBg = this.scene.background;
    this.scene.background = null;
    this.scene.overrideMaterial = this.normalMat;
    this.camera.layers.disable(FX_LAYER);
    this.renderer.setRenderTarget(this.normalRT);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.scene.overrideMaterial = null;
    this.scene.background = prevBg;
    this.camera.layers.enable(FX_LAYER);

    this.composer.render();
  }
}

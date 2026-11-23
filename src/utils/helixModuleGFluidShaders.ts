import * as THREE from 'three';
import {
  BiopixelPhysicsOverrides,
  OpcodeForceFieldProfile,
} from './helixBiopixelSurface';

export const HELIX_OPCODE_TEXELS = 32;
export const HELIX_FLUID_FBO_SIZE = 64;

/**
 * Pass 1 (GPGPU WebGL Ping-Pong FBO): Vertex shader del quad completo de simulación.
 */
export const HELIX_NS_KV_SIM_VERTEX_SHADER = `
varying vec2 vSimUv;
void main() {
  vSimUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Pass 1 (GPGPU WebGL Ping-Pong FBO): Fragment shader que integra directamente en GPU:
 *  - Ecuación de Navier-Stokes incompresible: du/dt = -(u·∇)u + ν∇²u + f_curl + f_opcodes
 *  - Ecuación constitutiva viscoelástica Kelvin-Voigt: dε/dt = (σ_opcodes + p_fluid - E·ε) / η
 *  - Disipación exponencial Ley Némesis de Cauchy hacia el reposo 0.0f
 *
 * Empaquetado RGBA [0..1] compatible 100% con UnsignedByteType (WebGL1/WebGL2/SwiftShader):
 *   R = u_x * 0.25 + 0.5
 *   G = u_y * 0.25 + 0.5
 *   B = ε   * 0.35 + 0.5   (deformación viscoelástica Kelvin-Voigt)
 *   A = ω   * 0.25 + 0.5   (vorticidad escalar ∇×u)
 */
export const HELIX_NS_KV_SIM_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D tPrevState;
uniform sampler2D tOpcodeField;
uniform vec2 uTexelSize;
uniform float uFluidTime;
uniform float uFluidDt;
uniform float uNsViscosity;
uniform float uNsCurlGain;
uniform float uKvElasticityE;
uniform float uKvDampingEta;
uniform float uNemesisGamma;
uniform float uOpcodeImpulse;
uniform float uOpcodeCount;

varying vec2 vSimUv;

vec4 unpackFluid(vec4 enc) {
  return vec4(
    (enc.r - 0.5) * 4.0,
    (enc.g - 0.5) * 4.0,
    (enc.b - 0.5) / 0.35,
    (enc.a - 0.5) * 4.0
  );
}

vec4 packFluid(vec2 vel, float strain, float vort) {
  return clamp(vec4(
    vel.x * 0.25 + 0.5,
    vel.y * 0.25 + 0.5,
    strain * 0.35 + 0.5,
    vort * 0.25 + 0.5
  ), 0.0, 1.0);
}

vec2 curlForce2D(vec2 uv, float t) {
  float e = 0.012;
  float pU = sin((uv.y + e) * 12.566 + t * 1.6) * cos(uv.x * 9.424 - t * 0.9);
  float pD = sin((uv.y - e) * 12.566 + t * 1.6) * cos(uv.x * 9.424 - t * 0.9);
  float pR = sin(uv.y * 12.566 + t * 1.6) * cos((uv.x + e) * 9.424 - t * 0.9);
  float pL = sin(uv.y * 12.566 + t * 1.6) * cos((uv.x - e) * 9.424 - t * 0.9);
  float dPsiDy = (pU - pD) / (2.0 * e);
  float dPsiDx = (pR - pL) / (2.0 * e);
  return vec2(dPsiDy, -dPsiDx) * 0.085;
}

void main() {
  float dt = clamp(uFluidDt, 0.001, 0.033);

  vec4 c = unpackFluid(texture2D(tPrevState, vSimUv));
  vec4 l = unpackFluid(texture2D(tPrevState, vec2(fract(vSimUv.x - uTexelSize.x), vSimUv.y)));
  vec4 r = unpackFluid(texture2D(tPrevState, vec2(fract(vSimUv.x + uTexelSize.x), vSimUv.y)));
  vec4 u = unpackFluid(texture2D(tPrevState, vec2(vSimUv.x, min(1.0, vSimUv.y + uTexelSize.y))));
  vec4 d = unpackFluid(texture2D(tPrevState, vec2(vSimUv.x, max(0.0, vSimUv.y - uTexelSize.y))));

  // Advección semi-Lagrangiana -(u·∇)u
  vec2 backUv = vec2(
    fract(vSimUv.x - c.x * dt * 0.16),
    clamp(vSimUv.y - c.y * dt * 0.16, 0.0, 1.0)
  );
  vec4 adv = unpackFluid(texture2D(tPrevState, backUv));

  // Difusión viscosa Laplaciana ν∇²u
  vec2 lapVel = (l.xy + r.xy + u.xy + d.xy - 4.0 * c.xy);

  // Acumular forzamiento de los opcodes activos codificados en tOpcodeField (32 texels)
  vec2 opcodeSwirlForce = vec2(0.0);
  float opcodeTargetStress = 0.0;
  for (int i = 0; i < 32; i++) {
    if (float(i) >= uOpcodeCount) break;
    vec4 opData = texture2D(tOpcodeField, vec2((float(i) + 0.5) / 32.0, 0.5));
    vec2 opCenter = opData.rg;
    float opTargetStrain = (opData.b - 0.5) * 2.0;
    float opSignedWeight = (opData.a - 0.5) * 4.0;

    float du = abs(vSimUv.x - opCenter.x);
    du = min(du, 1.0 - du);
    float dv = vSimUv.y - opCenter.y;
    float distSq = du * du * 14.0 + dv * dv * 9.0;
    float kernel = exp(-distSq * 3.8);

    float wave = 0.6 + 0.4 * sin(uFluidTime * (2.2 + float(i) * 0.35));
    vec2 tangent = normalize(vec2(-dv, du + 0.001));
    opcodeSwirlForce += tangent * opSignedWeight * kernel * wave;
    opcodeTargetStress += opTargetStrain * abs(opSignedWeight) * kernel * wave;
  }

  vec2 curlF = curlForce2D(vSimUv, uFluidTime) * uNsCurlGain;
  vec2 totalForce = (curlF + opcodeSwirlForce * 0.85 * uNsCurlGain) * (0.55 + uOpcodeImpulse);
  float viscDrag = exp(-uNsViscosity * 4.5 * dt);
  vec2 nextVel = clamp((adv.xy + totalForce * dt) * viscDrag + lapVel * min(0.22, uNsViscosity * dt * 6.0), vec2(-1.8), vec2(1.8));

  // Vorticidad escalar discreta ω = ∂v/∂x - ∂u/∂y
  float vort = clamp(0.5 * ((r.y - l.y) - (u.x - d.x)) * 2.5, -1.8, 1.8);

  // Acoplamiento Fluido-Estructura + ODE Viscoelástica Kelvin-Voigt:
  // σ_total = E·ε + η·dε/dt  =>  dε/dt = (σ_opcodes + p_fluido - E·ε) / η
  float fluidPressure = (r.x - l.x + u.y - d.y) * 3.2 + abs(vort) * 0.55;
  float sigmaDrive = (opcodeTargetStress * 18.0 + fluidPressure * 6.0) * (0.55 + uOpcodeImpulse);
  float strainRate = (sigmaDrive - uKvElasticityE * c.z) / max(0.8, uKvDampingEta);
  float nextStrain = (c.z + strainRate * dt) * (1.0 - clamp(uNemesisGamma, 0.001, 0.4) * dt * 2.2);
  nextStrain = clamp(nextStrain, -1.25, 1.25);

  gl_FragColor = packFluid(nextVel, nextStrain, vort);
}
`;

/**
 * Pass 2 (Vertex Shader de Deformación de Malla 3D):
 * Lee directamente tFluidState (resultado GPU de Navier-Stokes + Kelvin-Voigt) y
 * desplaza los vértices de la malla 3D por presión viscoelástica normal + flujo tangencial.
 */
export const HELIX_MESH_KV_DEFORM_VERTEX_PARS = `
uniform sampler2D tFluidState;
uniform float uFluidTime;
uniform float uMeshDeformGain;
uniform float uHelixTension;
uniform float uHelixCurlGain;
uniform float uHelixCymaticHz;
uniform float uHelixQuantumPhase;
varying vec3 vHelixWorldPos;
varying vec3 vHelixWorldNormal;
varying float vHelixCurlEnergy;
varying float vHelixKvStrain;
varying float vHelixFluidVort;
`;

export const HELIX_MESH_KV_DEFORM_VERTEX_CHUNK = `
#include <begin_vertex>
vec2 hUvSample = vec2(
  fract(atan(position.z, position.x) / 6.2831853 + 0.5),
  clamp(position.y * 0.45 + 0.25, 0.02, 0.98)
);
vec4 hFluidEnc = texture2D(tFluidState, hUvSample);
vec2 hFluidVel = (hFluidEnc.rg - 0.5) * 4.0;
float hKvStrain = (hFluidEnc.b - 0.5) / 0.35;
float hFluidVort = (hFluidEnc.a - 0.5) * 4.0;

float hFreq = clamp(uHelixCymaticHz / 220.0, 1.0, 4.0);
vec3 hCurl = vec3(
  cos(transformed.y * hFreq + uFluidTime * 2.4 + uHelixQuantumPhase) - sin(transformed.z * hFreq + uFluidTime * 1.9),
  cos(transformed.z * hFreq - uFluidTime * 2.1) - sin(transformed.x * hFreq + uFluidTime * 2.3),
  cos(transformed.x * hFreq + uFluidTime * 1.8) - sin(transformed.y * hFreq - uFluidTime * 2.6)
);
vec3 hTangent = normalize(cross(vec3(0.0, 1.0, 0.0), objectNormal + vec3(0.0001, 0.0, 0.0)));
float hTensionScale = clamp(0.32 + uHelixTension * 0.72, 0.15, 1.65);

transformed += objectNormal * (hKvStrain * 0.085 * uMeshDeformGain * hTensionScale);
transformed += hTangent * (hFluidVel.x * 0.042 * uMeshDeformGain * hTensionScale);
transformed.y += hFluidVel.y * 0.032 * uMeshDeformGain * hTensionScale;
transformed += hCurl * (0.016 * clamp(uHelixCurlGain, 0.1, 1.8) * clamp(uHelixTension, 0.0, 1.5));

vHelixKvStrain = hKvStrain;
vHelixFluidVort = hFluidVort;
vHelixCurlEnergy = clamp(abs(hKvStrain) * 0.75 + abs(hFluidVort) * 0.45 + uHelixTension * 0.35, 0.0, 1.0);
vec4 hWorldPos = modelMatrix * vec4(transformed, 1.0);
vHelixWorldPos = hWorldPos.xyz;
vHelixWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

/**
 * Pass 2 (Fragment Shader Óptico-Reológico):
 * Combina dispersión cromática de Cauchy (700/546.1/435.8 nm), SSS, glasmorfismo Fresnel
 * y mapa térmico de vorticidad Navier-Stokes / tensión Kelvin-Voigt en el silicio GPU.
 */
export const HELIX_MESH_KV_DEFORM_FRAGMENT_PARS = `
uniform float uHelixTension;
uniform float uHelixQuantumPhase;
uniform vec3 uHelixCauchyN;
uniform float uHelixSssStrength;
uniform float uHelixGlassStrength;
varying vec3 vHelixWorldPos;
varying vec3 vHelixWorldNormal;
varying float vHelixCurlEnergy;
varying float vHelixKvStrain;
varying float vHelixFluidVort;
`;

export const HELIX_MESH_KV_DEFORM_FRAGMENT_CHUNK = `
vec3 hN = normalize(vHelixWorldNormal);
vec3 hV = normalize(cameraPosition - vHelixWorldPos);
float hNdotV = clamp(dot(hN, hV), 0.0, 1.0);
float hFresnel = pow(1.0 - hNdotV, 3.0);

vec3 hKeyDir = normalize(vec3(0.55, 0.80, 0.50));
float hWrap = clamp((dot(hN, hKeyDir) + 0.55) / 1.55, 0.0, 1.0);
float hBackScatter = pow(clamp(dot(hV, -hKeyDir) * 0.5 + 0.5, 0.0, 1.0), 2.5);
vec3 hSssTint = vec3(0.14, 0.62, 0.88) * hWrap + vec3(0.95, 0.45, 0.28) * hBackScatter * 0.45;

// Resalte reológico Kelvin-Voigt (expansión azul cian / compresión ámbar) + vorticidad NS
vec3 hKvTint = mix(
  vec3(0.96, 0.62, 0.16),
  vec3(0.18, 0.78, 0.98),
  smoothstep(-0.45, 0.45, vHelixKvStrain)
);
float hVortGlow = clamp(abs(vHelixFluidVort) * 0.42, 0.0, 0.55);

gl_FragColor.rgb += hSssTint * uHelixSssStrength * (0.14 + 0.24 * vHelixCurlEnergy);
gl_FragColor.rgb += hKvTint * uHelixSssStrength * hVortGlow * 0.26;

float hCauchySpreadR = clamp((uHelixCauchyN.x - 1.44) * 9.0, 0.05, 1.0);
float hCauchySpreadG = clamp((uHelixCauchyN.y - 1.44) * 9.0, 0.05, 1.0);
float hCauchySpreadB = clamp((uHelixCauchyN.z - 1.44) * 9.0, 0.05, 1.0);
vec3 hDispersion = vec3(hCauchySpreadR * 0.85, hCauchySpreadG * 0.98, hCauchySpreadB * 1.25);
float hPhaseMod = 0.85 + 0.15 * sin(uHelixQuantumPhase + hNdotV * 6.28318);
gl_FragColor.rgb += hDispersion * hFresnel * uHelixGlassStrength * hPhaseMod * (0.20 + 0.24 * clamp(uHelixTension, 0.0, 1.2));
#include <dithering_fragment>
`;

export interface ModuleGShaderUniformBag {
  tFluidState: { value: THREE.Texture };
  tOpcodeField: { value: THREE.DataTexture };
  uFluidTime: { value: number };
  uMeshDeformGain: { value: number };
  uNsViscosity: { value: number };
  uNsCurlGain: { value: number };
  uKvElasticityE: { value: number };
  uKvDampingEta: { value: number };
  uNemesisGamma: { value: number };
  uHelixTension: { value: number };
  uHelixCurlGain: { value: number };
  uHelixCymaticHz: { value: number };
  uHelixQuantumPhase: { value: number };
  uHelixCauchyN: { value: THREE.Vector3 };
  uHelixSssStrength: { value: number };
  uHelixGlassStrength: { value: number };
}

export interface ModuleGFluidEngineSnapshot {
  fboResolution: number;
  opcodeTexelsCount: number;
  activeInjectors: number;
  meshDeformGain: number;
  nsViscosity: number;
  nsCurlGain: number;
  kvElasticityE: number;
  kvDampingEta: number;
  nemesisGamma: number;
  gpuPassCount: number;
  opcodeDataHash: number;
}

/**
 * Empaqueta los opcodes compilados de Helix VM en una DataTexture RGBA (32×1)
 * para lectura directa O(1) en los shaders WebGL de Navier-Stokes y Kelvin-Voigt.
 */
export function encodeVmOpcodesToFluidDataTexture(
  profile: OpcodeForceFieldProfile,
  existingTexture?: THREE.DataTexture,
): { texture: THREE.DataTexture; hash: number; activeCount: number } {
  const data =
    existingTexture && existingTexture.image.data instanceof Uint8Array
      ? existingTexture.image.data
      : new Uint8Array(HELIX_OPCODE_TEXELS * 4);

  data.fill(128);
  const count = Math.min(HELIX_OPCODE_TEXELS, profile.injectors.length);
  let hash = 2166136261;

  for (let i = 0; i < count; i++) {
    const inj = profile.injectors[i];
    const off = i * 4;
    const r = Math.max(0, Math.min(255, Math.round(inj.uNorm * 255)));
    const g = Math.max(0, Math.min(255, Math.round(inj.vNorm * 255)));
    const b = Math.max(
      0,
      Math.min(255, Math.round((Math.max(-1, Math.min(1, inj.targetStrain)) * 0.5 + 0.5) * 255)),
    );
    const signedW = Math.max(-1, Math.min(1, inj.vorticitySign * (inj.weight / 1.5)));
    const a = Math.max(0, Math.min(255, Math.round((signedW * 0.5 + 0.5) * 255)));

    data[off] = r;
    data[off + 1] = g;
    data[off + 2] = b;
    data[off + 3] = a;

    hash ^= (r << 16) ^ (g << 8) ^ b ^ a;
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  if (existingTexture) {
    existingTexture.needsUpdate = true;
    return { texture: existingTexture, hash, activeCount: count };
  }

  const texture = new THREE.DataTexture(
    data,
    HELIX_OPCODE_TEXELS,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, hash, activeCount: count };
}

/**
 * Inyecta los shaders WebGL de deformación Navier-Stokes + Kelvin-Voigt + Óptica Cauchy/SSS
 * en cualquier MeshPhysicalMaterial / MeshStandardMaterial de Three.js.
 */
export function attachHelixFluidKelvinVoigtShader(
  material: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial,
  uniforms: ModuleGShaderUniformBag,
  cacheTag = 'helix-module-g-ns-kv-v1',
): void {
  material.customProgramCacheKey = () => cacheTag;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tFluidState = uniforms.tFluidState;
    shader.uniforms.tOpcodeField = uniforms.tOpcodeField;
    shader.uniforms.uFluidTime = uniforms.uFluidTime;
    shader.uniforms.uMeshDeformGain = uniforms.uMeshDeformGain;
    shader.uniforms.uHelixTension = uniforms.uHelixTension;
    shader.uniforms.uHelixCurlGain = uniforms.uHelixCurlGain;
    shader.uniforms.uHelixCymaticHz = uniforms.uHelixCymaticHz;
    shader.uniforms.uHelixQuantumPhase = uniforms.uHelixQuantumPhase;
    shader.uniforms.uHelixCauchyN = uniforms.uHelixCauchyN;
    shader.uniforms.uHelixSssStrength = uniforms.uHelixSssStrength;
    shader.uniforms.uHelixGlassStrength = uniforms.uHelixGlassStrength;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HELIX_MESH_KV_DEFORM_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', HELIX_MESH_KV_DEFORM_VERTEX_CHUNK);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HELIX_MESH_KV_DEFORM_FRAGMENT_PARS}`)
      .replace('#include <dithering_fragment>', HELIX_MESH_KV_DEFORM_FRAGMENT_CHUNK);
  };
}

/**
 * Motor GPGPU Ping-Pong WebGL para Navier-Stokes + Kelvin-Voigt acoplado a opcodes de la VM.
 * Funciona de forma determinista y sin extensiones float obligatorias (100% compatible SwiftShader/WebGL2).
 */
export class HelixWebGLFluidEngine {
  readonly fboSize = HELIX_FLUID_FBO_SIZE;
  readonly opcodeTexture: THREE.DataTexture;
  readonly sharedUniforms: ModuleGShaderUniformBag;

  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private ping = true;
  private simScene: THREE.Scene;
  private simCamera: THREE.OrthographicCamera;
  private simQuadGeo: THREE.PlaneGeometry;
  private simMaterial: THREE.ShaderMaterial;
  private simMesh: THREE.Mesh;

  private activeInjectors = 1;
  private opcodeDataHash = 0;
  private gpuPassCount = 0;
  private impulse = 0.65;

  constructor(initialProfile: OpcodeForceFieldProfile, initialCauchyN = new THREE.Vector3(1.465, 1.471, 1.48)) {
    const encoded = encodeVmOpcodesToFluidDataTexture(initialProfile);
    this.opcodeTexture = encoded.texture;
    this.activeInjectors = encoded.activeCount;
    this.opcodeDataHash = encoded.hash;

    const rtOpts: THREE.RenderTargetOptions = {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };

    this.rtA = new THREE.WebGLRenderTarget(this.fboSize, this.fboSize, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(this.fboSize, this.fboSize, rtOpts);

    this.sharedUniforms = {
      tFluidState: { value: this.rtA.texture },
      tOpcodeField: { value: this.opcodeTexture },
      uFluidTime: { value: 0 },
      uMeshDeformGain: { value: 1.0 },
      uNsViscosity: { value: initialProfile.kinematicViscosity },
      uNsCurlGain: { value: initialProfile.curlStrength },
      uKvElasticityE: { value: initialProfile.elasticityE },
      uKvDampingEta: { value: initialProfile.dampingEta },
      uNemesisGamma: { value: initialProfile.nemesisGamma },
      uHelixTension: { value: 0.5 },
      uHelixCurlGain: { value: initialProfile.curlStrength },
      uHelixCymaticHz: { value: initialProfile.dominantFrequencyHz },
      uHelixQuantumPhase: { value: 0.7854 },
      uHelixCauchyN: { value: initialCauchyN.clone() },
      uHelixSssStrength: { value: 0.65 },
      uHelixGlassStrength: { value: 0.6 },
    };

    this.simMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tPrevState: { value: this.rtA.texture },
        tOpcodeField: { value: this.opcodeTexture },
        uTexelSize: { value: new THREE.Vector2(1 / this.fboSize, 1 / this.fboSize) },
        uFluidTime: this.sharedUniforms.uFluidTime,
        uFluidDt: { value: 1 / 60 },
        uNsViscosity: this.sharedUniforms.uNsViscosity,
        uNsCurlGain: this.sharedUniforms.uNsCurlGain,
        uKvElasticityE: this.sharedUniforms.uKvElasticityE,
        uKvDampingEta: this.sharedUniforms.uKvDampingEta,
        uNemesisGamma: this.sharedUniforms.uNemesisGamma,
        uOpcodeImpulse: { value: this.impulse },
        uOpcodeCount: { value: this.activeInjectors },
      },
      vertexShader: HELIX_NS_KV_SIM_VERTEX_SHADER,
      fragmentShader: HELIX_NS_KV_SIM_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
    });

    this.simQuadGeo = new THREE.PlaneGeometry(2, 2);
    this.simMesh = new THREE.Mesh(this.simQuadGeo, this.simMaterial);
    this.simScene = new THREE.Scene();
    this.simScene.add(this.simMesh);
    this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Inicializa los Ping-Pong FBOs al estado de reposo neutro (0.5, 0.5, 0.5, 0.5) = (u=0, ε=0, ω=0).
   */
  resetBuffers(renderer: THREE.WebGLRenderer): void {
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();

    renderer.setClearColor(new THREE.Color(0.5, 0.5, 0.5), 0.5);
    renderer.setRenderTarget(this.rtA);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(this.rtB);
    renderer.clear(true, false, false);

    renderer.setClearColor(prevClear, prevAlpha);
    renderer.setRenderTarget(prevTarget);
  }

  syncOpcodes(profile: OpcodeForceFieldProfile): ModuleGFluidEngineSnapshot {
    const encoded = encodeVmOpcodesToFluidDataTexture(profile, this.opcodeTexture);
    this.activeInjectors = encoded.activeCount;
    this.opcodeDataHash = encoded.hash;

    this.sharedUniforms.uNsViscosity.value = profile.kinematicViscosity;
    this.sharedUniforms.uNsCurlGain.value = profile.curlStrength;
    this.sharedUniforms.uKvElasticityE.value = profile.elasticityE;
    this.sharedUniforms.uKvDampingEta.value = profile.dampingEta;
    this.sharedUniforms.uNemesisGamma.value = profile.nemesisGamma;
    this.sharedUniforms.uHelixCurlGain.value = profile.curlStrength;
    this.sharedUniforms.uHelixCymaticHz.value = profile.dominantFrequencyHz;
    this.simMaterial.uniforms.uOpcodeCount.value = encoded.activeCount;
    this.impulse = Math.max(this.impulse, 0.85);

    return this.getSnapshot();
  }

  pulse(strength = 1.2): void {
    this.impulse = Math.max(this.impulse, Math.min(2.0, strength));
  }

  step(
    renderer: THREE.WebGLRenderer,
    dtSec: number,
    overrides: BiopixelPhysicsOverrides = {},
    meshDeformGain = 1.0,
  ): void {
    const dt = Math.min(0.033, Math.max(0.001, dtSec));
    this.sharedUniforms.uFluidTime.value += dt;
    this.sharedUniforms.uMeshDeformGain.value = meshDeformGain;
    this.impulse = Math.max(0, this.impulse * Math.exp(-dt * 1.15));

    if (overrides.curlStrength !== undefined) {
      this.sharedUniforms.uNsCurlGain.value = overrides.curlStrength;
      this.sharedUniforms.uHelixCurlGain.value = overrides.curlStrength;
    }
    if (overrides.elasticityE !== undefined) {
      this.sharedUniforms.uKvElasticityE.value = overrides.elasticityE;
    }
    if (overrides.dampingEta !== undefined) {
      this.sharedUniforms.uKvDampingEta.value = overrides.dampingEta;
    }

    this.simMaterial.uniforms.uFluidDt.value = dt;
    this.simMaterial.uniforms.uOpcodeImpulse.value = this.impulse;

    const readRt = this.ping ? this.rtA : this.rtB;
    const writeRt = this.ping ? this.rtB : this.rtA;
    this.simMaterial.uniforms.tPrevState.value = readRt.texture;

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(writeRt);
    renderer.render(this.simScene, this.simCamera);
    renderer.setRenderTarget(prevTarget);

    this.sharedUniforms.tFluidState.value = writeRt.texture;
    this.ping = !this.ping;
    this.gpuPassCount += 1;
  }

  getSnapshot(): ModuleGFluidEngineSnapshot {
    return {
      fboResolution: this.fboSize,
      opcodeTexelsCount: HELIX_OPCODE_TEXELS,
      activeInjectors: this.activeInjectors,
      meshDeformGain: this.sharedUniforms.uMeshDeformGain.value,
      nsViscosity: this.sharedUniforms.uNsViscosity.value,
      nsCurlGain: this.sharedUniforms.uNsCurlGain.value,
      kvElasticityE: this.sharedUniforms.uKvElasticityE.value,
      kvDampingEta: this.sharedUniforms.uKvDampingEta.value,
      nemesisGamma: this.sharedUniforms.uNemesisGamma.value,
      gpuPassCount: this.gpuPassCount,
      opcodeDataHash: this.opcodeDataHash,
    };
  }

  dispose(): void {
    this.rtA.dispose();
    this.rtB.dispose();
    this.opcodeTexture.dispose();
    this.simQuadGeo.dispose();
    this.simMaterial.dispose();
  }
}

import { PrimitiveToken, RUNES, TOKEN_BY_GLYPH } from '../data/runes';
import { CompoundWord } from '../data/vocabulary';
import {
  BlochState,
  CAUCHY_SPECTRAL_LINES_NM,
  computeCauchySpectralTriple,
  createBlochState,
  createPauliSoAPhysicsState,
  evaluateWeberFechnerFrame,
  evolveSchrodingerPauli,
  PauliSoAPhysicsState,
  stepNemesisCauchy,
  stepPauliSoAPhysics,
} from './helixPhysics';
import {
  createSoABuffer,
  packToSoABuffer,
  SoAHolographicBuffer,
  Z4Symbol,
} from './helixSignal';
import {
  compileHelixScript,
  ProgramVerificationReport,
  verifyHelixProgram,
} from './helixVm';

export type CauchySpectralTriple = ReturnType<typeof computeCauchySpectralTriple>;

export interface SiliconUniformSnapshot {
  uTime: number;
  uTension: number;
  uCurlGain: number;
  uNemesisGamma: number;
  uCymaticHz: number;
  uQuantumPhase: number;
  uBlochNormSq: number;
  uCauchyN: [number, number, number];
  uSssStrength: number;
  uGlassStrength: number;
  weberDecision: 'RENDER_FRAME' | 'SKIP_FRAME';
}

export interface TokenPauliBridgeState {
  soaBuffer: SoAHolographicBuffer;
  phys: PauliSoAPhysicsState;
  bloch: BlochState;
  cauchyTriple: CauchySpectralTriple;
  activeRunes: PrimitiveToken[];
  dominantRune: PrimitiveToken;
  cymaticHz: number;
  curlGain: number;
  nemesisGamma: number;
  weberThresholdK: number;
  impulseEnvelope: number;
  lastTension: number;
  lastMetric: number;
  timeSec: number;
  renderedFrames: number;
  skippedFrames: number;
  lastWeberDecision: 'RENDER_FRAME' | 'SKIP_FRAME';
  smtVerified: boolean;
  smtLatencyMs: number;
  lastRejectedReason: string | null;
  lastImpulseLabel: string;
}

export interface SiliconBridgeTelemetrySnapshot {
  capacityCells: number;
  byteLength: number;
  strideBytes: number;
  tension: number;
  impulseEnvelope: number;
  cymaticHz: number;
  dominantGlyph: string;
  dominantName: string;
  cauchyRed: number;
  cauchyGreen: number;
  cauchyBlue: number;
  blochNormSq: number;
  blochTheta: number;
  renderedFrames: number;
  skippedFrames: number;
  lastWeberDecision: 'RENDER_FRAME' | 'SKIP_FRAME';
  smtVerified: boolean;
  smtLatencyMs: number;
  lastRejectedReason: string | null;
  lastImpulseLabel: string;
}

export const BIO_OPTIC_3D_PROGRAM = `# Núcleo Bio-Óptico HELIX: Pauli-SoA + SSS + Glasmorfismo + Cauchy (700/546.1/435.8 nm)
ᛇᚢ
ᛗᚦ optic_lead
SOA_INIT 32
CURL_STEP 0.55 0.008
NEMESIS_DECAY 0.055
BLOCH_ROT 0 1 0 1.25 0.016
WEBER_GUARD 0.015
MESH_NODE bio_core lathe 780 1.18
MAT_ORM bio_core 0.94 0.18 0.28
MESH_NODE cymatic_halo torus 1024 0.96
MAT_ORM cymatic_halo 0.96 0.12 0.88
LOOP 3
  MESH_NODE fin_optic extrude 260 0.78
END
MAT_ORM fin_optic 0.92 0.20 0.65
CAM_6DOF 3.2 2.1 3.5 38 22 44
WS_EMIT bio_optic cauchy_sss_ready
ᚳᛏ`;

/**
 * Inyecta uniformes GLSL y desplazamiento Curl-Noise + onda cimática Kelvin-Voigt
 * controlado estrictamente por uHelixTension (retorna a 0.0f con la Ley Némesis).
 */
export const HELIX_OPTIC_VERTEX_PARS = `
uniform float uHelixTime;
uniform float uHelixTension;
uniform float uHelixCurlGain;
uniform float uHelixCymaticHz;
uniform float uHelixQuantumPhase;
varying vec3 vHelixWorldPos;
varying vec3 vHelixWorldNormal;
varying float vHelixCurlEnergy;
`;

export const HELIX_OPTIC_VERTEX_DISPLACE = `
#include <begin_vertex>
vec3 hPos = transformed;
float hFreq = clamp(uHelixCymaticHz / 220.0, 1.0, 4.0);
vec3 hCurl = vec3(
  cos(hPos.y * hFreq + uHelixTime * 2.4 + uHelixQuantumPhase) - sin(hPos.z * hFreq + uHelixTime * 1.9),
  cos(hPos.z * hFreq - uHelixTime * 2.1) - sin(hPos.x * hFreq + uHelixTime * 2.3),
  cos(hPos.x * hFreq + uHelixTime * 1.8) - sin(hPos.y * hFreq - uHelixTime * 2.6)
);
float hWave = sin(hPos.y * 5.2 - uHelixTime * 4.5 + uHelixQuantumPhase);
float hAmp = clamp(uHelixTension, 0.0, 1.8) * (0.028 * clamp(uHelixCurlGain, 0.1, 1.5));
transformed += (hCurl * 0.65 + objectNormal * hWave * 0.35) * hAmp;
vHelixCurlEnergy = clamp(uHelixTension * 0.55 + abs(hWave) * hAmp * 8.0, 0.0, 1.0);
vec4 hWorldPos = modelMatrix * vec4(transformed, 1.0);
vHelixWorldPos = hWorldPos.xyz;
vHelixWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

/**
 * Sombreado Subsuperficial (SSS) + Glasmorfismo Fresnel + Dispersión Óptica de Cauchy
 * (700.0 nm Rojo / 546.1 nm Verde / 435.8 nm Azul) directamente en GLSL sin texturas 8K.
 */
export const HELIX_OPTIC_FRAGMENT_PARS = `
uniform float uHelixTension;
uniform float uHelixQuantumPhase;
uniform vec3 uHelixCauchyN;
uniform float uHelixSssStrength;
uniform float uHelixGlassStrength;
varying vec3 vHelixWorldPos;
varying vec3 vHelixWorldNormal;
varying float vHelixCurlEnergy;
`;

export const HELIX_OPTIC_FRAGMENT_SSS_CAUCHY = `
vec3 hN = normalize(vHelixWorldNormal);
vec3 hV = normalize(cameraPosition - vHelixWorldPos);
float hNdotV = clamp(dot(hN, hV), 0.0, 1.0);
float hFresnel = pow(1.0 - hNdotV, 3.0);

// Wrap-diffuse Subsurface Scattering (SSS) sin texturas pesadas
vec3 hKeyDir = normalize(vec3(0.55, 0.80, 0.50));
float hWrap = clamp((dot(hN, hKeyDir) + 0.55) / 1.55, 0.0, 1.0);
float hBackScatter = pow(clamp(dot(hV, -hKeyDir) * 0.5 + 0.5, 0.0, 1.0), 2.5);
vec3 hSssTint = vec3(0.16, 0.58, 0.86) * hWrap + vec3(0.92, 0.42, 0.32) * hBackScatter * 0.45;
gl_FragColor.rgb += hSssTint * uHelixSssStrength * (0.14 + 0.24 * vHelixCurlEnergy);

// Dispersión cromática de Cauchy n(lambda) para 700nm / 546.1nm / 435.8nm en bordes glasmórficos
float hCauchySpreadR = clamp((uHelixCauchyN.x - 1.44) * 9.0, 0.05, 1.0);
float hCauchySpreadG = clamp((uHelixCauchyN.y - 1.44) * 9.0, 0.05, 1.0);
float hCauchySpreadB = clamp((uHelixCauchyN.z - 1.44) * 9.0, 0.05, 1.0);
vec3 hDispersion = vec3(hCauchySpreadR * 0.85, hCauchySpreadG * 0.98, hCauchySpreadB * 1.25);
float hPhaseMod = 0.85 + 0.15 * sin(uHelixQuantumPhase + hNdotV * 6.28318);
gl_FragColor.rgb += hDispersion * hFresnel * uHelixGlassStrength * hPhaseMod * (0.22 + 0.25 * clamp(uHelixTension, 0.0, 1.2));
#include <dithering_fragment>
`;

const DEFAULT_DOMINANT_RUNE: PrimitiveToken = TOKEN_BY_GLYPH.get('ᚩ') ?? RUNES[3];

function extractRunesFromCompiled(glyphLines: string[]): PrimitiveToken[] {
  const seen = new Set<string>();
  const out: PrimitiveToken[] = [];
  for (const line of glyphLines) {
    for (const ch of line) {
      const rune = TOKEN_BY_GLYPH.get(ch);
      if (rune && !seen.has(rune.glyph)) {
        seen.add(rune.glyph);
        out.push(rune);
      }
    }
  }
  if (out.length === 0) {
    for (const g of ['ᛇ', 'ᚢ', 'ᚩ', 'ᚳ']) {
      const r = TOKEN_BY_GLYPH.get(g);
      if (r) out.push(r);
    }
  }
  return out;
}

export function createSiliconBridgeState(capacity = 32): TokenPauliBridgeState {
  const cap = Math.max(4, Math.min(256, Math.round(capacity)));
  const cauchyTriple = computeCauchySpectralTriple();
  const state: TokenPauliBridgeState = {
    soaBuffer: createSoABuffer(cap),
    phys: createPauliSoAPhysicsState(cap),
    bloch: createBlochState(Math.PI / 4, 0),
    cauchyTriple,
    activeRunes: [DEFAULT_DOMINANT_RUNE],
    dominantRune: DEFAULT_DOMINANT_RUNE,
    cymaticHz: DEFAULT_DOMINANT_RUNE.frequencyHz,
    curlGain: 0.45,
    nemesisGamma: 0.055,
    weberThresholdK: 0.015,
    impulseEnvelope: 0,
    lastTension: 0,
    lastMetric: 0,
    timeSec: 0,
    renderedFrames: 0,
    skippedFrames: 0,
    lastWeberDecision: 'RENDER_FRAME',
    smtVerified: true,
    smtLatencyMs: 0,
    lastRejectedReason: null,
    lastImpulseLabel: 'Inicializado en reposo (0.0f)',
  };

  for (let i = 0; i < cap; i++) {
    const angle = i * 2.399963229728653;
    const rad = 0.25 + (i / cap) * 0.75;
    packToSoABuffer(
      state.soaBuffer,
      i,
      Math.cos(angle) * rad,
      (i / cap - 0.5) * 0.6,
      Math.sin(angle) * rad,
      0,
      0,
      0.35,
      (i % 4) as Z4Symbol,
    );
  }
  return state;
}

/**
 * Traduce un script Helix validado directamente a memoria Pauli-SoA (28 B/celda, Zero-GC).
 * Blindaje SMT Inviolable: si verifyHelixProgram devuelve RECHAZADO, no modifica ni SoA ni GPU.
 */
export function syncScriptToSiliconBridge(
  state: TokenPauliBridgeState,
  script: string,
  vocabulary?: CompoundWord[],
): {
  accepted: boolean;
  verification: ProgramVerificationReport;
  activeRunesCount: number;
} {
  const instructions = compileHelixScript(script, vocabulary);
  const verification = verifyHelixProgram(instructions);
  const smtLatencyMs = verification.symbolic?.smtLatencyMs ?? 0;
  state.smtLatencyMs = smtLatencyMs;

  if (verification.status === 'RECHAZADO') {
    state.smtVerified = false;
    const firstErr = verification.findings.find((f) => f.severity === 'ERROR');
    state.lastRejectedReason = firstErr
      ? `L${firstErr.lineNumber} [${firstErr.rule}]: ${firstErr.detail}`
      : 'Violación formal detectada por Z3 SMT';
    return {
      accepted: false,
      verification,
      activeRunesCount: state.activeRunes.length,
    };
  }

  let requestedCap = state.soaBuffer.capacity;
  let nextCurlGain = 0.45;
  let nextNemesisGamma = 0.055;
  let nextWeberK = 0.015;
  let blochAxis: [number, number, number] = [0, 1, 0];
  let blochOmega = 1.1;

  for (const inst of instructions) {
    if (inst.opcode === 'SOA_INIT') {
      const cap = Math.round(Number(inst.args[0]));
      if (Number.isFinite(cap) && cap >= 4 && cap <= 256) {
        requestedCap = cap;
      }
    } else if (inst.opcode === 'CURL_STEP') {
      const g = Number(inst.args[0]);
      if (Number.isFinite(g) && g > 0 && g <= 4) {
        nextCurlGain = g;
      }
    } else if (inst.opcode === 'NEMESIS_DECAY') {
      const g = Number(inst.args[0]);
      if (Number.isFinite(g) && g >= 0.005 && g < 1) {
        nextNemesisGamma = g;
      }
    } else if (inst.opcode === 'WEBER_GUARD') {
      const k = Number(inst.args[0]);
      if (Number.isFinite(k) && k > 0 && k < 0.5) {
        nextWeberK = k;
      }
    } else if (inst.opcode === 'BLOCH_ROT') {
      const nx = Number(inst.args[0] ?? 0);
      const ny = Number(inst.args[1] ?? 1);
      const nz = Number(inst.args[2] ?? 0);
      const om = Number(inst.args[3] ?? 1.1);
      if (Math.hypot(nx, ny, nz) > 0 && Number.isFinite(om)) {
        blochAxis = [nx, ny, nz];
        blochOmega = om;
      }
    }
  }

  if (requestedCap !== state.soaBuffer.capacity) {
    state.soaBuffer = createSoABuffer(requestedCap);
    state.phys = createPauliSoAPhysicsState(requestedCap);
  }

  const activeRunes = extractRunesFromCompiled(instructions.map((i) => i.glyphs));
  const preferred =
    activeRunes.find((r) => r.glyph === 'ᚩ') ?? activeRunes[activeRunes.length - 1] ?? DEFAULT_DOMINANT_RUNE;
  const meanHz =
    activeRunes.reduce((acc, r) => acc + r.frequencyHz, 0) / Math.max(1, activeRunes.length);

  state.activeRunes = activeRunes;
  state.dominantRune = preferred;
  state.cymaticHz = Number(meanHz.toFixed(4));
  state.curlGain = nextCurlGain;
  state.nemesisGamma = nextNemesisGamma;
  state.weberThresholdK = nextWeberK;
  state.smtVerified = true;
  state.lastRejectedReason = null;

  const cap = state.soaBuffer.capacity;
  for (let i = 0; i < cap; i++) {
    const rune = activeRunes[i % activeRunes.length];
    const angle = i * 2.399963229728653 + (rune.prime % 11) * 0.25;
    const rad = 0.25 + (i / cap) * 0.75;
    const amp = rune.frequencyHz / 520;
    packToSoABuffer(
      state.soaBuffer,
      i,
      Math.cos(angle) * rad,
      (i / cap - 0.5) * 0.6,
      Math.sin(angle) * rad,
      0,
      0,
      amp,
      (rune.prime % 4) as Z4Symbol,
    );
    state.phys.tension[i] = 0.35 + (rune.prime / 137) * 0.45;
    state.phys.vx[i] = Math.cos(angle) * 0.14;
    state.phys.vy[i] = Math.sin(angle * 0.5) * 0.1;
    state.phys.vz[i] = Math.sin(angle) * 0.14;
  }

  state.bloch = evolveSchrodingerPauli(state.bloch, blochAxis, blochOmega, 1 / 60);
  state.impulseEnvelope = 0.78;
  state.lastTension = 0.78;
  state.lastMetric = -1;
  state.lastImpulseLabel = `Sync SMT OK (${activeRunes.length} runas · ${state.cymaticHz.toFixed(2)} Hz)`;

  return {
    accepted: true,
    verification,
    activeRunesCount: activeRunes.length,
  };
}

/**
 * Inyecta un impulso Token -> Tensión directo en memoria Pauli-SoA (p.ej. Ansuz/STR 457.84 Hz).
 * Respeta estrictamente el blindaje SMT.
 */
export function injectTokenImpulse(
  state: TokenPauliBridgeState,
  glyphOrName = 'ᚩ',
  strength = 0.95,
): { applied: boolean; detail: string } {
  if (!state.smtVerified) {
    return {
      applied: false,
      detail: 'Impulso bloqueado: blindaje Z3 SMT en estado RECHAZADO.',
    };
  }

  const normalized = glyphOrName.trim().toUpperCase();
  const matchedRune =
    TOKEN_BY_GLYPH.get(glyphOrName.trim()) ??
    RUNES.find((r) => r.name.toUpperCase() === normalized || r.osTag.toUpperCase() === normalized) ??
    DEFAULT_DOMINANT_RUNE;

  state.dominantRune = matchedRune;
  state.cymaticHz = matchedRune.frequencyHz;
  const clampedStrength = Math.max(0.1, Math.min(1.6, strength));

  const cap = state.soaBuffer.capacity;
  const omega = (matchedRune.frequencyHz / 440) * Math.PI;
  for (let i = 0; i < cap; i++) {
    const phase = (i / cap) * Math.PI * 2 + omega;
    state.phys.tension[i] = Math.min(1.8, state.phys.tension[i] * 0.3 + clampedStrength);
    state.phys.vx[i] += Math.cos(phase) * clampedStrength * 0.35;
    state.phys.vy[i] += Math.sin(phase * 1.5) * clampedStrength * 0.25;
    state.phys.vz[i] += Math.sin(phase) * clampedStrength * 0.35;
    state.soaBuffer.phaseQuad[i] = matchedRune.prime % 4;
  }

  state.bloch = evolveSchrodingerPauli(
    state.bloch,
    [0.2, 0.9, 0.4],
    matchedRune.frequencyHz / 180,
    1 / 60,
  );
  state.impulseEnvelope = Math.max(state.impulseEnvelope, clampedStrength);
  state.lastTension = state.impulseEnvelope;
  state.lastMetric = -1;
  state.lastImpulseLabel = `${matchedRune.glyph} ${matchedRune.name} (${matchedRune.frequencyHz.toFixed(2)} Hz)`;

  return {
    applied: true,
    detail: `Impulso ${state.lastImpulseLabel} inyectado en Pauli-SoA (${cap}×28 B).`,
  };
}

/**
 * Avanza un tick de física Pauli-SoA (Curl Noise + Kelvin-Voigt + Ley Némesis de Cauchy)
 * y aplica el filtrado psicofísico de Weber-Fechner (RENDER_FRAME / SKIP_FRAME).
 */
export function stepSiliconBridgeFrame(
  state: TokenPauliBridgeState,
  dtSec: number,
  opticEnabled = true,
): SiliconUniformSnapshot {
  const dt = Math.min(0.05, Math.max(0.001, dtSec));
  state.timeSec += dt;

  // Ley Némesis de Cauchy: decaimiento exponencial garantizado hacia el suelo térmico 0.0f
  state.impulseEnvelope = stepNemesisCauchy(state.impulseEnvelope, state.nemesisGamma);
  if (state.impulseEnvelope < 1e-6) {
    state.impulseEnvelope = 0;
  }

  const effectiveCurlGain = state.curlGain * state.impulseEnvelope;
  const physReport = stepPauliSoAPhysics(
    state.soaBuffer,
    state.phys,
    state.timeSec,
    dt,
    {
      curlGain: effectiveCurlGain,
      nemesisGamma: state.nemesisGamma,
    },
  );

  if (state.impulseEnvelope > 1e-4) {
    state.bloch = evolveSchrodingerPauli(
      state.bloch,
      [0, 1, 0],
      Math.max(0.4, state.cymaticHz / 350),
      dt,
    );
  }

  const rawTension = physReport.maxTension + state.impulseEnvelope * 0.45;
  const uTension = rawTension < 1e-5 ? 0 : Math.min(1.8, rawTension);
  state.lastTension = uTension;

  const currentMetric = uTension + physReport.meanTension * 0.5;
  let weberDecision: 'RENDER_FRAME' | 'SKIP_FRAME';

  if (state.lastMetric < 0) {
    weberDecision = 'RENDER_FRAME';
    state.lastMetric = currentMetric;
  } else {
    const wf = evaluateWeberFechnerFrame(
      state.lastMetric,
      currentMetric,
      state.weberThresholdK,
    );
    weberDecision = wf.decision;
    if (weberDecision === 'RENDER_FRAME') {
      state.lastMetric = currentMetric;
    }
  }

  if (weberDecision === 'SKIP_FRAME') {
    state.skippedFrames += 1;
  } else {
    state.renderedFrames += 1;
  }
  state.lastWeberDecision = weberDecision;

  return {
    uTime: state.timeSec,
    uTension,
    uCurlGain: state.curlGain,
    uNemesisGamma: state.nemesisGamma,
    uCymaticHz: state.cymaticHz,
    uQuantumPhase: state.bloch.theta + state.bloch.phi,
    uBlochNormSq: state.bloch.normSq,
    uCauchyN: [
      state.cauchyTriple.nRed,
      state.cauchyTriple.nGreen,
      state.cauchyTriple.nBlue,
    ],
    uSssStrength: opticEnabled ? 0.65 : 0.0,
    uGlassStrength: opticEnabled ? 0.6 : 0.0,
    weberDecision,
  };
}

export function getSiliconBridgeTelemetry(
  state: TokenPauliBridgeState,
): SiliconBridgeTelemetrySnapshot {
  return {
    capacityCells: state.soaBuffer.capacity,
    byteLength: state.soaBuffer.backingBuffer.byteLength,
    strideBytes: state.soaBuffer.strideBytes,
    tension: state.lastTension,
    impulseEnvelope: state.impulseEnvelope,
    cymaticHz: state.cymaticHz,
    dominantGlyph: state.dominantRune.glyph,
    dominantName: state.dominantRune.name,
    cauchyRed: state.cauchyTriple.nRed,
    cauchyGreen: state.cauchyTriple.nGreen,
    cauchyBlue: state.cauchyTriple.nBlue,
    blochNormSq: state.bloch.normSq,
    blochTheta: state.bloch.theta,
    renderedFrames: state.renderedFrames,
    skippedFrames: state.skippedFrames,
    lastWeberDecision: state.lastWeberDecision,
    smtVerified: state.smtVerified,
    smtLatencyMs: state.smtLatencyMs,
    lastRejectedReason: state.lastRejectedReason,
    lastImpulseLabel: state.lastImpulseLabel,
  };
}

export const HELIX_CAUCHY_SPECTRAL_BANDS = CAUCHY_SPECTRAL_LINES_NM;

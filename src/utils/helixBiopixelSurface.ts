import { RUNES, TOKEN_BY_GLYPH } from '../data/runes';
import { computeCurlNoise3D, stepNemesisCauchy } from './helixPhysics';
import { stepKelvinVoigt } from './helixSignal';
import { ParsedScriptInstruction } from './helixVm';
import { derivePrimeColor } from './primeColor';

export interface OpcodeBiopixelInjector {
  lineNumber: number;
  opcode: string;
  glyphs: string;
  prime: number;
  frequencyHz: number;
  uNorm: number;
  vNorm: number;
  targetStrain: number;
  vorticitySign: 1 | -1;
  weight: number;
  colorHex: string;
  rgbNorm: [number, number, number];
}

export interface OpcodeForceFieldProfile {
  curlStrength: number;
  kinematicViscosity: number;
  elasticityE: number;
  dampingEta: number;
  nemesisGamma: number;
  reynoldsNumber: number;
  dominantFrequencyHz: number;
  injectors: OpcodeBiopixelInjector[];
  opcodeBreakdown: { opcode: string; count: number; roleLabel: string }[];
}

export interface BiopixelPhysicsOverrides {
  curlStrength?: number;
  elasticityE?: number;
  dampingEta?: number;
}

export interface BiopixelSurfaceMetrics {
  count: number;
  cols: number;
  rows: number;
  reynoldsNumber: number;
  kinematicViscosity: number;
  elasticityE: number;
  dampingEta: number;
  curlStrength: number;
  meanStrain: number;
  maxStrain: number;
  maxStress: number;
  meanVorticity: number;
  maxCurlDivergence: number;
  kineticEnergy: number;
  hysteresisPower: number;
  excitationEnvelope: number;
  activeOpcodesCount: number;
}

export interface BiopixelSurfaceState {
  readonly cols: number;
  readonly rows: number;
  readonly count: number;
  restX: Float32Array;
  restY: Float32Array;
  restZ: Float32Array;
  normX: Float32Array;
  normY: Float32Array;
  normZ: Float32Array;
  posX: Float32Array;
  posY: Float32Array;
  posZ: Float32Array;
  velX: Float32Array;
  velY: Float32Array;
  velZ: Float32Array;
  nextVelX: Float32Array;
  nextVelY: Float32Array;
  nextVelZ: Float32Array;
  strain: Float32Array;
  strainVel: Float32Array;
  stress: Float32Array;
  vorticity: Float32Array;
  baseR: Float32Array;
  baseG: Float32Array;
  baseB: Float32Array;
  uCoord: Float32Array;
  vCoord: Float32Array;
  profile: OpcodeForceFieldProfile;
  timeSec: number;
  excitationEnvelope: number;
  lastMetrics: BiopixelSurfaceMetrics;
}

function classifyOpcodeEffect(inst: ParsedScriptInstruction): {
  targetStrain: number;
  vorticitySign: 1 | -1;
  weight: number;
  roleLabel: string;
} {
  const op = inst.opcode;
  switch (op) {
    case 'CURL_STEP': {
      const argGain = Number(inst.args[0]);
      const gain = Number.isFinite(argGain) && argGain > 0 ? Math.min(1.4, argGain) : 0.75;
      return {
        targetStrain: 0.42 * gain,
        vorticitySign: 1,
        weight: 1.35,
        roleLabel: 'Vorticidad Rotacional NS',
      };
    }
    case 'SOA_INIT':
    case 'MEM_ALLOC':
    case 'MEM_INIT':
      return {
        targetStrain: 0.52,
        vorticitySign: 1,
        weight: 1.15,
        roleLabel: 'Presión Osmótica / Expansión',
      };
    case 'MEM_FREE':
    case 'NEMESIS_DECAY':
      return {
        targetStrain: -0.44,
        vorticitySign: -1,
        weight: 1.05,
        roleLabel: 'Relajación / Retracción Térmica',
      };
    case 'MEM_LOCK':
    case 'WEBER_GUARD':
      return {
        targetStrain: -0.18,
        vorticitySign: -1,
        weight: 0.9,
        roleLabel: 'Rigidez Estructural E↑',
      };
    case 'BLOCH_ROT':
    case 'BVN_LATTICE':
      return {
        targetStrain: 0.36,
        vorticitySign: 1,
        weight: 1.25,
        roleLabel: 'Precesión Cuántica / Fase',
      };
    case 'MESH_NODE':
      return {
        targetStrain: 0.48,
        vorticitySign: 1,
        weight: 1.2,
        roleLabel: 'Anclaje Geométrico',
      };
    case 'MAT_ORM':
      return {
        targetStrain: 0.22,
        vorticitySign: -1,
        weight: 0.95,
        roleLabel: 'Visco-amortiguamiento η',
      };
    case 'LOOP':
    case 'FN':
    case 'CALL':
      return {
        targetStrain: 0.34,
        vorticitySign: 1,
        weight: 1.1,
        roleLabel: 'Cizalladura Cíclica',
      };
    case 'WS_EMIT':
    case 'IO_BUS_TX':
      return {
        targetStrain: 0.4,
        vorticitySign: -1,
        weight: 1.05,
        roleLabel: 'Onda Cimática / Pulso TX',
      };
    case 'ADD':
    case 'MUL':
    case 'SET':
      return {
        targetStrain: 0.26,
        vorticitySign: 1,
        weight: 0.85,
        roleLabel: 'Gradiente Aritmético +',
      };
    case 'SUB':
    case 'DIV':
      return {
        targetStrain: -0.26,
        vorticitySign: -1,
        weight: 0.85,
        roleLabel: 'Gradiente Aritmético -',
      };
    default:
      return {
        targetStrain: 0.16,
        vorticitySign: inst.lineNumber % 2 === 0 ? 1 : -1,
        weight: 0.7,
        roleLabel: 'Modulación Base',
      };
  }
}

function resolveRuneMetaForInstruction(inst: ParsedScriptInstruction): {
  prime: number;
  frequencyHz: number;
  colorHex: string;
  rgbNorm: [number, number, number];
} {
  for (const ch of Array.from(inst.glyphs)) {
    const rune = TOKEN_BY_GLYPH.get(ch);
    if (rune) {
      return {
        prime: rune.prime,
        frequencyHz: rune.frequencyHz,
        colorHex: rune.colorHex,
        rgbNorm: [rune.rgb[0] / 255, rune.rgb[1] / 255, rune.rgb[2] / 255],
      };
    }
  }
  const fallbackRune = RUNES[inst.lineNumber % RUNES.length];
  const pColor = derivePrimeColor(fallbackRune.prime, 'golden', fallbackRune.index - 1);
  return {
    prime: fallbackRune.prime,
    frequencyHz: fallbackRune.frequencyHz,
    colorHex: pColor.colorHex,
    rgbNorm: [pColor.rgb[0] / 255, pColor.rgb[1] / 255, pColor.rgb[2] / 255],
  };
}

/**
 * Traduce los opcodes compilados del programa Helix en un campo físico
 * Navier-Stokes (vorticidad, viscosidad cinemática ν, Re) y Kelvin-Voigt (E, η).
 */
export function mapProgramOpcodesToBiopixelProfile(
  instructions: ParsedScriptInstruction[],
): OpcodeForceFieldProfile {
  let curlStrength = 0.58;
  let kinematicViscosity = 0.036;
  let elasticityE = 18.0;
  let dampingEta = 5.4;
  let nemesisGamma = 0.035;

  const injectors: OpcodeBiopixelInjector[] = [];
  const counts = new Map<string, { count: number; roleLabel: string }>();

  let totalFreq = 0;
  let freqCount = 0;

  for (let idx = 0; idx < instructions.length; idx++) {
    const inst = instructions[idx];
    if (!inst.opcode || inst.opcode === 'NOP') continue;

    const eff = classifyOpcodeEffect(inst);
    const meta = resolveRuneMetaForInstruction(inst);
    totalFreq += meta.frequencyHz;
    freqCount += 1;

    const prevCount = counts.get(inst.opcode);
    if (prevCount) {
      prevCount.count += 1;
    } else {
      counts.set(inst.opcode, { count: 1, roleLabel: eff.roleLabel });
    }

    if (inst.opcode === 'CURL_STEP') {
      const g = Number(inst.args[0]);
      if (Number.isFinite(g) && g > 0) curlStrength = Math.max(0.25, Math.min(2.2, g * 1.15));
      const visc = Number(inst.args[1]);
      if (Number.isFinite(visc) && visc > 0) kinematicViscosity = Math.max(0.008, Math.min(0.18, visc * 3.5));
    } else if (inst.opcode === 'NEMESIS_DECAY') {
      const gam = Number(inst.args[0]);
      if (Number.isFinite(gam) && gam > 0 && gam < 1) {
        nemesisGamma = Math.max(0.01, Math.min(0.25, gam));
        dampingEta = Math.min(14, dampingEta + gam * 28);
      }
    } else if (inst.opcode === 'MEM_LOCK' || inst.opcode === 'WEBER_GUARD') {
      elasticityE = Math.min(38, elasticityE + 3.2);
    } else if (inst.opcode === 'MEM_ALLOC' || inst.opcode === 'SOA_INIT') {
      curlStrength = Math.min(2.2, curlStrength + 0.08);
    } else if (inst.opcode === 'MAT_ORM') {
      const rough = Number(inst.args[2]);
      if (Number.isFinite(rough)) {
        dampingEta = Math.max(2.5, Math.min(14, dampingEta + rough * 2.2));
      }
    } else if (inst.opcode === 'LOOP' || inst.opcode === 'BLOCH_ROT') {
      curlStrength = Math.min(2.2, curlStrength + 0.14);
      elasticityE = Math.min(38, elasticityE + 1.4);
    }

    if (injectors.length < 28) {
      const uNorm = ((idx * 0.61803398875 + (meta.prime % 13) * 0.07) % 1 + 1) % 1;
      const vNorm = 0.15 + 0.7 * (((idx + 0.5) / Math.max(1, instructions.length)) % 1);
      injectors.push({
        lineNumber: inst.lineNumber,
        opcode: inst.opcode,
        glyphs: inst.glyphs,
        prime: meta.prime,
        frequencyHz: meta.frequencyHz,
        uNorm,
        vNorm,
        targetStrain: eff.targetStrain,
        vorticitySign: eff.vorticitySign,
        weight: eff.weight,
        colorHex: meta.colorHex,
        rgbNorm: meta.rgbNorm,
      });
    }
  }

  if (injectors.length === 0) {
    const defRune = RUNES[3];
    injectors.push({
      lineNumber: 1,
      opcode: 'CURL_STEP',
      glyphs: defRune.glyph,
      prime: defRune.prime,
      frequencyHz: defRune.frequencyHz,
      uNorm: 0.5,
      vNorm: 0.5,
      targetStrain: 0.35,
      vorticitySign: 1,
      weight: 1.0,
      colorHex: defRune.colorHex,
      rgbNorm: [defRune.rgb[0] / 255, defRune.rgb[1] / 255, defRune.rgb[2] / 255],
    });
  }

  const dominantFrequencyHz =
    freqCount > 0 ? Number((totalFreq / freqCount).toFixed(2)) : RUNES[3].frequencyHz;
  const charLength = 1.5;
  const reynoldsNumber = Number(
    ((curlStrength * charLength) / Math.max(0.005, kinematicViscosity)).toFixed(1),
  );

  const opcodeBreakdown = Array.from(counts.entries())
    .map(([opcode, info]) => ({ opcode, count: info.count, roleLabel: info.roleLabel }))
    .slice(0, 8);

  return {
    curlStrength: Number(curlStrength.toFixed(3)),
    kinematicViscosity: Number(kinematicViscosity.toFixed(4)),
    elasticityE: Number(elasticityE.toFixed(2)),
    dampingEta: Number(dampingEta.toFixed(2)),
    nemesisGamma: Number(nemesisGamma.toFixed(4)),
    reynoldsNumber,
    dominantFrequencyHz,
    injectors,
    opcodeBreakdown,
  };
}

/**
 * Construye una membrana toroidal-cúpula de biopíxeles alrededor del núcleo Helix
 * con arreglos tipados contiguos (Zero-GC durante el ciclo de animación).
 */
export function createBiopixelSurfaceState(
  instructions: ParsedScriptInstruction[] = [],
  cols = 20,
  rows = 8,
): BiopixelSurfaceState {
  const safeCols = Math.max(8, Math.min(40, Math.round(cols)));
  const safeRows = Math.max(4, Math.min(20, Math.round(rows)));
  const count = safeCols * safeRows;

  const restX = new Float32Array(count);
  const restY = new Float32Array(count);
  const restZ = new Float32Array(count);
  const normX = new Float32Array(count);
  const normY = new Float32Array(count);
  const normZ = new Float32Array(count);
  const posX = new Float32Array(count);
  const posY = new Float32Array(count);
  const posZ = new Float32Array(count);
  const velX = new Float32Array(count);
  const velY = new Float32Array(count);
  const velZ = new Float32Array(count);
  const nextVelX = new Float32Array(count);
  const nextVelY = new Float32Array(count);
  const nextVelZ = new Float32Array(count);
  const strain = new Float32Array(count);
  const strainVel = new Float32Array(count);
  const stress = new Float32Array(count);
  const vorticity = new Float32Array(count);
  const baseR = new Float32Array(count);
  const baseG = new Float32Array(count);
  const baseB = new Float32Array(count);
  const uCoord = new Float32Array(count);
  const vCoord = new Float32Array(count);

  const majorR = 1.54;
  const heightMin = 0.24;
  const heightSpan = 1.32;

  for (let row = 0; row < safeRows; row++) {
    const vNorm = safeRows > 1 ? row / (safeRows - 1) : 0.5;
    const archTheta = (vNorm - 0.5) * Math.PI * 0.72;
    const ringRadius = majorR + Math.cos(archTheta) * 0.22;
    const y = heightMin + vNorm * heightSpan;

    for (let col = 0; col < safeCols; col++) {
      const i = row * safeCols + col;
      const uNorm = col / safeCols;
      const phi = uNorm * Math.PI * 2;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      const x = ringRadius * cosPhi;
      const z = ringRadius * sinPhi;

      const nx = cosPhi * Math.cos(archTheta * 0.65);
      const ny = Math.sin(archTheta * 0.65);
      const nz = sinPhi * Math.cos(archTheta * 0.65);
      const nLen = Math.hypot(nx, ny, nz) || 1;

      restX[i] = x;
      restY[i] = y;
      restZ[i] = z;
      posX[i] = x;
      posY[i] = y;
      posZ[i] = z;
      normX[i] = nx / nLen;
      normY[i] = ny / nLen;
      normZ[i] = nz / nLen;
      uCoord[i] = uNorm;
      vCoord[i] = vNorm;
    }
  }

  const profile = mapProgramOpcodesToBiopixelProfile(instructions);
  const state: BiopixelSurfaceState = {
    cols: safeCols,
    rows: safeRows,
    count,
    restX,
    restY,
    restZ,
    normX,
    normY,
    normZ,
    posX,
    posY,
    posZ,
    velX,
    velY,
    velZ,
    nextVelX,
    nextVelY,
    nextVelZ,
    strain,
    strainVel,
    stress,
    vorticity,
    baseR,
    baseG,
    baseB,
    uCoord,
    vCoord,
    profile,
    timeSec: 0,
    excitationEnvelope: 1.0,
    lastMetrics: {
      count,
      cols: safeCols,
      rows: safeRows,
      reynoldsNumber: profile.reynoldsNumber,
      kinematicViscosity: profile.kinematicViscosity,
      elasticityE: profile.elasticityE,
      dampingEta: profile.dampingEta,
      curlStrength: profile.curlStrength,
      meanStrain: 0,
      maxStrain: 0,
      maxStress: 0,
      meanVorticity: 0,
      maxCurlDivergence: 0,
      kineticEnergy: 0,
      hysteresisPower: 0,
      excitationEnvelope: 1.0,
      activeOpcodesCount: profile.injectors.length,
    },
  };

  paintBiopixelOpcodeColors(state);
  return state;
}

function paintBiopixelOpcodeColors(state: BiopixelSurfaceState): void {
  const { count, uCoord, vCoord, baseR, baseG, baseB, profile } = state;
  const injList = profile.injectors;

  for (let i = 0; i < count; i++) {
    const u = uCoord[i];
    const v = vCoord[i];
    let wSum = 0.05;
    let rAcc = 0.08 * 0.05;
    let gAcc = 0.62 * 0.05;
    let bAcc = 0.86 * 0.05;

    for (let k = 0; k < injList.length; k++) {
      const inj = injList[k];
      let du = Math.abs(u - inj.uNorm);
      if (du > 0.5) du = 1 - du;
      const dv = v - inj.vNorm;
      const distSq = du * du * 9.0 + dv * dv * 5.0;
      const w = inj.weight * Math.exp(-distSq * 4.2);
      wSum += w;
      rAcc += inj.rgbNorm[0] * w;
      gAcc += inj.rgbNorm[1] * w;
      bAcc += inj.rgbNorm[2] * w;
    }

    baseR[i] = Math.min(1, rAcc / wSum);
    baseG[i] = Math.min(1, gAcc / wSum);
    baseB[i] = Math.min(1, bAcc / wSum);
  }
}

export function syncBiopixelSurfaceToOpcodes(
  state: BiopixelSurfaceState,
  instructions: ParsedScriptInstruction[],
): OpcodeForceFieldProfile {
  state.profile = mapProgramOpcodesToBiopixelProfile(instructions);
  paintBiopixelOpcodeColors(state);
  state.excitationEnvelope = Math.max(state.excitationEnvelope, 0.95);
  return state.profile;
}

export function triggerBiopixelOpcodePulse(
  state: BiopixelSurfaceState,
  strength = 1.0,
): void {
  const pulse = Math.max(0.25, Math.min(2.0, strength));
  state.excitationEnvelope = Math.max(state.excitationEnvelope, pulse);
  const { count, uCoord, vCoord, normX, normY, normZ, velX, velY, velZ, strainVel, profile } =
    state;

  for (let i = 0; i < count; i++) {
    const u = uCoord[i];
    const v = vCoord[i];
    let normalImpulse = 0;
    let swirlImpulse = 0;

    for (let k = 0; k < profile.injectors.length; k++) {
      const inj = profile.injectors[k];
      let du = Math.abs(u - inj.uNorm);
      if (du > 0.5) du = 1 - du;
      const dv = v - inj.vNorm;
      const kernel = inj.weight * Math.exp(-(du * du * 10 + dv * dv * 6));
      normalImpulse += inj.targetStrain * kernel;
      swirlImpulse += inj.vorticitySign * kernel;
    }

    strainVel[i] += normalImpulse * pulse * 2.2;
    // Tangential impulse perpendicular to radial normal (-nz, 0, nx)
    velX[i] += -normZ[i] * swirlImpulse * pulse * 0.45 + normX[i] * normalImpulse * 0.15;
    velY[i] += swirlImpulse * pulse * 0.25;
    velZ[i] += normX[i] * swirlImpulse * pulse * 0.45 + normZ[i] * normalImpulse * 0.15;
  }
}

/**
 * Integra un paso físico acoplado:
 * 1) Mecánica de fluidos de Navier-Stokes: rotacional incompresible (∇×ψ) + advección convectiva + difusión viscosa (ν∇²u)
 * 2) Viscoelasticidad de Kelvin-Voigt: σ = E·ε + η·dε/dt con histéresis reversible dirigida por opcodes
 */
export function stepBiopixelSurfacePhysics(
  state: BiopixelSurfaceState,
  dtSec: number,
  overrides: BiopixelPhysicsOverrides = {},
  decayMode: 'steady_oscillation' | 'nemesis_relax' = 'steady_oscillation',
): BiopixelSurfaceMetrics {
  const dt = Math.min(0.033, Math.max(0.001, dtSec));
  state.timeSec += dt;

  const {
    cols,
    rows,
    count,
    restX,
    restY,
    restZ,
    normX,
    normY,
    normZ,
    posX,
    posY,
    posZ,
    velX,
    velY,
    velZ,
    nextVelX,
    nextVelY,
    nextVelZ,
    strain,
    strainVel,
    stress,
    vorticity,
    uCoord,
    vCoord,
    profile,
  } = state;

  const curlStrength = overrides.curlStrength ?? profile.curlStrength;
  const elasticityE = overrides.elasticityE ?? profile.elasticityE;
  const dampingEta = overrides.dampingEta ?? profile.dampingEta;
  const visc = profile.kinematicViscosity;

  if (decayMode === 'nemesis_relax') {
    state.excitationEnvelope = stepNemesisCauchy(state.excitationEnvelope, profile.nemesisGamma * 0.5);
  } else {
    // Mantiene excitación mínima viva acoplada al flujo de opcodes mientras permite picos por pulsos
    state.excitationEnvelope = 0.65 + (state.excitationEnvelope - 0.65) * Math.exp(-dt * 1.4);
  }

  let maxCurlDivergence = 0;
  let sumVorticity = 0;
  let sumStrain = 0;
  let maxStrain = 0;
  let maxStress = 0;
  let kineticEnergy = 0;
  let hysteresisPower = 0;

  // Paso 1: Campo de velocidad Navier-Stokes (Curl Noise incompresible + forzamiento por opcodes + difusión ν∇²u)
  const diffAlpha = Math.min(0.22, visc * dt * 14.0);
  for (let row = 0; row < rows; row++) {
    const rUp = Math.min(rows - 1, row + 1);
    const rDn = Math.max(0, row - 1);

    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const cL = (col - 1 + cols) % cols;
      const cR = (col + 1) % cols;

      const iL = row * cols + cL;
      const iR = row * cols + cR;
      const iU = rUp * cols + col;
      const iD = rDn * cols + col;

      const rx = restX[i];
      const ry = restY[i];
      const rz = restZ[i];

      const curl = computeCurlNoise3D(rx, ry, rz, state.timeSec * 0.9, 1.35);
      const absDiv = Math.abs(curl.divergence);
      if (absDiv > maxCurlDivergence) maxCurlDivergence = absDiv;

      // Suma de fuerzas cymáticas/rotacionales de los opcodes sobre (u, v)
      const u = uCoord[i];
      const v = vCoord[i];
      let opcodeSwirl = 0;
      for (let k = 0; k < profile.injectors.length; k++) {
        const inj = profile.injectors[k];
        let du = Math.abs(u - inj.uNorm);
        if (du > 0.5) du = 1 - du;
        const dv = v - inj.vNorm;
        const kernel = inj.weight * Math.exp(-(du * du * 9.5 + dv * dv * 5.5));
        const wave = Math.sin(state.timeSec * (inj.frequencyHz / 110) + k * 0.85);
        opcodeSwirl += inj.vorticitySign * kernel * wave;
      }

      // Laplaciano discreto ∇²u de viscosidad cinemática sobre la superficie
      const lapX = velX[iL] + velX[iR] + velX[iU] + velX[iD] - 4 * velX[i];
      const lapY = velY[iL] + velY[iR] + velY[iU] + velY[iD] - 4 * velY[i];
      const lapZ = velZ[iL] + velZ[iR] + velZ[iU] + velZ[iD] - 4 * velZ[i];

      // Advección simplificada estable -(u·∇)u aproximada en grilla curvilínea
      const advX = -0.25 * velX[i] * (velX[iR] - velX[iL]);
      const advY = -0.25 * velY[i] * (velY[iU] - velY[iD]);
      const advZ = -0.25 * velZ[i] * (velZ[iR] - velZ[iL]);

      const tx = -normZ[i];
      const tz = normX[i];
      const driveScale = curlStrength * state.excitationEnvelope;

      const fx = curl.vx * driveScale * 0.95 + tx * opcodeSwirl * driveScale * 0.55;
      const fy = curl.vy * driveScale * 0.85 + opcodeSwirl * driveScale * 0.28;
      const fz = curl.vz * driveScale * 0.95 + tz * opcodeSwirl * driveScale * 0.55;

      const drag = Math.exp(-visc * 8.5 * dt);
      const nvx = Math.max(-2.2, Math.min(2.2, (velX[i] + (fx + advX) * dt) * drag + lapX * diffAlpha));
      const nvy = Math.max(-2.2, Math.min(2.2, (velY[i] + (fy + advY) * dt) * drag + lapY * diffAlpha));
      const nvz = Math.max(-2.2, Math.min(2.2, (velZ[i] + (fz + advZ) * dt) * drag + lapZ * diffAlpha));

      nextVelX[i] = nvx;
      nextVelY[i] = nvy;
      nextVelZ[i] = nvz;

      // Vorticidad local aproximada |∇×u|
      const dwZ = velY[iR] - velY[iL] - (velX[iU] - velX[iD]);
      const dwX = velZ[iU] - velZ[iD] - (velY[iR] - velY[iL]);
      const vort = 0.5 * Math.hypot(dwX, dwZ);
      vorticity[i] = vort;
      sumVorticity += vort;
    }
  }

  // Volcar buffer de velocidad sin asignar memoria (Zero-GC) + Paso 2: Viscoelasticidad Kelvin-Voigt
  for (let i = 0; i < count; i++) {
    const vx = nextVelX[i];
    const vy = nextVelY[i];
    const vz = nextVelZ[i];
    velX[i] = vx;
    velY[i] = vy;
    velZ[i] = vz;

    const u = uCoord[i];
    const v = vCoord[i];
    let targetStrain = 0;
    for (let k = 0; k < profile.injectors.length; k++) {
      const inj = profile.injectors[k];
      let du = Math.abs(u - inj.uNorm);
      if (du > 0.5) du = 1 - du;
      const dv = v - inj.vNorm;
      const kernel = inj.weight * Math.exp(-(du * du * 9.0 + dv * dv * 5.2));
      const harmonic = 0.55 + 0.45 * Math.sin(state.timeSec * (inj.frequencyHz / 120) + k * 0.7);
      targetStrain += inj.targetStrain * kernel * harmonic;
    }

    // Acoplamiento fluido-estructura: presión normal Navier-Stokes v·n excita deformación viscoelástica
    const fluidNormalPressure = (vx * normX[i] + vy * normY[i] + vz * normZ[i]) * 0.45;
    const totalTargetStrain = (targetStrain + fluidNormalPressure) * state.excitationEnvelope;

    const kv = stepKelvinVoigt(
      strain[i],
      strainVel[i],
      totalTargetStrain,
      dt,
      elasticityE,
      dampingEta,
    );

    strain[i] = kv.nextStrain;
    strainVel[i] = kv.nextVelocity;
    stress[i] = kv.stress;

    const absStrain = Math.abs(kv.nextStrain);
    const absStress = Math.abs(kv.stress);
    sumStrain += absStrain;
    if (absStrain > maxStrain) maxStrain = absStrain;
    if (absStress > maxStress) maxStress = absStress;

    const biopixelMass = 0.045;
    kineticEnergy += 0.5 * biopixelMass * (vx * vx + vy * vy + vz * vz + kv.nextVelocity * kv.nextVelocity);
    hysteresisPower += dampingEta * kv.nextVelocity * kv.nextVelocity * 0.02;

    // Desplazamiento geométrico total del biopíxel (normal viscoelástica + deslizamiento fluido)
    const normalDisp = Math.max(-0.22, Math.min(0.32, kv.nextStrain * 0.24));
    const fluidSlip = 0.075;
    posX[i] = restX[i] + normX[i] * normalDisp + vx * fluidSlip;
    posY[i] = Math.max(0.14, restY[i] + normY[i] * normalDisp + vy * fluidSlip);
    posZ[i] = restZ[i] + normZ[i] * normalDisp + vz * fluidSlip;
  }

  const reynoldsNumber = Number(
    ((curlStrength * 1.5) / Math.max(0.005, visc)).toFixed(1),
  );

  const metrics: BiopixelSurfaceMetrics = {
    count,
    cols,
    rows,
    reynoldsNumber,
    kinematicViscosity: visc,
    elasticityE,
    dampingEta,
    curlStrength,
    meanStrain: sumStrain / count,
    maxStrain,
    maxStress,
    meanVorticity: sumVorticity / count,
    maxCurlDivergence,
    kineticEnergy,
    hysteresisPower,
    excitationEnvelope: state.excitationEnvelope,
    activeOpcodesCount: profile.injectors.length,
  };
  state.lastMetrics = metrics;
  return metrics;
}

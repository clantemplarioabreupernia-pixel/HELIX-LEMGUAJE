import type { SoAHolographicBuffer } from './helixSignal';

/**
 * Líneas espectrales reales de Fraunhofer (C, e, g) en nanómetros
 * empleadas para la ley de dispersión óptica de Cauchy n(λ) = A + B/λ² + C/λ⁴.
 */
export const CAUCHY_SPECTRAL_LINES_NM = {
  red: 700.0,
  green: 546.1,
  blue: 435.8,
} as const;

export interface ComplexNumber {
  re: number;
  im: number;
}

export function cAdd(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function cSub(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function cMul(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

export function cConj(a: ComplexNumber): ComplexNumber {
  return { re: a.re, im: -a.im };
}

export function cAbsSq(a: ComplexNumber): number {
  return a.re * a.re + a.im * a.im;
}

/**
 * Dispersión óptica de Cauchy para las líneas espectrales exactas
 * Rojo (700.0 nm), Verde (546.1 nm) y Azul (435.8 nm).
 */
export function computeCauchySpectralTriple(
  A = 1.458,
  B = 0.00354,
  C = 0.00012,
): { nRed: number; nGreen: number; nBlue: number; abbeEstimate: number } {
  const calc = (nm: number) => {
    const lUm = nm / 1000;
    const l2 = lUm * lUm;
    return Number((A + B / l2 + C / (l2 * l2)).toFixed(6));
  };
  const nRed = calc(CAUCHY_SPECTRAL_LINES_NM.red);
  const nGreen = calc(CAUCHY_SPECTRAL_LINES_NM.green);
  const nBlue = calc(CAUCHY_SPECTRAL_LINES_NM.blue);
  const abbeEstimate = Number(((nGreen - 1) / Math.max(1e-6, nBlue - nRed)).toFixed(4));
  return { nRed, nGreen, nBlue, abbeEstimate };
}

/**
 * Potencial vectorial 3D suave y determinista ψ(x, y, z, t) para Navier-Stokes / Curl Noise.
 */
function potentialFieldPsi(
  x: number,
  y: number,
  z: number,
  t: number,
  freq: number,
): [number, number, number] {
  const px = x * freq;
  const py = y * freq;
  const pz = z * freq;
  const psiX =
    Math.sin(py * 1.13 + t * 0.7) * Math.cos(pz * 0.89 - t * 0.4) +
    0.45 * Math.sin(py * 2.31 - pz * 1.7 + t * 0.5);
  const psiY =
    Math.sin(pz * 1.27 - t * 0.6) * Math.cos(px * 0.97 + t * 0.35) +
    0.45 * Math.cos(pz * 2.11 + px * 1.43 - t * 0.45);
  const psiZ =
    Math.sin(px * 1.19 + t * 0.55) * Math.cos(py * 1.07 - t * 0.65) +
    0.45 * Math.sin(px * 1.91 - py * 2.17 + t * 0.3);
  return [psiX, psiY, psiZ];
}

export interface CurlNoiseSample {
  vx: number;
  vy: number;
  vz: number;
  divergence: number;
}

/**
 * Calcula el rotacional 3D (Curl Noise = ∇ × ψ) mediante diferencias centrales
 * garantizando un campo de velocidad incompresible (∇·v ≈ 0).
 */
export function computeCurlNoise3D(
  x: number,
  y: number,
  z: number,
  t = 0,
  freq = 1.25,
  eps = 1e-4,
): CurlNoiseSample {
  const sampleAt = (sx: number, sy: number, sz: number): [number, number, number] => {
    const inv = 1 / (2 * eps);
    const [, pyP, pzP] = potentialFieldPsi(sx, sy + eps, sz, t, freq);
    const [, pyM, pzM] = potentialFieldPsi(sx, sy - eps, sz, t, freq);
    const dPsiZ_dy = (pzP - pzM) * inv;
    const dPsiY_dy_unused = pyP - pyM;
    void dPsiY_dy_unused;

    const [pxZp, pyZp] = potentialFieldPsi(sx, sy, sz + eps, t, freq);
    const [pxZm, pyZm] = potentialFieldPsi(sx, sy, sz - eps, t, freq);
    const dPsiY_dz = (pyZp - pyZm) * inv;
    const dPsiX_dz = (pxZp - pxZm) * inv;

    const [pxXp, , pzXp] = potentialFieldPsi(sx + eps, sy, sz, t, freq);
    const [pxXm, , pzXm] = potentialFieldPsi(sx - eps, sy, sz, t, freq);
    const dPsiZ_dx = (pzXp - pzXm) * inv;
    const dPsiX_dx_unused = pxXp - pxXm;
    void dPsiX_dx_unused;

    const [pxYp] = potentialFieldPsi(sx, sy + eps, sz, t, freq);
    const [pxYm] = potentialFieldPsi(sx, sy - eps, sz, t, freq);
    const dPsiX_dy = (pxYp - pxYm) * inv;

    const [, pyXp] = potentialFieldPsi(sx + eps, sy, sz, t, freq);
    const [, pyXm] = potentialFieldPsi(sx - eps, sy, sz, t, freq);
    const dPsiY_dx = (pyXp - pyXm) * inv;

    return [
      dPsiZ_dy - dPsiY_dz,
      dPsiX_dz - dPsiZ_dx,
      dPsiY_dx - dPsiX_dy,
    ];
  };

  const [vx, vy, vz] = sampleAt(x, y, z);

  // Verificación numérica de incompresibilidad (∇·v = ∂vx/∂x + ∂vy/∂y + ∂vz/∂z)
  const h = 1e-3;
  const inv2h = 1 / (2 * h);
  const [vxP] = sampleAt(x + h, y, z);
  const [vxM] = sampleAt(x - h, y, z);
  const [, vyP] = sampleAt(x, y + h, z);
  const [, vyM] = sampleAt(x, y - h, z);
  const [, , vzP] = sampleAt(x, y, z + h);
  const [, , vzM] = sampleAt(x, y, z - h);
  const divergence = (vxP - vxM) * inv2h + (vyP - vyM) * inv2h + (vzP - vzM) * inv2h;

  return { vx, vy, vz, divergence };
}

/**
 * Ley Némesis de Cauchy: disipación viscoelástica exponencial
 * Tensión_{t+1} = Tensión_t - Tensión_t * γ hacia el suelo térmico 0.0f.
 */
export function stepNemesisCauchy(tension: number, gamma = 0.08): number {
  const safeGamma = Math.min(0.9999, Math.max(1e-5, gamma));
  const next = tension - tension * safeGamma;
  return Math.abs(next) < 1e-8 ? 0 : next;
}

export interface PauliSoAPhysicsState {
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  tension: Float32Array;
}

export function createPauliSoAPhysicsState(capacity: number): PauliSoAPhysicsState {
  const safeCap = Math.max(1, Math.floor(capacity));
  return {
    vx: new Float32Array(safeCap),
    vy: new Float32Array(safeCap),
    vz: new Float32Array(safeCap),
    tension: new Float32Array(safeCap),
  };
}

export interface PauliSoAPhysicsStepReport {
  maxTension: number;
  meanTension: number;
  totalKineticEnergy: number;
  maxCurlDivergence: number;
}

/**
 * Integra un paso físico completo sobre el búfer contiguo Pauli-SoA (28 B / celda):
 * Curl Noise (Navier-Stokes incompresible) + Viscoelasticidad Kelvin-Voigt + Ley Némesis de Cauchy.
 */
export function stepPauliSoAPhysics(
  soa: SoAHolographicBuffer,
  phys: PauliSoAPhysicsState,
  timeSec: number,
  dt = 1 / 120,
  options: {
    curlGain?: number;
    elasticityE?: number;
    viscosityEta?: number;
    nemesisGamma?: number;
  } = {},
): PauliSoAPhysicsStepReport {
  const curlGain = options.curlGain ?? 0.35;
  const elasticityE = options.elasticityE ?? 16.0;
  const viscosityEta = options.viscosityEta ?? 5.5;
  const nemesisGamma = options.nemesisGamma ?? 0.06;

  let maxTension = 0;
  let sumTension = 0;
  let totalKineticEnergy = 0;
  let maxCurlDivergence = 0;

  const n = soa.capacity;
  for (let i = 0; i < n; i++) {
    const x = soa.x[i];
    const y = soa.y[i];
    const z = soa.z[i];

    const curl =
      curlGain > 0
        ? computeCurlNoise3D(x, y, z, timeSec)
        : { vx: 0, vy: 0, vz: 0, divergence: 0 };
    if (Math.abs(curl.divergence) > maxCurlDivergence) {
      maxCurlDivergence = Math.abs(curl.divergence);
    }

    // Fuerza elástica Kelvin-Voigt + advección Curl Noise
    const accelX = curl.vx * curlGain - elasticityE * phys.tension[i] * 0.02 - viscosityEta * phys.vx[i];
    const accelY = curl.vy * curlGain - elasticityE * phys.tension[i] * 0.02 - viscosityEta * phys.vy[i];
    const accelZ = curl.vz * curlGain - elasticityE * phys.tension[i] * 0.02 - viscosityEta * phys.vz[i];

    phys.vx[i] += accelX * dt;
    phys.vy[i] += accelY * dt;
    phys.vz[i] += accelZ * dt;

    soa.x[i] = x + phys.vx[i] * dt;
    soa.y[i] = y + phys.vy[i] * dt;
    soa.z[i] = z + phys.vz[i] * dt;

    const curlSpeed = Math.hypot(curl.vx, curl.vy, curl.vz) * curlGain;
    const rawTension = phys.tension[i] + curlSpeed * dt;
    const decayedTension = stepNemesisCauchy(rawTension, nemesisGamma);
    phys.tension[i] = decayedTension;

    soa.amp[i] = Math.max(0, soa.amp[i] * (1 - nemesisGamma * 0.5) + decayedTension);

    if (decayedTension > maxTension) maxTension = decayedTension;
    sumTension += decayedTension;
    const vSq = phys.vx[i] * phys.vx[i] + phys.vy[i] * phys.vy[i] + phys.vz[i] * phys.vz[i];
    totalKineticEnergy += 0.5 * vSq;
  }

  return {
    maxTension,
    meanTension: n > 0 ? sumTension / n : 0,
    totalKineticEnergy,
    maxCurlDivergence,
  };
}

/**
 * Optimización de Silicio: Ley Psicofísica de Weber-Fechner para filtrado de fotogramas a 120 FPS.
 */
export function evaluateWeberFechnerFrame(
  prevMetric: number,
  nextMetric: number,
  thresholdK = 0.015,
): { decision: 'RENDER_FRAME' | 'SKIP_FRAME'; deltaRatio: number } {
  const denom = Math.max(1e-4, Math.abs(prevMetric));
  const deltaRatio = Math.abs(nextMetric - prevMetric) / denom;
  return {
    decision: deltaRatio < thresholdK ? 'SKIP_FRAME' : 'RENDER_FRAME',
    deltaRatio,
  };
}

/**
 * Estado cuántico en la Esfera de Bloch: |ψ⟩ = α|0⟩ + β|1⟩ con ||ψ||² = 1.
 */
export interface BlochState {
  alpha: ComplexNumber;
  beta: ComplexNumber;
  theta: number;
  phi: number;
  blochVector: [number, number, number];
  normSq: number;
}

function normalizeSpinor(alpha: ComplexNumber, beta: ComplexNumber): BlochState {
  const norm = Math.sqrt(Math.max(1e-18, cAbsSq(alpha) + cAbsSq(beta)));
  const a = { re: alpha.re / norm, im: alpha.im / norm };
  const b = { re: beta.re / norm, im: beta.im / norm };
  const normSq = cAbsSq(a) + cAbsSq(b);

  // b_x = 2 Re(conj(a)*b), b_y = 2 Im(conj(a)*b), b_z = |a|^2 - |b|^2
  const ab = cMul(cConj(a), b);
  const bx = 2 * ab.re;
  const by = 2 * ab.im;
  const bz = cAbsSq(a) - cAbsSq(b);

  const clampedBz = Math.max(-1, Math.min(1, bz));
  const theta = Math.acos(clampedBz);
  const phi = Math.atan2(by, bx);

  return {
    alpha: a,
    beta: b,
    theta,
    phi,
    blochVector: [bx, by, bz],
    normSq,
  };
}

export function createBlochState(theta = 0, phi = 0): BlochState {
  const half = theta / 2;
  const alpha: ComplexNumber = { re: Math.cos(half), im: 0 };
  const s = Math.sin(half);
  const beta: ComplexNumber = { re: s * Math.cos(phi), im: s * Math.sin(phi) };
  return normalizeSpinor(alpha, beta);
}

/**
 * Evolución unitaria exacta de Schrödinger U(t) = exp(-i H t / ħ)
 * bajo un Hamiltoniano de Pauli H = (ħω/2)(nx σx + ny σy + nz σz).
 * Garantiza conservación estricta de probabilidad ||ψ||² = 1.
 */
export function evolveSchrodingerPauli(
  state: BlochState,
  axis: [number, number, number],
  omegaRadPerSec: number,
  dt: number,
): BlochState {
  const axisNorm = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const nx = axis[0] / axisNorm;
  const ny = axis[1] / axisNorm;
  const nz = axis[2] / axisNorm;

  const halfAngle = 0.5 * omegaRadPerSec * dt;
  const c = Math.cos(halfAngle);
  const s = Math.sin(halfAngle);

  // U = cos(a) I - i sin(a) (nx σx + ny σy + nz σz)
  // U00 = c - i*s*nz, U01 = -i*s*nx - s*ny
  // U10 = -i*s*nx + s*ny, U11 = c + i*s*nz
  const u00: ComplexNumber = { re: c, im: -s * nz };
  const u01: ComplexNumber = { re: -s * ny, im: -s * nx };
  const u10: ComplexNumber = { re: s * ny, im: -s * nx };
  const u11: ComplexNumber = { re: c, im: s * nz };

  const nextAlpha = cAdd(cMul(u00, state.alpha), cMul(u01, state.beta));
  const nextBeta = cAdd(cMul(u10, state.alpha), cMul(u11, state.beta));
  return normalizeSpinor(nextAlpha, nextBeta);
}

/**
 * Proyector ortogonal Hermítico 2×2 sobre C² para el reticulado de Birkhoff-von Neumann.
 */
export interface Projector2x2 {
  m00: ComplexNumber;
  m01: ComplexNumber;
  m10: ComplexNumber;
  m11: ComplexNumber;
  rank: 0 | 1 | 2;
}

const PROJ_ZERO: Projector2x2 = {
  m00: { re: 0, im: 0 },
  m01: { re: 0, im: 0 },
  m10: { re: 0, im: 0 },
  m11: { re: 0, im: 0 },
  rank: 0,
};

const PROJ_IDENTITY: Projector2x2 = {
  m00: { re: 1, im: 0 },
  m01: { re: 0, im: 0 },
  m10: { re: 0, im: 0 },
  m11: { re: 1, im: 0 },
  rank: 2,
};

export function projectorFromBlochAngle(theta: number, phi = 0): Projector2x2 {
  const st = createBlochState(theta, phi);
  return {
    m00: cMul(st.alpha, cConj(st.alpha)),
    m01: cMul(st.alpha, cConj(st.beta)),
    m10: cMul(st.beta, cConj(st.alpha)),
    m11: cMul(st.beta, cConj(st.beta)),
    rank: 1,
  };
}

function projectorDistance(a: Projector2x2, b: Projector2x2): number {
  return Math.sqrt(
    cAbsSq(cSub(a.m00, b.m00)) +
      cAbsSq(cSub(a.m01, b.m01)) +
      cAbsSq(cSub(a.m10, b.m10)) +
      cAbsSq(cSub(a.m11, b.m11)),
  );
}

/** Ortocomplemento en reticulado de Birkhoff-von Neumann: P⊥ = I - P */
export function bvnNot(p: Projector2x2): Projector2x2 {
  if (p.rank === 0) return PROJ_IDENTITY;
  if (p.rank === 2) return PROJ_ZERO;
  return {
    m00: cSub({ re: 1, im: 0 }, p.m00),
    m01: { re: -p.m01.re, im: -p.m01.im },
    m10: { re: -p.m10.re, im: -p.m10.im },
    m11: cSub({ re: 1, im: 0 }, p.m11),
    rank: 1,
  };
}

/** Conjunción cuántica (Meet P ∧ Q = intersección de subespacios en C²) */
export function bvnMeet(p: Projector2x2, q: Projector2x2, tol = 1e-6): Projector2x2 {
  if (p.rank === 0 || q.rank === 0) return PROJ_ZERO;
  if (p.rank === 2) return q;
  if (q.rank === 2) return p;
  return projectorDistance(p, q) < tol ? p : PROJ_ZERO;
}

/** Disyunción cuántica (Join P ∨ Q = (P⊥ ∧ Q⊥)⊥ = span cerrado en C²) */
export function bvnJoin(p: Projector2x2, q: Projector2x2, tol = 1e-6): Projector2x2 {
  if (p.rank === 2 || q.rank === 2) return PROJ_IDENTITY;
  if (p.rank === 0) return q;
  if (q.rank === 0) return p;
  return projectorDistance(p, q) < tol ? p : PROJ_IDENTITY;
}

/**
 * Demuestra formalmente la no-distributividad de la lógica cuántica de Birkhoff-von Neumann:
 * P ∧ (Q ∨ R) vs (P ∧ Q) ∨ (P ∧ R).
 */
export function verifyBirkhoffVonNeumannNonDistributivity(
  p: Projector2x2,
  q: Projector2x2,
  r: Projector2x2,
): {
  distributiveHolds: boolean;
  lhsRank: number;
  rhsRank: number;
  frobeniusDiff: number;
} {
  const lhs = bvnMeet(p, bvnJoin(q, r));
  const rhs = bvnJoin(bvnMeet(p, q), bvnMeet(p, r));
  const frobeniusDiff = projectorDistance(lhs, rhs);
  return {
    distributiveHolds: frobeniusDiff < 1e-6,
    lhsRank: lhs.rank,
    rhsRank: rhs.rank,
    frobeniusDiff,
  };
}

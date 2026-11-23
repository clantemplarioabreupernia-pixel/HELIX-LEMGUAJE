import { RUNES } from '../data/runes';
import { sha256Hex } from './helixPcc';

export type Z4Symbol = 0 | 1 | 2 | 3;

export interface Qpsk132Frame {
  primeMaskBits: string; // 33 bits representing active P33 primes
  bitLength: 132;
  byteLength: 17;
  payloadBytes: Uint8Array;
  symbols: Z4Symbol[]; // 66 QPSK symbols (2 bits each)
  frameSha256: string;
}

/**
 * Memoria contigua Structure-of-Arrays (SoA) sin punteros ni objetos por celda.
 * 7 arreglos tipados × 4 bytes (Float32) = exactamente 28 bytes contiguos por celda (Zero-GC).
 */
export interface SoAHolographicBuffer {
  readonly capacity: number;
  readonly strideBytes: 28;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  u: Float32Array;
  v: Float32Array;
  amp: Float32Array;
  phaseQuad: Float32Array;
  readonly backingBuffer: ArrayBuffer;
}

export function createSoABuffer(capacity: number): SoAHolographicBuffer {
  const safeCap = Math.max(1, Math.floor(capacity));
  const backingBuffer = new ArrayBuffer(safeCap * 28);
  const stride = safeCap * 4;
  return {
    capacity: safeCap,
    strideBytes: 28,
    x: new Float32Array(backingBuffer, stride * 0, safeCap),
    y: new Float32Array(backingBuffer, stride * 1, safeCap),
    z: new Float32Array(backingBuffer, stride * 2, safeCap),
    u: new Float32Array(backingBuffer, stride * 3, safeCap),
    v: new Float32Array(backingBuffer, stride * 4, safeCap),
    amp: new Float32Array(backingBuffer, stride * 5, safeCap),
    phaseQuad: new Float32Array(backingBuffer, stride * 6, safeCap),
    backingBuffer,
  };
}

/**
 * Codifica hasta 4 canales de 33 bits (4 × 33 = 132 bits = 66 símbolos Z4 QPSK)
 * sobre un arreglo empaquetado de 17 bytes con firma SHA-256 real.
 */
export function encodeQpsk132Frame(
  activePrimeIndices: number[],
  channelValues: [number, number, number] = [0, 0, 0],
): Qpsk132Frame {
  const bits = new Uint8Array(132);

  // Canal 0 (bits 0..32): máscara exacta de los 33 primos P33 activos
  for (const idx of activePrimeIndices) {
    if (idx >= 0 && idx < 33) {
      bits[idx] = 1;
    }
  }

  // Canales 1..3 (bits 33..131): 3 enteros de 33 bits (coordenadas, amplitud, fase)
  for (let ch = 0; ch < 3; ch++) {
    const val = BigInt(Math.max(0, Math.floor(channelValues[ch] ?? 0))) & ((1n << 33n) - 1n);
    for (let b = 0; b < 33; b++) {
      bits[33 * (ch + 1) + b] = Number((val >> BigInt(b)) & 1n);
    }
  }

  const symbols: Z4Symbol[] = [];
  for (let i = 0; i < 132; i += 2) {
    const sym = ((bits[i] << 1) | bits[i + 1]) as Z4Symbol;
    symbols.push(sym);
  }

  const payloadBytes = new Uint8Array(17);
  for (let i = 0; i < 132; i++) {
    if (bits[i] === 1) {
      payloadBytes[i >> 3] |= 1 << (i & 7);
    }
  }

  const hexFrame = Array.from(payloadBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    primeMaskBits: Array.from(bits.slice(0, 33)).join(''),
    bitLength: 132,
    byteLength: 17,
    payloadBytes,
    symbols,
    frameSha256: sha256Hex(`qpsk132|${hexFrame}`),
  };
}

export function decodeQpsk132Symbols(symbols: Z4Symbol[]): {
  activePrimeIndices: number[];
  channels: [number, number, number];
} {
  const bits = new Uint8Array(132);
  for (let s = 0; s < 66 && s < symbols.length; s++) {
    const sym = symbols[s] & 3;
    bits[s * 2] = (sym >> 1) & 1;
    bits[s * 2 + 1] = sym & 1;
  }

  const activePrimeIndices: number[] = [];
  for (let i = 0; i < 33; i++) {
    if (bits[i] === 1) activePrimeIndices.push(i);
  }

  const channels: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    let val = 0n;
    for (let b = 0; b < 33; b++) {
      if (bits[33 * (ch + 1) + b] === 1) {
        val |= 1n << BigInt(b);
      }
    }
    channels[ch] = Number(val);
  }

  return { activePrimeIndices, channels };
}

/**
 * Empaqueta símbolos QPSK y parámetros espectrales en la memoria contigua SoA de 28 bytes/celda.
 */
export function packToSoABuffer(
  buffer: SoAHolographicBuffer,
  slot: number,
  x: number,
  y: number,
  z: number,
  u: number,
  v: number,
  amp: number,
  phaseQuad: Z4Symbol,
): void {
  if (slot < 0 || slot >= buffer.capacity) return;
  buffer.x[slot] = x;
  buffer.y[slot] = y;
  buffer.z[slot] = z;
  buffer.u[slot] = u;
  buffer.v[slot] = v;
  buffer.amp[slot] = amp;
  buffer.phaseQuad[slot] = phaseQuad;
}

/**
 * Purga explícita de memoria SoA con entropía CSPRNG (Zeroization real).
 */
export function zeroizeSoABuffer(buffer: SoAHolographicBuffer): void {
  const view = new Uint8Array(buffer.backingBuffer);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(view);
  } else {
    view.fill(0);
  }
}

/**
 * Ley de dispersión óptica de Cauchy: n(lambda) = A + B/lambda^2 + C/lambda^4 (lambda en micrómetros).
 */
export function cauchyRefractiveIndex(wavelengthNm: number, A = 1.458, B = 0.00354, C = 0.00012): number {
  const lambdaUm = Math.max(0.35, wavelengthNm / 1000);
  const l2 = lambdaUm * lambdaUm;
  return Number((A + B / l2 + C / (l2 * l2)).toFixed(6));
}

/**
 * Filtro perceptual Weber-Fechner: devuelve true si el cambio relativo ΔI/I supera el umbral k.
 */
export function passesWeberFechnerThreshold(prevIntensity: number, nextIntensity: number, k = 0.02): boolean {
  const base = Math.max(1e-4, Math.abs(prevIntensity));
  return Math.abs(nextIntensity - prevIntensity) / base >= k;
}

/**
 * Paso discreto de viscoelasticidad Kelvin-Voigt: sigma = E*epsilon + eta*(dEpsilon/dt).
 */
export function stepKelvinVoigt(
  strain: number,
  velocity: number,
  targetStrain: number,
  dt: number,
  elasticityE = 18.0,
  viscosityEta = 6.5,
): { nextStrain: number; nextVelocity: number; stress: number } {
  const error = targetStrain - strain;
  const accel = elasticityE * error - viscosityEta * velocity;
  const nextVelocity = velocity + accel * dt;
  const nextStrain = strain + nextVelocity * dt;
  const stress = elasticityE * nextStrain + viscosityEta * nextVelocity;
  return { nextStrain, nextVelocity, stress };
}

export function extractActiveRunesFromScript(glyphsList: string[]): number[] {
  const byGlyph = new Map(RUNES.map((r) => [r.glyph, r.index]));
  const indices = new Set<number>();
  for (const gStr of glyphsList) {
    for (const ch of Array.from(gStr)) {
      const idx = byGlyph.get(ch);
      if (idx !== undefined) indices.add(idx);
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

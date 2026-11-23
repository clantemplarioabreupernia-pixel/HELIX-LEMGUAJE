export interface PrimeColorSpec {
  hueDeg: number;
  saturationPct: number;
  lightnessPct: number;
  rgb: [number, number, number];
  colorHex: string;
}

export interface CompositeColorResult extends PrimeColorSpec {
  coherence: number;
  tokenHexes: string[];
}

const GOLDEN_ANGLE_DEG = 137.50776405003785;

/**
 * Normaliza cualquier ángulo en grados al intervalo [0, 360).
 */
export function normalizeHue(deg: number): number {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

/**
 * Ecuación procedural por ángulo áureo sobre el primo base p:
 * H(p) = (p * 137.507764°) mod 360°
 */
export function computePrimeHueGolden(prime: number): number {
  return Number(normalizeHue(prime * GOLDEN_ANGLE_DEG).toFixed(2));
}

/**
 * Distribución espectral uniforme por índice (0..32):
 * H(i) = (i * 360 / 33) mod 360
 */
export function computeIndexHueSpectral(indexZeroBased: number, total = 33): number {
  return Number(normalizeHue((indexZeroBased * 360) / total).toFixed(2));
}

/**
 * Convierte HSL [0..360, 0..100, 0..100] a RGB [0..255, 0..255, 0..255] y #RRGGBB.
 */
export function hslToRgbHex(
  hueDeg: number,
  saturationPct: number,
  lightnessPct: number,
): { rgb: [number, number, number]; hex: string } {
  const h = normalizeHue(hueDeg) / 360;
  const s = Math.max(0, Math.min(100, saturationPct)) / 100;
  const l = Math.max(0, Math.min(100, lightnessPct)) / 100;

  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    r = l;
    g = l;
    b = l;
  } else {
    const hue2rgb = (p: number, q: number, tInput: number): number => {
      let t = tInput;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const rByte = Math.round(r * 255);
  const gByte = Math.round(g * 255);
  const bByte = Math.round(b * 255);

  const toHex = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
  return {
    rgb: [rByte, gByte, bByte],
    hex: `#${toHex(rByte)}${toHex(gByte)}${toHex(bByte)}`,
  };
}

/**
 * Deriva de forma 100% procedural el color nativo de un token desde su número primo.
 * Mantiene saturación y luminosidad calibradas para legibilidad técnica sobre fondos claros.
 */
export function derivePrimeColor(
  prime: number,
  mode: 'golden' | 'spectral' = 'golden',
  indexZeroBased = 0,
): PrimeColorSpec {
  const hueDeg =
    mode === 'golden'
      ? computePrimeHueGolden(prime)
      : computeIndexHueSpectral(indexZeroBased);

  // Saturación y luminosidad acotadas para asegurar contraste legible
  const saturationPct = 72;
  const lightnessPct = 41;
  const { rgb, hex } = hslToRgbHex(hueDeg, saturationPct, lightnessPct);

  return {
    hueDeg,
    saturationPct,
    lightnessPct,
    rgb,
    colorHex: hex,
  };
}

/**
 * Síntesis cromática compuesta mediante suma vectorial circular sobre los primos participantes:
 * H_bar = atan2( sum(sin(H_k)), sum(cos(H_k)) ) mod 360
 */
export function computeCompositeColorFromPrimes(primes: number[]): CompositeColorResult {
  if (primes.length === 0) {
    return {
      hueDeg: 0,
      saturationPct: 0,
      lightnessPct: 60,
      rgb: [153, 153, 153],
      colorHex: '#94A3B8',
      coherence: 0,
      tokenHexes: [],
    };
  }

  let sumSin = 0;
  let sumCos = 0;
  const tokenHexes: string[] = [];

  for (const p of primes) {
    const spec = derivePrimeColor(p, 'golden');
    tokenHexes.push(spec.colorHex);
    const rad = (spec.hueDeg * Math.PI) / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
  }

  const n = primes.length;
  const coherence = Number(
    Math.min(1, Math.sqrt(sumSin * sumSin + sumCos * sumCos) / n).toFixed(3),
  );
  const rawAngleDeg = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
  const hueDeg = Number(normalizeHue(rawAngleDeg).toFixed(2));

  // Cuando vectores opuestos se cancelan (coherencia baja), la saturación decrece hacia gris neutro
  const saturationPct = Math.round(16 + 58 * coherence);
  const lightnessPct = 41;
  const { rgb, hex } = hslToRgbHex(hueDeg, saturationPct, lightnessPct);

  return {
    hueDeg,
    saturationPct,
    lightnessPct,
    rgb,
    colorHex: hex,
    coherence,
    tokenHexes,
  };
}

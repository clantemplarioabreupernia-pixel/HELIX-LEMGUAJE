import { RUNES } from '../data/runes';
import { CompoundWord } from '../data/vocabulary';
import {
  BasisCellHint,
  computePositionalSignature,
  GodelChecksumValidationReport,
  GodelLineValidation,
  resolveInstructionToBasisRunes,
  validateHelixGodelChecksum,
} from './helixEngine';

export const HELIX_33_PRIMES: readonly number[] = RUNES.map((r) => r.prime);

export interface TokenPrimeProductOptions {
  vocabulary?: CompoundWord[];
  cells?: BasisCellHint[];
}

export interface TokenPrimeProductResult {
  valid: boolean;
  product: bigint;
  productString: string;
  primes: number[];
  resolvedGlyphs: string;
  positionalSignature: string;
  unknownTokens: string[];
}

export interface Program33ValidationResult {
  valid: boolean;
  godelProduct: string;
  positionalSignature: string;
  totalLines: number;
  validLinesCount: number;
  totalBasisTokens: number;
  factorizedPrimes: number[];
  remainder: string;
  foreignTokens: string[];
  invalidLines: GodelLineValidation[];
  summary: string;
  report: GodelChecksumValidationReport;
}

/**
 * Calcula el producto de números primos de Gödel asociado a una cadena de tokens
 * (o arreglo de tokens) dentro de la base canónica de los 33 tokens Helix [2..137].
 */
export function computePrimeProductForTokens(
  tokensInput: string | string[],
  options: TokenPrimeProductOptions = {},
): TokenPrimeProductResult {
  const { vocabulary = [], cells = [] } = options;

  const rawTokens = Array.isArray(tokensInput)
    ? tokensInput.map((t) => t.trim()).filter(Boolean)
    : tokensInput
        .split(/\r?\n/)
        .map((line) => line.split('#')[0].trim())
        .filter(Boolean)
        .flatMap((line) => line.split(/\s+/))
        .filter(Boolean);

  if (rawTokens.length === 0) {
    return {
      valid: false,
      product: 1n,
      productString: '1',
      primes: [],
      resolvedGlyphs: '',
      positionalSignature: '0x0000000000000000',
      unknownTokens: [],
    };
  }

  let product = 1n;
  const resolvedRunes: typeof RUNES = [];
  const unknownTokens: string[] = [];

  for (const tok of rawTokens) {
    const res = resolveInstructionToBasisRunes(tok, vocabulary, cells);
    if (!res.resolved || res.runes.length === 0) {
      unknownTokens.push(...(res.foreignTokens.length > 0 ? res.foreignTokens : [tok]));
      continue;
    }
    for (const r of res.runes) {
      product *= BigInt(r.prime);
      resolvedRunes.push(r);
    }
  }

  return {
    valid: unknownTokens.length === 0 && resolvedRunes.length > 0,
    product,
    productString: product.toString(),
    primes: resolvedRunes.map((r) => r.prime),
    resolvedGlyphs: resolvedRunes.map((r) => r.glyph).join(''),
    positionalSignature: computePositionalSignature(resolvedRunes),
    unknownTokens: Array.from(new Set(unknownTokens)),
  };
}

/**
 * Valida si un programa Helix completo (una o múltiples líneas) cumple estrictamente
 * con la restricción del alfabeto cerrado de los 33 tokens Helix (primos 2..137),
 * verificando cada instrucción y su factorización exacta (residuo === '1').
 */
export function validateHelixProgram33Tokens(
  program: string,
  options: TokenPrimeProductOptions & {
    expectedGodelProduct?: string;
    expectedPositionalSignature?: string;
  } = {},
): Program33ValidationResult {
  const report = validateHelixGodelChecksum(program, options);
  const invalidLines = report.lines.filter((line) => line.status !== 'VALIDO');

  return {
    valid: report.valid,
    godelProduct: report.programGodelProduct,
    positionalSignature: report.positionalSignature,
    totalLines: report.totalLines,
    validLinesCount: report.validLinesCount,
    totalBasisTokens: report.totalBasisTokens,
    factorizedPrimes: report.factorizedPrimes,
    remainder: report.remainder,
    foreignTokens: report.foreignTokens,
    invalidLines,
    summary: report.summary,
    report,
  };
}

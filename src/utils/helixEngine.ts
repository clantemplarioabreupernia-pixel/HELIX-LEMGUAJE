import {
  HELIX_OPERATORS,
  OPERATOR_SET,
  OsSubsystem,
  RUNE_BY_GLYPH,
  RUNE_BY_PRIME,
  RUNES,
  RuneToken,
} from '../data/runes';
import { CompoundWord } from '../data/vocabulary';
import {
  CompositeColorResult,
  computeCompositeColorFromPrimes,
} from './primeColor';

export interface ParsedToken {
  kind: 'rune' | 'operator' | 'unknown';
  raw: string;
  rune?: RuneToken;
  operatorSymbol?: string;
}

export interface AstClause {
  subject: RuneToken | null;
  operation: RuneToken | null;
  modifiers: RuneToken[];
  tokens: RuneToken[];
}

export interface ParsedPhrase {
  input: string;
  tokens: ParsedToken[];
  runes: RuneToken[];
  operators: string[];
  unknownChars: string[];
  category:
    | 'Vacío'
    | 'Token Atómico'
    | 'Instrucción Binaria'
    | 'Sentencia SO'
    | 'Expresión Operada'
    | 'Inválido';
  isValid: boolean;
  validationNotes: string[];
  phoneticReading: string;
  literalGloss: string;
  godelProduct: string;
  positionalSignature: string;
  primeFactors: number[];
  frequenciesHz: number[];
  harmonicMeanHz: number | null;
  compositeColor: CompositeColorResult;
  compiledPseudocode: string;
  clauses: AstClause[];
}

export function tokenizeHelix(input: string): ParsedToken[] {
  const cleaned = input.replace(/\s+/g, '');
  const chars = Array.from(cleaned);
  return chars.map((ch) => {
    const rune = RUNE_BY_GLYPH.get(ch);
    if (rune) {
      return { kind: 'rune', raw: ch, rune };
    }
    if (OPERATOR_SET.has(ch)) {
      return { kind: 'operator', raw: ch, operatorSymbol: ch };
    }
    return { kind: 'unknown', raw: ch };
  });
}

export function computeGodelProduct(runes: RuneToken[]): bigint {
  return runes.reduce((acc, r) => acc * BigInt(r.prime), 1n);
}

/**
 * Firma posicional determinista (FNV-1a 64-bit sobre la secuencia ordenada de primos).
 * Evita colisiones por conmutatividad del producto de Gödel (ej. ᚠᚢ != ᚢᚠ).
 */
export function computePositionalSignature(runes: RuneToken[]): string {
  if (runes.length === 0) return '0x0000000000000000';
  let hash = 0xcbf29ce484222325n;
  const prime64 = 0x100000001b3n;
  const mask64 = 0xffffffffffffffffn;
  for (let i = 0; i < runes.length; i++) {
    const step = BigInt(runes[i].prime) ^ BigInt((i + 1) * 257);
    hash = ((hash ^ step) * prime64) & mask64;
  }
  return `0x${hash.toString(16).toUpperCase().padStart(16, '0')}`;
}

export function computeCompositeColor(runes: RuneToken[]): CompositeColorResult {
  return computeCompositeColorFromPrimes(runes.map((r) => r.prime));
}

export function formatBigIntGrouped(n: bigint): string {
  const s = n.toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function parseHelixPhrase(
  input: string,
  vocabulary: CompoundWord[] = [],
): ParsedPhrase {
  const tokens = tokenizeHelix(input);
  const runes = tokens
    .filter((t): t is ParsedToken & { rune: RuneToken } => t.kind === 'rune' && Boolean(t.rune))
    .map((t) => t.rune);
  const operators = tokens
    .filter((t) => t.kind === 'operator' && t.operatorSymbol)
    .map((t) => t.operatorSymbol as string);
  const unknownChars = tokens.filter((t) => t.kind === 'unknown').map((t) => t.raw);

  const validationNotes: string[] = [];

  if (tokens.length === 0) {
    return {
      input,
      tokens,
      runes,
      operators,
      unknownChars,
      category: 'Vacío',
      isValid: false,
      validationNotes: ['Introduce al menos un símbolo del léxico base de 33 tokens.'],
      phoneticReading: '',
      literalGloss: '',
      godelProduct: '1',
      positionalSignature: '0x0000000000000000',
      primeFactors: [],
      frequenciesHz: [],
      harmonicMeanHz: null,
      compositeColor: computeCompositeColorFromPrimes([]),
      compiledPseudocode: '',
      clauses: [],
    };
  }

  if (unknownChars.length > 0) {
    validationNotes.push(
      `Caracteres no reconocidos fuera del léxico base: ${unknownChars.join(', ')}.`,
    );
  }

  const clauses: AstClause[] = [];
  let currentRunes: RuneToken[] = [];
  let operatorSyntaxError = false;

  tokens.forEach((t, idx) => {
    if (t.kind === 'operator') {
      if (currentRunes.length === 0 || idx === tokens.length - 1) {
        operatorSyntaxError = true;
      }
      if (currentRunes.length > 0) {
        clauses.push(buildClause(currentRunes));
        currentRunes = [];
      }
    } else if (t.kind === 'rune' && t.rune) {
      currentRunes.push(t.rune);
    }
  });
  if (currentRunes.length > 0) {
    clauses.push(buildClause(currentRunes));
  }

  if (operatorSyntaxError) {
    validationNotes.push(
      'Error de sintaxis: los operadores (⊕, ⊗, ⊖, ⊡) requieren operandos a izquierda y derecha (notación infija).',
    );
  }

  let category: ParsedPhrase['category'] = 'Inválido';
  if (unknownChars.length === 0 && !operatorSyntaxError) {
    if (operators.length > 0) {
      category = 'Expresión Operada';
    } else if (runes.length === 1) {
      category = 'Token Atómico';
    } else if (runes.length === 2) {
      category = 'Instrucción Binaria';
    } else {
      category = 'Sentencia SO';
    }
  }

  if (runes.length >= 3 && operators.length === 0 && unknownChars.length === 0) {
    const roles = runes.map((r) => r.role);
    if (!roles.includes('Operación')) {
      validationNotes.push(
        'Advertencia sintáctica: la sentencia no contiene un token con rol de Operación.',
      );
    } else {
      validationNotes.push(
        'Análisis sintáctico correcto: estructura Entidad / Operación verificada.',
      );
    }
  } else if (unknownChars.length === 0 && !operatorSyntaxError) {
    validationNotes.push('Análisis léxico y firma numérica de Gödel verificados.');
  }

  const phoneticReading =
    '/' +
    runes.map((r) => r.phoneme.replaceAll('/', '')).join('') +
    '/';

  const literalGloss = runes.map((r) => r.name).join('-');
  const godelBigInt = computeGodelProduct(runes);
  const positionalSignature = computePositionalSignature(runes);
  const primeFactors = runes.map((r) => r.prime);
  const frequenciesHz = runes.map((r) => r.frequencyHz);
  const harmonicMeanHz =
    frequenciesHz.length > 0
      ? frequenciesHz.length /
        frequenciesHz.reduce((sum, f) => sum + 1 / f, 0)
      : null;

  const compositeColor = computeCompositeColor(runes);

  const compiledPseudocode = compileToOsPseudocode(
    tokens,
    clauses,
    vocabulary,
  );

  const isValid = unknownChars.length === 0 && !operatorSyntaxError && runes.length > 0;

  return {
    input,
    tokens,
    runes,
    operators,
    unknownChars,
    category,
    isValid,
    validationNotes,
    phoneticReading,
    literalGloss,
    godelProduct: godelBigInt.toString(),
    positionalSignature,
    primeFactors,
    frequenciesHz,
    harmonicMeanHz,
    compositeColor,
    compiledPseudocode,
    clauses,
  };
}

function buildClause(runes: RuneToken[]): AstClause {
  const subject =
    runes.find((r) => r.role === 'Entidad') ?? runes[0] ?? null;
  const operation =
    runes.find((r) => r.role === 'Operación' && r !== subject) ??
    (runes.length > 1 ? runes[1] : null);
  const modifiers = runes.filter((r) => r !== subject && r !== operation);
  return {
    subject,
    operation,
    modifiers,
    tokens: runes,
  };
}

function compileToOsPseudocode(
  tokens: ParsedToken[],
  clauses: AstClause[],
  vocabulary: CompoundWord[],
): string {
  const vocabMap = new Map(vocabulary.map((v) => [v.glyphs, v]));

  const formatClause = (c: AstClause): string => {
    const rawGlyphs = c.tokens.map((t) => t.glyph).join('');
    const known = vocabMap.get(rawGlyphs);
    if (known) {
      return `${known.opcode}(${known.compoundName})`;
    }
    if (c.tokens.length === 1) {
      return `REF(${c.tokens[0].osTag})`;
    }
    if (c.tokens.length === 2) {
      return `OP_${c.tokens[0].osTag}__${c.tokens[1].osTag}()`;
    }
    const opName = c.operation ? c.operation.osTag : 'EXEC';
    const subj = c.subject ? `target=${c.subject.osTag}` : '';
    const mods = c.modifiers.map((m) => m.osTag).join(', ');
    return `${opName}(${[subj, mods ? `flags=[${mods}]` : ''].filter(Boolean).join(', ')})`;
  };

  if (clauses.length === 0) return '';

  const ops = tokens
    .filter((t) => t.kind === 'operator' && t.operatorSymbol)
    .map((t) => t.operatorSymbol as string);

  if (ops.length === 0) {
    return formatClause(clauses[0]);
  }

  let out = formatClause(clauses[0]);
  for (let i = 0; i < ops.length; i++) {
    const opMeta = HELIX_OPERATORS.find((o) => o.symbol === ops[i]);
    const nextClause = clauses[i + 1];
    const opLabel = opMeta ? opMeta.name.toUpperCase() : ops[i];
    if (nextClause) {
      out += `  ${ops[i]} [${opLabel}]  ${formatClause(nextClause)}`;
    }
  }
  return out;
}

export interface FactorizedResult {
  valid: boolean;
  inputNumber: string;
  runes: RuneToken[];
  remainder: string;
  error?: string;
}

export function factorizeGodelNumber(rawInput: string): FactorizedResult {
  const cleaned = rawInput.replace(/\s+/g, '');
  if (!/^\d+$/.test(cleaned)) {
    return {
      valid: false,
      inputNumber: rawInput,
      runes: [],
      remainder: rawInput,
      error: 'Introduce un número entero positivo.',
    };
  }

  let n = BigInt(cleaned);
  if (n < 2n) {
    return {
      valid: false,
      inputNumber: cleaned,
      runes: [],
      remainder: cleaned,
      error: 'El entero mínimo codificable es 2 (token ᚠ / RES).',
    };
  }

  const matched: RuneToken[] = [];
  for (const rune of RUNES) {
    const p = BigInt(rune.prime);
    while (n % p === 0n) {
      matched.push(rune);
      n = n / p;
      if (matched.length > 64) {
        return {
          valid: false,
          inputNumber: cleaned,
          runes: matched,
          remainder: n.toString(),
          error: 'Límite máximo de 64 factores alcanzado.',
        };
      }
    }
  }

  if (n !== 1n) {
    return {
      valid: false,
      inputNumber: cleaned,
      runes: matched,
      remainder: n.toString(),
      error: `Contiene factores primos fuera del conjunto base de 33 tokens (residuo: ${n.toString()}).`,
    };
  }

  return {
    valid: true,
    inputNumber: cleaned,
    runes: matched,
    remainder: '1',
  };
}

export interface GeneratedProposal {
  glyphs: string;
  compoundName: string;
  literalGloss: string;
  osInstruction: string;
  opcode: string;
  subsystem: OsSubsystem;
  godelProduct: string;
  phoneme: string;
  colorHex: string;
  hueDeg: number;
  collision: boolean;
}

export function generateProposalsForSubsystem(
  subsystem: OsSubsystem,
  existingVocab: CompoundWord[],
  seedOffset = 0,
): GeneratedProposal[] {
  const existingSet = new Set(existingVocab.map((v) => v.glyphs));
  const entities = RUNES.filter(
    (r) => r.role === 'Entidad' && (r.subsystem === subsystem || r.index <= 12),
  );
  const actionsAndMods = RUNES.filter(
    (r) =>
      (r.role === 'Operación' || r.role === 'Modificador') &&
      (r.subsystem === subsystem || r.index % 3 === 0),
  );

  const candidates: GeneratedProposal[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < entities.length; i++) {
    for (let j = 0; j < actionsAndMods.length; j++) {
      const e = entities[(i + seedOffset) % entities.length];
      const m = actionsAndMods[(j + seedOffset) % actionsAndMods.length];
      if (e.glyph === m.glyph) continue;
      const glyphs = `${e.glyph}${m.glyph}`;
      if (seen.has(glyphs)) continue;
      seen.add(glyphs);

      if (existingSet.has(glyphs)) continue;

      const prod = BigInt(e.prime) * BigInt(m.prime);
      const compColor = computeCompositeColorFromPrimes([e.prime, m.prime]);
      candidates.push({
        glyphs,
        compoundName: `${e.name}-${m.name}`,
        literalGloss: `${e.osTag.toLowerCase()} · ${m.osTag.toLowerCase()}`,
        osInstruction: `${describeAction(m)} sobre ${describeEntity(e)} (${subsystem})`,
        opcode: `${e.osTag.split('_')[0]}_${m.osTag.split('_')[0]}`,
        subsystem,
        godelProduct: prod.toString(),
        phoneme: `/${e.phoneme.replaceAll('/', '')}${m.phoneme.replaceAll('/', '')}/`,
        colorHex: compColor.colorHex,
        hueDeg: compColor.hueDeg,
        collision: false,
      });

      if (candidates.length >= 6) {
        return candidates;
      }
    }
  }

  return candidates;
}

function describeEntity(r: RuneToken): string {
  return r.osTag.toLowerCase().replace('_', ' ');
}

function describeAction(r: RuneToken): string {
  return r.role === 'Operación'
    ? `Ejecutar ${r.osTag.toLowerCase().replace('_', ' ')}`
    : `Aplicar flag ${r.osTag.toLowerCase().replace('_', ' ')}`;
}

export function getRuneByPrimeSafe(p: number): RuneToken | undefined {
  return RUNE_BY_PRIME.get(p);
}

export interface BasisCellHint {
  opcode: string;
  glyphs: string;
}

export interface GodelLineValidation {
  lineNumber: number;
  raw: string;
  headToken: string;
  resolvedGlyphs: string;
  primes: number[];
  lineGodelProduct: string;
  lineSignature: string;
  factorizedValid: boolean;
  remainder: string;
  status: 'VALIDO' | 'ALUCINACION';
  reason?: string;
}

export interface GodelChecksumValidationReport {
  valid: boolean;
  basisSize: number;
  totalLines: number;
  validLinesCount: number;
  totalBasisTokens: number;
  programGodelProduct: string;
  positionalSignature: string;
  factorizedPrimes: number[];
  remainder: string;
  checksumMatched: boolean;
  foreignTokens: string[];
  lines: GodelLineValidation[];
  summary: string;
}

export interface ValidateGodelChecksumOptions {
  vocabulary?: CompoundWord[];
  cells?: BasisCellHint[];
  expectedGodelProduct?: string;
  expectedPositionalSignature?: string;
}

/**
 * Mapeo canónico determinista de mnemónicos de la VM Helix y operadores infijos
 * sobre el conjunto base de 33 tokens primos (runas 2..137).
 */
const CANONICAL_OPCODE_GLYPH_MAP: Record<string, string> = {
  SET: 'ᛣ',
  ADD: 'ᛣᚷ',
  SUB: 'ᛣᛠ',
  MUL: 'ᛣᛜ',
  DIV: 'ᛣᚣ',
  LOOP: 'ᛡ',
  IF: 'ᚻ',
  ELSE: 'ᚦ',
  END: 'ᛏ',
  FILE_WRITE: 'ᛟᚪ',
  FILE_READ: 'ᛟᚩ',
  FILE_DEL: 'ᛟᛤ',
  KERN_BOOT: 'ᛇᚢ',
  AUTH_CHECK: 'ᛗᚦ',
  MEM_INIT: 'ᚠᚢ',
  MEM_ALLOC: 'ᚠᚷ',
  MEM_FREE: 'ᚠᛠ',
  MEM_LOCK: 'ᚠᛁ',
  HEAP_CAP: 'ᛜᛥ',
  FS_MOUNT_RO: 'ᛟᛥ',
  IO_GUARD: 'ᚦᚩ',
  UID_CTX: 'ᛗᛣ',
  TRAP_SANDBOX: 'ᛉᚻ',
  SIGKILL: 'ᛤᚾ',
  PROC_RUN: 'ᚱᚳ',
  PROC_FORK: 'ᛒᚢ',
  EXIT_OK: 'ᚳᛏ',
  CLK_OK: 'ᛋᚹ',
  REG_PERSIST: 'ᛣᚪ',
  SVC_WAKE: 'ᛢᛣ',
  IO_BUS_TX: 'ᚩᛖ',
  PIPE_SEEK: 'ᛚᚣ',
  BUF_PAUSE: 'ᛚᛁ',
  SCHED_CRON: 'ᛄᛡ',
  SCHED_PRIO: 'ᛞᚾ',
  CSPRNG_ECC: 'ᛈᚫ',
  MESH_NODE: 'ᚠᛜ',
  MAT_ORM: 'ᛟᛣ',
  CAM_6DOF: 'ᚱᚣ',
  WS_EMIT: 'ᚩᛢ',
  FN: 'ᛒᚱ',
  CALL: 'ᚱᛒ',
  LLAMAR: 'ᚱᛒ',
  RET: 'ᛏᛣ',
  BIEN: 'ᛏᛣ',
  RETORNO: 'ᛏᛣ',
  REQUIRES: 'ᚦᛣ',
  ENSURES: 'ᚹᛏ',
  ARRAY: 'ᚠᛚ',
  FORMACION: 'ᚠᛚ',
  'FORMACIÓN': 'ᚠᛚ',
  ASET: 'ᚠᛣ',
  AGET: 'ᚠᚣ',
  SOA_INIT: 'ᚠᛗ',
  CURL_STEP: 'ᛟᚱ',
  NEMESIS_DECAY: 'ᛏᛜ',
  BLOCH_ROT: 'ᛒᚣ',
  BVN_LATTICE: 'ᛉᛣ',
  WEBER_GUARD: 'ᚹᛋ',
};

const OPERATOR_BASIS_GLYPHS: Record<string, string> = {
  '⊕': 'ᛣᚷ',
  '⊖': 'ᛣᛠ',
  '⊗': 'ᛣᛜ',
  '⊡': 'ᛣᚣ',
};

function resolveGlyphStringStrictly(glyphText: string): {
  runes: RuneToken[];
  unknownChars: string[];
} {
  const runes: RuneToken[] = [];
  const unknownChars: string[] = [];

  for (const ch of Array.from(glyphText)) {
    const rune = RUNE_BY_GLYPH.get(ch);
    if (rune) {
      runes.push(rune);
      continue;
    }
    const opExpansion = OPERATOR_BASIS_GLYPHS[ch];
    if (opExpansion) {
      for (const opRuneChar of Array.from(opExpansion)) {
        const mapped = RUNE_BY_GLYPH.get(opRuneChar);
        if (mapped) runes.push(mapped);
      }
      continue;
    }
    unknownChars.push(ch);
  }

  return { runes, unknownChars };
}

export function resolveInstructionToBasisRunes(
  headToken: string,
  vocabulary: CompoundWord[] = [],
  cells: BasisCellHint[] = [],
): {
  resolved: boolean;
  runes: RuneToken[];
  resolvedGlyphs: string;
  foreignTokens: string[];
  reason?: string;
} {
  const trimmed = headToken.trim();
  if (!trimmed) {
    return {
      resolved: false,
      runes: [],
      resolvedGlyphs: '',
      foreignTokens: ['<VACÍO>'],
      reason: 'Instrucción vacía sin token cabeza.',
    };
  }

  const upper = trimmed.toUpperCase();

  // 1. Verificar coincidencia en células .hlx registradas o vocabulario compuesto
  const cellHit = cells.find((c) => c.opcode.toUpperCase() === upper || c.glyphs === trimmed);
  if (cellHit) {
    const strict = resolveGlyphStringStrictly(cellHit.glyphs);
    if (strict.unknownChars.length === 0 && strict.runes.length > 0) {
      return {
        resolved: true,
        runes: strict.runes,
        resolvedGlyphs: strict.runes.map((r) => r.glyph).join(''),
        foreignTokens: [],
      };
    }
    return {
      resolved: false,
      runes: [],
      resolvedGlyphs: '',
      foreignTokens: strict.unknownChars.length > 0 ? strict.unknownChars : [trimmed],
      reason: `La célula ${cellHit.opcode} contiene glifos fuera de los 33 tokens Helix.`,
    };
  }

  const vocabHit = vocabulary.find((v) => v.opcode.toUpperCase() === upper || v.glyphs === trimmed);
  if (vocabHit) {
    const strict = resolveGlyphStringStrictly(vocabHit.glyphs);
    if (strict.unknownChars.length === 0 && strict.runes.length > 0) {
      return {
        resolved: true,
        runes: strict.runes,
        resolvedGlyphs: strict.runes.map((r) => r.glyph).join(''),
        foreignTokens: [],
      };
    }
  }

  // 2. Mnemónicos canónicos de VM Helix y etiquetas atómicas de los 33 tokens
  const canonicalGlyphs = CANONICAL_OPCODE_GLYPH_MAP[upper];
  if (canonicalGlyphs) {
    const strict = resolveGlyphStringStrictly(canonicalGlyphs);
    return {
      resolved: true,
      runes: strict.runes,
      resolvedGlyphs: strict.runes.map((r) => r.glyph).join(''),
      foreignTokens: [],
    };
  }

  const atomicTagRune = RUNES.find(
    (r) => r.osTag.toUpperCase() === upper || r.name.toUpperCase() === upper,
  );
  if (atomicTagRune) {
    return {
      resolved: true,
      runes: [atomicTagRune],
      resolvedGlyphs: atomicTagRune.glyph,
      foreignTokens: [],
    };
  }

  // 3. Secuencia directa de runas / operadores (ej. ᛇᚢ, ᚠᚷ, ᚠ⊕ᚩ)
  const direct = resolveGlyphStringStrictly(trimmed);
  if (direct.unknownChars.length === 0 && direct.runes.length > 0) {
    return {
      resolved: true,
      runes: direct.runes,
      resolvedGlyphs: direct.runes.map((r) => r.glyph).join(''),
      foreignTokens: [],
    };
  }

  // Detectar si había caracteres rúnicos no pertenecientes a Helix (U+16A0..U+16FF)
  const foreignRunes = Array.from(trimmed).filter((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return cp >= 0x16a0 && cp <= 0x16ff && !RUNE_BY_GLYPH.has(ch);
  });

  const foreignList = foreignRunes.length > 0 ? foreignRunes : [trimmed];
  return {
    resolved: false,
    runes: [],
    resolvedGlyphs: '',
    foreignTokens: foreignList,
    reason: `Token '${trimmed}' fuera del conjunto canónico de 33 tokens Helix (primos 2..137).`,
  };
}

function factorizeArbitraryLengthP33(rawValue: string): {
  valid: boolean;
  uniquePrimes: number[];
  remainder: string;
} {
  let n: bigint;
  try {
    n = BigInt(rawValue);
  } catch {
    return { valid: false, uniquePrimes: [], remainder: rawValue };
  }
  if (n < 2n) {
    return { valid: false, uniquePrimes: [], remainder: n.toString() };
  }

  const uniquePrimes: number[] = [];
  for (const rune of RUNES) {
    const p = BigInt(rune.prime);
    if (n % p === 0n) {
      uniquePrimes.push(rune.prime);
      while (n % p === 0n) {
        n = n / p;
      }
    }
  }

  return {
    valid: n === 1n,
    uniquePrimes,
    remainder: n.toString(),
  };
}

/**
 * Valida la integridad léxica y matemática de un programa Helix generado por IA
 * mediante codificación y factorización de Gödel sobre los 33 primos base [2..137].
 * Garantiza que no existan alucinaciones ni tokens fuera del conjunto cerrado Helix.
 */
export function validateHelixGodelChecksum(
  source: string,
  options: ValidateGodelChecksumOptions = {},
): GodelChecksumValidationReport {
  const {
    vocabulary = [],
    cells = [],
    expectedGodelProduct,
    expectedPositionalSignature,
  } = options;

  const rawLines = source.split(/\r?\n/);
  const lines: GodelLineValidation[] = [];
  const allBasisRunes: RuneToken[] = [];
  const foreignTokensSet = new Set<string>();
  let programGodelBigInt = 1n;

  rawLines.forEach((rawLine, idx) => {
    const clean = rawLine.split('#')[0].trim();
    if (!clean) return;

    const parts = clean.split(/\s+/);
    const headToken = parts[0];
    const args = parts.slice(1);

    // Verificar también que ningún argumento inyecte runas rúnicas ajenas a los 33 tokens
    const foreignArgRunes: string[] = [];
    for (const arg of args) {
      for (const ch of Array.from(arg)) {
        const cp = ch.codePointAt(0) ?? 0;
        const isUnicodeRunic = cp >= 0x16a0 && cp <= 0x16ff;
        if (isUnicodeRunic && !RUNE_BY_GLYPH.has(ch)) {
          foreignArgRunes.push(ch);
        }
      }
    }

    const resolution = resolveInstructionToBasisRunes(headToken, vocabulary, cells);

    if (!resolution.resolved || foreignArgRunes.length > 0) {
      const bad = [
        ...resolution.foreignTokens,
        ...foreignArgRunes,
      ];
      bad.forEach((tok) => foreignTokensSet.add(tok));

      lines.push({
        lineNumber: idx + 1,
        raw: clean,
        headToken,
        resolvedGlyphs: resolution.resolvedGlyphs,
        primes: [],
        lineGodelProduct: '0',
        lineSignature: '0x0000000000000000',
        factorizedValid: false,
        remainder: '0',
        status: 'ALUCINACION',
        reason:
          foreignArgRunes.length > 0
            ? `Argumento contiene runa(s) fuera de los 33 tokens Helix: ${foreignArgRunes.join(', ')}.`
            : resolution.reason,
      });
      return;
    }

    const lineGodel = computeGodelProduct(resolution.runes);
    const lineSig = computePositionalSignature(resolution.runes);
    const fact = factorizeGodelNumber(lineGodel.toString());

    if (!fact.valid) {
      foreignTokensSet.add(headToken);
    }

    allBasisRunes.push(...resolution.runes);
    programGodelBigInt *= lineGodel;

    lines.push({
      lineNumber: idx + 1,
      raw: clean,
      headToken,
      resolvedGlyphs: resolution.resolvedGlyphs,
      primes: resolution.runes.map((r) => r.prime),
      lineGodelProduct: lineGodel.toString(),
      lineSignature: lineSig,
      factorizedValid: fact.valid,
      remainder: fact.remainder,
      status: fact.valid ? 'VALIDO' : 'ALUCINACION',
      reason: fact.valid ? undefined : fact.error,
    });
  });

  const programGodelProduct = allBasisRunes.length > 0 ? programGodelBigInt.toString() : '1';
  const positionalSignature = computePositionalSignature(allBasisRunes);
  const progFactor = factorizeArbitraryLengthP33(programGodelProduct);

  let checksumMatched = true;
  let effectiveRemainder = progFactor.remainder;

  if (expectedGodelProduct !== undefined) {
    const cleanExpected = expectedGodelProduct.replace(/\s+/g, '');
    const expectedFactor = factorizeArbitraryLengthP33(cleanExpected);
    if (!expectedFactor.valid || cleanExpected !== programGodelProduct) {
      checksumMatched = false;
      if (!expectedFactor.valid) {
        effectiveRemainder = expectedFactor.remainder;
        foreignTokensSet.add(`PRIME_${expectedFactor.remainder}`);
      }
    }
  }

  if (
    expectedPositionalSignature !== undefined &&
    expectedPositionalSignature !== positionalSignature
  ) {
    checksumMatched = false;
  }

  const validLinesCount = lines.filter((l) => l.status === 'VALIDO').length;
  const foreignTokens = Array.from(foreignTokensSet);
  const valid =
    lines.length > 0 &&
    validLinesCount === lines.length &&
    allBasisRunes.length > 0 &&
    progFactor.valid &&
    progFactor.remainder === '1' &&
    checksumMatched &&
    foreignTokens.length === 0;

  let summary: string;
  if (lines.length === 0) {
    summary = 'Programa vacío: no contiene instrucciones codificables en la base de 33 tokens.';
  } else if (valid) {
    summary = `Checksum de Gödel íntegro: ${lines.length}/${lines.length} líneas y ${allBasisRunes.length} tokens factorizados exactamente en P33 (residuo = 1).`;
  } else if (!checksumMatched) {
    summary = `Fallo de checksum de Gödel: el producto esperado no coincide o contiene factor ajeno a P33 (residuo = ${effectiveRemainder}).`;
  } else {
    summary = `Alucinación detectada: ${foreignTokens.length} token(es) fuera del conjunto base de 33 tokens (${foreignTokens.join(', ')}).`;
  }

  return {
    valid,
    basisSize: RUNES.length,
    totalLines: lines.length,
    validLinesCount,
    totalBasisTokens: allBasisRunes.length,
    programGodelProduct,
    positionalSignature,
    factorizedPrimes: progFactor.uniquePrimes,
    remainder: effectiveRemainder,
    checksumMatched,
    foreignTokens,
    lines,
    summary,
  };
}


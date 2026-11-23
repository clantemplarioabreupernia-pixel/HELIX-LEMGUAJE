import { CompoundWord, INITIAL_COMPOUND_VOCABULARY } from '../data/vocabulary';
import type { HelixCell } from './helixCells';
import { resolveInstructionToBasisRunes } from './helixEngine';
import { checkDenominatorInP33 } from './rationalP33';
import { solveHelixConstraints, IntervalBound } from './helixSolver';
import { compileHelixScript } from './helixVm';

export const AUTOMATON_BOS = '<BOS>';
export const AUTOMATON_EOL = '\n';
export const AUTOMATON_EOS = '<EOS>';

export type GrammarPhase =
  | 'LINE_HEAD'
  | 'ARG_IDENTIFIER'
  | 'ARG_DECLARED_VAR'
  | 'ARG_VALUE_OR_VAR'
  | 'ARG_DENOM_P33'
  | 'ARG_LOOP_COUNT'
  | 'ARG_MEM_SIZE'
  | 'ARG_ARRAY_NAME'
  | 'ARG_ARRAY_SIZE'
  | 'ARG_ARRAY_INDEX'
  | 'ARG_FN_NAME'
  | 'ARG_CALL_ARG'
  | 'ARG_CMP_OP'
  | 'ARG_MESH_SHAPE'
  | 'ARG_MESH_TRIS'
  | 'ARG_ORM_UNIT'
  | 'ARG_MESH_NODE_ID'
  | 'ARG_WRITTEN_FILE'
  | 'ARG_SOA_CELLS'
  | 'ARG_UNIT_OPEN'
  | 'ARG_NONNEG_DT'
  | 'LINE_END_ONLY';

export interface AutomatonState {
  completedLines: string[];
  currentLineTokens: string[];
  phase: GrammarPhase;
  blockStack: { kind: 'IF' | 'ELSE' | 'LOOP' | 'FN'; loopCount: number }[];
  loopMultiplier: number;
  insideFn: boolean;
  kernelBooted: boolean;
  authenticated: boolean;
  soaInitialized: boolean;
  liveBlocksCount: number;
  unlockedBlocksCount: number;
  writtenFiles: string[];
  declaredVars: Record<string, IntervalBound>;
  declaredArrays: Record<string, number>;
  declaredFunctions: Record<string, { params: string[] }>;
  meshNodes: string[];
  remainingHeapBytes: number;
  remainingTriangles: number;
  lastLineHead: string;
}

export interface TokenMaskDecision {
  token: string;
  allowed: boolean;
  rule?: string;
  reason?: string;
}

export interface TokenMaskVectorResult {
  state: AutomatonState;
  allowedMask: boolean[];
  decisions: TokenMaskDecision[];
  allowedCount: number;
  maskedCount: number;
}

const RESERVED_HEAD_OPCODES = new Set([
  'SET',
  'ADD',
  'SUB',
  'MUL',
  'DIV',
  'IF',
  'ELSE',
  'LOOP',
  'END',
  'FN',
  'CALL',
  'LLAMAR',
  'RET',
  'BIEN',
  'RETORNO',
  'REQUIRES',
  'ENSURES',
  'ARRAY',
  'FORMACION',
  'FORMACIÓN',
  'ASET',
  'AGET',
  'FILE_WRITE',
  'FILE_READ',
  'FILE_DEL',
  'KERN_BOOT',
  'AUTH_CHECK',
  'MEM_INIT',
  'MEM_ALLOC',
  'MEM_FREE',
  'MEM_LOCK',
  'HEAP_CAP',
  'PROC_FORK',
  'PROC_RUN',
  'EXIT_OK',
  'MESH_NODE',
  'MAT_ORM',
  'CAM_6DOF',
  'WS_EMIT',
  'REG_PERSIST',
  'IO_BUS_TX',
  'SOA_INIT',
  'CURL_STEP',
  'NEMESIS_DECAY',
  'BLOCH_ROT',
  'BVN_LATTICE',
  'WEBER_GUARD',
]);

const RELATIONAL_OPS = new Set(['==', '!=', '>', '<', '>=', '<=']);
const MESH_SHAPES = new Set(['lathe', 'torus', 'extrude', 'prism']);

function normalizeHeadOpcode(
  head: string,
  vocabulary: CompoundWord[],
): string {
  const upper = head.toUpperCase();
  if (upper === 'LLAMAR') return 'CALL';
  if (upper === 'BIEN' || upper === 'RETORNO') return 'RET';
  if (upper === 'FORMACION' || upper === 'FORMACIÓN') return 'ARRAY';

  const vocabHit = vocabulary.find((v) => v.glyphs === head || v.opcode.toUpperCase() === upper);
  if (vocabHit) return vocabHit.opcode.toUpperCase();

  if (head === 'ᛇᚢ') return 'KERN_BOOT';
  if (head === 'ᛗᚦ') return 'AUTH_CHECK';
  if (head === 'ᚠᚷ') return 'MEM_ALLOC';
  if (head === 'ᚠᚢ') return 'MEM_INIT';
  if (head === 'ᚠᛠ') return 'MEM_FREE';
  if (head === 'ᛒᚢ') return 'PROC_FORK';
  if (head === 'ᚱᚳ') return 'PROC_RUN';
  if (head === 'ᚳᛏ') return 'EXIT_OK';
  if (head === 'ᛣᚪ') return 'REG_PERSIST';
  if (head === 'ᚩᛖ') return 'IO_BUS_TX';
  if (head === 'ᛟᚪ') return 'FILE_WRITE';
  if (head === 'ᛟᚩ') return 'FILE_READ';
  if (head === 'ᛟᛤ') return 'FILE_DEL';
  if (head === 'ᚠᛗ') return 'SOA_INIT';
  if (head === 'ᛟᚱ') return 'CURL_STEP';
  if (head === 'ᛏᛜ') return 'NEMESIS_DECAY';
  if (head === 'ᛒᚣ') return 'BLOCH_ROT';
  if (head === 'ᛉᛣ') return 'BVN_LATTICE';
  if (head === 'ᚹᛋ') return 'WEBER_GUARD';
  return upper;
}

function isPlainIdentifier(tok: string): boolean {
  if (!tok || tok === AUTOMATON_BOS || tok === AUTOMATON_EOL || tok === AUTOMATON_EOS) {
    return false;
  }
  if (RESERVED_HEAD_OPCODES.has(tok.toUpperCase())) return false;
  if (RELATIONAL_OPS.has(tok)) return false;
  if (/^-?\d+(\.\d+)?$/.test(tok)) return false;
  return /^[a-zA-Z_][a-zA-Z0-9_.\-]*$/.test(tok);
}

function computeNextPhase(
  currentLineTokens: string[],
  vocabulary: CompoundWord[],
  declaredFunctions: Record<string, { params: string[] }>,
): GrammarPhase {
  if (currentLineTokens.length === 0) return 'LINE_HEAD';
  const headOp = normalizeHeadOpcode(currentLineTokens[0], vocabulary);
  const argCount = currentLineTokens.length - 1;

  switch (headOp) {
    case 'KERN_BOOT':
    case 'EXIT_OK':
    case 'END':
    case 'ELSE':
    case 'PROC_RUN':
    case 'REG_PERSIST':
    case 'MEM_LOCK':
    case 'MEM_FREE':
      return 'LINE_END_ONLY';

    case 'AUTH_CHECK':
    case 'PROC_FORK':
      return argCount === 0 ? 'ARG_IDENTIFIER' : 'LINE_END_ONLY';

    case 'LOOP':
      return argCount === 0 ? 'ARG_LOOP_COUNT' : 'LINE_END_ONLY';

    case 'MEM_ALLOC':
    case 'MEM_INIT':
    case 'HEAP_CAP':
      return argCount === 0 ? 'ARG_MEM_SIZE' : 'LINE_END_ONLY';

    case 'SET':
      if (argCount === 0) return 'ARG_IDENTIFIER';
      if (argCount === 1) return 'ARG_VALUE_OR_VAR';
      return 'LINE_END_ONLY';

    case 'ADD':
    case 'SUB':
    case 'MUL':
      if (argCount === 0) return 'ARG_DECLARED_VAR';
      if (argCount === 1) return 'ARG_VALUE_OR_VAR';
      return 'LINE_END_ONLY';

    case 'DIV':
      if (argCount === 0) return 'ARG_DECLARED_VAR';
      if (argCount === 1) return 'ARG_DENOM_P33';
      return 'LINE_END_ONLY';

    case 'IF':
    case 'REQUIRES':
    case 'ENSURES':
      if (argCount === 0) return 'ARG_DECLARED_VAR';
      if (argCount === 1) return 'ARG_CMP_OP';
      if (argCount === 2) return 'ARG_VALUE_OR_VAR';
      return 'LINE_END_ONLY';

    case 'FILE_WRITE':
    case 'WS_EMIT':
    case 'IO_BUS_TX':
      if (argCount === 0) return 'ARG_IDENTIFIER';
      if (argCount === 1) return 'ARG_VALUE_OR_VAR';
      return 'LINE_END_ONLY';

    case 'FILE_READ':
    case 'FILE_DEL':
      return argCount === 0 ? 'ARG_WRITTEN_FILE' : 'LINE_END_ONLY';

    case 'ARRAY':
      if (argCount === 0) return 'ARG_IDENTIFIER';
      if (argCount === 1) return 'ARG_ARRAY_SIZE';
      if (argCount === 2) return 'ARG_VALUE_OR_VAR';
      return 'LINE_END_ONLY';

    case 'ASET':
      if (argCount === 0) return 'ARG_ARRAY_NAME';
      if (argCount === 1) return 'ARG_ARRAY_INDEX';
      if (argCount === 2) return 'ARG_VALUE_OR_VAR';
      return 'LINE_END_ONLY';

    case 'AGET':
      if (argCount === 0) return 'ARG_ARRAY_NAME';
      if (argCount === 1) return 'ARG_ARRAY_INDEX';
      if (argCount === 2) return 'ARG_IDENTIFIER';
      return 'LINE_END_ONLY';

    case 'FN':
      if (argCount === 0) return 'ARG_IDENTIFIER';
      return argCount <= 2 ? 'ARG_IDENTIFIER' : 'LINE_END_ONLY';

    case 'CALL': {
      if (argCount === 0) return 'ARG_FN_NAME';
      const fnName = currentLineTokens[1];
      const expectedParams = declaredFunctions[fnName]?.params.length ?? 0;
      if (argCount - 1 < expectedParams) return 'ARG_CALL_ARG';
      if (currentLineTokens[currentLineTokens.length - 1] === '->') return 'ARG_IDENTIFIER';
      return 'LINE_END_ONLY';
    }

    case 'RET':
      return argCount === 0 ? 'ARG_VALUE_OR_VAR' : 'LINE_END_ONLY';

    case 'MESH_NODE':
      if (argCount === 0) return 'ARG_IDENTIFIER';
      if (argCount === 1) return 'ARG_MESH_SHAPE';
      if (argCount === 2) return 'ARG_MESH_TRIS';
      if (argCount === 3) return 'ARG_VALUE_OR_VAR';
      return 'LINE_END_ONLY';

    case 'MAT_ORM':
      if (argCount === 0) return 'ARG_MESH_NODE_ID';
      if (argCount >= 1 && argCount <= 3) return 'ARG_ORM_UNIT';
      return 'LINE_END_ONLY';

    case 'CAM_6DOF':
      if (argCount < 6) return 'ARG_VALUE_OR_VAR';
      return 'LINE_END_ONLY';

    case 'SOA_INIT':
      return argCount === 0 ? 'ARG_SOA_CELLS' : 'LINE_END_ONLY';

    case 'CURL_STEP':
      if (argCount === 0) return 'ARG_VALUE_OR_VAR';
      if (argCount === 1) return 'ARG_NONNEG_DT';
      return 'LINE_END_ONLY';

    case 'NEMESIS_DECAY':
      return argCount === 0 ? 'ARG_UNIT_OPEN' : 'LINE_END_ONLY';

    case 'BLOCH_ROT':
      if (argCount < 4) return 'ARG_VALUE_OR_VAR';
      if (argCount === 4) return 'ARG_NONNEG_DT';
      return 'LINE_END_ONLY';

    case 'BVN_LATTICE':
      if (argCount < 3) return 'ARG_VALUE_OR_VAR';
      if (argCount === 3) return 'ARG_IDENTIFIER';
      return 'LINE_END_ONLY';

    case 'WEBER_GUARD':
      if (argCount === 0) return 'ARG_UNIT_OPEN';
      if (argCount < 3) return 'ARG_VALUE_OR_VAR';
      if (argCount === 3) return 'ARG_IDENTIFIER';
      return 'LINE_END_ONLY';

    default:
      return argCount === 0 ? 'LINE_END_ONLY' : 'LINE_END_ONLY';
  }
}

/**
 * Construye el estado exacto del Autómata Gramatical + Solver SMT
 * dado el prefijo de líneas completas y los tokens parciales de la línea en curso.
 */
export function createAutomatonContext(
  completedLines: string[],
  currentLineTokens: string[] = [],
  vocabulary: CompoundWord[] = INITIAL_COMPOUND_VOCABULARY,
): AutomatonState {
  const cleanCompleted = completedLines.map((l) => l.trim()).filter(Boolean);
  const compiled = compileHelixScript(cleanCompleted.join('\n'), vocabulary);

  // Cerrar bloques abiertos temporalmente para que solveHelixConstraints evalúe multiplicadores LOOP y presupuestos exactos
  let openCount = 0;
  for (const inst of compiled) {
    const op = inst.opcode.toUpperCase();
    if (op === 'IF' || op === 'LOOP' || op === 'FN') openCount++;
    else if (op === 'END') openCount = Math.max(0, openCount - 1);
  }
  const solverInput =
    openCount > 0
      ? compileHelixScript(
          [...cleanCompleted, ...Array.from({ length: openCount }, () => 'END')].join('\n'),
          vocabulary,
        )
      : compiled;
  const sym = solverInput.length > 0 ? solveHelixConstraints(solverInput) : undefined;

  const blockStack: AutomatonState['blockStack'] = [];
  const declaredFunctions: Record<string, { params: string[] }> = {};
  const declaredArrays: Record<string, number> = {};
  const declaredVars: Record<string, IntervalBound> = sym
    ? { ...sym.variableBounds }
    : {};
  const meshNodes: string[] = [];
  const writtenFiles: string[] = [];
  let kernelBooted = false;
  let authenticated = false;
  let soaInitialized = false;
  let liveBlocksCount = 0;
  let unlockedBlocksCount = 0;
  let activeFnParams: string[] = [];

  for (const inst of compiled) {
    const op = inst.opcode.toUpperCase();
    if (op === 'KERN_BOOT') kernelBooted = true;
    else if (op === 'AUTH_CHECK') authenticated = true;
    else if (op === 'SOA_INIT') {
      soaInitialized = true;
      liveBlocksCount++;
      unlockedBlocksCount++;
    } else if (op === 'MEM_ALLOC' || op === 'MEM_INIT') {
      liveBlocksCount++;
      unlockedBlocksCount++;
    } else if (op === 'MEM_LOCK') {
      if (unlockedBlocksCount > 0) unlockedBlocksCount--;
    } else if (op === 'MEM_FREE') {
      if (unlockedBlocksCount > 0) unlockedBlocksCount--;
      if (liveBlocksCount > 0) liveBlocksCount--;
    } else if (op === 'FILE_WRITE' && inst.args[0]) {
      if (!writtenFiles.includes(inst.args[0])) writtenFiles.push(inst.args[0]);
    } else if (op === 'FILE_DEL' && inst.args[0]) {
      const idx = writtenFiles.indexOf(inst.args[0]);
      if (idx >= 0) writtenFiles.splice(idx, 1);
    } else if (op === 'IF') blockStack.push({ kind: 'IF', loopCount: 1 });
    else if (op === 'ELSE') {
      const top = blockStack[blockStack.length - 1];
      if (top?.kind === 'IF') top.kind = 'ELSE';
    } else if (op === 'LOOP') {
      const n = Number(inst.args[0]);
      blockStack.push({ kind: 'LOOP', loopCount: Number.isFinite(n) && n > 0 ? Math.floor(n) : 1 });
    } else if (op === 'FN') {
      if (inst.args[0]) {
        const params = inst.args.slice(1);
        declaredFunctions[inst.args[0]] = { params };
        activeFnParams = params;
      }
      blockStack.push({ kind: 'FN', loopCount: 1 });
    } else if (op === 'END') {
      const popped = blockStack.pop();
      if (popped?.kind === 'FN') activeFnParams = [];
    } else if (op === 'SET' && inst.args[0] && !declaredVars[inst.args[0]]) {
      const v = Number(inst.args[1]);
      declaredVars[inst.args[0]] = Number.isNaN(v) ? { min: -Infinity, max: Infinity } : { min: v, max: v };
    } else if (op === 'CALL') {
      const arrowIdx = inst.args.indexOf('->');
      if (arrowIdx >= 0 && inst.args[arrowIdx + 1] && !declaredVars[inst.args[arrowIdx + 1]]) {
        declaredVars[inst.args[arrowIdx + 1]] = { min: -Infinity, max: Infinity };
      }
    } else if (op === 'ARRAY' && inst.args[0]) {
      const sz = Math.floor(Number(inst.args[1]));
      if (Number.isFinite(sz) && sz >= 1 && sz <= 256) {
        declaredArrays[inst.args[0]] = sz;
      }
    } else if (op === 'AGET' && inst.args[2] && !declaredVars[inst.args[2]]) {
      declaredVars[inst.args[2]] = { min: -Infinity, max: Infinity };
    } else if ((op === 'BVN_LATTICE' || op === 'WEBER_GUARD') && inst.args[3] && !declaredVars[inst.args[3]]) {
      declaredVars[inst.args[3]] = { min: 0, max: 1 };
    } else if (op === 'MESH_NODE' && inst.args[0] && !meshNodes.includes(inst.args[0])) {
      meshNodes.push(inst.args[0]);
    }
  }

  const insideFn = blockStack.some((b) => b.kind === 'FN');
  if (insideFn) {
    for (const p of activeFnParams) {
      if (!declaredVars[p]) {
        declaredVars[p] = { min: -Infinity, max: Infinity };
      }
    }
  }
  const loopMultiplier = blockStack.reduce(
    (acc, b) => (b.kind === 'LOOP' ? acc * b.loopCount : acc),
    1,
  );
  const lastInst = compiled[compiled.length - 1];
  const lastLineHead = lastInst ? lastInst.opcode.toUpperCase() : '';

  const phase = computeNextPhase(currentLineTokens, vocabulary, declaredFunctions);

  return {
    completedLines: cleanCompleted,
    currentLineTokens: [...currentLineTokens],
    phase,
    blockStack,
    loopMultiplier,
    insideFn,
    kernelBooted,
    authenticated,
    soaInitialized,
    liveBlocksCount,
    unlockedBlocksCount,
    writtenFiles,
    declaredVars,
    declaredArrays,
    declaredFunctions,
    meshNodes,
    remainingHeapBytes: Math.max(0, 1024 - (sym?.maxHeapBytes ?? 0)),
    remainingTriangles: Math.max(0, 10000 - (sym?.totalTriangles ?? 0)),
    lastLineHead,
  };
}

/**
 * Evalúa un único token candidato `tok` contra el estado actual del Autómata Gramatical
 * (CFG/PDA) + Base de 33 tokens + Invariantes SMT.
 */
export function evaluateTokenAgainstAutomaton(
  state: AutomatonState,
  tok: string,
  vocabulary: CompoundWord[] = INITIAL_COMPOUND_VOCABULARY,
  cells: HelixCell[] = [],
): TokenMaskDecision {
  if (tok === AUTOMATON_BOS) {
    return { token: tok, allowed: false, rule: 'CFG_BOS', reason: 'Token <BOS> prohibido tras el inicio.' };
  }

  // Fase 1: Inicio de línea -> debe ser una cabecera válida en los 33 tokens o <EOS> al cerrar
  if (state.phase === 'LINE_HEAD') {
    if (tok === AUTOMATON_EOS) {
      const canClose =
        state.blockStack.length === 0 &&
        state.completedLines.length > 0 &&
        state.lastLineHead === 'EXIT_OK';
      return canClose
        ? { token: tok, allowed: true }
        : {
            token: tok,
            allowed: false,
            rule: state.blockStack.length > 0 ? 'UNCLOSED_BLOCK' : 'CFG_NEEDS_EXIT_OK',
            reason:
              state.blockStack.length > 0
                ? 'Prohibido <EOS> con bloques LOOP/IF/FN abiertos.'
                : 'El programa debe cerrar con ᚳᛏ (EXIT_OK) antes de <EOS>.',
          };
    }

    if (tok === AUTOMATON_EOL) {
      return { token: tok, allowed: false, rule: 'CFG_EMPTY_LINE', reason: 'Se esperaba instrucción en LINE_HEAD.' };
    }

    const basisCheck = resolveInstructionToBasisRunes(tok, vocabulary, cells);
    if (!basisCheck.resolved) {
      return {
        token: tok,
        allowed: false,
        rule: 'GODEL_OUT_OF_BASIS',
        reason: basisCheck.reason ?? `Token "${tok}" fuera de los 33 tokens Helix.`,
      };
    }

    const normOp = normalizeHeadOpcode(tok, vocabulary);
    if (/^-?\d+(\.\d+)?$/.test(tok) || RELATIONAL_OPS.has(tok)) {
      return { token: tok, allowed: false, rule: 'CFG_INVALID_HEAD', reason: 'Literal o símbolo no válido como opcode.' };
    }

    const needsBoot = new Set([
      'MEM_INIT',
      'MEM_ALLOC',
      'MEM_LOCK',
      'MEM_FREE',
      'HEAP_CAP',
      'FILE_WRITE',
      'FILE_READ',
      'FILE_DEL',
      'PROC_FORK',
      'PROC_RUN',
      'MESH_NODE',
      'MAT_ORM',
      'CAM_6DOF',
      'WS_EMIT',
      'ARRAY',
      'ASET',
      'AGET',
      'REG_PERSIST',
      'IO_BUS_TX',
      'SOA_INIT',
      'CURL_STEP',
      'NEMESIS_DECAY',
      'BLOCH_ROT',
      'BVN_LATTICE',
      'WEBER_GUARD',
    ]);
    if (needsBoot.has(normOp) && !state.kernelBooted) {
      return {
        token: tok,
        allowed: false,
        rule: 'BOOT_PRECONDITION',
        reason: `${normOp} bloqueado antes de KERN_BOOT (ᛇᚢ).`,
      };
    }

    if ((normOp === 'FILE_WRITE' || normOp === 'FILE_DEL') && !state.authenticated) {
      return {
        token: tok,
        allowed: false,
        rule: 'ACL_PRECONDITION',
        reason: `${normOp} bloqueado antes de AUTH_CHECK (ᛗᚦ).`,
      };
    }

    if (normOp === 'END' && state.blockStack.length === 0) {
      return { token: tok, allowed: false, rule: 'AST_ORPHAN_END', reason: 'END sin bloque abierto.' };
    }

    if (normOp === 'ELSE') {
      const top = state.blockStack[state.blockStack.length - 1];
      if (!top || top.kind !== 'IF') {
        return { token: tok, allowed: false, rule: 'AST_ORPHAN_ELSE', reason: 'ELSE sin IF abierto.' };
      }
    }

    if (normOp === 'RET' && !state.insideFn) {
      return { token: tok, allowed: false, rule: 'AST_ORPHAN_RET', reason: 'RET fuera de FN ... END.' };
    }

    if (normOp === 'EXIT_OK' && state.blockStack.length > 0) {
      return {
        token: tok,
        allowed: false,
        rule: 'UNCLOSED_BLOCK',
        reason: `EXIT_OK prohibido con ${state.blockStack.length} bloque(s) abiertos.`,
      };
    }

    if (normOp === 'FN' && state.insideFn) {
      return { token: tok, allowed: false, rule: 'AST_NESTED_FN', reason: 'FN anidado prohibido.' };
    }

    if ((normOp === 'REQUIRES' || normOp === 'ENSURES') && !state.insideFn) {
      return { token: tok, allowed: false, rule: 'CFG_CONTRACT_OUTSIDE_FN', reason: `${normOp} solo dentro de FN.` };
    }

    const varMutOps = new Set(['ADD', 'SUB', 'MUL', 'DIV']);
    if (varMutOps.has(normOp) && Object.keys(state.declaredVars).length === 0) {
      return {
        token: tok,
        allowed: false,
        rule: 'TYPESTATE_UNINIT_VAR',
        reason: `${normOp} bloqueado: ninguna variable declarada con SET aún.`,
      };
    }

    if ((normOp === 'ASET' || normOp === 'AGET') && Object.keys(state.declaredArrays).length === 0) {
      return {
        token: tok,
        allowed: false,
        rule: 'SMT_ARRAY_BOUNDS',
        reason: `${normOp} bloqueado: ningún arreglo ARRAY declarado aún.`,
      };
    }

    if (normOp === 'CALL' && Object.keys(state.declaredFunctions).length === 0) {
      return {
        token: tok,
        allowed: false,
        rule: 'AST_UNKNOWN_FN',
        reason: 'CALL bloqueado: ninguna función FN declarada aún.',
      };
    }

    if (normOp === 'MAT_ORM' && state.meshNodes.length === 0) {
      return {
        token: tok,
        allowed: false,
        rule: 'SCENE_NO_MESH',
        reason: 'MAT_ORM bloqueado: no hay MESH_NODE declarado.',
      };
    }

    if ((normOp === 'MEM_ALLOC' || normOp === 'MEM_INIT') && state.remainingHeapBytes <= 0) {
      return {
        token: tok,
        allowed: false,
        rule: 'SMT_MEM_BOUNDS',
        reason: 'Heap agotado (0 B disponibles).',
      };
    }

    if (normOp === 'SOA_INIT' && state.remainingHeapBytes < 28) {
      return {
        token: tok,
        allowed: false,
        rule: 'SMT_MEM_BOUNDS',
        reason: 'Heap insuficiente (< 28 B) para celda Pauli-SoA.',
      };
    }

    if ((normOp === 'CURL_STEP' || normOp === 'NEMESIS_DECAY') && !state.soaInitialized) {
      return {
        token: tok,
        allowed: false,
        rule: 'TYPESTATE_UNINIT_VAR',
        reason: `${normOp} bloqueado antes de SOA_INIT (ᚠᛗ).`,
      };
    }

    if (normOp === 'MEM_FREE' && (state.unlockedBlocksCount < state.loopMultiplier || state.liveBlocksCount === 0)) {
      return {
        token: tok,
        allowed: false,
        rule: 'TYPESTATE_DOUBLE_FREE',
        reason: 'MEM_FREE bloqueado: sin bloque desbloqueado disponible.',
      };
    }

    if (normOp === 'MEM_LOCK' && state.unlockedBlocksCount === 0) {
      return {
        token: tok,
        allowed: false,
        rule: 'TYPESTATE_LOCKED_FREE',
        reason: 'MEM_LOCK bloqueado: sin bloque RW desbloqueado disponible.',
      };
    }

    if ((normOp === 'FILE_READ' || normOp === 'FILE_DEL') && state.writtenFiles.length === 0) {
      return {
        token: tok,
        allowed: false,
        rule: 'VFS_ENOENT',
        reason: `${normOp} bloqueado: aún no existe ningún archivo escrito en el VFS.`,
      };
    }

    return { token: tok, allowed: true };
  }

  // Fase 2: Cierre obligatorio de línea (o '->' opcional tras argumentos posicionales de CALL)
  if (state.phase === 'LINE_END_ONLY') {
    const headOp = normalizeHeadOpcode(state.currentLineTokens[0] ?? '', vocabulary);
    if (
      tok === '->' &&
      headOp === 'CALL' &&
      !state.currentLineTokens.includes('->') &&
      state.currentLineTokens.length >= 2
    ) {
      return { token: tok, allowed: true };
    }
    return tok === AUTOMATON_EOL
      ? { token: tok, allowed: true }
      : { token: tok, allowed: false, rule: 'CFG_EXPECT_EOL', reason: 'Se esperaba salto de línea \\n.' };
  }

  if (tok === AUTOMATON_EOL || tok === AUTOMATON_EOS) {
    // RET sin argumento puede cerrar en EOL, FN con >= 1 nombre puede cerrar en EOL, ARRAY con >= 2 args
    const headOp = normalizeHeadOpcode(state.currentLineTokens[0] ?? '', vocabulary);
    if (
      tok === AUTOMATON_EOL &&
      ((headOp === 'RET') ||
        (headOp === 'ARRAY' && state.currentLineTokens.length >= 3) ||
        (headOp === 'FN' && state.currentLineTokens.length >= 2) ||
        (headOp === 'CURL_STEP' && state.currentLineTokens.length >= 2) ||
        (headOp === 'BLOCH_ROT' && state.currentLineTokens.length >= 5) ||
        (headOp === 'BVN_LATTICE' && state.currentLineTokens.length >= 4) ||
        (headOp === 'WEBER_GUARD' && state.currentLineTokens.length >= 4) ||
        (headOp === 'CALL' &&
          state.currentLineTokens.length >= 2 &&
          !state.currentLineTokens.includes('->') &&
          (state.declaredFunctions[state.currentLineTokens[1]]?.params.length ?? 0) <=
            state.currentLineTokens.length - 2))
    ) {
      return { token: tok, allowed: true };
    }
    return {
      token: tok,
      allowed: false,
      rule: 'CFG_INCOMPLETE_ARGS',
      reason: `Faltan operandos para fase ${state.phase}.`,
    };
  }

  // Validar por fase de argumento exacta
  switch (state.phase) {
    case 'ARG_IDENTIFIER':
      return isPlainIdentifier(tok)
        ? { token: tok, allowed: true }
        : { token: tok, allowed: false, rule: 'CFG_EXPECT_IDENT', reason: `Se esperaba identificador, recibido "${tok}".` };

    case 'ARG_DECLARED_VAR': {
      const headOp = normalizeHeadOpcode(state.currentLineTokens[0] ?? '', vocabulary);
      if (headOp === 'ENSURES' && tok === 'RET_VAL') {
        return { token: tok, allowed: true };
      }
      return Object.prototype.hasOwnProperty.call(state.declaredVars, tok)
        ? { token: tok, allowed: true }
        : { token: tok, allowed: false, rule: 'TYPESTATE_UNINIT_VAR', reason: `"${tok}" no es una variable inicializada.` };
    }

    case 'ARG_VALUE_OR_VAR': {
      const headOp = normalizeHeadOpcode(state.currentLineTokens[0] ?? '', vocabulary);
      // Si es argumento 2 de ARRAY (opcional inicializador), puede ser EOL o número
      const isNum = /^-?\d+(\.\d+)?$/.test(tok);
      const isDeclVar = Object.prototype.hasOwnProperty.call(state.declaredVars, tok);
      if (isNum || isDeclVar) {
        if (headOp === 'MESH_NODE' && state.currentLineTokens.length === 4) {
          const scaleVal = isNum ? Number(tok) : state.declaredVars[tok]?.max ?? 1;
          if (scaleVal <= 0 || scaleVal > 8) {
            return { token: tok, allowed: false, rule: 'SMT_MESH_BUDGET', reason: 'Escala 3D fuera de (0..8].' };
          }
        }
        return { token: tok, allowed: true };
      }
      if ((headOp === 'FILE_WRITE' || headOp === 'WS_EMIT' || headOp === 'IO_BUS_TX') && isPlainIdentifier(tok)) {
        return { token: tok, allowed: true };
      }
      return { token: tok, allowed: false, rule: 'TYPESTATE_OR_LITERAL', reason: `Valor inválido "${tok}" en ${headOp}.` };
    }

    case 'ARG_DENOM_P33': {
      if (/^-?\d+$/.test(tok)) {
        const n = Number(tok);
        if (n === 0) {
          return { token: tok, allowed: false, rule: 'SMT_DIV_ZERO', reason: 'Divisor 0 bloqueado token-a-token.' };
        }
        const chk = checkDenominatorInP33(BigInt(Math.abs(n)));
        if (!chk.inSubringP33) {
          return {
            token: tok,
            allowed: false,
            rule: 'P33_DENOMINATOR',
            reason: `Divisor ${tok} fuera del subanillo P33 (residuo ${chk.remainderFactor.toString()}).`,
          };
        }
        return { token: tok, allowed: true };
      }
      if (Object.prototype.hasOwnProperty.call(state.declaredVars, tok)) {
        const b = state.declaredVars[tok];
        if (b.min <= 0 && b.max >= 0) {
          return { token: tok, allowed: false, rule: 'SMT_DIV_ZERO', reason: `Variable ${tok} puede valer 0.` };
        }
        return { token: tok, allowed: true };
      }
      return { token: tok, allowed: false, rule: 'SMT_DIV_INVALID', reason: `"${tok}" no es divisor P33 válido.` };
    }

    case 'ARG_LOOP_COUNT': {
      if (/^-?\d+$/.test(tok)) {
        const n = Number(tok);
        if (n < 1 || n > 100) {
          return {
            token: tok,
            allowed: false,
            rule: 'BOUNDED_LOOP',
            reason: `LOOP ${tok} fuera del límite determinista [1..100].`,
          };
        }
        return { token: tok, allowed: true };
      }
      return { token: tok, allowed: false, rule: 'BOUNDED_LOOP', reason: 'LOOP requiere entero literal en [1..100].' };
    }

    case 'ARG_MEM_SIZE': {
      let maxBytes = NaN;
      let minBytes = NaN;
      if (/^-?\d+(\.\d+)?$/.test(tok)) {
        maxBytes = Number(tok);
        minBytes = maxBytes;
      } else if (Object.prototype.hasOwnProperty.call(state.declaredVars, tok)) {
        maxBytes = state.declaredVars[tok].max;
        minBytes = state.declaredVars[tok].min;
      } else {
        return { token: tok, allowed: false, rule: 'TYPESTATE_UNINIT_VAR', reason: `"${tok}" no inicializado para MEM_ALLOC.` };
      }
      if (minBytes <= 0 || maxBytes * state.loopMultiplier > state.remainingHeapBytes) {
        return {
          token: tok,
          allowed: false,
          rule: 'SMT_MEM_BOUNDS',
          reason: `${tok} (${maxBytes}×${state.loopMultiplier}=${maxBytes * state.loopMultiplier} B) excede heap restante (${state.remainingHeapBytes} B).`,
        };
      }
      return { token: tok, allowed: true };
    }

    case 'ARG_ARRAY_NAME':
      return Object.prototype.hasOwnProperty.call(state.declaredArrays, tok)
        ? { token: tok, allowed: true }
        : { token: tok, allowed: false, rule: 'SMT_ARRAY_BOUNDS', reason: `Arreglo "${tok}" no declarado.` };

    case 'ARG_ARRAY_SIZE': {
      if (/^\d+$/.test(tok)) {
        const n = Number(tok);
        if (n >= 1 && n <= 256) return { token: tok, allowed: true };
      }
      return { token: tok, allowed: false, rule: 'BOUNDED_ARRAY', reason: 'Tamaño ARRAY debe estar en [1..256].' };
    }

    case 'ARG_ARRAY_INDEX': {
      const arrName = state.currentLineTokens[1];
      const arrSize = state.declaredArrays[arrName] ?? 0;
      let idxMin = NaN;
      let idxMax = NaN;
      if (/^-?\d+$/.test(tok)) {
        idxMin = Number(tok);
        idxMax = idxMin;
      } else if (Object.prototype.hasOwnProperty.call(state.declaredVars, tok)) {
        idxMin = state.declaredVars[tok].min;
        idxMax = state.declaredVars[tok].max;
      } else {
        return { token: tok, allowed: false, rule: 'SMT_ARRAY_BOUNDS', reason: `Índice "${tok}" inválido o no declarado.` };
      }
      if (idxMin < 0 || idxMax >= arrSize) {
        return {
          token: tok,
          allowed: false,
          rule: 'SMT_ARRAY_BOUNDS',
          reason: `Índice "${tok}" ∈ [${idxMin}, ${idxMax}] fuera de [0, ${arrSize - 1}].`,
        };
      }
      return { token: tok, allowed: true };
    }

    case 'ARG_FN_NAME':
      return Object.prototype.hasOwnProperty.call(state.declaredFunctions, tok)
        ? { token: tok, allowed: true }
        : { token: tok, allowed: false, rule: 'AST_UNKNOWN_FN', reason: `Función "${tok}" no declarada.` };

    case 'ARG_CALL_ARG': {
      const isNum = /^-?\d+(\.\d+)?$/.test(tok);
      const isDeclVar = Object.prototype.hasOwnProperty.call(state.declaredVars, tok);
      return isNum || isDeclVar
        ? { token: tok, allowed: true }
        : { token: tok, allowed: false, rule: 'TYPESTATE_UNINIT_VAR', reason: `Argumento de CALL "${tok}" inválido.` };
    }

    case 'ARG_CMP_OP':
      return RELATIONAL_OPS.has(tok)
        ? { token: tok, allowed: true }
        : { token: tok, allowed: false, rule: 'CFG_EXPECT_CMP', reason: 'Se esperaba operador relacional (== != > < >= <=).' };

    case 'ARG_MESH_SHAPE':
      return MESH_SHAPES.has(tok.toLowerCase())
        ? { token: tok, allowed: true }
        : { token: tok, allowed: false, rule: 'CFG_EXPECT_SHAPE', reason: 'Forma 3D debe ser lathe|torus|extrude|prism.' };

    case 'ARG_MESH_TRIS': {
      if (/^\d+$/.test(tok)) {
        const tris = Number(tok);
        if (tris > 0 && tris * state.loopMultiplier <= state.remainingTriangles) {
          return { token: tok, allowed: true };
        }
        return {
          token: tok,
          allowed: false,
          rule: 'SMT_MESH_BUDGET',
          reason: `${tris}×${state.loopMultiplier} Δ excede presupuesto restante (${state.remainingTriangles} Δ).`,
        };
      }
      return { token: tok, allowed: false, rule: 'SMT_MESH_BUDGET', reason: 'Se esperaba entero positivo de triángulos.' };
    }

    case 'ARG_ORM_UNIT': {
      if (/^-?\d+(\.\d+)?$/.test(tok)) {
        const v = Number(tok);
        if (v >= 0 && v <= 1) return { token: tok, allowed: true };
        return { token: tok, allowed: false, rule: 'SMT_ORM_BOUNDS', reason: `Canal PBR ${tok} fuera de [0, 1].` };
      }
      return { token: tok, allowed: false, rule: 'SMT_ORM_BOUNDS', reason: 'Canal PBR ORM requiere valor numérico en [0, 1].' };
    }

    case 'ARG_MESH_NODE_ID':
      return state.meshNodes.includes(tok)
        ? { token: tok, allowed: true }
        : { token: tok, allowed: false, rule: 'SCENE_NO_MESH', reason: `Nodo 3D "${tok}" no declarado en escena.` };

    case 'ARG_WRITTEN_FILE':
      return state.writtenFiles.includes(tok)
        ? { token: tok, allowed: true }
        : { token: tok, allowed: false, rule: 'VFS_ENOENT', reason: `Archivo "${tok}" no existe aún en VFS.` };

    case 'ARG_SOA_CELLS': {
      if (/^\d+$/.test(tok)) {
        const cells = Number(tok);
        const bytes = cells * 28;
        if (cells >= 1 && cells <= 256 && bytes <= state.remainingHeapBytes) {
          return { token: tok, allowed: true };
        }
        return {
          token: tok,
          allowed: false,
          rule: 'SMT_MEM_BOUNDS',
          reason: `SOA_INIT ${cells} (${bytes} B) excede [1..256] o heap restante (${state.remainingHeapBytes} B).`,
        };
      }
      return { token: tok, allowed: false, rule: 'SMT_MEM_BOUNDS', reason: 'SOA_INIT requiere entero de celdas en [1..256].' };
    }

    case 'ARG_UNIT_OPEN': {
      let minV = NaN;
      let maxV = NaN;
      if (/^-?\d+(\.\d+)?$/.test(tok)) {
        minV = Number(tok);
        maxV = minV;
      } else if (Object.prototype.hasOwnProperty.call(state.declaredVars, tok)) {
        minV = state.declaredVars[tok].min;
        maxV = state.declaredVars[tok].max;
      } else {
        return { token: tok, allowed: false, rule: 'SMT_PHYSICS_STABILITY', reason: `"${tok}" no es factor físico válido en (0, 1).` };
      }
      if (minV > 0 && maxV < 1) return { token: tok, allowed: true };
      return {
        token: tok,
        allowed: false,
        rule: 'SMT_PHYSICS_STABILITY',
        reason: `Factor ${tok} ∈ [${minV}, ${maxV}] fuera de (0, 1) (viola disipación contráctil o Weber-Fechner).`,
      };
    }

    case 'ARG_NONNEG_DT': {
      let minV = NaN;
      let maxV = NaN;
      if (/^-?\d+(\.\d+)?$/.test(tok)) {
        minV = Number(tok);
        maxV = minV;
      } else if (Object.prototype.hasOwnProperty.call(state.declaredVars, tok)) {
        minV = state.declaredVars[tok].min;
        maxV = state.declaredVars[tok].max;
      } else {
        return { token: tok, allowed: false, rule: 'SMT_PHYSICS_STABILITY', reason: `Paso temporal "${tok}" inválido.` };
      }
      if (minV > 0 && maxV <= 1) return { token: tok, allowed: true };
      return {
        token: tok,
        allowed: false,
        rule: 'SMT_PHYSICS_STABILITY',
        reason: `Paso dt=${tok} fuera de (0, 1] estable.`,
      };
    }

    default:
      return { token: tok, allowed: false, rule: 'CFG_UNKNOWN_STATE' };
  }
}

/**
 * Calcula el vector completo de máscara token-a-token para todo el vocabulario |V| del Mini-GPT.
 */
export function computeTokenMaskVector(
  state: AutomatonState,
  vocab: string[],
  vocabulary: CompoundWord[] = INITIAL_COMPOUND_VOCABULARY,
  cells: HelixCell[] = [],
): TokenMaskVectorResult {
  const decisions = vocab.map((tok) =>
    evaluateTokenAgainstAutomaton(state, tok, vocabulary, cells),
  );
  const allowedMask = decisions.map((d) => d.allowed);
  const allowedCount = allowedMask.filter(Boolean).length;
  return {
    state,
    allowedMask,
    decisions,
    allowedCount,
    maskedCount: vocab.length - allowedCount,
  };
}

/**
 * Avanza exactamente 1 token el estado del autómata gramatical (de forma incremental).
 */
export function advanceAutomatonToken(
  state: AutomatonState,
  chosenToken: string,
  vocabulary: CompoundWord[] = INITIAL_COMPOUND_VOCABULARY,
): AutomatonState {
  if (chosenToken === AUTOMATON_EOL) {
    const lineStr = state.currentLineTokens.join(' ').trim();
    const nextCompleted = lineStr ? [...state.completedLines, lineStr] : state.completedLines;
    return createAutomatonContext(nextCompleted, [], vocabulary);
  }
  const nextLineTokens = [...state.currentLineTokens, chosenToken];
  return createAutomatonContext(state.completedLines, nextLineTokens, vocabulary);
}

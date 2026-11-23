import { RUNES } from '../data/runes';
import { INITIAL_COMPOUND_VOCABULARY, CompoundWord } from '../data/vocabulary';
import { parseHelixPhrase } from './helixEngine';
import { solveHelixConstraints, SymbolicReport } from './helixSolver';
import { ProofCarryingCertificate } from './helixPcc';
import { generateStructuredGoScriptFile } from './helixGoScriptExporter';
import {
  checkDenominatorInP33,
  formatRationalP33,
  makeRationalP33,
} from './rationalP33';
import {
  createSoABuffer,
  packToSoABuffer,
  SoAHolographicBuffer,
} from './helixSignal';
import {
  BlochState,
  createBlochState,
  createPauliSoAPhysicsState,
  evaluateWeberFechnerFrame,
  evolveSchrodingerPauli,
  PauliSoAPhysicsState,
  PauliSoAPhysicsStepReport,
  projectorFromBlochAngle,
  stepNemesisCauchy,
  stepPauliSoAPhysics,
  verifyBirkhoffVonNeumannNonDistributivity,
} from './helixPhysics';

export interface MemoryBlock {
  id: string;
  address: number;
  size: number;
  locked: boolean;
  ownerPid: number;
  status: 'ALLOCATED' | 'FREED';
}

export interface ProcessEntry {
  pid: number;
  parentPid: number;
  name: string;
  priority: number;
  state: 'READY' | 'RUNNING' | 'SANDBOXED' | 'TERMINATED';
  exitCode: number | null;
}

export interface VirtualFileEntry {
  name: string;
  owner: string;
  content: string;
  sizeBytes: number;
  updatedAtTick: number;
}

export interface ExecutionLogEntry {
  step: number;
  line: number;
  raw: string;
  opcode: string;
  glyphs: string;
  bytecodeHex: string;
  status: 'OK' | 'RECHAZADO';
  detail: string;
}

export interface LoopFrame {
  startPc: number;
  remaining: number;
}

export interface CallFrame {
  returnPc: number;
  fnName: string;
  savedVars: Record<string, number | string>;
  destVar?: string;
}

export type HelixMeshShape = 'torus' | 'lathe' | 'extrude' | 'prism';

export interface HelixSceneNode {
  id: string;
  shape: HelixMeshShape;
  triangles: number;
  scale: number;
  ao: number;
  roughness: number;
  metalness: number;
  colorHex: string;
}

export interface HelixCamera6Dof {
  x: number;
  y: number;
  z: number;
  yawDeg: number;
  pitchDeg: number;
  fov: number;
}

export interface HelixWsEvent {
  id: string;
  channel: string;
  payload: string;
  tick: number;
  qpskMaskHex: string;
}

export interface HelixVmState {
  kernelBooted: boolean;
  authenticatedUid: string | null;
  totalMemoryBytes: number;
  usedMemoryBytes: number;
  memoryBlocks: MemoryBlock[];
  processes: ProcessEntry[];
  nextPid: number;
  activePid: number | null;
  variables: Record<string, number | string>;
  arrays: Record<string, (number | string)[]>;
  files: Record<string, VirtualFileEntry>;
  loopStack: LoopFrame[];
  callStack: CallFrame[];
  ioBuffer: string[];
  ioPaused: boolean;
  pipeCursor: number;
  clockTicks: number;
  persistedRegisters: Record<string, string>;
  entropySeed: number;
  sceneNodes: HelixSceneNode[];
  camera6Dof: HelixCamera6Dof;
  wsOutbox: HelixWsEvent[];
  soaBuffer: SoAHolographicBuffer | null;
  soaPhysics: PauliSoAPhysicsState | null;
  soaReport: PauliSoAPhysicsStepReport | null;
  blochState: BlochState;
  bvnLastNonDistributive: boolean | null;
  weberDecision: 'RENDER_FRAME' | 'SKIP_FRAME' | null;
  weberSkippedFrames: number;
  weberRenderedFrames: number;
  nemesisTensionPeak: number;
  stepCount: number;
  halted: boolean;
  logs: ExecutionLogEntry[];
}

export interface ParsedScriptInstruction {
  lineNumber: number;
  raw: string;
  glyphs: string;
  opcode: string;
  args: string[];
  bytecodeHex: string;
  elsePc?: number;
  endPc?: number;
  loopStartPc?: number;
}

export interface VerificationFinding {
  lineNumber: number;
  severity: 'ERROR' | 'WARN';
  rule: string;
  detail: string;
}

export interface ProgramVerificationReport {
  status: 'VERIFICADO' | 'ADVERTENCIA' | 'RECHAZADO';
  errorCount: number;
  warningCount: number;
  findings: VerificationFinding[];
  symbolic?: SymbolicReport;
}

export const MAX_VM_EXECUTION_STEPS = 500;

export const DEFAULT_HELIX_PROGRAM = `# Programa completo Helix OS: variables, bucles, condicionales y VFS
ᛇᚢ                  # KERN_BOOT: Inicializar núcleo
ᛗᚦ root             # AUTH_CHECK: Autenticar UID root
SET tam 64          # Declarar variable numérica
LOOP 2              # Asignar 2 bloques crecientes
  ᚠᚷ tam            # MEM_ALLOC usando variable tam
  ADD tam 64        # tam = tam + 64
END
IF tam > 128        # Control de flujo condicional
  ᛒᚢ worker         # PROC_FORK worker
  ᚱᚳ                # PROC_RUN
END
FILE_WRITE init.cfg boot_ok
ᚩᛖ pkt_01           # IO_BUS_TX
ᛣᚪ                  # REG_PERSIST
ᚳᛏ                  # EXIT_OK`;

export const DEFAULT_HELIX_3D_PROGRAM = `# Escena 3D PBR + Telemetría WebSocket construida íntegramente en Helix
ᛇᚢ                          # KERN_BOOT: Inicializar núcleo
ᛗᚦ render_admin             # AUTH_CHECK: Autenticar sesión de escena
SET rotorScale 1.15         # Escala base del rotor
MESH_NODE hub lathe 960 1.0
MAT_ORM hub 0.92 0.28 0.85
MESH_NODE ring torus 1280 rotorScale
MAT_ORM ring 0.88 0.22 0.90
LOOP 3                      # 3 aletas procedurales extruidas
  MESH_NODE fin extrude 360 0.85
END
MAT_ORM fin 0.95 0.36 0.72
MESH_NODE core prism 240 0.75
MAT_ORM core 0.90 0.18 0.94
CAM_6DOF 3.2 2.1 3.8 38 18 45
WS_EMIT telemetry rotor_ready
ᛣᚪ                          # REG_PERSIST
ᚳᛏ                          # EXIT_OK`;

export const DEFAULT_HELIX_CONTRACT_PROGRAM = `# Funciones con Contratos (REQUIRES/ENSURES) + Arreglos Acotados (ARRAY)
ᛇᚢ                          # KERN_BOOT: Inicializar núcleo
ᛗᚦ sys_admin                # AUTH_CHECK: Autenticar sesión
FN asignar_cuota base
  REQUIRES base >= 32
  ENSURES RET_VAL >= 64
  SET total base
  ADD total 32
  ᚠᚷ total
  RET total
END
ARRAY cuotas 4 0
CALL asignar_cuota 64 -> cuota0
ASET cuotas 0 cuota0
ASET cuotas 1 96
AGET cuotas 0 leido0
FILE_WRITE contrato.hlx leido0
ᚳᛏ                          # EXIT_OK`;

export const DEFAULT_HELIX_PHYSICS_PROGRAM = `# Núcleo Físico-Cuántico Implícito HELIX (Pauli-SoA 28B + Curl + Némesis + Bloch + BvN + Weber)
ᛇᚢ                          # KERN_BOOT: Inicializar núcleo físico
ᛗᚦ phys_kernel              # AUTH_CHECK: Sesión determinista
SOA_INIT 16                 # Asignar 16 celdas Pauli-SoA (448 B Zero-GC)
LOOP 3
  CURL_STEP 0.45 0.008      # Navier-Stokes Curl Noise (∇·v ≈ 0) + Kelvin-Voigt
  NEMESIS_DECAY 0.08        # Ley Némesis de Cauchy hacia 0.0f
END
BLOCH_ROT 0 1 0 1.5708 1    # Schrödinger unitario U(t) = exp(-iHt/ħ)
BVN_LATTICE 1.5708 0 3.1416 q_nondist
WEBER_GUARD 0.015 1.0 1.004 wf_render
FILE_WRITE physics.hlx q_nondist
ᚳᛏ                          # EXIT_OK`;

export function createInitialVmState(
  initialFiles: Record<string, VirtualFileEntry> = {},
): HelixVmState {
  return {
    kernelBooted: false,
    authenticatedUid: null,
    totalMemoryBytes: 1024,
    usedMemoryBytes: 0,
    memoryBlocks: [],
    processes: [
      {
        pid: 1,
        parentPid: 0,
        name: 'init',
        priority: 10,
        state: 'READY',
        exitCode: null,
      },
    ],
    nextPid: 2,
    activePid: 1,
    variables: {},
    arrays: {},
    files: { ...initialFiles },
    loopStack: [],
    callStack: [],
    ioBuffer: [],
    ioPaused: false,
    pipeCursor: 0,
    clockTicks: 0,
    persistedRegisters: {},
    entropySeed: 0x1a2b,
    sceneNodes: [],
    camera6Dof: { x: 3.4, y: 2.2, z: 3.8, yawDeg: 40, pitchDeg: 22, fov: 45 },
    wsOutbox: [],
    soaBuffer: null,
    soaPhysics: null,
    soaReport: null,
    blochState: createBlochState(0, 0),
    bvnLastNonDistributive: null,
    weberDecision: null,
    weberSkippedFrames: 0,
    weberRenderedFrames: 0,
    nemesisTensionPeak: 0,
    stepCount: 0,
    halted: false,
    logs: [],
  };
}

export function compileHelixScript(
  source: string,
  vocabulary: CompoundWord[] = INITIAL_COMPOUND_VOCABULARY,
): ParsedScriptInstruction[] {
  const lines = source.split(/\r?\n/);
  const byGlyphs = new Map(vocabulary.map((v) => [v.glyphs, v]));
  const byOpcode = new Map(vocabulary.map((v) => [v.opcode.toUpperCase(), v]));
  const instructions: ParsedScriptInstruction[] = [];

  lines.forEach((rawLine, idx) => {
    const withoutComment = rawLine.split('#')[0].trim();
    if (!withoutComment) return;

    const parts = withoutComment.split(/\s+/);
    const head = parts[0];
    const args = parts.slice(1);

    const BUILTIN_PHYSICS: Record<string, { opcode: string; glyphs: string }> = {
      SOA_INIT: { opcode: 'SOA_INIT', glyphs: 'ᚠᛗ' },
      'ᚠᛗ': { opcode: 'SOA_INIT', glyphs: 'ᚠᛗ' },
      CURL_STEP: { opcode: 'CURL_STEP', glyphs: 'ᛟᚱ' },
      'ᛟᚱ': { opcode: 'CURL_STEP', glyphs: 'ᛟᚱ' },
      NEMESIS_DECAY: { opcode: 'NEMESIS_DECAY', glyphs: 'ᛏᛜ' },
      'ᛏᛜ': { opcode: 'NEMESIS_DECAY', glyphs: 'ᛏᛜ' },
      BLOCH_ROT: { opcode: 'BLOCH_ROT', glyphs: 'ᛒᚣ' },
      'ᛒᚣ': { opcode: 'BLOCH_ROT', glyphs: 'ᛒᚣ' },
      BVN_LATTICE: { opcode: 'BVN_LATTICE', glyphs: 'ᛉᛣ' },
      'ᛉᛣ': { opcode: 'BVN_LATTICE', glyphs: 'ᛉᛣ' },
      WEBER_GUARD: { opcode: 'WEBER_GUARD', glyphs: 'ᚹᛋ' },
      'ᚹᛋ': { opcode: 'WEBER_GUARD', glyphs: 'ᚹᛋ' },
    };

    const vocabMatch = byGlyphs.get(head) ?? byOpcode.get(head.toUpperCase());
    const builtinPhys = BUILTIN_PHYSICS[head] ?? BUILTIN_PHYSICS[head.toUpperCase()];
    let glyphs = head;
    let opcode = head.toUpperCase();

    if (vocabMatch) {
      glyphs = vocabMatch.glyphs;
      opcode = vocabMatch.opcode;
    } else if (builtinPhys) {
      glyphs = builtinPhys.glyphs;
      opcode = builtinPhys.opcode;
    } else {
      const parsed = parseHelixPhrase(head, vocabulary);
      if (parsed.isValid && parsed.runes.length > 0) {
        glyphs = parsed.runes.map((r) => r.glyph).join('');
        opcode =
          parsed.runes.length === 1
            ? parsed.runes[0].osTag
            : `OP_${parsed.runes.map((r) => r.name).join('_')}`;
      }
    }

    // Normalizar alias en español para funciones/contratos/arreglos
    const upperOp = opcode.toUpperCase();
    if (upperOp === 'LLAMAR') opcode = 'CALL';
    else if (upperOp === 'BIEN' || upperOp === 'RETORNO') opcode = 'RET';
    else if (upperOp === 'FORMACION' || upperOp === 'FORMACIÓN') opcode = 'ARRAY';

    const parsedHead = parseHelixPhrase(glyphs, vocabulary);
    const bytecodeHex =
      parsedHead.runes.length > 0
        ? parsedHead.runes
            .map((r) => r.index.toString(16).padStart(2, '0').toUpperCase())
            .join(' ')
        : opcodeBytecode(opcode);

    instructions.push({
      lineNumber: idx + 1,
      raw: withoutComment,
      glyphs,
      opcode,
      args,
      bytecodeHex,
    });
  });

  // Link IF / ELSE / LOOP / FN / END control-flow targets
  const stack: { type: 'IF' | 'ELSE' | 'LOOP' | 'FN'; index: number }[] = [];
  instructions.forEach((inst, idx) => {
    const op = inst.opcode.toUpperCase();
    if (op === 'IF') {
      stack.push({ type: 'IF', index: idx });
    } else if (op === 'ELSE') {
      const top = stack.pop();
      if (top && top.type === 'IF') {
        instructions[top.index].elsePc = idx;
        stack.push({ type: 'ELSE', index: idx });
      }
    } else if (op === 'LOOP') {
      stack.push({ type: 'LOOP', index: idx });
    } else if (op === 'FN') {
      stack.push({ type: 'FN', index: idx });
    } else if (op === 'END') {
      const top = stack.pop();
      if (top) {
        if (top.type === 'IF' || top.type === 'FN') {
          instructions[top.index].endPc = idx;
        } else if (top.type === 'ELSE') {
          instructions[top.index].endPc = idx;
          // Also find preceding IF referencing this ELSE
          for (let j = top.index - 1; j >= 0; j--) {
            if (instructions[j].elsePc === top.index) {
              instructions[j].endPc = idx;
              break;
            }
          }
        } else if (top.type === 'LOOP') {
          instructions[top.index].endPc = idx;
          inst.loopStartPc = top.index;
        }
      }
    }
  });

  return instructions;
}

export function verifyHelixProgram(
  instructions: ParsedScriptInstruction[],
): ProgramVerificationReport {
  const findings: VerificationFinding[] = [];
  const stack: { type: 'IF' | 'ELSE' | 'LOOP' | 'FN'; line: number }[] = [];
  const declaredFns = new Map<string, number>();
  for (const inst of instructions) {
    if (inst.opcode.toUpperCase() === 'FN' && inst.args[0]) {
      declaredFns.set(inst.args[0], Math.max(0, inst.args.length - 1));
    }
  }
  let seenBoot = false;
  let seenAuth = false;

  for (const inst of instructions) {
    const op = inst.opcode.toUpperCase();

    if (op === 'KERN_BOOT') {
      seenBoot = true;
    } else if (op === 'AUTH_CHECK') {
      seenAuth = true;
    } else if (op === 'FN') {
      if (stack.some((s) => s.type === 'FN')) {
        findings.push({
          lineNumber: inst.lineNumber,
          severity: 'ERROR',
          rule: 'AST_NESTED_FN',
          detail: 'No se permiten definiciones FN anidadas.',
        });
      }
      if (!inst.args[0]) {
        findings.push({
          lineNumber: inst.lineNumber,
          severity: 'ERROR',
          rule: 'AST_FN_SYNTAX',
          detail: 'FN requiere un nombre de función: FN <nombre> [param...].',
        });
      }
      stack.push({ type: 'FN', line: inst.lineNumber });
    } else if (op === 'RET') {
      if (!stack.some((s) => s.type === 'FN')) {
        findings.push({
          lineNumber: inst.lineNumber,
          severity: 'ERROR',
          rule: 'AST_ORPHAN_RET',
          detail: 'RET/BIEN solo puede usarse dentro de un bloque FN ... END.',
        });
      }
    } else if (op === 'CALL') {
      const target = inst.args[0];
      const arrowIdx = inst.args.indexOf('->');
      const callArgs = arrowIdx >= 0 ? inst.args.slice(1, arrowIdx) : inst.args.slice(1);
      if (!target || !declaredFns.has(target)) {
        findings.push({
          lineNumber: inst.lineNumber,
          severity: 'ERROR',
          rule: 'AST_UNKNOWN_FN',
          detail: `CALL/LLAMAR invoca función no declarada "${target ?? '?'}".`,
        });
      } else if (callArgs.length !== (declaredFns.get(target) ?? 0)) {
        findings.push({
          lineNumber: inst.lineNumber,
          severity: 'ERROR',
          rule: 'AST_CALL_ARITY',
          detail: `CALL "${target}" esperaba ${declaredFns.get(target)} argumento(s), recibió ${callArgs.length}.`,
        });
      }
    } else if (op === 'ARRAY') {
      const sizeNum = Number(inst.args[1]);
      if (!inst.args[0] || Number.isNaN(sizeNum) || sizeNum < 1 || sizeNum > 256) {
        findings.push({
          lineNumber: inst.lineNumber,
          severity: 'ERROR',
          rule: 'BOUNDED_ARRAY',
          detail: `ARRAY/FORMACION "${inst.args[0] ?? '?'}" requiere tamaño entero acotado en [1..256].`,
        });
      }
    } else if (op === 'IF') {
      stack.push({ type: 'IF', line: inst.lineNumber });
      if (inst.args.length < 3) {
        findings.push({
          lineNumber: inst.lineNumber,
          severity: 'ERROR',
          rule: 'AST_IF_ARITY',
          detail: 'IF requiere 3 operandos: IF <izq> <op> <der>.',
        });
      }
    } else if (op === 'ELSE') {
      const top = stack.pop();
      if (!top || top.type !== 'IF') {
        findings.push({
          lineNumber: inst.lineNumber,
          severity: 'ERROR',
          rule: 'AST_ORPHAN_ELSE',
          detail: 'ELSE sin bloque IF abierto correspondiente.',
        });
      } else {
        stack.push({ type: 'ELSE', line: inst.lineNumber });
      }
    } else if (op === 'LOOP') {
      stack.push({ type: 'LOOP', line: inst.lineNumber });
      const literalCount = Number(inst.args[0]);
      if (
        inst.args[0] !== undefined &&
        !Number.isNaN(literalCount) &&
        (literalCount < 0 || literalCount > 100)
      ) {
        findings.push({
          lineNumber: inst.lineNumber,
          severity: 'ERROR',
          rule: 'BOUNDED_LOOP',
          detail: `LOOP ${literalCount} fuera del límite determinista [0..100].`,
        });
      }
    } else if (op === 'END') {
      const top = stack.pop();
      if (!top) {
        findings.push({
          lineNumber: inst.lineNumber,
          severity: 'ERROR',
          rule: 'AST_ORPHAN_END',
          detail: 'END sin bloque IF, LOOP o FN previo.',
        });
      }
    }

    if (op === 'DIV') {
      const denomArg = inst.args[1];
      const denomNum = Number(denomArg);
      if (denomArg === '0' || denomNum === 0) {
        findings.push({
          lineNumber: inst.lineNumber,
          severity: 'ERROR',
          rule: 'NO_DIV_ZERO',
          detail: 'División estática por cero detectada antes de ejecutar.',
        });
      } else if (
        denomArg !== undefined &&
        /^-?\d+$/.test(denomArg) &&
        !checkDenominatorInP33(BigInt(denomArg)).inSubringP33
      ) {
        const chk = checkDenominatorInP33(BigInt(denomArg));
        findings.push({
          lineNumber: inst.lineNumber,
          severity: 'ERROR',
          rule: 'P33_DENOMINATOR',
          detail: `Divisor ${denomArg} contiene factor primo fuera del subanillo P33 (residuo ${chk.remainderFactor.toString()}).`,
        });
      }
    }

    const needsBoot =
      op === 'MEM_INIT' ||
      op === 'MEM_ALLOC' ||
      op === 'MEM_LOCK' ||
      op === 'MEM_FREE' ||
      op === 'FILE_WRITE' ||
      op === 'FILE_READ' ||
      op === 'FILE_DEL' ||
      op === 'PROC_FORK' ||
      op === 'PROC_RUN' ||
      op === 'MESH_NODE' ||
      op === 'MAT_ORM' ||
      op === 'CAM_6DOF' ||
      op === 'WS_EMIT' ||
      op === 'SOA_INIT' ||
      op === 'CURL_STEP' ||
      op === 'NEMESIS_DECAY' ||
      op === 'BLOCH_ROT' ||
      op === 'BVN_LATTICE' ||
      op === 'WEBER_GUARD';

    if (needsBoot && !seenBoot) {
      findings.push({
        lineNumber: inst.lineNumber,
        severity: 'WARN',
        rule: 'BOOT_PRECONDITION',
        detail: `${op} aparece sin KERN_BOOT (ᛇᚢ) previo en el flujo lineal.`,
      });
    }

    const needsAuth =
      op === 'FILE_WRITE' ||
      op === 'FILE_DEL' ||
      op === 'SIGKILL' ||
      op === 'IO_GUARD';

    if (needsAuth && !seenAuth) {
      findings.push({
        lineNumber: inst.lineNumber,
        severity: 'WARN',
        rule: 'ACL_PRECONDITION',
        detail: `${op} requiere sesión autenticada previa (AUTH_CHECK / ᛗᚦ).`,
      });
    }
  }

  for (const unclosed of stack) {
    findings.push({
      lineNumber: unclosed.line,
      severity: 'ERROR',
      rule: 'AST_UNCLOSED_BLOCK',
      detail: `Bloque ${unclosed.type} abierto sin instrucción END de cierre.`,
    });
  }

  const hasStructuralAstError = findings.some((f) => f.rule.startsWith('AST_'));
  let symbolic: SymbolicReport | undefined;

  if (!hasStructuralAstError && instructions.length > 0) {
    symbolic = solveHelixConstraints(instructions);
    for (const sf of symbolic.findings) {
      if (sf.severity === 'INFO') continue;
      if (
        sf.rule === 'SMT_DIV_ZERO' &&
        findings.some((f) => f.lineNumber === sf.lineNumber && f.rule === 'NO_DIV_ZERO')
      ) {
        continue;
      }
      if (
        sf.rule === 'SMT_P33_VAR' &&
        findings.some((f) => f.lineNumber === sf.lineNumber && f.rule === 'P33_DENOMINATOR')
      ) {
        continue;
      }
      findings.push({
        lineNumber: sf.lineNumber,
        severity: sf.severity,
        rule: sf.rule,
        detail: sf.detail,
      });
    }
  }

  const errorCount = findings.filter((f) => f.severity === 'ERROR').length;
  const warningCount = findings.filter((f) => f.severity === 'WARN').length;
  const status =
    errorCount > 0 ? 'RECHAZADO' : warningCount > 0 ? 'ADVERTENCIA' : 'VERIFICADO';

  return {
    status,
    errorCount,
    warningCount,
    findings,
    symbolic,
  };
}

function opcodeBytecode(opcode: string): string {
  const table: Record<string, string> = {
    SET: 'A0',
    ADD: 'A1',
    SUB: 'A2',
    MUL: 'A3',
    DIV: 'A4',
    IF: 'B0',
    ELSE: 'B1',
    LOOP: 'B2',
    END: 'B3',
    FILE_WRITE: 'C0',
    FILE_READ: 'C1',
    FILE_DEL: 'C2',
    MESH_NODE: 'D0',
    MAT_ORM: 'D1',
    CAM_6DOF: 'D2',
    WS_EMIT: 'D3',
    FN: 'E0',
    CALL: 'E1',
    RET: 'E2',
    REQUIRES: 'E3',
    ENSURES: 'E4',
    ARRAY: 'E5',
    ASET: 'E6',
    AGET: 'E7',
    SOA_INIT: 'F0',
    CURL_STEP: 'F1',
    NEMESIS_DECAY: 'F2',
    BLOCH_ROT: 'F3',
    BVN_LATTICE: 'F4',
    WEBER_GUARD: 'F5',
  };
  return table[opcode] ?? 'F0';
}

function resolveNumeric(
  token: string | undefined,
  vars: Record<string, number | string>,
): number {
  if (token === undefined) return NaN;
  if (Object.prototype.hasOwnProperty.call(vars, token)) {
    return Number(vars[token]);
  }
  return Number(token);
}

function resolveValue(
  token: string | undefined,
  vars: Record<string, number | string>,
): number | string {
  if (token === undefined) return '';
  if (Object.prototype.hasOwnProperty.call(vars, token)) {
    return vars[token];
  }
  const asNum = Number(token);
  return token !== '' && !Number.isNaN(asNum) ? asNum : token;
}

function evaluateCondition(
  args: string[],
  vars: Record<string, number | string>,
): { valid: boolean; result: boolean; summary: string } {
  if (args.length < 3) {
    return { valid: false, result: false, summary: 'Sintaxis esperada: IF <izq> <op> <der>' };
  }
  const left = resolveValue(args[0], vars);
  const cmp = args[1];
  const right = resolveValue(args[2], vars);

  const nLeft = Number(left);
  const nRight = Number(right);
  const bothNum = !Number.isNaN(nLeft) && !Number.isNaN(nRight);

  let result = false;
  switch (cmp) {
    case '==':
      result = bothNum ? nLeft === nRight : String(left) === String(right);
      break;
    case '!=':
      result = bothNum ? nLeft !== nRight : String(left) !== String(right);
      break;
    case '>':
      result = bothNum && nLeft > nRight;
      break;
    case '<':
      result = bothNum && nLeft < nRight;
      break;
    case '>=':
      result = bothNum && nLeft >= nRight;
      break;
    case '<=':
      result = bothNum && nLeft <= nRight;
      break;
    default:
      return { valid: false, result: false, summary: `Operador relacional no soportado: ${cmp}` };
  }

  return {
    valid: true,
    result,
    summary: `${left} ${cmp} ${right} → ${result ? 'VERDADERO' : 'FALSO'}`,
  };
}

export function stepHelixVm(
  state: HelixVmState,
  inst: ParsedScriptInstruction,
): HelixVmState {
  return stepHelixVmWithPc(state, [inst], 0).nextState;
}

export function stepHelixVmWithPc(
  state: HelixVmState,
  instructions: ParsedScriptInstruction[],
  pc: number,
): { nextState: HelixVmState; nextPc: number } {
  const inst = instructions[pc];
  if (!inst) {
    return { nextState: state, nextPc: pc };
  }

  const arraysCopy: Record<string, (number | string)[]> = {};
  for (const [ak, av] of Object.entries(state.arrays)) {
    arraysCopy[ak] = [...av];
  }

  const next: HelixVmState = {
    ...state,
    memoryBlocks: state.memoryBlocks.map((b) => ({ ...b })),
    processes: state.processes.map((p) => ({ ...p })),
    variables: { ...state.variables },
    arrays: arraysCopy,
    files: { ...state.files },
    loopStack: state.loopStack.map((f) => ({ ...f })),
    callStack: state.callStack.map((c) => ({ ...c, savedVars: { ...c.savedVars } })),
    ioBuffer: [...state.ioBuffer],
    persistedRegisters: { ...state.persistedRegisters },
    sceneNodes: state.sceneNodes.map((n) => ({ ...n })),
    camera6Dof: { ...state.camera6Dof },
    wsOutbox: state.wsOutbox.map((e) => ({ ...e })),
    logs: [...state.logs],
    stepCount: state.stepCount + 1,
    clockTicks: state.clockTicks + 1,
  };

  let nextPc = pc + 1;

  const fail = (detail: string): { nextState: HelixVmState; nextPc: number } => {
    next.logs.unshift({
      step: next.stepCount,
      line: inst.lineNumber,
      raw: inst.raw,
      opcode: inst.opcode,
      glyphs: inst.glyphs,
      bytecodeHex: inst.bytecodeHex,
      status: 'RECHAZADO',
      detail,
    });
    return { nextState: next, nextPc };
  };

  const ok = (detail: string): { nextState: HelixVmState; nextPc: number } => {
    next.logs.unshift({
      step: next.stepCount,
      line: inst.lineNumber,
      raw: inst.raw,
      opcode: inst.opcode,
      glyphs: inst.glyphs,
      bytecodeHex: inst.bytecodeHex,
      status: 'OK',
      detail,
    });
    return { nextState: next, nextPc };
  };

  if (next.stepCount > MAX_VM_EXECUTION_STEPS) {
    next.halted = true;
    return fail(`Límite de seguridad alcanzado (${MAX_VM_EXECUTION_STEPS} pasos). Ejecución detenida.`);
  }

  const op = inst.opcode.toUpperCase();

  // Control flow & variable instructions
  if (op === 'SET') {
    const varName = inst.args[0];
    if (!varName || inst.args.length < 2) {
      return fail('Sintaxis inválida en SET: usa SET <nombre> <valor>.');
    }
    const val = resolveValue(inst.args.slice(1).join(' '), next.variables);
    next.variables[varName] = val;
    return ok(`Variable ${varName} = ${val}.`);
  }

  if (op === 'ADD' || op === 'SUB' || op === 'MUL' || op === 'DIV') {
    const varName = inst.args[0];
    if (!varName || !Object.prototype.hasOwnProperty.call(next.variables, varName)) {
      return fail(`Variable "${varName ?? ''}" no declarada.`);
    }
    const current = Number(next.variables[varName]);
    const operand = resolveNumeric(inst.args[1], next.variables);
    if (Number.isNaN(current) || Number.isNaN(operand)) {
      return fail(`Operación ${op} requiere operandos numéricos.`);
    }
    if (op === 'DIV' && operand === 0) {
      return fail('Invariante aritmético violado: división por cero rechazada.');
    }
    if (op === 'DIV' && Number.isInteger(operand)) {
      const p33Check = checkDenominatorInP33(BigInt(operand));
      if (!p33Check.inSubringP33) {
        return fail(
          `Invariante P33 violado: divisor ${operand} tiene residuo primo (${p33Check.remainderFactor.toString()}) fuera de (2..137).`,
        );
      }
    }
    const computed =
      op === 'ADD'
        ? current + operand
        : op === 'SUB'
          ? current - operand
          : op === 'MUL'
            ? current * operand
            : current / operand;
    next.variables[varName] = computed;
    if (op === 'DIV' && Number.isInteger(current) && Number.isInteger(operand)) {
      const exact = makeRationalP33(BigInt(current), BigInt(operand));
      return ok(`${varName} actualizado a ${computed} (P33 exacto: ${formatRationalP33(exact)}).`);
    }
    return ok(`${varName} actualizado a ${computed}.`);
  }

  if (op === 'IF') {
    const cond = evaluateCondition(inst.args, next.variables);
    if (!cond.valid) {
      return fail(cond.summary);
    }
    if (!cond.result) {
      nextPc =
        inst.elsePc !== undefined
          ? inst.elsePc + 1
          : inst.endPc !== undefined
            ? inst.endPc + 1
            : pc + 1;
    }
    return ok(`IF (${cond.summary}).`);
  }

  if (op === 'ELSE') {
    nextPc = inst.endPc !== undefined ? inst.endPc + 1 : pc + 1;
    return ok('Rama ELSE omitida tras rama IF verdadera.');
  }

  if (op === 'LOOP') {
    const count = Math.floor(resolveNumeric(inst.args[0], next.variables));
    if (Number.isNaN(count) || count < 0 || count > 100) {
      return fail('LOOP requiere un contador entero entre 0 y 100.');
    }
    if (count === 0) {
      nextPc = inst.endPc !== undefined ? inst.endPc + 1 : pc + 1;
      return ok('LOOP 0: bloque omitido.');
    }
    next.loopStack.push({ startPc: pc, remaining: count });
    return ok(`Inicio de bucle LOOP (${count} iteraciones).`);
  }

  if (op === 'FN') {
    nextPc = inst.endPc !== undefined ? inst.endPc + 1 : pc + 1;
    return ok(`Definición de función verificable ${inst.args[0] ?? 'anon'}(${inst.args.slice(1).join(', ')}) registrada.`);
  }

  if (op === 'REQUIRES') {
    const cond = evaluateCondition(inst.args, next.variables);
    if (!cond.valid || !cond.result) {
      next.halted = true;
      return fail(`Contrato REQUIRES violado en runtime: ${cond.summary}`);
    }
    return ok(`Contrato REQUIRES verificado (${cond.summary}).`);
  }

  if (op === 'ENSURES') {
    return ok(`Postcondición ENSURES (${inst.args.join(' ')}) registrada para RET.`);
  }

  const checkEnsuresForFn = (
    fnName: string,
    retVal: number | string,
    localVars: Record<string, number | string>,
  ): string | null => {
    const fnIdx = instructions.findIndex(
      (candidate) => candidate.opcode.toUpperCase() === 'FN' && candidate.args[0] === fnName,
    );
    if (fnIdx < 0) return null;
    const fnEnd = instructions[fnIdx].endPc ?? instructions.length - 1;
    const postVars = { ...localVars, RET_VAL: retVal };
    for (let j = fnIdx + 1; j < fnEnd; j++) {
      const sub = instructions[j];
      if (sub.opcode.toUpperCase() === 'ENSURES') {
        const cond = evaluateCondition(sub.args, postVars);
        if (!cond.valid || !cond.result) {
          return `Postcondición ENSURES violada en ${fnName}: ${cond.summary}`;
        }
      }
    }
    return null;
  };

  if (op === 'CALL') {
    const fnName = inst.args[0];
    const fnPc = instructions.findIndex(
      (candidate) => candidate.opcode.toUpperCase() === 'FN' && candidate.args[0] === fnName,
    );
    if (fnPc < 0) {
      return fail(`Función no encontrada: ${fnName ?? '?'}`);
    }
    if (next.callStack.length >= 16) {
      next.halted = true;
      return fail('Invariante violado: profundidad máxima de pila de llamadas (16) alcanzada.');
    }
    const fnInst = instructions[fnPc];
    const params = fnInst.args.slice(1);
    const arrowIdx = inst.args.indexOf('->');
    const rawArgs = arrowIdx >= 0 ? inst.args.slice(1, arrowIdx) : inst.args.slice(1);
    const destVar = arrowIdx >= 0 ? inst.args[arrowIdx + 1] : undefined;

    const callerVarsSnapshot = { ...next.variables };
    const boundLocals: Record<string, number | string> = {};
    params.forEach((pName, idx) => {
      boundLocals[pName] = resolveValue(rawArgs[idx], callerVarsSnapshot);
    });

    next.callStack.push({
      returnPc: pc + 1,
      fnName,
      savedVars: callerVarsSnapshot,
      destVar,
    });
    next.variables = boundLocals;
    nextPc = fnPc + 1;
    return ok(`CALL ${fnName}(${rawArgs.map((a) => String(resolveValue(a, callerVarsSnapshot))).join(', ')})`);
  }

  if (op === 'RET') {
    const frame = next.callStack.pop();
    if (!frame) {
      return fail('RET/BIEN ejecutado sin marco de llamada activo.');
    }
    const retVal = inst.args[0] !== undefined ? resolveValue(inst.args[0], next.variables) : 0;
    const ensuresErr = checkEnsuresForFn(frame.fnName, retVal, next.variables);
    if (ensuresErr) {
      next.halted = true;
      return fail(ensuresErr);
    }
    next.variables = {
      ...frame.savedVars,
      RET_VAL: retVal,
      ...(frame.destVar ? { [frame.destVar]: retVal } : {}),
    };
    nextPc = frame.returnPc;
    return ok(`RET de ${frame.fnName} => ${retVal}`);
  }

  if (op === 'ARRAY') {
    const arrName = inst.args[0];
    const size = Math.floor(resolveNumeric(inst.args[1], next.variables));
    const initVal = inst.args[2] !== undefined ? resolveValue(inst.args[2], next.variables) : 0;
    if (!arrName || Number.isNaN(size) || size < 1 || size > 256) {
      return fail(`ARRAY "${arrName ?? '?'}" requiere tamaño entero en [1..256].`);
    }
    next.arrays[arrName] = Array.from({ length: size }, () => initVal);
    return ok(`ARRAY ${arrName}[${size}] inicializado con ${initVal}.`);
  }

  if (op === 'ASET') {
    const [arrName, idxTok, valTok] = inst.args;
    const arr = arrName ? next.arrays[arrName] : undefined;
    if (!arr) return fail(`ARRAY "${arrName ?? '?'}" no declarado.`);
    const idx = Math.floor(resolveNumeric(idxTok, next.variables));
    if (Number.isNaN(idx) || idx < 0 || idx >= arr.length) {
      return fail(`Índice fuera de rango en ASET ${arrName}[${idx}] (rango 0..${arr.length - 1}).`);
    }
    const val = resolveValue(valTok, next.variables);
    arr[idx] = val;
    return ok(`${arrName}[${idx}] = ${val}.`);
  }

  if (op === 'AGET') {
    const [arrName, idxTok, destVar] = inst.args;
    const arr = arrName ? next.arrays[arrName] : undefined;
    if (!arr) return fail(`ARRAY "${arrName ?? '?'}" no declarado.`);
    const idx = Math.floor(resolveNumeric(idxTok, next.variables));
    if (Number.isNaN(idx) || idx < 0 || idx >= arr.length) {
      return fail(`Índice fuera de rango en AGET ${arrName}[${idx}] (rango 0..${arr.length - 1}).`);
    }
    if (destVar) {
      next.variables[destVar] = arr[idx];
    }
    return ok(`${destVar ?? 'tmp'} = ${arrName}[${idx}] (${arr[idx]}).`);
  }

  if (op === 'END') {
    const top = next.loopStack[next.loopStack.length - 1];
    if (inst.loopStartPc !== undefined && top && top.startPc === inst.loopStartPc) {
      top.remaining -= 1;
      if (top.remaining > 0) {
        nextPc = top.startPc + 1;
        return ok(`Iteración completada (restan ${top.remaining}).`);
      }
      next.loopStack.pop();
      return ok('Bucle LOOP finalizado.');
    }
    const activeCall = next.callStack[next.callStack.length - 1];
    const isFnEnd =
      activeCall &&
      instructions.some(
        (fnInst) => fnInst.opcode.toUpperCase() === 'FN' && fnInst.args[0] === activeCall.fnName && fnInst.endPc === pc,
      );
    if (isFnEnd && activeCall) {
      next.callStack.pop();
      const ensuresErr = checkEnsuresForFn(activeCall.fnName, 0, next.variables);
      if (ensuresErr) {
        next.halted = true;
        return fail(ensuresErr);
      }
      next.variables = {
        ...activeCall.savedVars,
        RET_VAL: 0,
        ...(activeCall.destVar ? { [activeCall.destVar]: 0 } : {}),
      };
      nextPc = activeCall.returnPc;
      return ok(`Retorno implícito de ${activeCall.fnName} => 0.`);
    }
    return ok('Fin de bloque condicional.');
  }

  // Kernel & Auth
  if (op === 'KERN_BOOT') {
    next.kernelBooted = true;
    return ok('Núcleo inicializado; subsistemas listos.');
  }

  if (op === 'AUTH_CHECK') {
    const uid = inst.args[0] || 'sys_admin';
    next.authenticatedUid = uid;
    return ok(`Credenciales verificadas para UID "${uid}".`);
  }

  if (!next.kernelBooted && op !== 'CLK_OK') {
    return fail('Invariante violado: el núcleo no ha sido inicializado (ejecuta KERN_BOOT / ᛇᚢ primero).');
  }

  // Virtual File System
  if (op === 'FILE_WRITE') {
    const fileName = inst.args[0];
    if (!fileName) return fail('FILE_WRITE requiere un nombre de archivo.');
    if (!next.authenticatedUid) {
      return fail('Permiso denegado (EACCES): FILE_WRITE requiere sesión autenticada.');
    }
    const existing = next.files[fileName];
    if (
      existing &&
      existing.owner !== next.authenticatedUid &&
      next.authenticatedUid !== 'root'
    ) {
      return fail(`Acceso denegado: "${fileName}" pertenece a "${existing.owner}".`);
    }
    const rawContent = inst.args.slice(1).join(' ') || 'empty';
    const content = Object.prototype.hasOwnProperty.call(next.variables, rawContent)
      ? String(next.variables[rawContent])
      : rawContent;
    next.files[fileName] = {
      name: fileName,
      owner: next.authenticatedUid,
      content,
      sizeBytes: new Blob([content]).size,
      updatedAtTick: next.clockTicks,
    };
    return ok(`Archivo "${fileName}" escrito (${content.length} chars) por ${next.authenticatedUid}.`);
  }

  if (op === 'FILE_READ') {
    const fileName = inst.args[0];
    if (!fileName || !next.files[fileName]) {
      return fail(`ENOENT: el archivo "${fileName ?? ''}" no existe en el VFS.`);
    }
    const file = next.files[fileName];
    next.variables['LAST_READ'] = file.content;
    return ok(`Leído "${fileName}": "${file.content}" -> variable LAST_READ.`);
  }

  if (op === 'FILE_DEL') {
    const fileName = inst.args[0];
    if (!fileName || !next.files[fileName]) {
      return fail(`ENOENT: el archivo "${fileName ?? ''}" no existe.`);
    }
    if (!next.authenticatedUid) {
      return fail('Permiso denegado: FILE_DEL requiere autenticación.');
    }
    const file = next.files[fileName];
    if (file.owner !== next.authenticatedUid && next.authenticatedUid !== 'root') {
      return fail(`EACCES: "${fileName}" solo puede ser eliminado por "${file.owner}" o root.`);
    }
    delete next.files[fileName];
    return ok(`Archivo "${fileName}" eliminado del VFS.`);
  }

  // OS Subsystems
  switch (op) {
    case 'MEM_INIT':
    case 'MEM_ALLOC': {
      const resolved = inst.args[0] ? resolveNumeric(inst.args[0], next.variables) : 128;
      if (!Number.isFinite(resolved) || resolved <= 0) {
        return fail('Precondición inválida: el tamaño de memoria debe ser > 0.');
      }
      if (next.usedMemoryBytes + resolved > next.totalMemoryBytes) {
        return fail(
          `Invariante de memoria violado: ${resolved} B solicitados superan el espacio libre (${next.totalMemoryBytes - next.usedMemoryBytes} B).`,
        );
      }
      const lastEnd = next.memoryBlocks.reduce(
        (max, b) => (b.status === 'ALLOCATED' ? Math.max(max, b.address + b.size) : max),
        0,
      );
      const id = `blk_${next.memoryBlocks.length + 1}`;
      next.memoryBlocks.push({
        id,
        address: lastEnd,
        size: resolved,
        locked: false,
        ownerPid: next.activePid ?? 1,
        status: 'ALLOCATED',
      });
      next.usedMemoryBytes += resolved;
      return ok(`Asignado ${id} (${resolved} B en @0x${lastEnd.toString(16).padStart(4, '0')}).`);
    }

    case 'MEM_LOCK': {
      const target = [...next.memoryBlocks]
        .reverse()
        .find((b) => b.status === 'ALLOCATED' && !b.locked);
      if (!target) {
        return fail('Precondición fallida: no hay bloque asignado desbloqueado para proteger.');
      }
      target.locked = true;
      return ok(`Bloque ${target.id} marcado como solo lectura.`);
    }

    case 'MEM_FREE': {
      const targetId = inst.args[0];
      const target = targetId
        ? next.memoryBlocks.find((b) => b.id === targetId)
        : [...next.memoryBlocks].reverse().find((b) => b.status === 'ALLOCATED');
      if (!target) {
        return fail('Error de memoria: no existe bloque asignado para liberar.');
      }
      if (target.status === 'FREED') {
        return fail(`Invariante double-free bloqueado sobre ${target.id}.`);
      }
      if (target.locked) {
        return fail(`Invariante de protección: ${target.id} está bloqueado en solo lectura.`);
      }
      target.status = 'FREED';
      next.usedMemoryBytes = Math.max(0, next.usedMemoryBytes - target.size);
      return ok(`Liberado ${target.id} (${target.size} B recuperados).`);
    }

    case 'HEAP_CAP': {
      const extra = inst.args[0] ? resolveNumeric(inst.args[0], next.variables) : 256;
      if (!Number.isFinite(extra) || extra <= 0) {
        return fail('Expansión inválida: se requiere incremento positivo.');
      }
      next.totalMemoryBytes += extra;
      return ok(`Límite del heap ampliado a ${next.totalMemoryBytes} B.`);
    }

    case 'PROC_FORK': {
      const name = inst.args[0] || `proc_${next.nextPid}`;
      const pid = next.nextPid++;
      next.processes.push({
        pid,
        parentPid: next.activePid ?? 1,
        name,
        priority: 5,
        state: 'READY',
        exitCode: null,
      });
      next.activePid = pid;
      return ok(`Proceso "${name}" creado con PID ${pid}.`);
    }

    case 'PROC_RUN': {
      const target =
        next.processes.find((p) => p.pid === next.activePid && p.state !== 'TERMINATED') ??
        next.processes.find((p) => p.state === 'READY');
      if (!target) {
        return fail('No hay procesos listos en la cola de planificación.');
      }
      next.processes.forEach((p) => {
        if (p.state === 'RUNNING') p.state = 'READY';
      });
      target.state = 'RUNNING';
      next.activePid = target.pid;
      return ok(`PID ${target.pid} (${target.name}) en ejecución.`);
    }

    case 'SCHED_PRIO': {
      const prio = inst.args[0] ? resolveNumeric(inst.args[0], next.variables) : 1;
      const target = next.processes.find((p) => p.pid === next.activePid);
      if (!target) return fail('No hay proceso activo para ajustar prioridad.');
      target.priority = Math.max(1, Math.min(99, prio));
      return ok(`Prioridad de PID ${target.pid} actualizada a ${target.priority}.`);
    }

    case 'TRAP_SANDBOX': {
      const target = next.processes.find((p) => p.pid === next.activePid);
      if (!target) return fail('No hay proceso activo para aislar.');
      target.state = 'SANDBOXED';
      return ok(`PID ${target.pid} aislado en sandbox tras captura de evento.`);
    }

    case 'SIGKILL': {
      if (!next.authenticatedUid) {
        return fail('Permiso denegado (EACCES): SIGKILL requiere sesión UID autenticada.');
      }
      const targetPid = Number(inst.args[0] ?? next.activePid);
      const target = next.processes.find((p) => p.pid === targetPid && p.pid !== 1);
      if (!target) {
        return fail('No se puede terminar el proceso raíz init o PID inexistente.');
      }
      target.state = 'TERMINATED';
      target.exitCode = 137;
      return ok(`PID ${target.pid} terminado forzosamente (código 137).`);
    }

    case 'EXIT_OK': {
      const target = next.processes.find(
        (p) => p.pid === next.activePid && p.state !== 'TERMINATED',
      );
      if (!target) return fail('No existe proceso activo para finalizar.');
      target.state = 'TERMINATED';
      target.exitCode = 0;
      const fallback = next.processes.find((p) => p.state !== 'TERMINATED');
      next.activePid = fallback ? fallback.pid : null;
      return ok(`PID ${target.pid} finalizado limpiamente con código 0.`);
    }

    case 'IO_BUS_TX':
    case 'IO_GUARD': {
      if (op === 'IO_GUARD' && !next.authenticatedUid) {
        return fail('Acceso denegado: IO_GUARD exige autenticación UID.');
      }
      if (next.ioPaused) {
        return fail('Flujo pausado: el búfer de E/S está bloqueado (BUF_PAUSE).');
      }
      const payload = inst.args.join(' ') || `frame_${next.stepCount}`;
      next.ioBuffer.push(payload);
      return ok(`Trama "${payload}" enviada al bus de E/S.`);
    }

    case 'BUF_PAUSE': {
      next.ioPaused = true;
      return ok('Lectura y escritura del búfer de E/S pausada.');
    }

    case 'PIPE_SEEK': {
      const offset = inst.args[0] ? resolveNumeric(inst.args[0], next.variables) : 0;
      if (!Number.isFinite(offset) || offset < 0) {
        return fail('Desplazamiento inválido en PIPE_SEEK.');
      }
      next.pipeCursor = offset;
      return ok(`Cursor de tubería desplazado a posición ${offset}.`);
    }

    case 'REG_PERSIST': {
      next.persistedRegisters['LAST_PID'] = String(next.activePid ?? 0);
      next.persistedRegisters['MEM_USED'] = `${next.usedMemoryBytes}B`;
      next.persistedRegisters['TICKS'] = String(next.clockTicks);
      return ok('Registros de estado guardados de forma persistente.');
    }

    case 'CLK_OK':
    case 'SVC_WAKE':
    case 'SCHED_CRON':
    case 'UID_CTX':
    case 'FS_MOUNT_RO': {
      return ok(`Instrucción ${op} ejecutada correctamente en el subsistema.`);
    }

    case 'CSPRNG_ECC': {
      next.entropySeed = (next.entropySeed * 1103515245 + 12345) & 0x7fffffff;
      return ok(`Semilla CSPRNG actualizada: 0x${next.entropySeed.toString(16).toUpperCase()}.`);
    }

    case 'MESH_NODE': {
      const baseId = inst.args[0] || `node_${next.sceneNodes.length + 1}`;
      const rawShape = (inst.args[1] || 'lathe').toLowerCase();
      const shape: HelixMeshShape =
        rawShape === 'torus' || rawShape === 'lathe' || rawShape === 'extrude' || rawShape === 'prism'
          ? rawShape
          : 'lathe';
      const triangles = Math.round(resolveNumeric(inst.args[2] ?? '240', next.variables));
      const scale = resolveNumeric(inst.args[3] ?? '1', next.variables);
      if (!Number.isFinite(triangles) || triangles <= 0) {
        return fail(`MESH_NODE "${baseId}": triángulos inválidos.`);
      }
      const curTotal = next.sceneNodes.reduce((acc, n) => acc + n.triangles, 0);
      if (curTotal + triangles > 10000) {
        return fail(`SMT_MESH_BUDGET: ${curTotal + triangles} triángulos superan el límite de 10000.`);
      }
      const samePrefixCount = next.sceneNodes.filter(
        (n) => n.id === baseId || n.id.startsWith(`${baseId}_`),
      ).length;
      const nodeId = samePrefixCount === 0 ? baseId : `${baseId}_${samePrefixCount + 1}`;
      const runeColor = RUNES[(next.sceneNodes.length * 5 + 2) % RUNES.length]?.colorHex ?? '#2563EB';
      next.sceneNodes.push({
        id: nodeId,
        shape,
        triangles,
        scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
        ao: 0.9,
        roughness: 0.35,
        metalness: 0.78,
        colorHex: runeColor,
      });
      return ok(`Nodo 3D "${nodeId}" (${shape}, ${triangles} Δ, escala=${scale}) añadido a escena.`);
    }

    case 'MAT_ORM': {
      const targetPrefix = inst.args[0] || 'node_1';
      const ao = resolveNumeric(inst.args[1], next.variables);
      const roughness = resolveNumeric(inst.args[2], next.variables);
      const metalness = resolveNumeric(inst.args[3], next.variables);
      if (
        [ao, roughness, metalness].some((v) => !Number.isFinite(v) || v < 0 || v > 1)
      ) {
        return fail(`SMT_ORM_BOUNDS: canales ORM de "${targetPrefix}" fuera de [0, 1].`);
      }
      let matched = 0;
      next.sceneNodes.forEach((n) => {
        if (n.id === targetPrefix || n.id.startsWith(`${targetPrefix}_`)) {
          n.ao = ao;
          n.roughness = roughness;
          n.metalness = metalness;
          matched++;
        }
      });
      if (matched === 0) {
        return fail(`MAT_ORM: no se encontró nodo "${targetPrefix}" en la escena.`);
      }
      return ok(`ORM(${targetPrefix}) = [AO:${ao}, R:${roughness}, M:${metalness}] en ${matched} nodo(s).`);
    }

    case 'CAM_6DOF': {
      const x = resolveNumeric(inst.args[0] ?? '3.4', next.variables);
      const y = resolveNumeric(inst.args[1] ?? '2.2', next.variables);
      const z = resolveNumeric(inst.args[2] ?? '3.8', next.variables);
      const yawDeg = resolveNumeric(inst.args[3] ?? '40', next.variables);
      const pitchDeg = resolveNumeric(inst.args[4] ?? '22', next.variables);
      const rawFov = resolveNumeric(inst.args[5] ?? '45', next.variables);
      if ([x, y, z, yawDeg, pitchDeg, rawFov].some((v) => !Number.isFinite(v))) {
        return fail('CAM_6DOF requiere 6 coordenadas numéricas (x y z yaw pitch fov).');
      }
      next.camera6Dof = {
        x,
        y,
        z,
        yawDeg,
        pitchDeg,
        fov: Math.max(25, Math.min(100, rawFov)),
      };
      return ok(`Cámara 6-DoF posicionada en (${x}, ${y}, ${z}) yaw=${yawDeg}° fov=${next.camera6Dof.fov}°.`);
    }

    case 'WS_EMIT': {
      const channel = inst.args[0] || 'telemetry';
      const rawPayload = inst.args.slice(1).join(' ') || `tick_${next.clockTicks}`;
      const payload = Object.prototype.hasOwnProperty.call(next.variables, rawPayload)
        ? String(next.variables[rawPayload])
        : rawPayload;
      const maskHex = ((next.sceneNodes.length * 0x101 + next.clockTicks * 17 + next.usedMemoryBytes) & 0xffffffff)
        .toString(16)
        .toUpperCase()
        .padStart(8, '0');
      next.wsOutbox.push({
        id: `ws_${next.stepCount}_${next.clockTicks}`,
        channel,
        payload,
        tick: next.clockTicks,
        qpskMaskHex: `0x${maskHex}`,
      });
      next.ioBuffer.push(`[WS:${channel}] ${payload}`);
      return ok(`Evento WS_EMIT [${channel}] "${payload}" (QPSK 0x${maskHex}) encolado.`);
    }

    case 'SOA_INIT': {
      const cells = Math.floor(resolveNumeric(inst.args[0] ?? '16', next.variables));
      if (Number.isNaN(cells) || cells < 1 || cells > 256) {
        return fail(`SOA_INIT: capacidad ${cells} fuera de rango [1..256].`);
      }
      const reqBytes = cells * 28;
      if (next.usedMemoryBytes + reqBytes > next.totalMemoryBytes) {
        return fail(
          `SOA_INIT: ${reqBytes} B (${cells}×28 B) exceden memoria libre (${next.totalMemoryBytes - next.usedMemoryBytes} B).`,
        );
      }
      const soa = createSoABuffer(cells);
      for (let i = 0; i < cells; i++) {
        const angle = i * 0.45;
        packToSoABuffer(
          soa,
          i,
          Math.cos(angle) * 0.65,
          (i / Math.max(1, cells - 1) - 0.5) * 1.2,
          Math.sin(angle) * 0.65,
          i / cells,
          0.5,
          0.5,
          (i % 4) as 0 | 1 | 2 | 3,
        );
      }
      const lastEnd = next.memoryBlocks.reduce(
        (max, b) => (b.status === 'ALLOCATED' ? Math.max(max, b.address + b.size) : max),
        0,
      );
      next.memoryBlocks.push({
        id: `soa_${next.memoryBlocks.length + 1}`,
        address: lastEnd,
        size: reqBytes,
        locked: false,
        ownerPid: next.activePid ?? 1,
        status: 'ALLOCATED',
      });
      next.usedMemoryBytes += reqBytes;
      next.soaBuffer = soa;
      next.soaPhysics = createPauliSoAPhysicsState(cells);
      next.soaReport = {
        maxTension: 0,
        meanTension: 0,
        totalKineticEnergy: 0,
        maxCurlDivergence: 0,
      };
      return ok(`Pauli-SoA asignado: ${cells} celdas (${reqBytes} B contiguos, Zero-GC).`);
    }

    case 'CURL_STEP': {
      if (!next.soaBuffer || !next.soaPhysics) {
        return fail('CURL_STEP requiere inicializar memoria Pauli-SoA con SOA_INIT (ᚠᛗ) primero.');
      }
      const gain = resolveNumeric(inst.args[0] ?? '0.35', next.variables);
      const dt = resolveNumeric(inst.args[1] ?? '0.008333', next.variables);
      if (!Number.isFinite(gain) || gain < 0 || gain > 8 || !Number.isFinite(dt) || dt <= 0 || dt > 0.25) {
        return fail(`SMT_PHYSICS_STABILITY: CURL_STEP gain=${gain}, dt=${dt} fuera de región estable.`);
      }
      const report = stepPauliSoAPhysics(next.soaBuffer, next.soaPhysics, next.clockTicks * dt, dt, {
        curlGain: gain,
      });
      next.soaReport = report;
      next.nemesisTensionPeak = Math.max(next.nemesisTensionPeak, report.maxTension);
      return ok(
        `Curl+KV: maxT=${report.maxTension.toFixed(5)}, E_cin=${report.totalKineticEnergy.toFixed(5)}, max|∇·v|=${report.maxCurlDivergence.toExponential(1)}.`,
      );
    }

    case 'NEMESIS_DECAY': {
      const gamma = resolveNumeric(inst.args[0] ?? '0.08', next.variables);
      if (!Number.isFinite(gamma) || gamma <= 0 || gamma >= 1) {
        return fail(`SMT_PHYSICS_STABILITY: NEMESIS_DECAY γ=${gamma} debe estar en (0, 1).`);
      }
      if (!next.soaBuffer || !next.soaPhysics) {
        return fail('NEMESIS_DECAY requiere búfer Pauli-SoA inicializado con SOA_INIT.');
      }
      let maxT = 0;
      let sumT = 0;
      const n = next.soaBuffer.capacity;
      for (let i = 0; i < n; i++) {
        const nextT = stepNemesisCauchy(next.soaPhysics.tension[i], gamma);
        next.soaPhysics.tension[i] = nextT;
        next.soaBuffer.amp[i] = Math.max(0, next.soaBuffer.amp[i] * (1 - gamma) + nextT * 0.25);
        if (nextT > maxT) maxT = nextT;
        sumT += nextT;
      }
      next.soaReport = {
        maxTension: maxT,
        meanTension: n > 0 ? sumT / n : 0,
        totalKineticEnergy: next.soaReport?.totalKineticEnergy ?? 0,
        maxCurlDivergence: next.soaReport?.maxCurlDivergence ?? 0,
      };
      return ok(`Némesis(γ=${gamma}): tensión max=${maxT.toFixed(5)} disipando hacia 0.0f.`);
    }

    case 'BLOCH_ROT': {
      const nx = resolveNumeric(inst.args[0] ?? '0', next.variables);
      const ny = resolveNumeric(inst.args[1] ?? '1', next.variables);
      const nz = resolveNumeric(inst.args[2] ?? '0', next.variables);
      const omega = resolveNumeric(inst.args[3] ?? '1.5708', next.variables);
      const dt = resolveNumeric(inst.args[4] ?? '1', next.variables);
      if (
        [nx, ny, nz, omega, dt].some((v) => !Number.isFinite(v)) ||
        Math.hypot(nx, ny, nz) <= 1e-9 ||
        dt < 0
      ) {
        return fail('SMT_QUANTUM_UNITARY: BLOCH_ROT requiere eje no nulo y dt >= 0.');
      }
      next.blochState = evolveSchrodingerPauli(next.blochState, [nx, ny, nz], omega, dt);
      const [bx, by, bz] = next.blochState.blochVector;
      return ok(
        `U(t) Schrödinger: ||ψ||²=${next.blochState.normSq.toFixed(9)}, Bloch=(${bx.toFixed(3)}, ${by.toFixed(3)}, ${bz.toFixed(3)}).`,
      );
    }

    case 'BVN_LATTICE': {
      const thP = resolveNumeric(inst.args[0] ?? '1.5708', next.variables);
      const thQ = resolveNumeric(inst.args[1] ?? '0', next.variables);
      const thR = resolveNumeric(inst.args[2] ?? '3.1416', next.variables);
      const destVar = inst.args[3];
      if ([thP, thQ, thR].some((v) => !Number.isFinite(v))) {
        return fail('SMT_QUANTUM_UNITARY: ángulos inválidos en BVN_LATTICE.');
      }
      const check = verifyBirkhoffVonNeumannNonDistributivity(
        projectorFromBlochAngle(thP, 0),
        projectorFromBlochAngle(thQ, 0),
        projectorFromBlochAngle(thR, 0),
      );
      const nonDist = !check.distributiveHolds;
      next.bvnLastNonDistributive = nonDist;
      if (destVar) {
        next.variables[destVar] = nonDist ? 1 : 0;
      }
      return ok(
        `Reticulado BvN: noDistributivo=${nonDist} (rank ${check.lhsRank} vs ${check.rhsRank}, ΔF=${check.frobeniusDiff.toFixed(3)}).`,
      );
    }

    case 'WEBER_GUARD': {
      const k = resolveNumeric(inst.args[0] ?? '0.015', next.variables);
      const prevI = resolveNumeric(inst.args[1] ?? '1.0', next.variables);
      const nextI = resolveNumeric(inst.args[2] ?? '1.004', next.variables);
      const destVar = inst.args[3];
      if (!Number.isFinite(k) || k <= 0 || k >= 1 || !Number.isFinite(prevI) || !Number.isFinite(nextI)) {
        return fail(`SMT_PHYSICS_STABILITY: WEBER_GUARD k=${k} fuera de (0, 1).`);
      }
      const evalRes = evaluateWeberFechnerFrame(prevI, nextI, k);
      next.weberDecision = evalRes.decision;
      if (evalRes.decision === 'SKIP_FRAME') {
        next.weberSkippedFrames += 1;
      } else {
        next.weberRenderedFrames += 1;
      }
      if (destVar) {
        next.variables[destVar] = evalRes.decision === 'SKIP_FRAME' ? 0 : 1;
      }
      return ok(
        `Weber-Fechner: ΔI/I=${(evalRes.deltaRatio * 100).toFixed(2)}% < ${(k * 100).toFixed(2)}% => ${evalRes.decision}.`,
      );
    }

    default:
      return ok(`Opcode simbólico ${op} evaluado en ciclo ${next.clockTicks}.`);
  }
}

export function runHelixProgram(
  instructions: ParsedScriptInstruction[],
  initialState?: HelixVmState,
): { finalState: HelixVmState; finalPc: number } {
  let state = initialState ?? createInitialVmState();
  let pc = 0;
  let guard = 0;
  while (pc < instructions.length && !state.halted && guard <= MAX_VM_EXECUTION_STEPS) {
    const res = stepHelixVmWithPc(state, instructions, pc);
    state = res.nextState;
    pc = res.nextPc;
    guard++;
  }
  return { finalState: state, finalPc: pc };
}

export function generateGoRuntimeCode(
  instructions: ParsedScriptInstruction[],
  cert?: ProofCarryingCertificate,
): string {
  return generateStructuredGoScriptFile(instructions, cert);
}

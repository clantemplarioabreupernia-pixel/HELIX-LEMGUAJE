import { RUNES } from '../data/runes';
import { CompoundWord, INITIAL_COMPOUND_VOCABULARY } from '../data/vocabulary';
import { assemblePureFromCells, HelixCell, PureAssemblyResult } from './helixCells';
import {
  GodelChecksumValidationReport,
  validateHelixGodelChecksum,
} from './helixEngine';
import {
  compileHelixScript,
  DEFAULT_HELIX_3D_PROGRAM,
  DEFAULT_HELIX_CONTRACT_PROGRAM,
  DEFAULT_HELIX_PHYSICS_PROGRAM,
  DEFAULT_HELIX_PROGRAM,
  ProgramVerificationReport,
  runHelixProgram,
  verifyHelixProgram,
} from './helixVm';

export interface AiTokenCandidate {
  line: string;
  rawLogit: number;
  label: string;
  hallucinationNote?: string;
}

export interface AiDecodingStepSpec {
  stepNumber: number;
  intent: string;
  candidates: AiTokenCandidate[];
}

export interface AiDecodingScenario {
  id: string;
  title: string;
  prompt: string;
  description: string;
  steps: AiDecodingStepSpec[];
}

export interface EvaluatedCandidate extends AiTokenCandidate {
  rawProb: number;
  maskedProb: number;
  allowed: boolean;
  violatedRules: string[];
  violationDetails: string[];
}

export interface EvaluatedDecodingStep {
  stepNumber: number;
  intent: string;
  candidates: EvaluatedCandidate[];
  stochasticWinner: EvaluatedCandidate;
  constrainedWinner: EvaluatedCandidate | null;
  blockedCount: number;
  prefixAfterStep: string;
}

export interface AiSequenceRunResult {
  scenario: AiDecodingScenario;
  temperature: number;
  steps: EvaluatedDecodingStep[];
  stochasticScript: string;
  stochasticVerification: ProgramVerificationReport;
  stochasticGodel: GodelChecksumValidationReport;
  constrainedScript: string;
  constrainedVerification: ProgramVerificationReport;
  constrainedGodel: GodelChecksumValidationReport;
  constrainedExecOk: boolean;
  pureAssemblyGo: PureAssemblyResult;
  pureAssemblyJs: PureAssemblyResult;
  blockedHallucinations: number;
  totalCandidates: number;
}

export interface HelixMiniGptRepo {
  projectName: string;
  requirementsTxt: string;
  datosHelixTxt: string;
  modeloHelixPy: string;
  stats: {
    vocabChars: number;
    corpusChars: number;
    corpusLines: number;
    runeCount: number;
    opcodeCount: number;
    cellCount: number;
  };
}

export const AI_DECODING_SCENARIOS: AiDecodingScenario[] = [
  {
    id: 'safe-heap-os',
    title: 'Kernel OS + Heap Acotado + Worker',
    prompt:
      'Inicializa el núcleo, autentica root, asigna 2 bloques de 128 B dentro del heap de 1024 B, escribe init.cfg y arranca worker.',
    description:
      'Demuestra cómo una IA estocástica suele alucinar asignando memoria antes de KERN_BOOT, excediendo el heap dentro de LOOP 2 o dejando bloques sin cerrar.',
    steps: [
      {
        stepNumber: 1,
        intent: 'Arranque del núcleo antes de tocar memoria o VFS',
        candidates: [
          {
            line: 'ᚠᚷ 256',
            rawLogit: 3.6,
            label: 'MEM_ALLOC prematuro (sin KERN_BOOT)',
            hallucinationNote: 'Un LLM común suele saltar directo a reservar memoria olvidando inicializar el núcleo.',
          },
          {
            line: 'ᛇᚢ',
            rawLogit: 3.1,
            label: 'KERN_BOOT (inicializar núcleo)',
          },
          {
            line: 'FILE_WRITE init.cfg ok',
            rawLogit: 2.1,
            label: 'Escritura VFS sin boot ni UID',
            hallucinationNote: 'Violación simultánea de precondición KERN_BOOT y ACL.',
          },
        ],
      },
      {
        stepNumber: 2,
        intent: 'Autenticación de sesión UID antes de E/S privilegiada',
        candidates: [
          {
            line: 'FILE_WRITE init.cfg ok',
            rawLogit: 3.4,
            label: 'FILE_WRITE sin AUTH_CHECK',
            hallucinationNote: 'Alucinación de permisos: intenta escribir en VFS sin sesión UID.',
          },
          {
            line: 'ᛗᚦ root',
            rawLogit: 2.9,
            label: 'AUTH_CHECK root',
          },
          {
            line: 'ᚠᚷ 2048',
            rawLogit: 2.5,
            label: 'MEM_ALLOC 2048 B (> 1024 B)',
            hallucinationNote: 'Desbordamiento estático del heap de 1024 B.',
          },
        ],
      },
      {
        stepNumber: 3,
        intent: 'Declaración de tamaño base de bloque',
        candidates: [
          {
            line: 'SET tam 128',
            rawLogit: 3.2,
            label: 'SET tam 128',
          },
          {
            line: 'ADD tam 64',
            rawLogit: 2.7,
            label: 'ADD sobre variable no inicializada',
            hallucinationNote: 'Error typestate: usa "tam" antes de declararla con SET.',
          },
          {
            line: 'DIV tam 0',
            rawLogit: 2.3,
            label: 'DIV por cero sobre tam',
            hallucinationNote: 'División estática por cero + variable no inicializada.',
          },
        ],
      },
      {
        stepNumber: 4,
        intent: 'Apertura de bucle determinista acotado',
        candidates: [
          {
            line: 'LOOP 250',
            rawLogit: 3.5,
            label: 'LOOP 250 (excede cota [0..100])',
            hallucinationNote: 'Alucinación de bucle largo que viola el límite determinista ≤ 100.',
          },
          {
            line: 'LOOP 2',
            rawLogit: 3.0,
            label: 'LOOP 2 (acotado y verificable)',
          },
          {
            line: 'END',
            rawLogit: 1.9,
            label: 'END huérfano',
            hallucinationNote: 'Cierra un bloque que nunca fue abierto.',
          },
        ],
      },
      {
        stepNumber: 5,
        intent: 'Asignación dentro del bucle respetando el presupuesto total de 1024 B',
        candidates: [
          {
            line: 'ᚠᚷ 768',
            rawLogit: 3.7,
            label: 'MEM_ALLOC 768 dentro de LOOP 2 (= 1536 B)',
            hallucinationNote: 'Error sutil: 768 ≤ 1024 en solitario, pero 2×768 = 1536 B desborda el heap.',
          },
          {
            line: 'ᚠᚷ tam',
            rawLogit: 2.9,
            label: 'MEM_ALLOC tam (2×128 = 256 B ≤ 1024 B)',
          },
          {
            line: 'ᚳᛏ',
            rawLogit: 2.0,
            label: 'EXIT_OK con LOOP abierto',
            hallucinationNote: 'Termina el programa dejando el bloque LOOP abierto.',
          },
        ],
      },
      {
        stepNumber: 6,
        intent: 'Cierre explícito del bloque LOOP',
        candidates: [
          {
            line: 'ᚳᛏ',
            rawLogit: 3.3,
            label: 'EXIT_OK prematuro (falta END)',
            hallucinationNote: 'Salto prematuro sin cerrar LOOP 2.',
          },
          {
            line: 'END',
            rawLogit: 3.0,
            label: 'END (cierra LOOP 2)',
          },
          {
            line: 'MEM_FREE blk_99',
            rawLogit: 2.2,
            label: 'MEM_FREE sobre bloque inexistente',
            hallucinationNote: 'Typestate error: blk_99 no existe.',
          },
        ],
      },
      {
        stepNumber: 7,
        intent: 'Creación y ejecución del proceso worker',
        candidates: [
          {
            line: 'ᛒᚢ worker',
            rawLogit: 3.1,
            label: 'PROC_FORK worker',
          },
          {
            line: 'DIV tam 0',
            rawLogit: 3.4,
            label: 'DIV tam 0 (alucinación aritmética)',
            hallucinationNote: 'División estática por cero bloqueada por AST/SMT.',
          },
          {
            line: 'END',
            rawLogit: 2.0,
            label: 'END extra huérfano',
            hallucinationNote: 'No hay bloques abiertos que cerrar.',
          },
        ],
      },
      {
        stepNumber: 8,
        intent: 'Planificación del worker y escritura en VFS',
        candidates: [
          {
            line: 'ᚱᚳ',
            rawLogit: 3.0,
            label: 'PROC_RUN',
          },
          {
            line: 'DIV tam 139',
            rawLogit: 3.3,
            label: 'DIV tam 139 (primo fuera de P33)',
            hallucinationNote: '139 > 137 introduce expansión periódica fuera del subanillo exacto P33.',
          },
          {
            line: 'END',
            rawLogit: 1.8,
            label: 'END huérfano',
          },
        ],
      },
      {
        stepNumber: 9,
        intent: 'Persistencia de configuración en VFS',
        candidates: [
          {
            line: 'FILE_WRITE init.cfg boot_ok',
            rawLogit: 3.1,
            label: 'FILE_WRITE init.cfg boot_ok',
          },
          {
            line: 'MEM_FREE blk_99',
            rawLogit: 2.7,
            label: 'MEM_FREE blk_99 (typestate inválido)',
          },
        ],
      },
      {
        stepNumber: 10,
        intent: 'Cierre limpio del programa',
        candidates: [
          {
            line: 'ᚳᛏ',
            rawLogit: 3.4,
            label: 'EXIT_OK (código 0)',
          },
          {
            line: 'END',
            rawLogit: 2.4,
            label: 'END huérfano',
          },
        ],
      },
    ],
  },
  {
    id: 'p33-finance-exact',
    title: 'Aritmética Exacta P33 (Cero Div/0 ni Primos > 137)',
    prompt:
      'Reparte 1260 créditos entre 14 nodos dentro del subanillo racional P33 sin división por cero ni aproximaciones binarias.',
    description:
      'Muestra cómo la máscara Helix bloquea divisores 0 y denominadores primos > 137 (como 139 o 149) garantizando aritmética racional exacta.',
    steps: [
      {
        stepNumber: 1,
        intent: 'Inicialización de núcleo',
        candidates: [
          {
            line: 'ᛇᚢ',
            rawLogit: 3.2,
            label: 'KERN_BOOT',
          },
          {
            line: 'FILE_WRITE ledger.p33 1260',
            rawLogit: 3.4,
            label: 'FILE_WRITE sin boot/auth',
            hallucinationNote: 'Falta KERN_BOOT y AUTH_CHECK.',
          },
        ],
      },
      {
        stepNumber: 2,
        intent: 'Autenticación de tesorería',
        candidates: [
          {
            line: 'ᛗᚦ treasury',
            rawLogit: 3.1,
            label: 'AUTH_CHECK treasury',
          },
          {
            line: 'DIV fondo 2',
            rawLogit: 3.5,
            label: 'DIV sobre variable no inicializada',
            hallucinationNote: 'La variable "fondo" aún no existe.',
          },
        ],
      },
      {
        stepNumber: 3,
        intent: 'Registro del fondo base',
        candidates: [
          {
            line: 'SET fondo 1260',
            rawLogit: 3.4,
            label: 'SET fondo 1260',
          },
          {
            line: 'DIV fondo 0',
            rawLogit: 2.9,
            label: 'DIV por cero',
          },
        ],
      },
      {
        stepNumber: 4,
        intent: 'Prorrateo exacto dentro del subanillo P33 (p ≤ 137)',
        candidates: [
          {
            line: 'DIV fondo 0',
            rawLogit: 3.8,
            label: 'DIV fondo 0 (división por cero)',
            hallucinationNote: 'Alucinación crítica clásica en código generado por IA.',
          },
          {
            line: 'DIV fondo 139',
            rawLogit: 3.5,
            label: 'DIV fondo 139 (primo 139 ∉ P33)',
            hallucinationNote: '139 está fuera de los 33 primeros primos [2..137] del subanillo exacto.',
          },
          {
            line: 'DIV fondo 14',
            rawLogit: 2.7,
            label: 'DIV fondo 14 (2×7 ∈ P33 → 90 exacto)',
          },
        ],
      },
      {
        stepNumber: 5,
        intent: 'Escalado de cuota y guardado en libro contable',
        candidates: [
          {
            line: 'MUL fondo 2',
            rawLogit: 3.1,
            label: 'MUL fondo 2 (180)',
          },
          {
            line: 'DIV fondo 149',
            rawLogit: 3.3,
            label: 'DIV fondo 149 (primo 149 ∉ P33)',
            hallucinationNote: 'Bloqueado por P33_DENOMINATOR.',
          },
        ],
      },
      {
        stepNumber: 6,
        intent: 'Persistencia y cierre',
        candidates: [
          {
            line: 'FILE_WRITE ledger.p33 fondo',
            rawLogit: 3.2,
            label: 'FILE_WRITE ledger.p33 fondo',
          },
          {
            line: 'END',
            rawLogit: 2.5,
            label: 'END huérfano',
          },
        ],
      },
      {
        stepNumber: 7,
        intent: 'Finalización verificada',
        candidates: [
          {
            line: 'ᚳᛏ',
            rawLogit: 3.5,
            label: 'EXIT_OK',
          },
          {
            line: 'MEM_FREE blk_1',
            rawLogit: 2.6,
            label: 'MEM_FREE sin asignaciones previas',
          },
        ],
      },
    ],
  },
  {
    id: 'scene-3d-budget',
    title: 'Pipeline 3D PBR + WS bajo Presupuesto SMT',
    prompt:
      'Genera un rotor 3D (hub + ring) con material ORM válido en [0,1], sin superar 10,000 triángulos, ajusta cámara 6-DoF y emite WS.',
    description:
      'Bloquea mallas con polígonos explosivos (>10,000 Δ) y canales PBR físicamente imposibles (AO/Roughness/Metalness fuera de [0,1]).',
    steps: [
      {
        stepNumber: 1,
        intent: 'Boot del kernel gráfico',
        candidates: [
          {
            line: 'MESH_NODE hub lathe 960 1.0',
            rawLogit: 3.5,
            label: 'MESH_NODE sin KERN_BOOT',
            hallucinationNote: 'Intenta crear geometría sin haber arrancado el runtime.',
          },
          {
            line: 'ᛇᚢ',
            rawLogit: 3.1,
            label: 'KERN_BOOT',
          },
        ],
      },
      {
        stepNumber: 2,
        intent: 'Sesión de escena autenticada',
        candidates: [
          {
            line: 'ᛗᚦ render_admin',
            rawLogit: 3.2,
            label: 'AUTH_CHECK render_admin',
          },
          {
            line: 'MAT_ORM hub 0.9 0.3 0.8',
            rawLogit: 2.8,
            label: 'MAT_ORM sin nodo previo (solo advertencia/desorden)',
          },
        ],
      },
      {
        stepNumber: 3,
        intent: 'Creación del cubo central dentro del presupuesto ≤ 10,000 Δ',
        candidates: [
          {
            line: 'MESH_NODE bad torus 14000 1.0',
            rawLogit: 3.9,
            label: 'MESH_NODE 14,000 Δ (excede 10,000 Δ)',
            hallucinationNote: 'Alucinación de densidad de malla rechazada por SMT_MESH_BUDGET.',
          },
          {
            line: 'MESH_NODE hub lathe 960 1.0',
            rawLogit: 3.0,
            label: 'MESH_NODE hub lathe 960 1.0',
          },
        ],
      },
      {
        stepNumber: 4,
        intent: 'Material PBR ORM acotado en [0, 1]',
        candidates: [
          {
            line: 'MAT_ORM hub 1.45 -0.2 0.85',
            rawLogit: 3.6,
            label: 'MAT_ORM con AO=1.45 y R=-0.2 (ilegal)',
            hallucinationNote: 'Valores PBR fuera del rango físico [0, 1] bloqueados por SMT_ORM_BOUNDS.',
          },
          {
            line: 'MAT_ORM hub 0.92 0.28 0.85',
            rawLogit: 3.0,
            label: 'MAT_ORM hub 0.92 0.28 0.85',
          },
        ],
      },
      {
        stepNumber: 5,
        intent: 'Anillo exterior respetando el presupuesto acumulado',
        candidates: [
          {
            line: 'MESH_NODE giant prism 9500 1.0',
            rawLogit: 3.5,
            label: 'MESH_NODE 9500 Δ (960+9500 = 10,460 > 10,000)',
            hallucinationNote: 'Suma acumulada excede 10,000 Δ aunque 9500 ≤ 10,000 en solitario.',
          },
          {
            line: 'MESH_NODE ring torus 1280 1.1',
            rawLogit: 3.1,
            label: 'MESH_NODE ring torus 1280 1.1 (total 2240 Δ)',
          },
        ],
      },
      {
        stepNumber: 6,
        intent: 'Cámara 6-DoF + emisión WebSocket + cierre',
        candidates: [
          {
            line: 'CAM_6DOF 3.2 2.1 3.8 38 18 45',
            rawLogit: 3.3,
            label: 'CAM_6DOF 3.2 2.1 3.8 38 18 45',
          },
          {
            line: 'DIV scale 0',
            rawLogit: 2.9,
            label: 'DIV por cero',
          },
        ],
      },
      {
        stepNumber: 7,
        intent: 'Telemetría WS y salida limpia',
        candidates: [
          {
            line: 'WS_EMIT telemetry rotor_ready',
            rawLogit: 3.2,
            label: 'WS_EMIT telemetry rotor_ready',
          },
          {
            line: 'LOOP 400',
            rawLogit: 2.8,
            label: 'LOOP 400 (no acotado)',
          },
        ],
      },
      {
        stepNumber: 8,
        intent: 'Cierre del programa',
        candidates: [
          {
            line: 'ᚳᛏ',
            rawLogit: 3.4,
            label: 'EXIT_OK',
          },
          {
            line: 'END',
            rawLogit: 2.2,
            label: 'END huérfano',
          },
        ],
      },
    ],
  },
];

function computeOpenBlocks(lines: string[], vocabulary: CompoundWord[]): number {
  const insts = compileHelixScript(lines.join('\n'), vocabulary);
  let depth = 0;
  for (const inst of insts) {
    const op = inst.opcode.toUpperCase();
    if (op === 'IF' || op === 'LOOP') depth++;
    else if (op === 'END') depth = Math.max(0, depth - 1);
  }
  return depth;
}

/**
 * Evalúa si una línea candidata es matemáticamente y gramaticalmente admisible
 * dado un prefijo ya verificado. Usa el compilador y solver SMT reales de Helix.
 */
export function evaluateCandidatePrefix(
  verifiedPrefixLines: string[],
  candidateLine: string,
  vocabulary: CompoundWord[],
  cells: HelixCell[] = [],
): { allowed: boolean; violatedRules: string[]; violationDetails: string[] } {
  const violatedRules: string[] = [];
  const violationDetails: string[] = [];

  // Barrera léxica y matemática de Gödel sobre la base cerrada de 33 tokens [2..137]
  const godelCheck = validateHelixGodelChecksum(candidateLine, { vocabulary, cells });
  if (!godelCheck.valid) {
    violatedRules.push('GODEL_OUT_OF_BASIS');
    violationDetails.push(godelCheck.summary);
  }

  const candidateInsts = compileHelixScript(candidateLine, vocabulary);
  const candidateOp = candidateInsts[0]?.opcode.toUpperCase() ?? '';
  const openBefore = computeOpenBlocks(verifiedPrefixLines, vocabulary);

  if (candidateOp === 'EXIT_OK' && openBefore > 0) {
    violatedRules.push('UNCLOSED_BLOCK');
    violationDetails.push(
      `EXIT_OK prohibido mientras existen ${openBefore} bloque(s) IF/LOOP abiertos sin END.`,
    );
  }

  // Construimos programa tentativo cerrando bloques aún abiertos SOLO para poder
  // ejecutar el solver SMT completo sobre el cuerpo actual del bucle/condicional.
  const tentativeLines = [...verifiedPrefixLines, candidateLine];
  const openAfter = computeOpenBlocks(tentativeLines, vocabulary);
  const smtClosures = Array.from({ length: openAfter }, () => 'END');
  const fullForCheck = [...tentativeLines, ...smtClosures].join('\n');

  const compiled = compileHelixScript(fullForCheck, vocabulary);
  const report = verifyHelixProgram(compiled);

  for (const f of report.findings) {
    // Ignoramos AST_UNCLOSED_BLOCK si ya lo controlamos explícitamente arriba,
    // pero bloqueamos cualquier ERROR real (SMT_*, P33_*, NO_DIV_ZERO, BOUNDED_LOOP, AST_ORPHAN_END, TYPESTATE_*)
    // y cualquier precondición de seguridad (BOOT_PRECONDITION, ACL_PRECONDITION).
    const isStrictViolation =
      f.severity === 'ERROR' ||
      f.rule === 'BOOT_PRECONDITION' ||
      f.rule === 'ACL_PRECONDITION';

    if (isStrictViolation) {
      if (!violatedRules.includes(f.rule)) violatedRules.push(f.rule);
      if (!violationDetails.includes(f.detail)) violationDetails.push(f.detail);
    }
  }

  // Regla extra para MAT_ORM antes de crear nodos si aún no hay MESH_NODE
  if (candidateOp === 'MAT_ORM') {
    const compiledRaw = compileHelixScript(tentativeLines.join('\n'), vocabulary);
    const hasMesh = compiledRaw.some((i) => i.opcode.toUpperCase() === 'MESH_NODE');
    if (!hasMesh) {
      if (!violatedRules.includes('SCENE_NO_MESH')) violatedRules.push('SCENE_NO_MESH');
      violationDetails.push('MAT_ORM invocado antes de declarar un MESH_NODE en la escena.');
    }
  }

  return {
    allowed: violatedRules.length === 0,
    violatedRules,
    violationDetails,
  };
}

function softmax(logits: number[], temperature: number): number[] {
  const t = Math.max(0.15, temperature);
  const scaled = logits.map((l) => l / t);
  const maxVal = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - maxVal));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

export function runConstrainedAiSequence(
  scenarioId: string,
  vocabulary: CompoundWord[] = INITIAL_COMPOUND_VOCABULARY,
  cells: HelixCell[] = [],
  temperature = 0.85,
): AiSequenceRunResult {
  const scenario =
    AI_DECODING_SCENARIOS.find((s) => s.id === scenarioId) ?? AI_DECODING_SCENARIOS[0];

  const constrainedLines: string[] = [];
  const stochasticLines: string[] = [];
  const steps: EvaluatedDecodingStep[] = [];
  let blockedHallucinations = 0;
  let totalCandidates = 0;

  for (const step of scenario.steps) {
    totalCandidates += step.candidates.length;
    const rawProbs = softmax(
      step.candidates.map((c) => c.rawLogit),
      temperature,
    );

    const evaluations = step.candidates.map((cand) =>
      evaluateCandidatePrefix(constrainedLines, cand.line, vocabulary, cells),
    );

    const maskedLogits = step.candidates.map((cand, idx) =>
      evaluations[idx].allowed ? cand.rawLogit : -Infinity,
    );
    const allBlocked = maskedLogits.every((v) => v === -Infinity);
    const maskedProbs = allBlocked
      ? step.candidates.map(() => 0)
      : softmax(
          maskedLogits.map((v) => (v === -Infinity ? -1e9 : v)),
          temperature,
        ).map((p, idx) => (evaluations[idx].allowed ? p : 0));

    const evaluatedCandidates: EvaluatedCandidate[] = step.candidates.map((cand, idx) => {
      if (!evaluations[idx].allowed) blockedHallucinations++;
      return {
        ...cand,
        rawProb: rawProbs[idx],
        maskedProb: maskedProbs[idx],
        allowed: evaluations[idx].allowed,
        violatedRules: evaluations[idx].violatedRules,
        violationDetails: evaluations[idx].violationDetails,
      };
    });

    const stochasticWinner = evaluatedCandidates.reduce((best, cur) =>
      cur.rawProb > best.rawProb ? cur : best,
    );

    const allowedCandidates = evaluatedCandidates.filter((c) => c.allowed);
    const constrainedWinner =
      allowedCandidates.length > 0
        ? allowedCandidates.reduce((best, cur) =>
            cur.maskedProb > best.maskedProb ? cur : best,
          )
        : null;

    stochasticLines.push(stochasticWinner.line);
    if (constrainedWinner) {
      constrainedLines.push(constrainedWinner.line);
    }

    steps.push({
      stepNumber: step.stepNumber,
      intent: step.intent,
      candidates: evaluatedCandidates,
      stochasticWinner,
      constrainedWinner,
      blockedCount: evaluatedCandidates.filter((c) => !c.allowed).length,
      prefixAfterStep: constrainedLines.join('\n'),
    });
  }

  const constrainedScript = constrainedLines.join('\n');
  const stochasticScript = stochasticLines.join('\n');

  const constrainedCompiled = compileHelixScript(constrainedScript, vocabulary);
  const constrainedVerification = verifyHelixProgram(constrainedCompiled);

  const stochasticCompiled = compileHelixScript(stochasticScript, vocabulary);
  const stochasticVerification = verifyHelixProgram(stochasticCompiled);

  const vmRun = runHelixProgram(constrainedCompiled);
  const constrainedExecOk =
    constrainedVerification.status === 'VERIFICADO' &&
    vmRun.finalState.logs.every((l) => l.status === 'OK');

  const pureAssemblyGo = assemblePureFromCells(constrainedCompiled, cells, 'go');
  const pureAssemblyJs = assemblePureFromCells(constrainedCompiled, cells, 'js');
  const constrainedGodel = validateHelixGodelChecksum(constrainedScript, { vocabulary, cells });
  const stochasticGodel = validateHelixGodelChecksum(stochasticScript, { vocabulary, cells });

  return {
    scenario,
    temperature,
    steps,
    stochasticScript,
    stochasticVerification,
    stochasticGodel,
    constrainedScript,
    constrainedVerification,
    constrainedGodel,
    constrainedExecOk,
    pureAssemblyGo,
    pureAssemblyJs,
    blockedHallucinations,
    totalCandidates,
  };
}

export function generateHelixTrainingCorpus(
  vocabulary: CompoundWord[],
  cells: HelixCell[],
): string {
  const verifiedPrograms: string[] = [
    DEFAULT_HELIX_PROGRAM,
    DEFAULT_HELIX_3D_PROGRAM,
    DEFAULT_HELIX_CONTRACT_PROGRAM,
    DEFAULT_HELIX_PHYSICS_PROGRAM,
    `# Programa P33 exacto verificado
ᛇᚢ
ᛗᚦ treasury
SET fondo 1260
DIV fondo 14
MUL fondo 2
FILE_WRITE ledger.p33 fondo
ᚳᛏ`,
    `# Bucle WS_EMIT determinista
ᛇᚢ
ᛗᚦ telemetry
SET pkt 10
LOOP 3
  WS_EMIT pulse pkt
  ADD pkt 1
END
ᚳᛏ`,
    `# Gestión de memoria con bloqueo RO y liberación segura
ᛇᚢ
ᛗᚦ sys_admin
SET chunk 128
LOOP 2
  ᚠᚷ chunk
  ADD chunk 64
END
MEM_LOCK
FILE_WRITE mem.log ok
ᚳᛏ`,
  ];

  // Agregar salidas verificadas de cada escenario IA
  for (const sc of AI_DECODING_SCENARIOS) {
    const run = runConstrainedAiSequence(sc.id, vocabulary, cells, 0.8);
    if (run.constrainedVerification.status === 'VERIFICADO') {
      verifiedPrograms.push(`# Escenario IA: ${sc.id}\n${run.constrainedScript}`);
    }
  }

  // Diccionario simbólico completo (33 tokens + opcodes compuestos + células .hlx)
  const runeBasisLines = RUNES.map(
    (r) => `# RUNE ${r.glyph} ${r.osTag} p=${r.prime} f=${r.frequencyHz.toFixed(2)}Hz`,
  );

  const vocabLines = vocabulary.slice(0, 40).map(
    (w) => `# OPCODE ${w.glyphs} => ${w.opcode} | ${w.osInstruction}`,
  );

  const cellChains = cells.map(
    (c) => `# CELL ${c.fileName} (${c.glyphs} -> ${c.opcode}) godel=${c.godelProduct}`,
  );

  // Repeticiones controladas para que MiniGPT aprenda distribuciones reales de tokens Helix
  const blocks: string[] = [
    ...runeBasisLines,
    '',
    ...vocabLines,
    '',
    ...cellChains,
    '',
  ];

  for (let rep = 0; rep < 6; rep++) {
    for (const prog of verifiedPrograms) {
      blocks.push(prog.trim(), '');
    }
  }

  return blocks.join('\n');
}

export function generateHelixMiniGptRepo(
  vocabulary: CompoundWord[],
  cells: HelixCell[],
): HelixMiniGptRepo {
  const requirementsTxt = `torch>=2.0.0\n`;
  const datosHelixTxt = generateHelixTrainingCorpus(vocabulary, cells);
  const uniqueChars = new Set(Array.from(datosHelixTxt)).size;
  const corpusLines = datosHelixTxt.split(/\r?\n/).length;

  const modeloHelixPy = `import math
import torch
import torch.nn as nn
from torch.nn import functional as F

# ==============================================================================
# Mini-GPT + Guardia Matemática Helix (Decodificación Cero-Alucinaciones)
# Basado en arquitectura Transformer autoregresiva con Máscara de Logits (-inf)
# ==============================================================================

# --- 1. Hiperparámetros ---
batch_size = 32
block_size = 64
max_iters = 2000
eval_interval = 250
learning_rate = 1e-3
device = 'cuda' if torch.cuda.is_available() else 'cpu'
n_embd = 128
n_head = 4
n_layer = 4
dropout = 0.1

torch.manual_seed(1337)

# Subanillo P33 exacto: primeros 33 números primos [2..137]
PRIMES_33 = [
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59,
    61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137,
]

# --- 2. Cargar y tokenizar el corpus simbólico Helix ---
with open('datos_helix.txt', 'r', encoding='utf-8') as f:
    text = f.read()

chars = sorted(list(set(text)))
vocab_size = len(chars)
stoi = {ch: i for i, ch in enumerate(chars)}
itos = {i: ch for i, ch in enumerate(chars)}
encode = lambda s: [stoi[c] for c in s if c in stoi]
decode = lambda l: ''.join([itos[i] for i in l])

data = torch.tensor(encode(text), dtype=torch.long)
n = int(0.9 * len(data))
train_data = data[:n]
val_data = data[n:]

def get_batch(split):
    data_split = train_data if split == 'train' else val_data
    ix = torch.randint(len(data_split) - block_size, (batch_size,))
    x = torch.stack([data_split[i:i+block_size] for i in ix])
    y = torch.stack([data_split[i+1:i+block_size+1] for i in ix])
    return x.to(device), y.to(device)

# --- 3. Verificador / Guardia Estático Helix para Máscara de Logits ---
def in_subring_p33(n_val: int) -> bool:
    if n_val <= 0:
        return False
    cur = n_val
    for p in PRIMES_33:
        while cur % p == 0:
            cur //= p
    return cur == 1

def helix_static_guard(prefix_text: str):
    """
    Evalúa invariantes matemáticos, físicos y gramaticales sobre el programa Helix parcial:
    - KERN_BOOT (ᛇᚢ) previo a operaciones privilegiadas / heap / 3D / Pauli-SoA
    - Bloqueo estático de DIV por 0 o denominadores fuera de P33 (> 137)
    - Balanceo estricto de bloques LOOP / IF / FN / END
    - Presupuesto determinista de triángulos <= 10,000, heap <= 1024 B y 0 < gamma < 1 (Némesis)
    """
    seen_boot = False
    open_blocks = 0
    used_mem = 0
    used_tris = 0
    errors = []

    for raw in prefix_text.splitlines():
        clean = raw.split('#')[0].strip()
        if not clean:
            continue
        parts = clean.split()
        head = parts[0].upper()
        args = parts[1:]

        if head in ('ᛇᚢ', 'KERN_BOOT'):
            seen_boot = True
        elif head in ('LOOP', 'IF', 'FN', 'ᛡ', 'ᚻ'):
            open_blocks += 1
            if head == 'LOOP' and args and args[0].isdigit() and int(args[0]) > 100:
                errors.append(f'BOUNDED_LOOP:{args[0]}')
        elif head == 'END':
            if open_blocks == 0:
                errors.append('AST_ORPHAN_END')
            else:
                open_blocks -= 1
        elif head in ('ᚳᛏ', 'EXIT_OK') and open_blocks > 0:
            errors.append('UNCLOSED_BLOCK')
        elif head in ('ᚠᚷ', 'MEM_ALLOC', 'MEM_INIT'):
            if not seen_boot:
                errors.append('BOOT_PRECONDITION')
            if args and args[0].isdigit():
                used_mem += int(args[0])
                if used_mem > 1024:
                    errors.append(f'SMT_MEM_BOUNDS:{used_mem}')
        elif head in ('ᚠᛗ', 'SOA_INIT'):
            if not seen_boot:
                errors.append('BOOT_PRECONDITION')
            if args and args[0].isdigit():
                used_mem += int(args[0]) * 28
                if used_mem > 1024 or int(args[0]) > 256:
                    errors.append(f'SMT_MEM_BOUNDS:{used_mem}')
        elif head in ('ᛏᛜ', 'NEMESIS_DECAY') and args:
            try:
                gamma = float(args[0])
                if not (0.0 < gamma < 1.0):
                    errors.append(f'SMT_PHYSICS_STABILITY:{gamma}')
            except ValueError:
                pass
        elif head == 'DIV' and len(args) >= 2:
            if args[1] == '0':
                errors.append('SMT_DIV_ZERO')
            elif args[1].lstrip('-').isdigit() and not in_subring_p33(abs(int(args[1]))):
                errors.append(f'P33_DENOMINATOR:{args[1]}')
        elif head == 'MESH_NODE' and len(args) >= 3 and args[2].isdigit():
            if not seen_boot:
                errors.append('BOOT_PRECONDITION')
            used_tris += int(args[2])
            if used_tris > 10000:
                errors.append(f'SMT_MESH_BUDGET:{used_tris}')

    return (len(errors) == 0), errors

# --- 4. Arquitectura Transformer Decoder-Only (Pre-LN + GELU + Dropout 0.1) ---
class Head(nn.Module):
    def __init__(self, head_size):
        super().__init__()
        self.key = nn.Linear(n_embd, head_size, bias=False)
        self.query = nn.Linear(n_embd, head_size, bias=False)
        self.value = nn.Linear(n_embd, head_size, bias=False)
        self.register_buffer('tril', torch.tril(torch.ones(block_size, block_size)))
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        B, T, C = x.shape
        k = self.key(x)
        q = self.query(x)
        wei = q @ k.transpose(-2, -1) * (head_size_scale := (k.shape[-1] ** -0.5))
        wei = wei.masked_fill(self.tril[:T, :T] == 0, float('-inf'))
        wei = F.softmax(wei, dim=-1)
        wei = self.dropout(wei)
        v = self.value(x)
        return wei @ v

class MultiHeadAttention(nn.Module):
    def __init__(self, num_heads, head_size):
        super().__init__()
        self.heads = nn.ModuleList([Head(head_size) for _ in range(num_heads)])
        self.proj = nn.Linear(n_embd, n_embd)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        out = torch.cat([h(x) for h in self.heads], dim=-1)
        return self.dropout(self.proj(out))

class FeedForward(nn.Module):
    def __init__(self, n_embd):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_embd, 4 * n_embd),
            nn.GELU(),
            nn.Linear(4 * n_embd, n_embd),
            nn.Dropout(dropout),
        )

    def forward(self, x):
        return self.net(x)

class Block(nn.Module):
    def __init__(self, n_embd, n_head):
        super().__init__()
        head_size = n_embd // n_head
        self.sa = MultiHeadAttention(n_head, head_size)
        self.ffwd = FeedForward(n_embd)
        self.ln1 = nn.LayerNorm(n_embd)
        self.ln2 = nn.LayerNorm(n_embd)

    def forward(self, x):
        x = x + self.sa(self.ln1(x))
        x = x + self.ffwd(self.ln2(x))
        return x

class MiniGPT(nn.Module):
    def __init__(self):
        super().__init__()
        self.token_embedding_table = nn.Embedding(vocab_size, n_embd)
        self.position_embedding_table = nn.Embedding(block_size, n_embd)
        self.blocks = nn.Sequential(*[Block(n_embd, n_head=n_head) for _ in range(n_layer)])
        self.ln_f = nn.LayerNorm(n_embd)
        self.lm_head = nn.Linear(n_embd, vocab_size)

    def forward(self, idx, targets=None):
        B, T = idx.shape
        tok_emb = self.token_embedding_table(idx)
        pos_emb = self.position_embedding_table(torch.arange(T, device=device))
        x = tok_emb + pos_emb
        x = self.blocks(x)
        x = self.ln_f(x)
        logits = self.lm_head(x)

        loss = None
        if targets is not None:
            B, T, C = logits.shape
            logits = logits.view(B * T, C)
            targets = targets.view(B * T)
            loss = F.cross_entropy(logits, targets)
        return logits, loss

    @torch.no_grad()
    def generate_verified(self, idx, max_new_tokens=220, top_k=8):
        """
        Generación autoregresiva con Máscara de Logits Helix:
        antes de cerrar una línea ('\\n'), evalúa los top_k tokens candidatos
        y enmascara con -inf cualquier transición que viole helix_static_guard.
        """
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -block_size:]
            logits, _ = self(idx_cond)
            logits = logits[:, -1, :]

            current_text = decode(idx[0].tolist())
            top_vals, top_idx = torch.topk(logits, min(top_k, vocab_size), dim=-1)
            for cand_id in top_idx[0].tolist():
                cand_char = itos[cand_id]
                if cand_char == '\\n':
                    ok, _ = helix_static_guard(current_text)
                    if not ok:
                        logits[0, cand_id] = float('-inf')

            probs = F.softmax(logits, dim=-1)
            if torch.isnan(probs).any():
                # Respaldo seguro si toda la cola quedó enmascarada
                probs = F.softmax(torch.ones_like(logits), dim=-1)
            idx_next = torch.multinomial(probs, num_samples=1)
            idx = torch.cat((idx, idx_next), dim=1)
        return idx

if __name__ == '__main__':
    model = MiniGPT().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)

    print(f"Entrenando MiniGPT-Helix en {device} | vocab={vocab_size} | chars={len(text)}")
    for it in range(max_iters):
        xb, yb = get_batch('train')
        _, loss = model(xb, yb)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()
        if it % eval_interval == 0:
            print(f"Paso {it}: pérdida = {loss.item():.4f}")

    torch.save(model.state_dict(), 'mi_modelo_helix.pth')
    seed_tokens = torch.tensor([encode('ᛇᚢ\\n')], dtype=torch.long, device=device)
    generated = decode(model.generate_verified(seed_tokens, max_new_tokens=200)[0].tolist())
    ok, errs = helix_static_guard(generated)
    print("\\n--- PROGRAMA HELIX GENERADO CON MÁSCARA SMT ---")
    print(generated)
    print(f"\\nVerificación estática: ok={ok}, errores={errs}")
`;

  return {
    projectName: 'mi-ia-helix',
    requirementsTxt,
    datosHelixTxt,
    modeloHelixPy,
    stats: {
      vocabChars: uniqueChars,
      corpusChars: datosHelixTxt.length,
      corpusLines,
      runeCount: RUNES.length,
      opcodeCount: vocabulary.length,
      cellCount: cells.length,
    },
  };
}

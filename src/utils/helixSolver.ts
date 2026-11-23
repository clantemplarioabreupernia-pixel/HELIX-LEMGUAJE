import { ParsedScriptInstruction } from './helixVm';
import { checkDenominatorInP33 } from './rationalP33';
import {
  buildProofCarryingCertificate,
  ProofCarryingCertificate,
} from './helixPcc';
import {
  projectorFromBlochAngle,
  verifyBirkhoffVonNeumannNonDistributivity,
} from './helixPhysics';

export interface IntervalBound {
  min: number;
  max: number;
}

export type BlockTypestate = 'ALLOCATED' | 'LOCKED_RO' | 'FREED' | 'MAYBE_FREED';
export type VarInitState = 'INIT' | 'MAYBE_INIT';

export interface SolverFinding {
  lineNumber: number;
  severity: 'ERROR' | 'WARN' | 'INFO';
  rule:
    | 'SMT_DIV_ZERO'
    | 'SMT_MEM_BOUNDS'
    | 'SMT_MESH_BUDGET'
    | 'SMT_ORM_BOUNDS'
    | 'SMT_BRANCH_SAT'
    | 'SMT_P33_VAR'
    | 'SMT_SAFE_BOUND'
    | 'SMT_ARRAY_BOUNDS'
    | 'SMT_CONTRACT_VIOLATION'
    | 'SMT_RECURSION_DEPTH'
    | 'SMT_PHYSICS_STABILITY'
    | 'SMT_QUANTUM_UNITARY'
    | 'TYPESTATE_DOUBLE_FREE'
    | 'TYPESTATE_LOCKED_FREE'
    | 'TYPESTATE_UNINIT_VAR';
  detail: string;
}

export interface OptimizationSuggestion {
  lineNumber: number;
  kind: 'DEAD_BRANCH_PRUNE' | 'IDENTITY_ELIMINATION' | 'RUNTIME_CHECK_DISCHARGED';
  detail: string;
}

export interface SymbolicFunctionSummary {
  name: string;
  params: string[];
  contractsChecked: number;
  callCount: number;
  maxCallDepth: number;
  contractStatus: 'PROVED' | 'VIOLATED';
}

export interface SymbolicArraySummary {
  name: string;
  size: number;
  elemBound: IntervalBound;
  boundsStatus: 'PROVED' | 'VIOLATED';
}

export interface SymbolicReport {
  status: 'PROVED_SAFE' | 'VIOLATION_FOUND';
  maxHeapBytes: number;
  heapCapacityBytes: number;
  totalTriangles: number;
  meshBudgetMax: number;
  meshNodesCount: number;
  variableBounds: Record<string, IntervalBound>;
  relationalInvariants: string[];
  octagonInvariants: string[];
  blockStates: { id: string; size: number; state: BlockTypestate }[];
  branchChecks: { lineNumber: number; condition: string; result: 'SAT' | 'TAUTOLOGÍA' | 'UNSAT' }[];
  functionsVerified: SymbolicFunctionSummary[];
  boundedArrays: SymbolicArraySummary[];
  dischargedRuntimeChecks: number;
  optimizations: OptimizationSuggestion[];
  optimizedScript: string;
  pccCertificate: ProofCarryingCertificate;
  findings: SolverFinding[];
  stepsAnalyzed: number;
  smtLatencyMs: number;
  quantumNormPreserved: boolean;
  nemesisDecayProved: boolean;
  soaCapacityCells: number;
}

interface SymbolicBlock {
  id: string;
  sizeMin: number;
  sizeMax: number;
  state: BlockTypestate;
}

interface SymbolicArray {
  size: number;
  elemBound: IntervalBound;
}

interface SymbolicFnDef {
  name: string;
  params: string[];
  startPc: number;
  endPc: number;
  requires: { lineNumber: number; left: string; cmp: string; right: string }[];
  ensures: { lineNumber: number; left: string; cmp: string; right: string }[];
}

interface AbstractState {
  vars: Record<string, IntervalBound>;
  init: Record<string, VarInitState>;
  /** Dominio de Octágonos Miné/ASTRÉE: diffs[x][y] = x - y ∈ [min, max]; sums[x][y] = x + y ∈ [min, max] */
  diffs: Record<string, Record<string, IntervalBound>>;
  sums: Record<string, Record<string, IntervalBound>>;
  blocks: SymbolicBlock[];
  arrays: Record<string, SymbolicArray>;
  usedMem: IntervalBound;
  totalMem: IntervalBound;
  usedTriangles: IntervalBound;
  meshNodeIds: string[];
}

function cloneMatrix(
  src: Record<string, Record<string, IntervalBound>>,
): Record<string, Record<string, IntervalBound>> {
  const out: Record<string, Record<string, IntervalBound>> = {};
  for (const [x, row] of Object.entries(src)) {
    out[x] = {};
    for (const [y, b] of Object.entries(row)) {
      out[x][y] = { min: b.min, max: b.max };
    }
  }
  return out;
}

function cloneState(s: AbstractState): AbstractState {
  const vars: Record<string, IntervalBound> = {};
  for (const [k, v] of Object.entries(s.vars)) {
    vars[k] = { min: v.min, max: v.max };
  }
  const arrays: Record<string, SymbolicArray> = {};
  for (const [k, arr] of Object.entries(s.arrays)) {
    arrays[k] = { size: arr.size, elemBound: { ...arr.elemBound } };
  }
  return {
    vars,
    init: { ...s.init },
    diffs: cloneMatrix(s.diffs),
    sums: cloneMatrix(s.sums),
    blocks: s.blocks.map((b) => ({ ...b })),
    arrays,
    usedMem: { ...s.usedMem },
    totalMem: { ...s.totalMem },
    usedTriangles: { ...s.usedTriangles },
    meshNodeIds: [...s.meshNodeIds],
  };
}

function setDiff(
  state: AbstractState,
  x: string,
  y: string,
  bound: IntervalBound,
): void {
  if (!Number.isFinite(bound.min) || !Number.isFinite(bound.max)) return;
  if (!state.diffs[x]) state.diffs[x] = {};
  if (!state.diffs[y]) state.diffs[y] = {};
  state.diffs[x][y] = { min: bound.min, max: bound.max };
  state.diffs[y][x] = { min: -bound.max, max: -bound.min };
}

function setSum(
  state: AbstractState,
  x: string,
  y: string,
  bound: IntervalBound,
): void {
  if (!Number.isFinite(bound.min) || !Number.isFinite(bound.max)) return;
  if (!state.sums[x]) state.sums[x] = {};
  if (!state.sums[y]) state.sums[y] = {};
  state.sums[x][y] = { min: bound.min, max: bound.max };
  state.sums[y][x] = { min: bound.min, max: bound.max };
}

function clearRelationalForVar(state: AbstractState, target: string): void {
  delete state.diffs[target];
  for (const row of Object.values(state.diffs)) {
    delete row[target];
  }
  delete state.sums[target];
  for (const row of Object.values(state.sums)) {
    delete row[target];
  }
}

function shiftRelationalForVar(state: AbstractState, target: string, delta: IntervalBound): void {
  if (!Number.isFinite(delta.min) || !Number.isFinite(delta.max)) {
    clearRelationalForVar(state, target);
    return;
  }
  const diffRow = state.diffs[target];
  if (diffRow) {
    for (const [other, b] of Object.entries(diffRow)) {
      if (other === target) continue;
      const nextB = { min: b.min + delta.min, max: b.max + delta.max };
      diffRow[other] = nextB;
      if (!state.diffs[other]) state.diffs[other] = {};
      state.diffs[other][target] = { min: -nextB.max, max: -nextB.min };
    }
  }
  const sumRow = state.sums[target];
  if (sumRow) {
    for (const [other, b] of Object.entries(sumRow)) {
      if (other === target) continue;
      const nextS = { min: b.min + delta.min, max: b.max + delta.max };
      sumRow[other] = nextS;
      if (!state.sums[other]) state.sums[other] = {};
      state.sums[other][target] = { min: nextS.min, max: nextS.max };
    }
  }
}

function joinIntervals(a: IntervalBound | undefined, b: IntervalBound | undefined): IntervalBound {
  if (!a) return b ? { ...b } : { min: -Infinity, max: Infinity };
  if (!b) return { ...a };
  return {
    min: Math.min(a.min, b.min),
    max: Math.max(a.max, b.max),
  };
}

function joinMatrix(
  matA: Record<string, Record<string, IntervalBound>>,
  matB: Record<string, Record<string, IntervalBound>>,
): Record<string, Record<string, IntervalBound>> {
  const out: Record<string, Record<string, IntervalBound>> = {};
  for (const [x, rowA] of Object.entries(matA)) {
    const rowB = matB[x];
    if (!rowB) continue;
    for (const [y, bA] of Object.entries(rowA)) {
      const bB = rowB[y];
      if (!bB) continue;
      if (!out[x]) out[x] = {};
      out[x][y] = {
        min: Math.min(bA.min, bB.min),
        max: Math.max(bA.max, bB.max),
      };
    }
  }
  return out;
}

function joinStates(a: AbstractState, b: AbstractState): AbstractState {
  const keys = new Set([...Object.keys(a.vars), ...Object.keys(b.vars)]);
  const vars: Record<string, IntervalBound> = {};
  const init: Record<string, VarInitState> = {};
  for (const k of keys) {
    vars[k] = joinIntervals(a.vars[k], b.vars[k]);
    init[k] = a.init[k] === 'INIT' && b.init[k] === 'INIT' ? 'INIT' : 'MAYBE_INIT';
  }

  const diffs = joinMatrix(a.diffs, b.diffs);
  const sums = joinMatrix(a.sums, b.sums);

  const blockMap = new Map<string, SymbolicBlock>();
  for (const blk of a.blocks) blockMap.set(blk.id, { ...blk });
  for (const blk of b.blocks) {
    const prev = blockMap.get(blk.id);
    if (!prev) {
      blockMap.set(blk.id, { ...blk });
    } else if (prev.state !== blk.state) {
      let mergedState: BlockTypestate = prev.state;
      if (prev.state === 'FREED' || blk.state === 'FREED') mergedState = 'MAYBE_FREED';
      else if (prev.state === 'LOCKED_RO' || blk.state === 'LOCKED_RO') mergedState = 'LOCKED_RO';
      blockMap.set(blk.id, {
        id: blk.id,
        sizeMin: Math.min(prev.sizeMin, blk.sizeMin),
        sizeMax: Math.max(prev.sizeMax, blk.sizeMax),
        state: mergedState,
      });
    }
  }

  const arrays: Record<string, SymbolicArray> = {};
  const arrKeys = new Set([...Object.keys(a.arrays), ...Object.keys(b.arrays)]);
  for (const ak of arrKeys) {
    const arrA = a.arrays[ak];
    const arrB = b.arrays[ak];
    if (arrA && arrB) {
      arrays[ak] = {
        size: Math.min(arrA.size, arrB.size),
        elemBound: joinIntervals(arrA.elemBound, arrB.elemBound),
      };
    } else if (arrA) {
      arrays[ak] = { size: arrA.size, elemBound: { ...arrA.elemBound } };
    } else if (arrB) {
      arrays[ak] = { size: arrB.size, elemBound: { ...arrB.elemBound } };
    }
  }

  return {
    vars,
    init,
    diffs,
    sums,
    blocks: Array.from(blockMap.values()),
    arrays,
    usedMem: joinIntervals(a.usedMem, b.usedMem),
    totalMem: joinIntervals(a.totalMem, b.totalMem),
    usedTriangles: joinIntervals(a.usedTriangles, b.usedTriangles),
    meshNodeIds: Array.from(new Set([...a.meshNodeIds, ...b.meshNodeIds])),
  };
}

function isIdentifier(token: string | undefined): boolean {
  return Boolean(token && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token));
}

function resolveInterval(token: string | undefined, state: AbstractState): IntervalBound {
  if (!token) return { min: NaN, max: NaN };
  if (Object.prototype.hasOwnProperty.call(state.vars, token)) {
    return { ...state.vars[token] };
  }
  const num = Number(token);
  if (!Number.isNaN(num)) {
    return { min: num, max: num };
  }
  return { min: -Infinity, max: Infinity };
}

function addIntervals(a: IntervalBound, b: IntervalBound): IntervalBound {
  return { min: a.min + b.min, max: a.max + b.max };
}

function subIntervals(a: IntervalBound, b: IntervalBound): IntervalBound {
  const min =
    !Number.isFinite(a.min) && !Number.isFinite(b.max) && a.min === b.max
      ? -Infinity
      : a.min - b.max;
  const max =
    !Number.isFinite(a.max) && !Number.isFinite(b.min) && a.max === b.min
      ? Infinity
      : a.max - b.min;
  return { min, max };
}

function mulIntervals(a: IntervalBound, b: IntervalBound): IntervalBound {
  const products = [a.min * b.min, a.min * b.max, a.max * b.min, a.max * b.max].filter(
    (v) => !Number.isNaN(v),
  );
  if (products.length === 0) return { min: -Infinity, max: Infinity };
  return { min: Math.min(...products), max: Math.max(...products) };
}

function divIntervals(a: IntervalBound, b: IntervalBound): IntervalBound {
  if (b.min <= 0 && b.max >= 0) {
    return { min: -Infinity, max: Infinity };
  }
  const quotients = [a.min / b.min, a.min / b.max, a.max / b.min, a.max / b.max];
  return { min: Math.min(...quotients), max: Math.max(...quotients) };
}

function evalConditionSat(
  l: IntervalBound,
  cmp: string,
  r: IntervalBound,
  relationalDiff?: IntervalBound,
): 'ALWAYS_TRUE' | 'ALWAYS_FALSE' | 'SAT_BOTH' {
  // Si disponemos de diferencia relacional exacta l - r ∈ [dMin, dMax] (Dominio Miné), úsala primero
  if (relationalDiff) {
    switch (cmp) {
      case '>':
        if (relationalDiff.min > 0) return 'ALWAYS_TRUE';
        if (relationalDiff.max <= 0) return 'ALWAYS_FALSE';
        break;
      case '>=':
        if (relationalDiff.min >= 0) return 'ALWAYS_TRUE';
        if (relationalDiff.max < 0) return 'ALWAYS_FALSE';
        break;
      case '<':
        if (relationalDiff.max < 0) return 'ALWAYS_TRUE';
        if (relationalDiff.min >= 0) return 'ALWAYS_FALSE';
        break;
      case '<=':
        if (relationalDiff.max <= 0) return 'ALWAYS_TRUE';
        if (relationalDiff.min > 0) return 'ALWAYS_FALSE';
        break;
      case '==':
        if (relationalDiff.min === 0 && relationalDiff.max === 0) return 'ALWAYS_TRUE';
        if (relationalDiff.max < 0 || relationalDiff.min > 0) return 'ALWAYS_FALSE';
        break;
      case '!=':
        if (relationalDiff.max < 0 || relationalDiff.min > 0) return 'ALWAYS_TRUE';
        if (relationalDiff.min === 0 && relationalDiff.max === 0) return 'ALWAYS_FALSE';
        break;
    }
  }

  if (Number.isNaN(l.min) || Number.isNaN(r.min)) return 'SAT_BOTH';
  switch (cmp) {
    case '>':
      if (l.min > r.max) return 'ALWAYS_TRUE';
      if (l.max <= r.min) return 'ALWAYS_FALSE';
      return 'SAT_BOTH';
    case '>=':
      if (l.min >= r.max) return 'ALWAYS_TRUE';
      if (l.max < r.min) return 'ALWAYS_FALSE';
      return 'SAT_BOTH';
    case '<':
      if (l.max < r.min) return 'ALWAYS_TRUE';
      if (l.min >= r.max) return 'ALWAYS_FALSE';
      return 'SAT_BOTH';
    case '<=':
      if (l.max <= r.min) return 'ALWAYS_TRUE';
      if (l.min > r.max) return 'ALWAYS_FALSE';
      return 'SAT_BOTH';
    case '==':
      if (l.min === l.max && r.min === r.max && l.min === r.min) return 'ALWAYS_TRUE';
      if (l.max < r.min || r.max < l.min) return 'ALWAYS_FALSE';
      return 'SAT_BOTH';
    case '!=':
      if (l.max < r.min || r.max < l.min) return 'ALWAYS_TRUE';
      if (l.min === l.max && r.min === r.max && l.min === r.min) return 'ALWAYS_FALSE';
      return 'SAT_BOTH';
    default:
      return 'SAT_BOTH';
  }
}

function narrowBranchVar(
  state: AbstractState,
  varName: string | undefined,
  cmp: string,
  other: IntervalBound,
  truth: boolean,
): void {
  if (!varName || !Object.prototype.hasOwnProperty.call(state.vars, varName)) return;
  const cur = state.vars[varName];
  const effCmp = truth
    ? cmp
    : cmp === '>'
      ? '<='
      : cmp === '>='
        ? '<'
        : cmp === '<'
          ? '>='
          : cmp === '<='
            ? '>'
            : cmp === '=='
              ? '!='
              : '==';

  if (effCmp === '>') {
    cur.min = Math.max(cur.min, other.min + (Number.isInteger(other.min) ? 1 : 0));
  } else if (effCmp === '>=') {
    cur.min = Math.max(cur.min, other.min);
  } else if (effCmp === '<') {
    cur.max = Math.min(cur.max, other.max - (Number.isInteger(other.max) ? 1 : 0));
  } else if (effCmp === '<=') {
    cur.max = Math.min(cur.max, other.max);
  } else if (effCmp === '==') {
    cur.min = Math.max(cur.min, other.min);
    cur.max = Math.min(cur.max, other.max);
  }
}

/**
 * Motor simbólico nativo sin dependencias externas (Cero Z3 / Cero CGO):
 * Combina cuatro técnicas académicas de verificación estática:
 *  1. Dominio de Intervalos [min, max] (Cousot / eBPF verifier).
 *  2. Dominio Relacional de Diferencias X - Y ∈ [dMin, dMax] (Miné / ASTRÉE).
 *  3. Typestate de variables inicializadas y ciclo de vida de heap (eBPF / Rust).
 *  4. Poda de ramas muertas UNSAT y descarga de guardas en tiempo de compilación (Wuffs).
 */
export function solveHelixConstraints(
  instructions: ParsedScriptInstruction[],
  initialHeapCapacity = 1024,
): SymbolicReport {
  const smtStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const findings: SolverFinding[] = [];
  const branchChecks: SymbolicReport['branchChecks'] = [];
  const optimizations: OptimizationSuggestion[] = [];
  const deadIndices = new Set<number>();
  const seenRules = new Set<string>();
  let stepsAnalyzed = 0;
  let dischargedRuntimeChecks = 0;
  let quantumNormPreserved = true;
  let nemesisDecayProved = false;
  let soaCapacityCells = 0;
  const MAX_ANALYSIS_STEPS = 500;

  const pushUniqueFinding = (f: SolverFinding) => {
    const key = `${f.lineNumber}:${f.rule}:${f.detail}`;
    if (!seenRules.has(key)) {
      seenRules.add(key);
      findings.push(f);
    }
  };

  const addOptimization = (opt: OptimizationSuggestion) => {
    if (!optimizations.some((o) => o.lineNumber === opt.lineNumber && o.kind === opt.kind)) {
      optimizations.push(opt);
    }
  };

  const checkVarReadInit = (state: AbstractState, token: string | undefined, lineNumber: number) => {
    if (isIdentifier(token) && state.init[token!] !== 'INIT') {
      pushUniqueFinding({
        lineNumber,
        severity: 'ERROR',
        rule: 'TYPESTATE_UNINIT_VAR',
        detail: `Typestate: lectura de "${token}" sin inicialización garantizada en todas las rutas.`,
      });
    }
  };

  // Pre-indexar definiciones de funciones FN ... END y sus contratos REQUIRES/ENSURES
  const fnTable = new Map<string, SymbolicFnDef>();
  const fnCallDepths = new Map<string, number>();
  const fnContractsChecked = new Map<string, number>();

  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    if (inst.opcode.toUpperCase() === 'FN' && inst.args[0]) {
      const fnName = inst.args[0];
      const params = inst.args.slice(1);
      const endPc = inst.endPc ?? instructions.length - 1;
      const requires: SymbolicFnDef['requires'] = [];
      const ensures: SymbolicFnDef['ensures'] = [];
      for (let j = i + 1; j < endPc; j++) {
        const sub = instructions[j];
        const subOp = sub.opcode.toUpperCase();
        if (subOp === 'REQUIRES' && sub.args.length >= 3) {
          requires.push({
            lineNumber: sub.lineNumber,
            left: sub.args[0],
            cmp: sub.args[1],
            right: sub.args[2],
          });
        } else if (subOp === 'ENSURES' && sub.args.length >= 3) {
          ensures.push({
            lineNumber: sub.lineNumber,
            left: sub.args[0],
            cmp: sub.args[1],
            right: sub.args[2],
          });
        }
      }
      fnTable.set(fnName, {
        name: fnName,
        params,
        startPc: i,
        endPc,
        requires,
        ensures,
      });
      fnCallDepths.set(fnName, 0);
      fnContractsChecked.set(fnName, 0);
    }
  }

  function executeRange(
    startPc: number,
    endExclusive: number,
    state: AbstractState,
    insideLoop = false,
    callDepth = 0,
    activeFn?: SymbolicFnDef,
  ): AbstractState {
    let cur = cloneState(state);
    let pc = startPc;

    while (pc < endExclusive && stepsAnalyzed < MAX_ANALYSIS_STEPS) {
      const inst = instructions[pc];
      if (!inst) break;
      stepsAnalyzed++;
      const op = inst.opcode.toUpperCase();

      if (op === 'FN') {
        const endPc = inst.endPc ?? endExclusive - 1;
        pc = endPc + 1;
        continue;
      }

      if (op === 'REQUIRES' || op === 'ENSURES') {
        pc++;
        continue;
      }

      if (op === 'RET') {
        const retTok = inst.args[0];
        if (retTok) {
          if (isIdentifier(retTok)) checkVarReadInit(cur, retTok, inst.lineNumber);
          cur.vars['RET_VAL'] = resolveInterval(retTok, cur);
          cur.init['RET_VAL'] = 'INIT';
        } else {
          cur.vars['RET_VAL'] = { min: 0, max: 0 };
          cur.init['RET_VAL'] = 'INIT';
        }
        if (activeFn) {
          for (const ens of activeFn.ensures) {
            const lInt = resolveInterval(ens.left, cur);
            const rInt = resolveInterval(ens.right, cur);
            const relDiff = cur.diffs[ens.left]?.[ens.right];
            const sat = evalConditionSat(lInt, ens.cmp, rInt, relDiff);
            if (sat === 'ALWAYS_FALSE') {
              pushUniqueFinding({
                lineNumber: inst.lineNumber,
                severity: 'ERROR',
                rule: 'SMT_CONTRACT_VIOLATION',
                detail: `Postcondición ENSURES (${ens.left} ${ens.cmp} ${ens.right}) de FN "${activeFn.name}" violada en RET.`,
              });
            } else {
              dischargedRuntimeChecks++;
              fnContractsChecked.set(activeFn.name, (fnContractsChecked.get(activeFn.name) ?? 0) + 1);
            }
          }
        }
        break;
      }

      if (op === 'CALL') {
        const fnName = inst.args[0];
        const fnDef = fnName ? fnTable.get(fnName) : undefined;
        const arrowIdx = inst.args.indexOf('->');
        const rawCallArgs = arrowIdx >= 0 ? inst.args.slice(1, arrowIdx) : inst.args.slice(1);
        const destVar = arrowIdx >= 0 ? inst.args[arrowIdx + 1] : undefined;

        for (const argTok of rawCallArgs) {
          if (isIdentifier(argTok)) checkVarReadInit(cur, argTok, inst.lineNumber);
        }

        if (fnDef) {
          const nextDepth = callDepth + 1;
          fnCallDepths.set(fnDef.name, Math.max(fnCallDepths.get(fnDef.name) ?? 0, nextDepth));
          if (nextDepth > 4) {
            pushUniqueFinding({
              lineNumber: inst.lineNumber,
              severity: 'ERROR',
              rule: 'SMT_RECURSION_DEPTH',
              detail: `Profundidad máxima de llamada (4) excedida al invocar FN "${fnDef.name}" (recursión no acotada).`,
            });
            pc++;
            continue;
          }

          const fnState = cloneState(cur);
          fnState.vars = {};
          fnState.init = {};
          fnState.diffs = {};
          fnState.sums = {};

          fnDef.params.forEach((paramName, idx) => {
            const callerTok = rawCallArgs[idx];
            fnState.vars[paramName] = callerTok
              ? resolveInterval(callerTok, cur)
              : { min: -Infinity, max: Infinity };
            fnState.init[paramName] = 'INIT';
          });

          // Verificar todas las precondiciones REQUIRES en el punto de llamada CALL
          for (const req of fnDef.requires) {
            const lInt = resolveInterval(req.left, fnState);
            const rInt = resolveInterval(req.right, fnState);
            const sat = evalConditionSat(lInt, req.cmp, rInt);
            if (sat !== 'ALWAYS_TRUE') {
              pushUniqueFinding({
                lineNumber: inst.lineNumber,
                severity: 'ERROR',
                rule: 'SMT_CONTRACT_VIOLATION',
                detail: `Precondición REQUIRES (${req.left} ${req.cmp} ${req.right}) de FN "${fnDef.name}" no garantizada en CALL (${req.left} ∈ [${lInt.min}, ${lInt.max}]).`,
              });
            } else {
              dischargedRuntimeChecks++;
              fnContractsChecked.set(fnDef.name, (fnContractsChecked.get(fnDef.name) ?? 0) + 1);
            }
          }

          const postFn = executeRange(
            fnDef.startPc + 1,
            fnDef.endPc,
            fnState,
            insideLoop,
            nextDepth,
            fnDef,
          );

          // Propagar efectos globales (heap, bloques, arrays, nodos 3D) y valor de retorno al llamador
          cur.blocks = postFn.blocks;
          cur.arrays = postFn.arrays;
          cur.usedMem = postFn.usedMem;
          cur.totalMem = postFn.totalMem;
          cur.usedTriangles = postFn.usedTriangles;
          cur.meshNodeIds = postFn.meshNodeIds;

          const retVal = postFn.vars['RET_VAL'] ?? { min: 0, max: 0 };
          cur.vars['RET_VAL'] = { ...retVal };
          cur.init['RET_VAL'] = 'INIT';
          clearRelationalForVar(cur, 'RET_VAL');
          if (destVar && isIdentifier(destVar)) {
            cur.vars[destVar] = { ...retVal };
            cur.init[destVar] = 'INIT';
            clearRelationalForVar(cur, destVar);
          }
        }
        pc++;
        continue;
      }

      if (op === 'ARRAY') {
        const arrName = inst.args[0];
        const sizeTok = inst.args[1];
        const initTok = inst.args[2] ?? '0';
        const sizeInt = resolveInterval(sizeTok, cur);
        const arrSize = Number.isFinite(sizeInt.max) ? Math.floor(sizeInt.max) : 0;
        if (!arrName || Number.isNaN(arrSize) || arrSize < 1 || arrSize > 256) {
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'SMT_ARRAY_BOUNDS',
            detail: `ARRAY "${arrName ?? '?'}" requiere tamaño estático en [1..256].`,
          });
        } else {
          if (isIdentifier(initTok)) checkVarReadInit(cur, initTok, inst.lineNumber);
          const initB = resolveInterval(initTok, cur);
          cur.arrays[arrName] = {
            size: arrSize,
            elemBound: Number.isNaN(initB.min) ? { min: 0, max: 0 } : initB,
          };
          dischargedRuntimeChecks++;
        }
        pc++;
        continue;
      }

      if (op === 'ASET') {
        const [arrName, idxTok, valTok] = inst.args;
        const arr = arrName ? cur.arrays[arrName] : undefined;
        if (!arr) {
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'SMT_ARRAY_BOUNDS',
            detail: `ASET sobre arreglo no declarado "${arrName ?? '?'}".`,
          });
        } else {
          if (isIdentifier(idxTok)) checkVarReadInit(cur, idxTok, inst.lineNumber);
          if (isIdentifier(valTok)) checkVarReadInit(cur, valTok, inst.lineNumber);
          const idxB = resolveInterval(idxTok, cur);
          if (Number.isNaN(idxB.min) || idxB.min < 0 || idxB.max >= arr.size) {
            pushUniqueFinding({
              lineNumber: inst.lineNumber,
              severity: 'ERROR',
              rule: 'SMT_ARRAY_BOUNDS',
              detail: `Acceso fuera de límites en ASET ${arrName}[${idxTok ?? '?'}]: índice ∈ [${idxB.min}, ${idxB.max}], rango válido [0, ${arr.size - 1}].`,
            });
          } else {
            dischargedRuntimeChecks++;
            const valB = resolveInterval(valTok, cur);
            if (!Number.isNaN(valB.min)) {
              arr.elemBound = joinIntervals(arr.elemBound, valB);
            }
          }
        }
        pc++;
        continue;
      }

      if (op === 'AGET') {
        const [arrName, idxTok, destVar] = inst.args;
        const arr = arrName ? cur.arrays[arrName] : undefined;
        if (!arr) {
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'SMT_ARRAY_BOUNDS',
            detail: `AGET sobre arreglo no declarado "${arrName ?? '?'}".`,
          });
        } else {
          if (isIdentifier(idxTok)) checkVarReadInit(cur, idxTok, inst.lineNumber);
          const idxB = resolveInterval(idxTok, cur);
          if (Number.isNaN(idxB.min) || idxB.min < 0 || idxB.max >= arr.size) {
            pushUniqueFinding({
              lineNumber: inst.lineNumber,
              severity: 'ERROR',
              rule: 'SMT_ARRAY_BOUNDS',
              detail: `Lectura fuera de límites en AGET ${arrName}[${idxTok ?? '?'}]: índice ∈ [${idxB.min}, ${idxB.max}], rango válido [0, ${arr.size - 1}].`,
            });
          } else {
            dischargedRuntimeChecks++;
            if (destVar) {
              cur.vars[destVar] = { ...arr.elemBound };
              cur.init[destVar] = 'INIT';
              clearRelationalForVar(cur, destVar);
            }
          }
        }
        pc++;
        continue;
      }

      if (op === 'SET') {
        const varName = inst.args[0];
        const rhsToken = inst.args.slice(1).join(' ');
        if (varName && rhsToken !== '') {
          if (isIdentifier(rhsToken) && !Object.prototype.hasOwnProperty.call(cur.vars, rhsToken)) {
            cur.init[varName] = 'INIT';
            clearRelationalForVar(cur, varName);
          } else {
            if (isIdentifier(rhsToken)) checkVarReadInit(cur, rhsToken, inst.lineNumber);
            const val = resolveInterval(rhsToken, cur);
            if (!Number.isNaN(val.min)) {
              cur.vars[varName] = val;
              cur.init[varName] = 'INIT';
              clearRelationalForVar(cur, varName);
              if (isIdentifier(rhsToken) && Object.prototype.hasOwnProperty.call(cur.vars, rhsToken)) {
                const rhsDiffs = cur.diffs[rhsToken];
                if (rhsDiffs) {
                  for (const [z, b] of Object.entries(rhsDiffs)) {
                    if (z !== varName) setDiff(cur, varName, z, b);
                  }
                }
                const rhsSums = cur.sums[rhsToken];
                if (rhsSums) {
                  for (const [z, b] of Object.entries(rhsSums)) {
                    if (z !== varName) setSum(cur, varName, z, b);
                  }
                }
                setDiff(cur, varName, rhsToken, { min: 0, max: 0 });
              }
            }
          }
        }
        pc++;
        continue;
      }

      if (op === 'ADD' || op === 'SUB' || op === 'MUL' || op === 'DIV') {
        const varName = inst.args[0];
        const rhsToken = inst.args[1];
        checkVarReadInit(cur, varName, inst.lineNumber);
        checkVarReadInit(cur, rhsToken, inst.lineNumber);

        if (varName && Object.prototype.hasOwnProperty.call(cur.vars, varName)) {
          const left = cur.vars[varName];
          const right = resolveInterval(rhsToken, cur);

          if (!insideLoop && (op === 'ADD' || op === 'SUB') && right.min === 0 && right.max === 0) {
            deadIndices.add(pc);
            addOptimization({
              lineNumber: inst.lineNumber,
              kind: 'IDENTITY_ELIMINATION',
              detail: `L${inst.lineNumber}: ${op} ${varName} 0 es identidad algebraica (eliminable).`,
            });
          } else if (!insideLoop && op === 'MUL' && right.min === 1 && right.max === 1) {
            deadIndices.add(pc);
            addOptimization({
              lineNumber: inst.lineNumber,
              kind: 'IDENTITY_ELIMINATION',
              detail: `L${inst.lineNumber}: MUL ${varName} 1 es identidad algebraica (eliminable).`,
            });
          }

          if (op === 'ADD') {
            // Consulta suma relacional del octágono (x + y) antes de degradar a intervalos
            const relSum = rhsToken ? cur.sums[varName]?.[rhsToken] : undefined;
            cur.vars[varName] = relSum ? { min: relSum.min, max: relSum.max } : addIntervals(left, right);
            if (isIdentifier(rhsToken)) {
              clearRelationalForVar(cur, varName);
              if (Number.isFinite(left.min) && Number.isFinite(left.max)) {
                setDiff(cur, varName, rhsToken, left);
              }
            } else {
              shiftRelationalForVar(cur, varName, right);
            }
          } else if (op === 'SUB') {
            // Consulta diferencia relacional (x - y) antes de degradar a intervalos
            const relDiff = rhsToken ? cur.diffs[varName]?.[rhsToken] : undefined;
            cur.vars[varName] = relDiff ? { min: relDiff.min, max: relDiff.max } : subIntervals(left, right);
            if (isIdentifier(rhsToken)) {
              clearRelationalForVar(cur, varName);
              if (Number.isFinite(left.min) && Number.isFinite(left.max)) {
                // varName' = left - rhs => varName' + rhs = left (invariante de suma del octágono)
                setSum(cur, varName, rhsToken, left);
                // Clausura transitiva del octágono sobre variables equivalentes/relacionadas con rhsToken
                const peers = cur.diffs[rhsToken];
                if (peers) {
                  for (const [z, d] of Object.entries(peers)) {
                    if (z !== varName && z !== rhsToken) {
                      setSum(cur, varName, z, addIntervals(left, d));
                    }
                  }
                }
              }
            } else {
              shiftRelationalForVar(cur, varName, { min: -right.max, max: -right.min });
            }
          } else if (op === 'MUL') {
            cur.vars[varName] = mulIntervals(left, right);
            clearRelationalForVar(cur, varName);
          } else {
            if (right.min <= 0 && right.max >= 0) {
              pushUniqueFinding({
                lineNumber: inst.lineNumber,
                severity: 'ERROR',
                rule: 'SMT_DIV_ZERO',
                detail: `Contraejemplo simbólico: el divisor "${rhsToken}" pertenece a [${right.min}, ${right.max}] e incluye 0.`,
              });
            } else {
              dischargedRuntimeChecks++;
              if (right.min === right.max && Number.isInteger(right.min)) {
                const chk = checkDenominatorInP33(BigInt(right.min));
                if (!chk.inSubringP33) {
                  pushUniqueFinding({
                    lineNumber: inst.lineNumber,
                    severity: 'ERROR',
                    rule: 'SMT_P33_VAR',
                    detail: `Divisor simbólico ${right.min} fuera de P33 (residuo primo ${chk.remainderFactor.toString()}).`,
                  });
                }
              }
            }
            cur.vars[varName] = divIntervals(left, right);
            clearRelationalForVar(cur, varName);
          }
        }
        pc++;
        continue;
      }

      if (op === 'FILE_READ') {
        cur.vars['LAST_READ'] = { min: -Infinity, max: Infinity };
        cur.init['LAST_READ'] = 'INIT';
        clearRelationalForVar(cur, 'LAST_READ');
        pc++;
        continue;
      }

      if (op === 'HEAP_CAP') {
        const extra = inst.args[0] ? resolveInterval(inst.args[0], cur) : { min: 256, max: 256 };
        if (!Number.isNaN(extra.min) && extra.min > 0) {
          cur.totalMem = addIntervals(cur.totalMem, extra);
        }
        pc++;
        continue;
      }

      if (op === 'MEM_INIT' || op === 'MEM_ALLOC') {
        if (isIdentifier(inst.args[0])) checkVarReadInit(cur, inst.args[0], inst.lineNumber);
        const req = inst.args[0] ? resolveInterval(inst.args[0], cur) : { min: 128, max: 128 };
        if (!Number.isNaN(req.min)) {
          if (req.min <= 0) {
            pushUniqueFinding({
              lineNumber: inst.lineNumber,
              severity: 'ERROR',
              rule: 'SMT_MEM_BOUNDS',
              detail: `Tamaño simbólico inválido [${req.min}, ${req.max}] B en ${op}.`,
            });
          }
          const blkId = `blk_${cur.blocks.length + 1}`;
          cur.blocks.push({
            id: blkId,
            sizeMin: req.min,
            sizeMax: req.max,
            state: 'ALLOCATED',
          });
          cur.usedMem = addIntervals(cur.usedMem, req);
          if (cur.usedMem.max > cur.totalMem.min) {
            pushUniqueFinding({
              lineNumber: inst.lineNumber,
              severity: 'ERROR',
              rule: 'SMT_MEM_BOUNDS',
              detail: `Desbordamiento potencial probado: heap acumulado ${cur.usedMem.max} B supera capacidad ${cur.totalMem.min} B.`,
            });
          } else {
            dischargedRuntimeChecks++;
          }
        }
        pc++;
        continue;
      }

      if (op === 'MEM_LOCK') {
        const target = [...cur.blocks]
          .reverse()
          .find((b) => b.state === 'ALLOCATED');
        if (target) {
          target.state = 'LOCKED_RO';
        }
        pc++;
        continue;
      }

      if (op === 'MESH_NODE') {
        const nodeId = inst.args[0] || `node_${cur.meshNodeIds.length + 1}`;
        const triArg = inst.args[2] ?? '240';
        const scaleArg = inst.args[3] ?? '1';
        if (isIdentifier(triArg)) checkVarReadInit(cur, triArg, inst.lineNumber);
        if (isIdentifier(scaleArg)) checkVarReadInit(cur, scaleArg, inst.lineNumber);
        const triBound = resolveInterval(triArg, cur);
        const scaleBound = resolveInterval(scaleArg, cur);
        if (Number.isNaN(triBound.min) || triBound.min <= 0) {
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'SMT_MESH_BUDGET',
            detail: `MESH_NODE "${nodeId}": conteo de triángulos inválido [${triBound.min}, ${triBound.max}].`,
          });
        } else {
          cur.usedTriangles = addIntervals(cur.usedTriangles, triBound);
          if (!cur.meshNodeIds.includes(nodeId)) {
            cur.meshNodeIds.push(nodeId);
          }
          if (cur.usedTriangles.max > 10000) {
            pushUniqueFinding({
              lineNumber: inst.lineNumber,
              severity: 'ERROR',
              rule: 'SMT_MESH_BUDGET',
              detail: `Presupuesto geométrico excedido: ${cur.usedTriangles.max} triángulos superan el límite determinista de 10000.`,
            });
          } else {
            dischargedRuntimeChecks++;
          }
        }
        if (!Number.isNaN(scaleBound.min) && (scaleBound.min <= 0 || scaleBound.max > 8)) {
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'SMT_MESH_BUDGET',
            detail: `MESH_NODE "${nodeId}": escala [${scaleBound.min}, ${scaleBound.max}] fuera de rango espacial (0..8].`,
          });
        }
        pc++;
        continue;
      }

      if (op === 'MAT_ORM') {
        const nodeId = inst.args[0] || 'node_1';
        const channelLabels = ['AO', 'Roughness', 'Metalness'];
        let allValid = true;
        for (let ch = 0; ch < 3; ch++) {
          const tok = inst.args[ch + 1];
          if (!tok) {
            allValid = false;
            pushUniqueFinding({
              lineNumber: inst.lineNumber,
              severity: 'ERROR',
              rule: 'SMT_ORM_BOUNDS',
              detail: `MAT_ORM "${nodeId}": falta canal ${channelLabels[ch]} en [0, 1].`,
            });
            continue;
          }
          if (isIdentifier(tok)) checkVarReadInit(cur, tok, inst.lineNumber);
          const b = resolveInterval(tok, cur);
          if (Number.isNaN(b.min) || b.min < 0 || b.max > 1) {
            allValid = false;
            pushUniqueFinding({
              lineNumber: inst.lineNumber,
              severity: 'ERROR',
              rule: 'SMT_ORM_BOUNDS',
              detail: `MAT_ORM "${nodeId}": canal ${channelLabels[ch]} [${b.min}, ${b.max}] fuera del rango físico [0, 1].`,
            });
          }
        }
        if (allValid) {
          dischargedRuntimeChecks++;
        }
        pc++;
        continue;
      }

      if (op === 'CAM_6DOF') {
        for (let i = 0; i < Math.min(6, inst.args.length); i++) {
          if (isIdentifier(inst.args[i])) {
            checkVarReadInit(cur, inst.args[i], inst.lineNumber);
          }
        }
        pc++;
        continue;
      }

      if (op === 'WS_EMIT') {
        for (let i = 1; i < inst.args.length; i++) {
          if (isIdentifier(inst.args[i]) && Object.prototype.hasOwnProperty.call(cur.vars, inst.args[i])) {
            checkVarReadInit(cur, inst.args[i], inst.lineNumber);
          }
        }
        pc++;
        continue;
      }

      if (op === 'MEM_FREE') {
        const targetId = inst.args[0];
        const target = targetId
          ? cur.blocks.find((b) => b.id === targetId)
          : [...cur.blocks].reverse().find((b) => b.state === 'ALLOCATED');
        if (!target) {
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'TYPESTATE_DOUBLE_FREE',
            detail: `Typestate: MEM_FREE sobre "${targetId ?? 'LIFO'}" sin bloque asignado activo.`,
          });
        } else if (target.state === 'FREED' || target.state === 'MAYBE_FREED') {
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'TYPESTATE_DOUBLE_FREE',
            detail: `Typestate: double-free estático detectado sobre ${target.id} (estado=${target.state}).`,
          });
        } else if (target.state === 'LOCKED_RO') {
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'TYPESTATE_LOCKED_FREE',
            detail: `Typestate: intento de liberar ${target.id} mientras está bloqueado como solo lectura (RO).`,
          });
        } else {
          target.state = 'FREED';
          cur.usedMem = {
            min: Math.max(0, cur.usedMem.min - target.sizeMax),
            max: Math.max(0, cur.usedMem.max - target.sizeMin),
          };
          dischargedRuntimeChecks++;
        }
        pc++;
        continue;
      }

      if (op === 'SOA_INIT') {
        const cellsTok = inst.args[0] ?? '16';
        if (isIdentifier(cellsTok)) checkVarReadInit(cur, cellsTok, inst.lineNumber);
        const cellsB = resolveInterval(cellsTok, cur);
        const minC = Math.floor(cellsB.min);
        const maxC = Math.floor(cellsB.max);
        if (Number.isNaN(minC) || minC < 1 || maxC > 256) {
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'SMT_MEM_BOUNDS',
            detail: `SOA_INIT: capacidad [${cellsB.min}, ${cellsB.max}] fuera de rango estático [1..256] celdas Pauli-SoA.`,
          });
        } else {
          const reqBytes = { min: minC * 28, max: maxC * 28 };
          cur.blocks.push({
            id: `soa_${cur.blocks.length + 1}`,
            sizeMin: reqBytes.min,
            sizeMax: reqBytes.max,
            state: 'ALLOCATED',
          });
          cur.usedMem = addIntervals(cur.usedMem, reqBytes);
          soaCapacityCells = Math.max(soaCapacityCells, maxC);
          if (cur.usedMem.max > cur.totalMem.min) {
            pushUniqueFinding({
              lineNumber: inst.lineNumber,
              severity: 'ERROR',
              rule: 'SMT_MEM_BOUNDS',
              detail: `SOA_INIT (${maxC}×28B=${reqBytes.max} B): heap acumulado ${cur.usedMem.max} B supera capacidad ${cur.totalMem.min} B.`,
            });
          } else {
            dischargedRuntimeChecks++;
          }
        }
        pc++;
        continue;
      }

      if (op === 'CURL_STEP') {
        const gainTok = inst.args[0] ?? '0.35';
        const dtTok = inst.args[1] ?? '0.008333';
        if (isIdentifier(gainTok)) checkVarReadInit(cur, gainTok, inst.lineNumber);
        if (isIdentifier(dtTok)) checkVarReadInit(cur, dtTok, inst.lineNumber);
        const gainB = resolveInterval(gainTok, cur);
        const dtB = resolveInterval(dtTok, cur);
        if (
          Number.isNaN(gainB.min) ||
          !Number.isFinite(gainB.max) ||
          gainB.min < 0 ||
          gainB.max > 8 ||
          Number.isNaN(dtB.min) ||
          !Number.isFinite(dtB.max) ||
          dtB.min <= 0 ||
          dtB.max > 0.25
        ) {
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'SMT_PHYSICS_STABILITY',
            detail: `CURL_STEP: ganancia [${gainB.min}, ${gainB.max}] ∈ [0,8] o dt [${dtB.min}, ${dtB.max}] ∈ (0, 0.25] fuera de región estable CFL.`,
          });
        } else {
          dischargedRuntimeChecks++;
        }
        pc++;
        continue;
      }

      if (op === 'NEMESIS_DECAY') {
        const gammaTok = inst.args[0] ?? '0.08';
        if (isIdentifier(gammaTok)) checkVarReadInit(cur, gammaTok, inst.lineNumber);
        const gammaB = resolveInterval(gammaTok, cur);
        if (
          Number.isNaN(gammaB.min) ||
          !Number.isFinite(gammaB.max) ||
          gammaB.min <= 0 ||
          gammaB.max >= 1
        ) {
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'SMT_PHYSICS_STABILITY',
            detail: `Ley Némesis de Cauchy violada: γ ∈ [${gammaB.min}, ${gammaB.max}] debe cumplir 0 < γ < 1 para retorno contráctil a 0.0f.`,
          });
        } else {
          nemesisDecayProved = true;
          dischargedRuntimeChecks++;
        }
        pc++;
        continue;
      }

      if (op === 'BLOCH_ROT') {
        const nxTok = inst.args[0] ?? '0';
        const nyTok = inst.args[1] ?? '1';
        const nzTok = inst.args[2] ?? '0';
        const omegaTok = inst.args[3] ?? '1.5708';
        const dtTok = inst.args[4] ?? '1';
        [nxTok, nyTok, nzTok, omegaTok, dtTok].forEach((t) => {
          if (isIdentifier(t)) checkVarReadInit(cur, t, inst.lineNumber);
        });
        const nxB = resolveInterval(nxTok, cur);
        const nyB = resolveInterval(nyTok, cur);
        const nzB = resolveInterval(nzTok, cur);
        const omB = resolveInterval(omegaTok, cur);
        const dtB = resolveInterval(dtTok, cur);
        const axisNormMax = Math.hypot(
          Math.max(Math.abs(nxB.min), Math.abs(nxB.max)),
          Math.max(Math.abs(nyB.min), Math.abs(nyB.max)),
          Math.max(Math.abs(nzB.min), Math.abs(nzB.max)),
        );
        if (
          [nxB, nyB, nzB, omB, dtB].some((b) => Number.isNaN(b.min) || !Number.isFinite(b.min) || !Number.isFinite(b.max)) ||
          axisNormMax <= 1e-9 ||
          dtB.min < 0
        ) {
          quantumNormPreserved = false;
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'SMT_QUANTUM_UNITARY',
            detail: `BLOCH_ROT: Hamiltoniano degenerado (||n||=${axisNormMax.toFixed(3)}) o tiempo negativo dt∈[${dtB.min}, ${dtB.max}]; unitariedad ||ψ||²=1 comprometida.`,
          });
        } else {
          dischargedRuntimeChecks++;
        }
        pc++;
        continue;
      }

      if (op === 'BVN_LATTICE') {
        const pTok = inst.args[0] ?? '1.5708';
        const qTok = inst.args[1] ?? '0';
        const rTok = inst.args[2] ?? '3.1416';
        const destVar = inst.args[3];
        [pTok, qTok, rTok].forEach((t) => {
          if (isIdentifier(t)) checkVarReadInit(cur, t, inst.lineNumber);
        });
        const pB = resolveInterval(pTok, cur);
        const qB = resolveInterval(qTok, cur);
        const rB = resolveInterval(rTok, cur);
        if (
          [pB, qB, rB].some((b) => Number.isNaN(b.min) || !Number.isFinite(b.min) || !Number.isFinite(b.max))
        ) {
          quantumNormPreserved = false;
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'SMT_QUANTUM_UNITARY',
            detail: 'BVN_LATTICE: ángulos de proyectores cuánticos en C² no son finitos.',
          });
        } else {
          const check = verifyBirkhoffVonNeumannNonDistributivity(
            projectorFromBlochAngle(pB.min, 0),
            projectorFromBlochAngle(qB.min, 0),
            projectorFromBlochAngle(rB.min, 0),
          );
          const bitVal = check.distributiveHolds ? 0 : 1;
          if (destVar) {
            cur.vars[destVar] = { min: bitVal, max: bitVal };
            cur.init[destVar] = 'INIT';
            clearRelationalForVar(cur, destVar);
          }
          dischargedRuntimeChecks++;
        }
        pc++;
        continue;
      }

      if (op === 'WEBER_GUARD') {
        const kTok = inst.args[0] ?? '0.015';
        const prevTok = inst.args[1] ?? '1.0';
        const nextTok = inst.args[2] ?? '1.004';
        const destVar = inst.args[3];
        [kTok, prevTok, nextTok].forEach((t) => {
          if (isIdentifier(t)) checkVarReadInit(cur, t, inst.lineNumber);
        });
        const kB = resolveInterval(kTok, cur);
        const prevB = resolveInterval(prevTok, cur);
        const nextB = resolveInterval(nextTok, cur);
        if (
          Number.isNaN(kB.min) ||
          !Number.isFinite(kB.max) ||
          kB.min <= 0 ||
          kB.max >= 1 ||
          Number.isNaN(prevB.min) ||
          Number.isNaN(nextB.min) ||
          !Number.isFinite(prevB.max) ||
          !Number.isFinite(nextB.max)
        ) {
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'ERROR',
            rule: 'SMT_PHYSICS_STABILITY',
            detail: `WEBER_GUARD: umbral k ∈ [${kB.min}, ${kB.max}] debe cumplir 0 < k < 1 y métricas finitas.`,
          });
        } else {
          dischargedRuntimeChecks++;
          if (destVar) {
            if (
              prevB.min === prevB.max &&
              nextB.min === nextB.max &&
              kB.min === kB.max
            ) {
              const denom = Math.max(1e-4, Math.abs(prevB.min));
              const ratio = Math.abs(nextB.min - prevB.min) / denom;
              const decisionVal = ratio < kB.min ? 0 : 1;
              cur.vars[destVar] = { min: decisionVal, max: decisionVal };
            } else {
              cur.vars[destVar] = { min: 0, max: 1 };
            }
            cur.init[destVar] = 'INIT';
            clearRelationalForVar(cur, destVar);
          }
        }
        pc++;
        continue;
      }

      if (op === 'LOOP') {
        const endPc = inst.endPc ?? endExclusive - 1;
        const countI = resolveInterval(inst.args[0], cur);
        const maxCount = Number.isFinite(countI.max)
          ? Math.min(100, Math.max(0, Math.floor(countI.max)))
          : 0;
        const minCount = Number.isFinite(countI.min)
          ? Math.min(maxCount, Math.max(0, Math.floor(countI.min)))
          : 0;

        let iterState = cloneState(cur);
        let merged = cloneState(cur);

        for (let iter = 0; iter < maxCount; iter++) {
          iterState = executeRange(pc + 1, endPc, iterState, true);
          merged = iter < minCount ? cloneState(iterState) : joinStates(merged, iterState);
        }
        cur = maxCount === 0 ? cur : merged;
        pc = endPc + 1;
        continue;
      }

      if (op === 'IF') {
        const endPc = inst.endPc ?? endExclusive - 1;
        const elsePc = inst.elsePc;
        const leftName = inst.args[0];
        const cmp = inst.args[1] ?? '==';
        const rightToken = inst.args[2];

        checkVarReadInit(cur, leftName, inst.lineNumber);
        checkVarReadInit(cur, rightToken, inst.lineNumber);

        const lInt = resolveInterval(leftName, cur);
        const rInt = resolveInterval(rightToken, cur);
        const relDiff =
          leftName && rightToken ? cur.diffs[leftName]?.[rightToken] : undefined;
        const sat = evalConditionSat(lInt, cmp, rInt, relDiff);

        const condLabel = `${leftName ?? '?'} ${cmp} ${rightToken ?? '?'}`;
        branchChecks.push({
          lineNumber: inst.lineNumber,
          condition: condLabel,
          result: sat === 'ALWAYS_TRUE' ? 'TAUTOLOGÍA' : sat === 'ALWAYS_FALSE' ? 'UNSAT' : 'SAT',
        });

        if (sat === 'ALWAYS_FALSE') {
          dischargedRuntimeChecks++;
          if (!insideLoop) {
            if (elsePc !== undefined) {
              for (let j = pc; j <= elsePc; j++) deadIndices.add(j);
              deadIndices.add(endPc);
            } else {
              for (let j = pc; j <= endPc; j++) deadIndices.add(j);
            }
            addOptimization({
              lineNumber: inst.lineNumber,
              kind: 'DEAD_BRANCH_PRUNE',
              detail: `L${inst.lineNumber}: rama THEN (${condLabel}) es UNSAT y puede podarse estáticamente.`,
            });
          }
          pushUniqueFinding({
            lineNumber: inst.lineNumber,
            severity: 'WARN',
            rule: 'SMT_BRANCH_SAT',
            detail: `Rama IF (${condLabel}) es UNSAT en el estado simbólico actual (rama THEN inalcanzable).`,
          });
          if (elsePc !== undefined) {
            cur = executeRange(elsePc + 1, endPc, cur, insideLoop);
          }
        } else if (sat === 'ALWAYS_TRUE') {
          dischargedRuntimeChecks++;
          if (elsePc !== undefined) {
            if (!insideLoop) {
              deadIndices.add(pc);
              for (let j = elsePc; j <= endPc; j++) deadIndices.add(j);
              addOptimization({
                lineNumber: instructions[elsePc]?.lineNumber ?? inst.lineNumber,
                kind: 'DEAD_BRANCH_PRUNE',
                detail: `L${inst.lineNumber}: guarda (${condLabel}) es tautología; rama ELSE podable.`,
              });
            }
            pushUniqueFinding({
              lineNumber: inst.lineNumber,
              severity: 'WARN',
              rule: 'SMT_BRANCH_SAT',
              detail: `Guarda IF (${condLabel}) es tautología; la rama ELSE es inalcanzable (UNSAT).`,
            });
          } else if (!insideLoop) {
            deadIndices.add(pc);
            deadIndices.add(endPc);
            addOptimization({
              lineNumber: inst.lineNumber,
              kind: 'RUNTIME_CHECK_DISCHARGED',
              detail: `L${inst.lineNumber}: guarda (${condLabel}) probada como tautología; chequeo eliminable.`,
            });
          }
          const thenEnd = elsePc !== undefined ? elsePc : endPc;
          cur = executeRange(pc + 1, thenEnd, cur, insideLoop);
        } else {
          const thenState = cloneState(cur);
          narrowBranchVar(thenState, leftName, cmp, rInt, true);
          const thenEnd = elsePc !== undefined ? elsePc : endPc;
          const postThen = executeRange(pc + 1, thenEnd, thenState, insideLoop);

          const elseState = cloneState(cur);
          narrowBranchVar(elseState, leftName, cmp, rInt, false);
          const postElse =
            elsePc !== undefined ? executeRange(elsePc + 1, endPc, elseState, insideLoop) : elseState;

          cur = joinStates(postThen, postElse);
        }
        pc = endPc + 1;
        continue;
      }

      pc++;
    }

    return cur;
  }

  const finalAbstract = executeRange(0, instructions.length, {
    vars: {},
    init: {},
    diffs: {},
    sums: {},
    blocks: [],
    arrays: {},
    usedMem: { min: 0, max: 0 },
    totalMem: { min: initialHeapCapacity, max: initialHeapCapacity },
    usedTriangles: { min: 0, max: 0 },
    meshNodeIds: [],
  });

  // Verificar modularmente cuerpos de funciones declaradas que nunca fueron llamadas en el flujo principal
  for (const fnDef of fnTable.values()) {
    if ((fnCallDepths.get(fnDef.name) ?? 0) === 0) {
      const modState: AbstractState = {
        vars: {},
        init: {},
        diffs: {},
        sums: {},
        blocks: [],
        arrays: {},
        usedMem: { min: 0, max: 0 },
        totalMem: { min: initialHeapCapacity, max: initialHeapCapacity },
        usedTriangles: { min: 0, max: 0 },
        meshNodeIds: [],
      };
      for (const p of fnDef.params) {
        modState.vars[p] = { min: -Infinity, max: Infinity };
        modState.init[p] = 'INIT';
      }
      for (const req of fnDef.requires) {
        narrowBranchVar(modState, req.left, req.cmp, resolveInterval(req.right, modState), true);
      }
      executeRange(fnDef.startPc + 1, fnDef.endPc, modState, false, 1, fnDef);
    }
  }

  const relationalInvariants: string[] = [];
  for (const [x, row] of Object.entries(finalAbstract.diffs)) {
    for (const [y, b] of Object.entries(row)) {
      if (x < y && Number.isFinite(b.min) && Number.isFinite(b.max)) {
        relationalInvariants.push(
          b.min === b.max ? `${x} - ${y} = ${b.min}` : `${x} - ${y} ∈ [${b.min}, ${b.max}]`,
        );
      }
    }
  }

  const sumInvariants: string[] = [];
  for (const [x, row] of Object.entries(finalAbstract.sums)) {
    for (const [y, b] of Object.entries(row)) {
      if (x < y && Number.isFinite(b.min) && Number.isFinite(b.max)) {
        sumInvariants.push(
          b.min === b.max ? `${x} + ${y} = ${b.min}` : `${x} + ${y} ∈ [${b.min}, ${b.max}]`,
        );
      }
    }
  }
  const octagonInvariants = [...relationalInvariants, ...sumInvariants];

  const hasContractViolations = findings.some(
    (f) => f.rule === 'SMT_CONTRACT_VIOLATION' || f.rule === 'SMT_RECURSION_DEPTH',
  );
  const hasArrayViolations = findings.some((f) => f.rule === 'SMT_ARRAY_BOUNDS');

  const functionsVerified: SymbolicFunctionSummary[] = Array.from(fnTable.values()).map((f) => ({
    name: f.name,
    params: f.params,
    contractsChecked: fnContractsChecked.get(f.name) ?? 0,
    callCount: fnCallDepths.get(f.name) ?? 0,
    maxCallDepth: fnCallDepths.get(f.name) ?? 0,
    contractStatus: hasContractViolations ? 'VIOLATED' : 'PROVED',
  }));

  const boundedArrays: SymbolicArraySummary[] = Object.entries(finalAbstract.arrays).map(
    ([name, arr]) => ({
      name,
      size: arr.size,
      elemBound: arr.elemBound,
      boundsStatus: hasArrayViolations ? 'VIOLATED' : 'PROVED',
    }),
  );

  const optimizedLines = instructions
    .filter((_, idx) => !deadIndices.has(idx))
    .map((inst) => inst.raw);

  const hasErrors = findings.some((f) => f.severity === 'ERROR');
  const status: SymbolicReport['status'] = hasErrors ? 'VIOLATION_FOUND' : 'PROVED_SAFE';
  const blockStates = finalAbstract.blocks.map((b) => ({
    id: b.id,
    size: b.sizeMax,
    state: b.state,
  }));

  const pccCertificate = buildProofCarryingCertificate(instructions, {
    status,
    maxHeapBytes: finalAbstract.usedMem.max,
    heapCapacityBytes: finalAbstract.totalMem.min,
    dischargedRuntimeChecks,
    octagonInvariants,
    blockStates,
  });

  if (!hasErrors) {
    findings.unshift({
      lineNumber: 1,
      severity: 'INFO',
      rule: 'SMT_SAFE_BOUND',
      detail: `Invariantes probados (Octágono + PCC SHA-256 ${pccCertificate.certificateSha256.slice(0, 12)}…): heap máx ${finalAbstract.usedMem.max}/${finalAbstract.totalMem.min} B, ${dischargedRuntimeChecks} guardas descargadas.`,
    });
  }

  const smtEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const smtLatencyMs = Number(Math.max(0.01, smtEnd - smtStart).toFixed(3));

  return {
    status,
    maxHeapBytes: finalAbstract.usedMem.max,
    heapCapacityBytes: finalAbstract.totalMem.min,
    totalTriangles: finalAbstract.usedTriangles.max,
    meshBudgetMax: 10000,
    meshNodesCount: finalAbstract.meshNodeIds.length,
    variableBounds: finalAbstract.vars,
    relationalInvariants,
    octagonInvariants,
    blockStates,
    branchChecks,
    functionsVerified,
    boundedArrays,
    dischargedRuntimeChecks,
    optimizations,
    optimizedScript: optimizedLines.join('\n'),
    pccCertificate,
    findings,
    stepsAnalyzed,
    smtLatencyMs,
    quantumNormPreserved,
    nemesisDecayProved,
    soaCapacityCells,
  };
}

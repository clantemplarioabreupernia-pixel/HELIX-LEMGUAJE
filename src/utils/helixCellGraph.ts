import { RUNE_BY_GLYPH, RUNES } from '../data/runes';
import { CompoundWord } from '../data/vocabulary';
import { HelixCell } from './helixCells';
import {
  compileHelixScript,
  DEFAULT_HELIX_3D_PROGRAM,
  DEFAULT_HELIX_PROGRAM,
} from './helixVm';
import { computeCompositeColorFromPrimes } from './primeColor';

export type CellEdgeKind = 'control' | 'state' | 'guard';
export type GraphScope = 'all' | 'default_os' | 'scene_3d' | 'current_vm';

export interface CellGraphNode {
  id: string; // cell.fileName
  cell: HelixCell;
  subsystem: string;
  colorHex: string;
  callCount: number;
  inDegree: number;
  outDegree: number;
  isEntry: boolean;
  isExit: boolean;
}

export interface CellGraphEdge {
  id: string;
  source: string; // cell.fileName
  target: string; // cell.fileName
  kind: CellEdgeKind;
  label: string;
  sequenceSteps: number[];
}

export interface CellDependencyGraph {
  nodes: CellGraphNode[];
  edges: CellGraphEdge[];
  activeChainOpcodes: string[];
  scopeLabel: string;
}

function classifyCellSubsystem(opcode: string): string {
  const op = opcode.toUpperCase();
  if (op === 'KERN_BOOT' || op === 'AUTH_CHECK' || op === 'EXIT_OK') return 'Kernel y Sesión';
  if (['SET', 'ADD', 'SUB', 'MUL', 'DIV'].includes(op)) return 'Aritmética P33';
  if (['IF', 'ELSE', 'LOOP', 'END'].includes(op)) return 'Control de Flujo';
  if (op.startsWith('MEM_')) return 'Memoria';
  if (op.startsWith('PROC_')) return 'Procesos';
  if (op.startsWith('FILE_') || op === 'IO_BUS_TX' || op === 'REG_PERSIST') return 'VFS y E/S';
  if (['MESH_NODE', 'MAT_ORM', 'CAM_6DOF', 'WS_EMIT'].includes(op)) return 'Motor 3D / WS';
  return 'Personalizada';
}

function getCellColorHex(cell: HelixCell): string {
  const primes = Array.from(cell.glyphs)
    .map((g) => RUNE_BY_GLYPH.get(g)?.prime)
    .filter((p): p is number => typeof p === 'number');
  return computeCompositeColorFromPrimes(primes.length > 0 ? primes : [RUNES[0].prime]).colorHex;
}

function extractDeclaredSymbols(cell: HelixCell): string[] {
  const declsText = [cell.decls.go ?? '', cell.decls.glsl ?? '', cell.decls.js ?? ''].join('\n');
  const symbols = new Set<string>();

  const patterns = [
    /\bvar\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\btype\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\bfunc\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\b(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\b(?:vec[234]|float|int|bool)\s+(hlx_[A-Za-z0-9_]*)/g,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(declsText)) !== null) {
      if (m[1] && m[1].length >= 4) symbols.add(m[1]);
    }
  }
  return Array.from(symbols);
}

const STATIC_GUARD_RULES: { from: string; to: string; label: string }[] = [
  { from: 'KERN_BOOT', to: 'AUTH_CHECK', label: 'invariante kernel' },
  { from: 'KERN_BOOT', to: 'MEM_ALLOC', label: 'heap activo' },
  { from: 'KERN_BOOT', to: 'PROC_FORK', label: 'planificador' },
  { from: 'KERN_BOOT', to: 'MESH_NODE', label: 'contexto escena' },
  { from: 'IF', to: 'ELSE', label: 'rama alternativa' },
  { from: 'IF', to: 'END', label: 'cierre bloque' },
  { from: 'ELSE', to: 'END', label: 'cierre rama' },
  { from: 'LOOP', to: 'END', label: 'cierre bucle' },
  { from: 'MESH_NODE', to: 'MAT_ORM', label: 'material PBR' },
  { from: 'MAT_ORM', to: 'CAM_6DOF', label: 'cámara 6-DoF' },
  { from: 'CAM_6DOF', to: 'WS_EMIT', label: 'sync WebSocket' },
  { from: 'REG_PERSIST', to: 'EXIT_OK', label: 'checkpoint final' },
];

export function buildCellDependencyGraph(
  cells: HelixCell[],
  scope: GraphScope,
  vocabulary: CompoundWord[],
  currentVmScript?: string,
): CellDependencyGraph {
  const byOpcode = new Map<string, HelixCell>();
  for (const c of cells) {
    byOpcode.set(c.opcode.toUpperCase(), c);
  }

  let scriptText = '';
  let scopeLabel = 'Red completa de células (.hlx)';
  if (scope === 'default_os') {
    scriptText = DEFAULT_HELIX_PROGRAM;
    scopeLabel = 'Cadena OS Clásico (Memoria · Procesos · VFS)';
  } else if (scope === 'scene_3d') {
    scriptText = DEFAULT_HELIX_3D_PROGRAM;
    scopeLabel = 'Cadena 3D PBR ORM + Telemetría WebSocket';
  } else if (scope === 'current_vm') {
    scriptText = currentVmScript || DEFAULT_HELIX_PROGRAM;
    scopeLabel = 'Cadena del Programa Activo (Módulo F)';
  }

  const compiled = scriptText ? compileHelixScript(scriptText, vocabulary) : [];
  const activeChainOpcodes = compiled.map((i) => i.opcode.toUpperCase());

  // Track call counts and which cells participate
  const callCounts = new Map<string, number>();
  const activeFiles = new Set<string>();
  const sequenceChain: { fileName: string; step: number; opcode: string }[] = [];

  compiled.forEach((inst, idx) => {
    const cell = byOpcode.get(inst.opcode.toUpperCase());
    if (!cell) return;
    activeFiles.add(cell.fileName);
    callCounts.set(cell.fileName, (callCounts.get(cell.fileName) ?? 0) + 1);
    sequenceChain.push({ fileName: cell.fileName, step: idx + 1, opcode: cell.opcode });
  });

  const includedCells =
    scope === 'all'
      ? cells
      : cells.filter((c) => activeFiles.has(c.fileName));

  const includedSet = new Set(includedCells.map((c) => c.fileName));
  const edgeMap = new Map<string, CellGraphEdge>();

  const addEdge = (
    source: string,
    target: string,
    kind: CellEdgeKind,
    label: string,
    step?: number,
  ) => {
    if (source === target || !includedSet.has(source) || !includedSet.has(target)) return;
    const key = `${source}->${target}:${kind}`;
    const existing = edgeMap.get(key);
    if (existing) {
      if (step !== undefined && !existing.sequenceSteps.includes(step)) {
        existing.sequenceSteps.push(step);
        existing.label = `paso ${existing.sequenceSteps.map((s) => `#${s}`).join(', ')}`;
      }
      return;
    }
    edgeMap.set(key, {
      id: key,
      source,
      target,
      kind,
      label,
      sequenceSteps: step !== undefined ? [step] : [],
    });
  };

  // 1. Execution sequence edges from compiled program
  for (let i = 0; i < sequenceChain.length - 1; i++) {
    const curr = sequenceChain[i];
    const next = sequenceChain[i + 1];
    addEdge(curr.fileName, next.fileName, 'control', `paso #${curr.step}`, curr.step);
  }

  // 2. Shared state / declared symbol dependencies across .hlx cells
  const symbolProviders = new Map<string, string[]>();
  for (const cell of includedCells) {
    for (const sym of extractDeclaredSymbols(cell)) {
      const list = symbolProviders.get(sym) ?? [];
      list.push(cell.fileName);
      symbolProviders.set(sym, list);
    }
  }

  for (const consumer of includedCells) {
    const body = [
      consumer.codeBlocks.go,
      consumer.codeBlocks.glsl,
      consumer.codeBlocks.js,
    ].join('\n');

    for (const [sym, providers] of symbolProviders.entries()) {
      const symRe = new RegExp(`\\b${sym}\\b`);
      if (!symRe.test(body)) continue;
      for (const providerFile of providers) {
        if (providerFile !== consumer.fileName) {
          // Avoid duplicating every single node->kern_boot edge on hlxState when already guarded
          if (sym === 'hlxState' && scope === 'all') continue;
          addEdge(providerFile, consumer.fileName, 'state', sym);
        }
      }
    }
  }

  // 3. Kernel & structural control-flow guard edges
  for (const rule of STATIC_GUARD_RULES) {
    const src = byOpcode.get(rule.from);
    const dst = byOpcode.get(rule.to);
    if (src && dst) {
      addEdge(src.fileName, dst.fileName, 'guard', rule.label);
    }
  }

  const edges = Array.from(edgeMap.values());
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const e of edges) {
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  const entryFile = sequenceChain[0]?.fileName ?? byOpcode.get('KERN_BOOT')?.fileName;
  const exitFile =
    sequenceChain[sequenceChain.length - 1]?.fileName ?? byOpcode.get('EXIT_OK')?.fileName;

  const nodes: CellGraphNode[] = includedCells.map((cell) => ({
    id: cell.fileName,
    cell,
    subsystem: classifyCellSubsystem(cell.opcode),
    colorHex: getCellColorHex(cell),
    callCount: callCounts.get(cell.fileName) ?? 0,
    inDegree: inDeg.get(cell.fileName) ?? 0,
    outDegree: outDeg.get(cell.fileName) ?? 0,
    isEntry: cell.fileName === entryFile,
    isExit: cell.fileName === exitFile,
  }));

  return {
    nodes,
    edges,
    activeChainOpcodes,
    scopeLabel,
  };
}

import { useEffect, useMemo, useState } from 'react';
import {
  Play,
  StepForward,
  RotateCcw,
  Terminal,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Download,
  FlaskConical,
  ShieldCheck,
  AlertTriangle,
  Box,
} from 'lucide-react';
import { CompoundWord } from '../data/vocabulary';
import {
  compileHelixScript,
  createInitialVmState,
  DEFAULT_HELIX_3D_PROGRAM,
  DEFAULT_HELIX_CONTRACT_PROGRAM,
  DEFAULT_HELIX_PHYSICS_PROGRAM,
  DEFAULT_HELIX_PROGRAM,
  generateGoRuntimeCode,
  HelixVmState,
  runHelixProgram,
  stepHelixVmWithPc,
  verifyHelixProgram,
  VirtualFileEntry,
} from '../utils/helixVm';
import { runHelixTestSuite, TestCaseResult } from '../utils/helixTests';
import { playFrequencySequence } from '../utils/audio';
import { RUNES, RUNE_BY_GLYPH } from '../data/runes';
import { computeCompositeColorFromPrimes } from '../utils/primeColor';
import { PrimeColorSwatch } from './PrimeColorSwatch';
import { SpectralPhaseCanvas } from './SpectralPhaseCanvas';
import { PureCellAssemblerPanel } from './PureCellAssemblerPanel';
import { GoSiliconBridgePanel } from './GoSiliconBridgePanel';
import { downloadHelixSiliconGoZip } from '../utils/helixGoDistribution';
import {
  downloadStructuredGoScript,
  summarizeGoOpcodeMapping,
} from '../utils/helixGoScriptExporter';
import {
  cauchyRefractiveIndex,
  createSoABuffer,
  decodeQpsk132Symbols,
  encodeQpsk132Frame,
  extractActiveRunesFromScript,
  packToSoABuffer,
  zeroizeSoABuffer,
  Z4Symbol,
} from '../utils/helixSignal';
import { CAUCHY_SPECTRAL_LINES_NM } from '../utils/helixPhysics';

import type { HelixCell } from '../utils/helixCells';

interface VmShellViewProps {
  vocabulary: CompoundWord[];
  script: string;
  onChangeScript: (next: string) => void;
  onOpenIn3DStudio?: (script: string) => void;
  cells?: HelixCell[];
  onChangeCells?: (updater: HelixCell[] | ((prev: HelixCell[]) => HelixCell[])) => void;
  onResetCells?: () => void;
}

const VFS_STORAGE_KEY = 'helix_os_vfs_v1';

function loadSavedVfs(): Record<string, VirtualFileEntry> {
  try {
    const raw = localStorage.getItem(VFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, VirtualFileEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function VmShellView({
  vocabulary,
  script,
  onChangeScript,
  onOpenIn3DStudio,
  cells,
  onChangeCells,
  onResetCells,
}: VmShellViewProps) {
  const [vmState, setVmState] = useState<HelixVmState>(() =>
    createInitialVmState(loadSavedVfs()),
  );
  const [pc, setPc] = useState(0);

  useEffect(() => {
    setPc(0);
  }, [script]);
  const [shellInput, setShellInput] = useState('');
  const [showGoCode, setShowGoCode] = useState(false);
  const [copiedGo, setCopiedGo] = useState(false);
  const [testResults, setTestResults] = useState<TestCaseResult[] | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VFS_STORAGE_KEY, JSON.stringify(vmState.files));
    } catch {
      // Ignore storage quota errors
    }
  }, [vmState.files]);

  const instructions = useMemo(
    () => compileHelixScript(script, vocabulary),
    [script, vocabulary],
  );

  const verification = useMemo(
    () => verifyHelixProgram(instructions),
    [instructions],
  );

  const goSource = useMemo(
    () => generateGoRuntimeCode(instructions, verification.symbolic?.pccCertificate),
    [instructions, verification.symbolic?.pccCertificate],
  );

  const goOpcodeSummary = useMemo(
    () => summarizeGoOpcodeMapping(instructions),
    [instructions],
  );

  const [soaPurged, setSoaPurged] = useState(false);
  const [qpskCheckStatus, setQpskCheckStatus] = useState<string | null>(null);

  useEffect(() => {
    setSoaPurged(false);
    setQpskCheckStatus(null);
  }, [script, vmState.stepCount]);

  const signalSnapshot = useMemo(() => {
    const activeIndices = extractActiveRunesFromScript(instructions.map((i) => i.glyphs));
    const frame = encodeQpsk132Frame(activeIndices, [
      vmState.usedMemoryBytes,
      instructions.length,
      vmState.stepCount,
    ]);
    const activePrimes = activeIndices
      .map((idx) => RUNES[idx]?.prime)
      .filter((p): p is number => typeof p === 'number');
    const color = computeCompositeColorFromPrimes(activePrimes);
    const phaseQuad = (frame.symbols[0] ?? 0) as Z4Symbol;
    const amp = 0.65 + Math.min(1.1, vmState.usedMemoryBytes / Math.max(1, vmState.totalMemoryBytes) + instructions.length * 0.03);
    const soa = createSoABuffer(Math.max(1, instructions.length));
    instructions.forEach((_, idx) => {
      packToSoABuffer(
        soa,
        idx,
        idx,
        vmState.usedMemoryBytes,
        activeIndices.length,
        color.hueDeg,
        cauchyRefractiveIndex(532),
        amp,
        (frame.symbols[idx % frame.symbols.length] ?? 0) as Z4Symbol,
      );
    });
    return {
      frame,
      soa,
      phaseQuad,
      amp,
      hueDeg: color.hueDeg,
      cauchyR: cauchyRefractiveIndex(CAUCHY_SPECTRAL_LINES_NM.red),
      cauchyG: cauchyRefractiveIndex(CAUCHY_SPECTRAL_LINES_NM.green),
      cauchyB: cauchyRefractiveIndex(CAUCHY_SPECTRAL_LINES_NM.blue),
    };
  }, [instructions, vmState.usedMemoryBytes, vmState.totalMemoryBytes, vmState.stepCount]);

  const handleVerifyQpskRoundtrip = () => {
    const decoded = decodeQpsk132Symbols(signalSnapshot.frame.symbols);
    const matchesMask =
      decoded.activePrimeIndices.length ===
      extractActiveRunesFromScript(instructions.map((i) => i.glyphs)).length;
    setQpskCheckStatus(
      matchesMask
        ? `Ronda QPSK 132b íntegra: ${decoded.activePrimeIndices.length} primos P33 y mem=${decoded.channels[0]} B decodificados.`
        : 'Desajuste en decodificación QPSK.',
    );
  };

  const handleZeroizeSoa = () => {
    zeroizeSoABuffer(signalSnapshot.soa);
    setSoaPurged(true);
    setQpskCheckStatus('Buffer SoA sobrescrito con entropía CSPRNG.');
  };

  const handleReset = () => {
    setVmState(createInitialVmState(vmState.files));
    setPc(0);
  };

  const handleClearVfs = () => {
    try {
      localStorage.removeItem(VFS_STORAGE_KEY);
    } catch {
      // Ignore
    }
    setVmState((prev) => ({ ...prev, files: {} }));
  };

  const handleStep = () => {
    if (pc >= instructions.length || vmState.halted) return;
    const current = instructions[pc];
    const { nextState, nextPc } = stepHelixVmWithPc(vmState, instructions, pc);
    setVmState(nextState);
    setPc(nextPc);
    const freqs = Array.from(current.glyphs)
      .map((g) => RUNE_BY_GLYPH.get(g)?.frequencyHz)
      .filter((f): f is number => typeof f === 'number');
    if (freqs.length > 0) {
      playFrequencySequence(freqs, 0.14);
    }
  };

  const handleRunAll = () => {
    const { finalState, finalPc } = runHelixProgram(
      instructions,
      createInitialVmState(vmState.files),
    );
    setVmState(finalState);
    setPc(finalPc);
  };

  const handleShellSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = shellInput.trim();
    if (!trimmed) return;
    const compiled = compileHelixScript(trimmed, vocabulary);
    if (compiled.length > 0) {
      const { nextState } = stepHelixVmWithPc(vmState, compiled, 0);
      setVmState(nextState);
      const freqs = Array.from(compiled[0].glyphs)
        .map((g) => RUNE_BY_GLYPH.get(g)?.frequencyHz)
        .filter((f): f is number => typeof f === 'number');
      if (freqs.length > 0) {
        playFrequencySequence(freqs, 0.14);
      }
    }
    setShellInput('');
  };

  const handleCopyGo = async () => {
    await navigator.clipboard.writeText(goSource);
    setCopiedGo(true);
    setTimeout(() => setCopiedGo(false), 1800);
  };

  const handleDownloadGo = () => {
    downloadStructuredGoScript(
      instructions,
      verification.symbolic?.pccCertificate,
      'helix_vm_script.go',
    );
  };

  const handleDownloadPcc = () => {
    if (!verification.symbolic) return;
    const blob = new Blob(
      [JSON.stringify(verification.symbolic.pccCertificate, null, 2)],
      { type: 'application/json;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'helix_cert.pcc.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRunTests = () => {
    setTestResults(runHelixTestSuite());
  };

  const memPct = Math.min(
    100,
    Math.round((vmState.usedMemoryBytes / Math.max(1, vmState.totalMemoryBytes)) * 100),
  );

  const fileList = Object.values(vmState.files);
  const varEntries = Object.entries(vmState.variables);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-blue-700">
          Módulo F · Back-end ejecutable (VM, Control de Flujo, VFS y Runtime Go)
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
          Máquina Virtual determinista, Shell interactivo y pruebas automáticas
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Ejecuta programas completos con variables (<code className="font-mono text-xs text-slate-800">SET, ADD, SUB, MUL, DIV</code>),
          condicionales (<code className="font-mono text-xs text-slate-800">IF / ELSE / END</code>), bucles acotados (<code className="font-mono text-xs text-slate-800">LOOP / END</code>), sistema de archivos
          virtual persistente (<code className="font-mono text-xs text-slate-800">FILE_WRITE, FILE_READ, FILE_DEL</code>), depuración paso a paso y
          exportación a runtime Go compilable.
        </p>
      </div>

      {/* Editor + Controls + Shell */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Program Script, Shell & Bytecode */}
        <div className="space-y-4 xl:col-span-7">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Programa fuente Helix ({instructions.length} instrucciones)
                </h2>
                <p className="text-xs text-slate-500">
                  Combina glifos (ᚠᚷ), opcodes (MEM_ALLOC), contratos (FN/LLAMAR/BIEN) y arreglos acotados (ARRAY/FORMACIÓN).
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-500">Presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeScript(DEFAULT_HELIX_PROGRAM);
                      setPc(0);
                    }}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    OS Kernel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeScript(DEFAULT_HELIX_3D_PROGRAM);
                      setPc(0);
                    }}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Escena 3D
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeScript(DEFAULT_HELIX_CONTRACT_PROGRAM);
                      setPc(0);
                    }}
                    className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
                  >
                    Contrato FN + ARRAY
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeScript(DEFAULT_HELIX_PHYSICS_PROGRAM);
                      setPc(0);
                    }}
                    className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    Física + Cuántica
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reiniciar VM
                </button>
                <button
                  type="button"
                  onClick={handleStep}
                  disabled={pc >= instructions.length || vmState.halted}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <StepForward className="h-3.5 w-3.5" />
                  Paso ({pc}/{instructions.length})
                </button>
                <button
                  type="button"
                  onClick={handleRunAll}
                  disabled={instructions.length === 0 || verification.status === 'RECHAZADO'}
                  title={
                    verification.status === 'RECHAZADO'
                      ? 'Corrige los errores estáticos de helix-verify antes de ejecutar'
                      : 'Ejecutar programa completo'
                  }
                  className="inline-flex items-center gap-1.5 rounded bg-blue-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <Play className="h-3.5 w-3.5" />
                  Ejecutar todo
                </button>
                {onOpenIn3DStudio && (
                  <button
                    type="button"
                    onClick={() => onOpenIn3DStudio(script)}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <Box className="h-3.5 w-3.5 text-blue-700" />
                    Estudio 3D
                  </button>
                )}
              </div>
            </div>

            <textarea
              rows={12}
              value={script}
              onChange={(e) => {
                onChangeScript(e.target.value);
                setPc(0);
              }}
              spellCheck={false}
              className="w-full rounded-md border border-slate-300 bg-slate-900 p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:border-blue-600 focus:outline-none"
            />

            {/* Interactive Shell Prompt */}
            <form onSubmit={handleShellSubmit} className="mt-4 border-t border-slate-100 pt-4">
              <label
                htmlFor="helix-shell"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-700"
              >
                <Terminal className="h-3.5 w-3.5 text-blue-700" />
                Shell interactivo directo (REPL)
              </label>
              <div className="flex gap-2">
                <input
                  id="helix-shell"
                  type="text"
                  value={shellInput}
                  onChange={(e) => setShellInput(e.target.value)}
                  placeholder="Ej: ᚠᚷ 64  |  SET x 10  |  FILE_READ init.cfg  |  SIGKILL 2"
                  className="flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  Enviar
                </button>
              </div>
            </form>
            {/* Static Pre-Execution Verifier Gate (helix-verify) */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  {verification.status === 'VERIFICADO' ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  ) : (
                    <AlertTriangle
                      className={`h-4 w-4 ${
                        verification.status === 'RECHAZADO'
                          ? 'text-red-700'
                          : 'text-amber-700'
                      }`}
                    />
                  )}
                  <span>Puerta estática (helix-verify): {verification.status}</span>
                </div>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {verification.errorCount} errores · {verification.warningCount} advertencias
                </span>
              </div>
              {verification.symbolic && (
                <div className="mt-2.5 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-600 tabular-nums">
                    <span>
                      Solver nativo (Cero Z3):{' '}
                      <strong
                        className={
                          verification.symbolic.status === 'PROVED_SAFE'
                            ? 'text-emerald-700'
                            : 'text-red-700'
                        }
                      >
                        {verification.symbolic.status === 'PROVED_SAFE'
                          ? 'SEGURO'
                          : 'VIOLACIÓN PROBADA'}
                      </strong>
                    </span>
                    <span>
                      Heap máx: {verification.symbolic.maxHeapBytes}/
                      {verification.symbolic.heapCapacityBytes} B
                    </span>
                    <span>
                      Guardas descargadas: {verification.symbolic.dischargedRuntimeChecks}
                    </span>
                    <span title={verification.symbolic.pccCertificate.certificateSha256}>
                      PCC SHA-256: {verification.symbolic.pccCertificate.certificateSha256.slice(0, 12)}
                    </span>
                    <span className="text-emerald-700">
                      SMT Latencia: {verification.symbolic.smtLatencyMs.toFixed(2)} ms
                    </span>
                    {verification.symbolic.soaCapacityCells > 0 && (
                      <span className="text-blue-700">
                        Pauli-SoA: {verification.symbolic.soaCapacityCells} cel ({verification.symbolic.soaCapacityCells * 28} B)
                      </span>
                    )}
                    {verification.symbolic.nemesisDecayProved && (
                      <span className="text-emerald-700">Némesis 0&lt;γ&lt;1 PROVED</span>
                    )}
                    <span className={verification.symbolic.quantumNormPreserved ? 'text-emerald-700' : 'text-red-700'}>
                      ||ψ||²=1 {verification.symbolic.quantumNormPreserved ? 'OK' : 'VIOLADO'}
                    </span>
                    {Object.entries(verification.symbolic.variableBounds).map(([name, b]) => (
                      <span key={name}>
                        {name} ∈ [{b.min}, {b.max}]
                      </span>
                    ))}
                    {verification.symbolic.octagonInvariants.map((inv) => (
                      <span key={inv} className="text-blue-700">
                        {inv}
                      </span>
                    ))}
                    {verification.symbolic.blockStates.map((blk) => (
                      <span key={blk.id} className="text-slate-700">
                        {blk.id}:{blk.state}
                      </span>
                    ))}
                    {verification.symbolic.branchChecks.map((br) => (
                      <span key={`${br.lineNumber}-${br.condition}`}>
                        L{br.lineNumber} ({br.condition}): {br.result}
                      </span>
                    ))}
                    {verification.symbolic.functionsVerified.map((fn) => (
                      <span key={`fn-${fn.name}`} className="text-emerald-700">
                        FN {fn.name}({fn.params.join(',')}) [call={fn.callCount}, {fn.contractStatus}]
                      </span>
                    ))}
                    {verification.symbolic.boundedArrays.map((arr) => (
                      <span key={`arr-${arr.name}`} className="text-indigo-700">
                        ARRAY {arr.name}[0..{arr.size - 1}] ({arr.boundsStatus})
                      </span>
                    ))}
                  </div>
                  {verification.symbolic.optimizations.length > 0 &&
                    verification.symbolic.optimizedScript !== script.trim() && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                        <span className="text-slate-700">
                          Optimizador Wuffs/ASTRÉE: {verification.symbolic.optimizations.length}{' '}
                          simplificaciones seguras detectadas ({verification.symbolic.optimizations[0]?.detail})
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onChangeScript(verification.symbolic!.optimizedScript);
                            setPc(0);
                          }}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
                        >
                          Aplicar poda/optimización ({verification.symbolic.optimizations.length})
                        </button>
                      </div>
                    )}
                </div>
              )}
              {verification.findings.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {verification.findings.map((f, i) => (
                    <li
                      key={`${f.rule}-${i}`}
                      className={
                        f.severity === 'ERROR' ? 'text-red-700' : 'text-amber-800'
                      }
                    >
                      <span className="font-mono font-medium">L{f.lineNumber} [{f.rule}]</span>{' '}
                      {f.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Bytecode & Go Emitter */}
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Salida compilada (Bytecode y Runtime Go tipado)
                </h3>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                  {goOpcodeSummary.uniqueTypedConstants.length} constantes tipadas{' '}
                  <span className="text-slate-700">HelixOpcode</span> · despacho{' '}
                  <span className="text-slate-700">switch inst.Opcode</span> ·{' '}
                  {goOpcodeSummary.totalInstructions} instrucciones (~{goOpcodeSummary.estimatedGoLines} líneas .go)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGoCode((v) => !v)}
                  className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  {showGoCode ? 'Ver tabla Bytecode' : 'Ver código Go'}
                </button>
                <button
                  type="button"
                  onClick={handleCopyGo}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  {copiedGo ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copiar Go
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadGo}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar .go tipado
                </button>
                <button
                  type="button"
                  onClick={() => downloadHelixSiliconGoZip(script)}
                  className="inline-flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  Proyecto Go (.ZIP)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPcc}
                  disabled={!verification.symbolic}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar PCC
                </button>
              </div>
            </div>

            {goOpcodeSummary.uniqueTypedConstants.length > 0 && (
              <div className="mb-3 rounded border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="mb-1 text-[11px] font-medium text-slate-600">
                  Constantes tipadas <code className="font-mono text-slate-800">HelixOpcode</code> activas en este script:
                </div>
                <div className="flex flex-wrap gap-1.5 font-mono text-[11px] text-slate-700">
                  {goOpcodeSummary.uniqueTypedConstants.map((c) => (
                    <span
                      key={c}
                      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-800"
                    >
                      {c}
                    </span>
                  ))}
                  {goOpcodeSummary.unmappedOpcodes.map((u) => (
                    <span
                      key={u}
                      className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-800"
                    >
                      HelixOpcode(&quot;{u}&quot;)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {showGoCode ? (
              <pre className="max-h-72 overflow-auto rounded-md border border-slate-200 bg-slate-900 p-3.5 font-mono text-xs leading-relaxed text-slate-100">
                {goSource}
              </pre>
            ) : (
              <div className="max-h-72 overflow-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="px-3 py-2 text-right">PC</th>
                      <th className="px-3 py-2">Glifos</th>
                      <th className="px-3 py-2">Opcode</th>
                      <th className="px-3 py-2">Argumentos</th>
                      <th className="px-3 py-2 text-right">Bytecode Hex</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {instructions.map((inst, idx) => {
                      const primes = Array.from(inst.glyphs)
                        .map((g) => RUNE_BY_GLYPH.get(g)?.prime)
                        .filter((p): p is number => typeof p === 'number');
                      const instColor = computeCompositeColorFromPrimes(primes);
                      return (
                        <tr
                          key={`${inst.lineNumber}-${idx}`}
                          className={idx === pc ? 'bg-blue-50/70' : ''}
                        >
                          <td className="px-3 py-1.5 text-right text-slate-500">
                            {idx}
                          </td>
                          <td className="px-3 py-1.5 text-sm font-semibold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              {primes.length > 0 && (
                                <PrimeColorSwatch hex={instColor.colorHex} size={11} />
                              )}
                              <span>{inst.glyphs}</span>
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-blue-700">{inst.opcode}</td>
                          <td className="px-3 py-1.5 text-slate-600">
                            {inst.args.length > 0 ? inst.args.join(' ') : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-700">
                            {inst.bytecodeHex}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <PureCellAssemblerPanel
            instructions={instructions}
            cells={cells}
            onChangeCells={onChangeCells}
            onResetCells={onResetCells}
          />

          {/* Automated Test Suite */}
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Batería de pruebas automáticas del lenguaje
                </h3>
                <p className="text-xs text-slate-500">
                  Verifica parser, Gödel, flujo de control, memoria, VFS y transpilador.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunTests}
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <FlaskConical className="h-3.5 w-3.5 text-blue-700" />
                Ejecutar pruebas
              </button>
            </div>

            {testResults && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                {testResults.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col gap-1 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="font-medium text-slate-900">{t.name}</span>
                      <div className="font-mono text-[11px] text-slate-500">{t.detail}</div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 font-medium shrink-0 ${
                        t.passed ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {t.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      {t.passed ? 'APROBADA' : 'FALLIDA'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Live VM State Inspector */}
        <div className="space-y-4 xl:col-span-5">
          {/* Kernel, Memory, Variables & VFS */}
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              Estado en vivo de la Máquina Virtual
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <dt className="text-slate-500">Núcleo</dt>
                <dd className="mt-1 font-mono font-semibold text-slate-900">
                  {vmState.kernelBooted ? 'ACTIVO' : 'DETENIDO'}
                </dd>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <dt className="text-slate-500">Sesión UID (ACL)</dt>
                <dd className="mt-1 font-mono font-semibold text-slate-900">
                  {vmState.authenticatedUid ?? 'SIN AUTENTICAR'}
                </dd>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <dt className="text-slate-500">Ciclos / Ticks</dt>
                <dd className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                  {vmState.clockTicks}
                </dd>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <dt className="text-slate-500">Búfer E/S</dt>
                <dd className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                  {vmState.ioBuffer.length} tramas
                </dd>
              </div>
            </dl>

            {/* Memory Bar */}
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">Memoria asignada</span>
                <span className="font-mono text-slate-600 tabular-nums">
                  {vmState.usedMemoryBytes} / {vmState.totalMemoryBytes} B ({memPct}%)
                </span>
              </div>
              <svg
                className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                viewBox="0 0 100 8"
                preserveAspectRatio="none"
                role="progressbar"
                aria-valuenow={memPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <rect x="0" y="0" width={memPct} height="8" fill="#1D4ED8" rx="4" />
              </svg>
            </div>

            {/* Variables */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-medium text-slate-600">
                Variables en memoria ({varEntries.length})
              </p>
              {varEntries.length === 0 ? (
                <p className="text-xs text-slate-400">Sin variables declaradas aún.</p>
              ) : (
                <div className="flex flex-wrap gap-2 font-mono text-[11px] tabular-nums">
                  {varEntries.map(([k, v]) => (
                    <div
                      key={k}
                      className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-800"
                    >
                      <span className="font-semibold text-blue-700">{k}</span> = {String(v)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bounded Arrays */}
            {(vmState.soaBuffer ||
              vmState.blochState.theta > 0 ||
              vmState.bvnLastNonDistributive !== null ||
              vmState.weberDecision !== null) && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-medium text-slate-600">
                  Leyes Físicas &amp; Cuánticas en VM
                </p>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums">
                  <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-800">
                    <span className="text-slate-500">Bloch ||ψ||²:</span>{' '}
                    <strong>{vmState.blochState.normSq.toFixed(6)}</strong>{' '}
                    ({vmState.blochState.blochVector.map((v) => v.toFixed(2)).join(',')})
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-800">
                    <span className="text-slate-500">BvN No-Dist:</span>{' '}
                    <strong>
                      {vmState.bvnLastNonDistributive === null
                        ? '—'
                        : vmState.bvnLastNonDistributive
                          ? 'VERIFICADO'
                          : 'DISTRIB'}
                    </strong>
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-800">
                    <span className="text-slate-500">Pauli-SoA / Némesis:</span>{' '}
                    <strong>
                      {vmState.soaBuffer ? `${vmState.soaBuffer.capacity}×28B` : '0 B'}
                    </strong>{' '}
                    {vmState.soaReport
                      ? `σ=${vmState.soaReport.maxTension.toFixed(4)} ∇·v=${vmState.soaReport.maxCurlDivergence.toExponential(1)}`
                      : ''}
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-800">
                    <span className="text-slate-500">Weber 120FPS:</span>{' '}
                    <strong>{vmState.weberDecision ?? '—'}</strong> (skip={vmState.weberSkippedFrames})
                  </div>
                </div>
              </div>
            )}

            {Object.keys(vmState.arrays).length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-medium text-slate-600">
                  Arreglos acotados ({Object.keys(vmState.arrays).length})
                </p>
                <div className="space-y-1 font-mono text-[11px] tabular-nums">
                  {Object.entries(vmState.arrays).map(([arrName, elems]) => (
                    <div
                      key={arrName}
                      className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-800"
                    >
                      <span className="font-semibold text-indigo-700">{arrName}</span>[{elems.length}] = [
                      {elems.slice(0, 8).map((v) => String(v)).join(', ')}
                      {elems.length > 8 ? ', …' : ''}]
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Virtual File System */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-600">
                  Sistema de archivos virtual VFS ({fileList.length})
                </p>
                {fileList.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearVfs}
                    className="text-[11px] font-medium text-slate-500 hover:text-red-700"
                  >
                    Vaciar VFS
                  </button>
                )}
              </div>
              {fileList.length === 0 ? (
                <p className="text-xs text-slate-400">Sin archivos creados aún.</p>
              ) : (
                <div className="space-y-1 font-mono text-[11px] tabular-nums">
                  {fileList.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                    >
                      <span className="font-semibold text-slate-900">{f.name}</span>
                      <span className="truncate max-w-[180px] text-slate-600">
                        {f.owner} · {f.sizeBytes} B · "{f.content}"
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Memory Blocks */}
            {vmState.memoryBlocks.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-medium text-slate-600">Tabla de bloques</p>
                <div className="space-y-1 font-mono text-[11px] tabular-nums">
                  {vmState.memoryBlocks.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                    >
                      <span className="font-semibold text-slate-900">
                        {b.id} @0x{b.address.toString(16).padStart(4, '0')}
                      </span>
                      <span className="text-slate-600">
                        {b.size} B · PID {b.ownerPid} · {b.locked ? 'RO' : 'RW'} · {b.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Process Table */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-medium text-slate-600">
                Tabla de procesos ({vmState.processes.length})
              </p>
              <div className="space-y-1 font-mono text-[11px] tabular-nums">
                {vmState.processes.map((p) => (
                  <div
                    key={p.pid}
                    className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                  >
                    <span className="font-semibold text-slate-900">
                      PID {p.pid} ({p.name})
                    </span>
                    <span className="text-slate-600">
                      prio={p.priority} · {p.state}
                      {p.exitCode !== null ? ` (exit=${p.exitCode})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Execution Audit Trace */}
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Traza de ejecución y verificación de invariantes
            </h3>
            {vmState.logs.length === 0 ? (
              <p className="text-xs text-slate-500">
                Pulsa «Paso» o «Ejecutar todo» para observar las transiciones verificadas de la VM.
              </p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {vmState.logs.map((entry) => {
                  const primes = Array.from(entry.glyphs)
                    .map((g) => RUNE_BY_GLYPH.get(g)?.prime)
                    .filter((p): p is number => typeof p === 'number');
                  const entryColor = computeCompositeColorFromPrimes(primes);
                  return (
                  <div
                    key={entry.step}
                    className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-900">
                        {primes.length > 0 && (
                          <PrimeColorSwatch hex={entryColor.colorHex} size={11} />
                        )}
                        #{entry.step} · {entry.glyphs} {entry.opcode}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          entry.status === 'OK' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {entry.status === 'OK' ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {entry.status}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600">{entry.detail}</p>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* QPSK Z4 132-bit, SoA Zero-GC & WebGL2 Spectral Phase Visualizer */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Transporte QPSK Z4 (132 bits), SoA (28 B) y Visor GLSL
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleVerifyQpskRoundtrip}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  Probar QPSK 132b
                </button>
                <button
                  type="button"
                  onClick={handleZeroizeSoa}
                  className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  Purgar SoA (CSPRNG)
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-slate-600 tabular-nums">
              <span>Trama: {signalSnapshot.frame.bitLength} bits ({signalSnapshot.frame.symbols.length} símb. Z4)</span>
              <span>SoA: {signalSnapshot.soa.backingBuffer.byteLength} B ({signalSnapshot.soa.strideBytes} B/celda Zero-GC)</span>
              <span>Cauchy n(R/G/B): {signalSnapshot.cauchyR} / {signalSnapshot.cauchyG} / {signalSnapshot.cauchyB}</span>
              <span title={signalSnapshot.frame.frameSha256}>
                SHA-256: {signalSnapshot.frame.frameSha256.slice(0, 12)}
              </span>
            </div>

            <SpectralPhaseCanvas
              amplitude={signalSnapshot.amp}
              phaseQuad={signalSnapshot.phaseQuad}
              hueDeg={signalSnapshot.hueDeg}
              zeroized={soaPurged}
            />

            {qpskCheckStatus && (
              <p className="font-mono text-[11px] text-slate-600">{qpskCheckStatus}</p>
            )}
          </div>
        </div>
      </div>

      <GoSiliconBridgePanel activeScript={script} />
    </div>
  );
}

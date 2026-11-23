import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  Binary,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  FileCode2,
  FolderGit2,
  Pause,
  Play,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Upload,
  Zap,
} from 'lucide-react';
import { CompoundWord } from '../data/vocabulary';
import { MiniGptLossChart } from './MiniGptLossChart';
import { HelixCell } from '../utils/helixCells';
import {
  computePrimeProductForTokens,
  validateHelixProgram33Tokens,
} from '../utils/godel';
import {
  GodelChecksumValidationReport,
  validateHelixGodelChecksum,
} from '../utils/helixEngine';
import {
  AI_DECODING_SCENARIOS,
  generateHelixMiniGptRepo,
  runConstrainedAiSequence,
} from '../utils/helixAiProtocol';
import {
  buildHelixNeuralCorpus,
  createHelixNeuralModel,
  DEFAULT_NEURAL_CONFIG,
  exportNeuralCheckpointPth,
  generateVerifiedFromNeuralModel,
  HELIX_MODEL_STORAGE_KEY,
  HelixNeuralModel,
  importNeuralCheckpointPth,
  NeuralGenerationResult,
  trainHelixNeuralSteps,
} from '../utils/helixNeuralEngine';

interface AiProtocolViewProps {
  vocabulary: CompoundWord[];
  cells: HelixCell[];
  onOpenInVm: (script: string) => void;
  onOpenIn3DStudio?: (script: string) => void;
}

type RepoTab = 'modelo' | 'datos' | 'requirements';
type AssemblyPreviewTarget = 'go' | 'js';
type ModuleHSubView = 'all' | 'trainer' | 'scenarios' | 'repo';

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AiProtocolView({
  vocabulary,
  cells,
  onOpenInVm,
  onOpenIn3DStudio,
}: AiProtocolViewProps) {
  const [subView, setSubView] = useState<ModuleHSubView>('all');
  const [scenarioId, setScenarioId] = useState<string>(AI_DECODING_SCENARIOS[0].id);
  const [constrainedMode, setConstrainedMode] = useState<boolean>(true);
  const [temperature, setTemperature] = useState<number>(0.85);
  const [selectedStep, setSelectedStep] = useState<number>(1);
  const [assemblyTarget, setAssemblyTarget] = useState<AssemblyPreviewTarget>('go');
  const [repoTab, setRepoTab] = useState<RepoTab>('modelo');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Estado del Entrenador Local Mini-GPT (.pth)
  const [customCorpusSnippet, setCustomCorpusSnippet] = useState<string>('');
  const [neuralBatchTick, setNeuralBatchTick] = useState<number>(0);
  const [isTraining, setIsTraining] = useState<boolean>(false);
  const [trainStepTarget, setTrainStepTarget] = useState<number>(120);
  const [learningRateInput, setLearningRateInput] = useState<number>(DEFAULT_NEURAL_CONFIG.learningRate);
  const [neuralSeedPrompt, setNeuralSeedPrompt] = useState<string>('ᛇᚢ\nᛗᚦ root');
  const [checkpointNotice, setCheckpointNotice] = useState<{
    kind: 'ok' | 'err';
    message: string;
  } | null>(null);
  const [godelProbeText, setGodelProbeText] = useState<string>('');
  const [godelTamperPrime139, setGodelTamperPrime139] = useState<boolean>(false);

  const pthFileInputRef = useRef<HTMLInputElement | null>(null);
  const corpusFileInputRef = useRef<HTMLInputElement | null>(null);
  const stopTrainingRef = useRef<boolean>(false);

  const neuralStoreRef = useRef<{
    model: HelixNeuralModel;
    sequences: string[][];
  } | null>(null);

  if (!neuralStoreRef.current) {
    let restored: HelixNeuralModel | null = null;
    try {
      const saved = localStorage.getItem(HELIX_MODEL_STORAGE_KEY);
      if (saved) {
        const res = importNeuralCheckpointPth(saved);
        if (
          res.shaMatched &&
          res.model.config.dModel === DEFAULT_NEURAL_CONFIG.dModel &&
          res.model.config.blockSize === DEFAULT_NEURAL_CONFIG.blockSize
        ) {
          restored = res.model;
        }
      }
    } catch {
      // Ignore invalid or unavailable saved checkpoint
    }
    const baseCorpus = buildHelixNeuralCorpus(vocabulary, []);
    if (restored) {
      neuralStoreRef.current = {
        model: restored,
        sequences: baseCorpus.sequences,
      };
    } else {
      neuralStoreRef.current = createHelixNeuralModel(vocabulary, []);
    }
  }

  const persistModelToStorage = (model: HelixNeuralModel) => {
    try {
      const serialized = exportNeuralCheckpointPth(model);
      localStorage.setItem(HELIX_MODEL_STORAGE_KEY, serialized);
    } catch {
      // Ignore storage quota errors
    }
  };

  const [neuralGen, setNeuralGen] = useState<NeuralGenerationResult>(() =>
    generateVerifiedFromNeuralModel(
      neuralStoreRef.current!.model,
      vocabulary,
      cells,
      0.75,
      10,
      ['ᛇᚢ', 'ᛗᚦ root'],
    ),
  );

  useEffect(() => {
    return () => {
      stopTrainingRef.current = true;
      setIsTraining(false);
    };
  }, []);

  const parseExtraScripts = (raw: string): string[] => {
    if (!raw.trim()) return [];
    return raw
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const rebuildNeuralModel = (extraText: string, clearSaved = false) => {
    if (!clearSaved && extraText.trim()) {
      const corpusCheck = validateHelixProgram33Tokens(extraText, { vocabulary, cells });
      if (!corpusCheck.valid) {
        setCheckpointNotice({
          kind: 'err',
          message: `Entrada de corpus rechazada por restricción de 33 tokens Helix: ${corpusCheck.foreignTokens.join(', ') || corpusCheck.summary}`,
        });
        return;
      }
    }
    stopTrainingRef.current = true;
    const extras = parseExtraScripts(extraText);
    const created = createHelixNeuralModel(vocabulary, extras, {
      ...DEFAULT_NEURAL_CONFIG,
      learningRate: learningRateInput,
    });
    neuralStoreRef.current = created;
    if (clearSaved) {
      try {
        localStorage.removeItem(HELIX_MODEL_STORAGE_KEY);
      } catch {
        // Ignore storage error
      }
      setCheckpointNotice({
        kind: 'ok',
        message: 'Pesos reiniciados desde cero y caché local limpiada.',
      });
    } else {
      setCheckpointNotice({
        kind: 'ok',
        message: `Corpus cargado (${created.sequences.length} secuencias, vocab=${created.model.vocab.length} tokens).`,
      });
    }
    setNeuralBatchTick((t) => t + 1);
    const seedLines = neuralSeedPrompt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    setNeuralGen(
      generateVerifiedFromNeuralModel(
        created.model,
        vocabulary,
        cells,
        temperature,
        10,
        seedLines,
      ),
    );
  };

  const handleTrainNeural = (totalSteps = trainStepTarget) => {
    if (isTraining || !neuralStoreRef.current) return;
    neuralStoreRef.current.model.config.learningRate = learningRateInput;
    stopTrainingRef.current = false;
    setIsTraining(true);
    let remaining = totalSteps;
    const chunk = 4;

    const runChunk = () => {
      if (!neuralStoreRef.current || stopTrainingRef.current) {
        if (neuralStoreRef.current) {
          persistModelToStorage(neuralStoreRef.current.model);
        }
        setIsTraining(false);
        return;
      }
      const stepNow = Math.min(chunk, remaining);
      trainHelixNeuralSteps(
        neuralStoreRef.current.model,
        neuralStoreRef.current.sequences,
        stepNow,
      );
      remaining -= stepNow;
      setNeuralBatchTick((t) => t + 1);

      if (remaining > 0) {
        setTimeout(runChunk, 16);
      } else {
        persistModelToStorage(neuralStoreRef.current.model);
        const seedCheck = validateHelixProgram33Tokens(neuralSeedPrompt, { vocabulary, cells });
        const seedLines = seedCheck.valid
          ? neuralSeedPrompt
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean)
          : ['ᛇᚢ', 'ᛗᚦ root'];
        setNeuralGen(
          generateVerifiedFromNeuralModel(
            neuralStoreRef.current.model,
            vocabulary,
            cells,
            temperature,
            10,
            seedLines,
          ),
        );
        setCheckpointNotice({
          kind: seedCheck.valid ? 'ok' : 'err',
          message: seedCheck.valid
            ? `Entrenamiento completado (${neuralStoreRef.current.model.trainedSteps} pasos). Estado guardado en sesión.`
            : `Entrenamiento completado (${neuralStoreRef.current.model.trainedSteps} pasos), pero el prefijo semilla contenía tokens fuera de los 33 tokens (${seedCheck.foreignTokens.join(', ')}); se usó prefijo base seguro.`,
        });
        setIsTraining(false);
      }
    };

    setTimeout(runChunk, 10);
  };

  const handleStopTraining = () => {
    stopTrainingRef.current = true;
  };

  const handleExportPth = () => {
    if (!neuralStoreRef.current) return;
    const pthText = exportNeuralCheckpointPth(neuralStoreRef.current.model);
    persistModelToStorage(neuralStoreRef.current.model);
    const fileName = `mi_modelo_helix_step_${neuralStoreRef.current.model.trainedSteps}.pth`;
    downloadTextFile(fileName, pthText);
    setCheckpointNotice({
      kind: 'ok',
      message: `Pesos exportados en ${fileName} (SHA-256 verificado).`,
    });
  };

  const handleUploadPthFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const { model, shaMatched } = importNeuralCheckpointPth(text);
      const extras = parseExtraScripts(customCorpusSnippet);
      const corpus = buildHelixNeuralCorpus(vocabulary, extras);
      neuralStoreRef.current = {
        model,
        sequences: corpus.sequences,
      };
      setLearningRateInput(model.config.learningRate);
      persistModelToStorage(model);
      setNeuralBatchTick((t) => t + 1);
      const seedLines = neuralSeedPrompt
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      setNeuralGen(
        generateVerifiedFromNeuralModel(
          model,
          vocabulary,
          cells,
          temperature,
          10,
          seedLines,
        ),
      );
      setCheckpointNotice({
        kind: shaMatched ? 'ok' : 'err',
        message: shaMatched
          ? `Checkpoint "${file.name}" cargado (${model.trainedSteps} pasos, SHA-256 OK).`
          : `Checkpoint "${file.name}" cargado pero la firma SHA-256 no coincide.`,
      });
    } catch (err) {
      setCheckpointNotice({
        kind: 'err',
        message: err instanceof Error ? err.message : 'No se pudo leer el archivo .pth.',
      });
    }
  };

  const handleUploadCorpusFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setCustomCorpusSnippet(text);
      const check = validateHelixProgram33Tokens(text, { vocabulary, cells });
      if (!check.valid) {
        setCheckpointNotice({
          kind: 'err',
          message: `Archivo "${file.name}" contiene tokens fuera de los 33 tokens Helix (${check.foreignTokens.join(', ')}). Corrige la entrada antes de entrenar.`,
        });
        return;
      }
      rebuildNeuralModel(text, false);
    } catch {
      setCheckpointNotice({
        kind: 'err',
        message: 'Error al leer el archivo de corpus.',
      });
    }
  };

  const handleRegenerateFromNeural = () => {
    if (!neuralStoreRef.current) return;
    const seedCheck = validateHelixProgram33Tokens(neuralSeedPrompt, { vocabulary, cells });
    if (!seedCheck.valid) {
      setCheckpointNotice({
        kind: 'err',
        message: `Prefijo semilla fuera de los 33 tokens Helix: ${seedCheck.foreignTokens.join(', ') || seedCheck.summary}`,
      });
      return;
    }
    const seedLines = neuralSeedPrompt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    setNeuralGen(
      generateVerifiedFromNeuralModel(
        neuralStoreRef.current.model,
        vocabulary,
        cells,
        temperature,
        10,
        seedLines,
      ),
    );
  };

  const neuralModel = neuralStoreRef.current.model;
  const lossPoints = neuralModel.lossHistory;
  const latestPoint = lossPoints.length > 0 ? lossPoints[lossPoints.length - 1] : null;
  const firstPoint = lossPoints.length > 0 ? lossPoints[0] : null;
  const lossReductionPct =
    firstPoint && latestPoint && firstPoint.loss > 0
      ? ((firstPoint.loss - latestPoint.loss) / firstPoint.loss) * 100
      : null;

  const runResult = useMemo(
    () => runConstrainedAiSequence(scenarioId, vocabulary, cells, temperature),
    [scenarioId, vocabulary, cells, temperature],
  );

  const repo = useMemo(
    () => generateHelixMiniGptRepo(vocabulary, cells),
    [vocabulary, cells],
  );

  const activeGodelSource = godelProbeText.trim() ? godelProbeText : neuralGen.script;

  const godelInspectorReport: GodelChecksumValidationReport = useMemo(() => {
    const baseReport = validateHelixGodelChecksum(activeGodelSource, { vocabulary, cells });
    if (!godelTamperPrime139) {
      return baseReport;
    }
    const tamperedProduct = (BigInt(baseReport.programGodelProduct || '1') * 139n).toString();
    return validateHelixGodelChecksum(activeGodelSource, {
      vocabulary,
      cells,
      expectedGodelProduct: tamperedProduct,
    });
  }, [activeGodelSource, vocabulary, cells, godelTamperPrime139]);

  const seedHeadTokens = useMemo(
    () =>
      neuralSeedPrompt
        .split(/\r?\n/)
        .map((l) => l.split('#')[0].trim().split(/\s+/)[0])
        .filter(Boolean),
    [neuralSeedPrompt],
  );

  const seedPrimeProduct = useMemo(
    () => computePrimeProductForTokens(seedHeadTokens, { vocabulary, cells }),
    [seedHeadTokens, vocabulary, cells],
  );

  const seedInputValidation = useMemo(
    () => validateHelixProgram33Tokens(neuralSeedPrompt, { vocabulary, cells }),
    [neuralSeedPrompt, vocabulary, cells],
  );

  const corpusInputValidation = useMemo(
    () =>
      customCorpusSnippet.trim()
        ? validateHelixProgram33Tokens(customCorpusSnippet, { vocabulary, cells })
        : null,
    [customCorpusSnippet, vocabulary, cells],
  );

  const activeStep =
    runResult.steps.find((s) => s.stepNumber === selectedStep) ?? runResult.steps[0];

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadBundle = () => {
    const bundle = [
      '# ============================================================================',
      '# Repositorio mi-ia-helix/ — Mini-GPT PyTorch + Guardia Matemática Helix',
      '# ============================================================================',
      '',
      '### FILE: requirements.txt',
      repo.requirementsTxt,
      '',
      '### FILE: modelo_helix.py',
      repo.modeloHelixPy,
      '',
      '### FILE: datos_helix.txt',
      repo.datosHelixTxt,
    ].join('\n');
    downloadTextFile('mi-ia-helix-bundle.txt', bundle);
  };

  const repoFileContent =
    repoTab === 'modelo'
      ? repo.modeloHelixPy
      : repoTab === 'datos'
        ? repo.datosHelixTxt
        : repo.requirementsTxt;

  const repoFileName =
    repoTab === 'modelo'
      ? 'modelo_helix.py'
      : repoTab === 'datos'
        ? 'datos_helix.txt'
        : 'requirements.txt';

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
              <Binary className="h-3.5 w-3.5" />
              Lenguaje de Comunicación IA-a-Máquina Matemáticamente Verificado
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Protocolo IA y Decodificación Cero-Alucinaciones (Mini-GPT + Máscara SMT)
            </h1>
            <p className="text-sm leading-relaxed text-slate-600">
              Cuando una IA generativa escribe lenguajes ambiguos de texto libre, cualquier token con
              probabilidad alta puede introducir <span className="font-medium text-slate-800">división por cero</span>,
              fugas de memoria o desbordamientos. En <span className="font-semibold text-slate-900">Helix</span>,
              el compilador y el verificador SMT actúan como una <span className="font-medium text-blue-700">máscara de logits (-∞)</span> antes
              del muestreo estocástico: la red neuronal solo puede emitir instrucciones matemáticamente probadas.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Alucinaciones Bloqueadas
              </div>
              <div className="mt-0.5 font-mono text-xl font-bold text-rose-600 tabular-nums">
                {runResult.blockedHallucinations} / {runResult.totalCandidates}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Estado Final SMT
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-sm font-bold text-emerald-700">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                {runResult.constrainedVerification.status}
              </div>
            </div>
          </div>
        </div>

        {/* Comparativa de Pipeline */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-800">
              <ShieldAlert className="h-4 w-4" />
              Pipeline LLM Tradicional (Estocástico Libre)
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span className="rounded bg-white px-2 py-1 font-mono border border-rose-200">Prompt Ambiguo</span>
              <ArrowRight className="h-3.5 w-3.5 text-rose-400" />
              <span className="rounded bg-white px-2 py-1 font-mono border border-rose-200">Softmax(Logits)</span>
              <ArrowRight className="h-3.5 w-3.5 text-rose-400" />
              <span className="rounded bg-rose-100 px-2 py-1 font-mono font-semibold text-rose-900">
                DIV 0 / Overflow / Bug
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
              <ShieldCheck className="h-4 w-4" />
              Pipeline Helix IA (Máscara Gramatical + SMT + Células .hlx)
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span className="rounded bg-white px-2 py-1 font-mono border border-emerald-200">Logits Transformer</span>
              <ArrowRight className="h-3.5 w-3.5 text-emerald-500" />
              <span className="rounded bg-white px-2 py-1 font-mono border border-emerald-200">
                Máscara (-∞) Octágonos + P33
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-emerald-500" />
              <span className="rounded bg-emerald-100 px-2 py-1 font-mono font-semibold text-emerald-900">
                PCC SHA-256 + Código .hlx Puro
              </span>
            </div>
          </div>
        </div>
        {/* Selector de subsecciones del Módulo H */}
        <div className="mt-5 flex flex-wrap gap-1.5 border-t border-slate-200 pt-4">
          {(
            [
              { id: 'all', label: 'Vista completa' },
              { id: 'trainer', label: 'Entrenador Mini-GPT (.pth + Recharts)' },
              { id: 'scenarios', label: 'Máscara SMT (Escenarios)' },
              { id: 'repo', label: 'Exportar PyTorch (mi-ia-helix/)' },
            ] as { id: ModuleHSubView; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSubView(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                subView === item.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {/* Sección 1: Entrenador Local Mini-GPT (.pth) con Recharts en tiempo real */}
      {(subView === 'all' || subView === 'trainer') && (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-700">
              <Activity className="h-3.5 w-3.5" />
              Entrenador Local Mini-GPT + Persistencia de Pesos (.pth)
            </div>
            <h2 className="mt-1 font-display text-lg font-bold text-slate-900">
              1. Entrenamiento Local Mini-GPT y Máscara Token-a-Token (Autómata CFG/PDA + SMT)
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Transformer Decoder-Only ({neuralModel.parameterCount.toLocaleString('es-ES')} parámetros · d_model={neuralModel.config.dModel} · ctx={neuralModel.config.blockSize} · {neuralModel.config.nHeads} cabezas · Pre-LN LayerNorm · GELU · Dropout {neuralModel.config.dropout}) con muestreo estocástico multinomial Softmax y máscara incremental token-a-token (<code className="font-mono">-∞</code> en cada token inviable del vocabulario |V|={neuralModel.vocab.length}).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={pthFileInputRef}
              type="file"
              accept=".pth,.json"
              onChange={handleUploadPthFile}
              className="hidden"
            />
            <input
              ref={corpusFileInputRef}
              type="file"
              accept=".txt,.hlx,.helix"
              onChange={handleUploadCorpusFile}
              className="hidden"
            />

            {!isTraining ? (
              <button
                type="button"
                onClick={() => handleTrainNeural(trainStepTarget)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                <Zap className="h-3.5 w-3.5" />
                Entrenar (+{trainStepTarget} pasos)
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopTraining}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700 whitespace-nowrap shrink-0"
              >
                <Pause className="h-3.5 w-3.5" />
                Pausar Entrenamiento
              </button>
            )}

            <button
              type="button"
              disabled={isTraining}
              onClick={handleRegenerateFromNeural}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              Generar
            </button>

            <button
              type="button"
              disabled={isTraining}
              onClick={handleExportPth}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Save className="h-3.5 w-3.5" />
              Exportar Pesos (.pth)
            </button>

            <button
              type="button"
              disabled={isTraining}
              onClick={() => pthFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              Cargar .pth
            </button>

            <button
              type="button"
              disabled={isTraining}
              onClick={() => rebuildNeuralModel(customCorpusSnippet, true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reiniciar
            </button>
          </div>
        </div>

        {checkpointNotice && (
          <div
            className={`mt-4 flex items-center justify-between gap-2 rounded-lg border px-3.5 py-2 text-xs ${
              checkpointNotice.kind === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <span className="font-medium">{checkpointNotice.message}</span>
            <button
              type="button"
              onClick={() => setCheckpointNotice(null)}
              className="text-[11px] font-semibold underline"
            >
              Ocultar
            </button>
          </div>
        )}

        {/* Métricas de entrenamiento + Visor Recharts en tiempo real */}
        <div className="mt-5 grid gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-6">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-tick={neuralBatchTick}>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">Pasos AdamW</div>
                <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                  {neuralModel.trainedSteps}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">Train Loss</div>
                <div className="font-mono text-base font-bold text-emerald-700 tabular-nums">
                  {latestPoint ? latestPoint.loss.toFixed(3) : '—'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">Val Loss</div>
                <div className="font-mono text-base font-bold text-blue-700 tabular-nums">
                  {latestPoint ? latestPoint.valLoss.toFixed(3) : '—'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">Mejora</div>
                <div className="font-mono text-base font-bold text-slate-800 tabular-nums">
                  {lossReductionPct !== null ? `${lossReductionPct.toFixed(0)}%` : '—'}
                </div>
              </div>
            </div>

            {/* Controles rápidos de hiperparámetros */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-slate-600">Pasos/ronda:</span>
                {[60, 120, 250].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={isTraining}
                    onClick={() => setTrainStepTarget(n)}
                    className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${
                      trainStepTarget === n
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-700'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-slate-600">LR:</span>
                {[0.004, 0.01, 0.018].map((lr) => (
                  <button
                    key={lr}
                    type="button"
                    disabled={isTraining}
                    onClick={() => setLearningRateInput(lr)}
                    className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${
                      learningRateInput === lr
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-700'
                    }`}
                  >
                    {lr}
                  </button>
                ))}
              </div>
            </div>

            {/* Visor de Loss en tiempo real con Recharts */}
            <MiniGptLossChart
              lossHistory={lossPoints.slice()}
              isTraining={isTraining}
              trainedSteps={neuralModel.trainedSteps}
              targetStepBatch={trainStepTarget}
            />

            {/* Carga de datos locales (.txt/.hlx) y prefijo semilla */}
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="neural-seed-input" className="block text-xs font-semibold text-slate-800">
                  Prefijo / Semilla de Generación (Helix)
                </label>
                <button
                  type="button"
                  disabled={isTraining}
                  onClick={() => corpusFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Upload className="h-3 w-3" />
                  Cargar datos.txt / .hlx
                </button>
              </div>
              <textarea
                id="neural-seed-input"
                rows={2}
                value={neuralSeedPrompt}
                onChange={(e) => setNeuralSeedPrompt(e.target.value)}
                className={`w-full rounded-md border bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:outline-none ${
                  seedInputValidation.valid
                    ? 'border-slate-300 focus:border-blue-500'
                    : 'border-rose-400 focus:border-rose-600'
                }`}
              />
              <div
                className={`flex flex-wrap items-center justify-between gap-2 rounded border px-2.5 py-1 font-mono text-[11px] ${
                  seedInputValidation.valid
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-800'
                }`}
              >
                <span>
                  {seedInputValidation.valid
                    ? `33-Tokens OK · ∏ Primos=${seedPrimeProduct.productString} [${seedPrimeProduct.primes.join('·')}]`
                    : `Bloqueado fuera de 33 tokens: [${seedInputValidation.foreignTokens.join(', ')}]`}
                </span>
                <span className="text-[10px] opacity-80">
                  {seedPrimeProduct.positionalSignature}
                </span>
              </div>

              <label htmlFor="neural-extra-corpus" className="block text-xs font-semibold text-slate-800">
                Corpus adicional cargado para entrenar (separa programas con línea en blanco)
              </label>
              <textarea
                id="neural-extra-corpus"
                rows={3}
                placeholder={'ᛇᚢ\nᛗᚦ admin\nSET x 64\nᚠᚷ x\nᚳᛏ'}
                value={customCorpusSnippet}
                onChange={(e) => setCustomCorpusSnippet(e.target.value)}
                className={`w-full rounded-md border bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:outline-none ${
                  corpusInputValidation && !corpusInputValidation.valid
                    ? 'border-rose-400 focus:border-rose-600'
                    : 'border-slate-300 focus:border-blue-500'
                }`}
              />
              {corpusInputValidation && (
                <div
                  className={`rounded border px-2.5 py-1 font-mono text-[11px] ${
                    corpusInputValidation.valid
                      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  {corpusInputValidation.valid
                    ? `Corpus válido (33 tokens) · ${corpusInputValidation.validLinesCount} líneas · ∏ Gödel=${corpusInputValidation.godelProduct}`
                    : `Corpus rechazado: tokens fuera de los 33 tokens Helix [${corpusInputValidation.foreignTokens.join(', ')}]`}
                </div>
              )}
              <button
                type="button"
                disabled={isTraining || (corpusInputValidation !== null && !corpusInputValidation.valid)}
                onClick={() => rebuildNeuralModel(customCorpusSnippet, false)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Aplicar Corpus y Reconstruir Vocabulario
              </button>
            </div>
          </div>

          {/* Salida neuronal en vivo + Trazado de Máscara SMT */}
          <div className="space-y-4 lg:col-span-6">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Salida Autoregresiva de la Red Neuronal + Máscara SMT
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-rose-100 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-800">
                    {neuralGen.blockedHallucinations} alucinaciones bloqueadas (-∞)
                  </span>
                  <span className="rounded bg-emerald-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                    {neuralGen.verification.status}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[11px] font-semibold text-emerald-900">
                    Código Helix Verificado (con Máscara)
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-emerald-200">
                    {neuralGen.script}
                  </pre>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-semibold text-rose-900">
                    Lo que habría emitido sin Máscara ({neuralGen.stochasticVerification.status})
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-rose-300">
                    {neuralGen.stochasticScript}
                  </pre>
                </div>
              </div>

              {neuralGen.tokenTrace.length > 0 && (
                <div className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-2.5 text-[11px]">
                  <div className="mb-1.5 flex items-center justify-between gap-2 font-semibold text-slate-800">
                    <span>Autómata Gramatical Incremental Token-a-Token ({neuralGen.tokenTrace.length} pasos)</span>
                    <span className="font-mono text-[10px] text-slate-500">
                      |V|={neuralModel.vocab.length} tokens
                    </span>
                  </div>
                  <div className="space-y-1">
                    {neuralGen.tokenTrace.map((tokStep) => (
                      <div
                        key={tokStep.step}
                        className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 font-mono"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-400">t{tokStep.step}</span>
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                            {tokStep.phase}
                            {tokStep.stackDepth > 0 ? `[d=${tokStep.stackDepth}]` : ''}
                          </span>
                          <strong className="text-emerald-700">
                            {tokStep.chosenToken === '\n' ? '\\n' : tokStep.chosenToken}
                          </strong>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                          <span className="font-semibold text-blue-700">
                            p={(tokStep.sampledProb * 100).toFixed(0)}%
                          </span>
                          <span>
                            válidos={tokStep.allowedCount} · mask(-∞)={tokStep.maskedCount}
                          </span>
                          {tokStep.blockedSamples[0] && (
                            <span className="text-rose-700">
                              ej. bloqueado: {tokStep.blockedSamples[0].token === '\n' ? '\\n' : tokStep.blockedSamples[0].token} [{tokStep.blockedSamples[0].rule}]
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {neuralGen.trace.length > 0 && (
                <div className="mt-3 max-h-36 overflow-auto rounded-lg border border-slate-200 bg-white p-2.5 text-[11px]">
                  <div className="mb-1.5 font-semibold text-slate-800">
                    Resumen por línea emitida ({neuralGen.trace.length} líneas):
                  </div>
                  <div className="space-y-1">
                    {neuralGen.trace.map((t) => (
                      <div
                        key={t.lineIndex}
                        className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 font-mono"
                      >
                        <span className="text-slate-700">
                          L{t.lineIndex}: <strong className="text-emerald-700">{t.chosenLine}</strong>
                        </span>
                        <span className="text-slate-500">
                          topSinMáscara={t.stochasticTopLine} · tokensMask(-∞)={t.blockedCount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono text-[11px] text-slate-600">
                  Ensamblado Go (.hlx): {neuralGen.pureAssemblyGo.usedCells.length} células · válido=
                  {String(neuralGen.pureAssemblyGo.valid)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {onOpenIn3DStudio && (
                    <button
                      type="button"
                      onClick={() => {
                        const raw = neuralGen.script;
                        if (raw.includes('MESH_NODE')) {
                          onOpenIn3DStudio(raw);
                        } else {
                          const lines = raw.split('\n');
                          const exitIdx = lines.findIndex((l) => l.trim().startsWith('ᚳᛏ'));
                          const meshBlock = [
                            'MESH_NODE ai_core lathe 720 1.15',
                            'MAT_ORM ai_core 0.94 0.18 0.32',
                            'CAM_6DOF 3.2 2.1 3.5 38 22 44',
                          ];
                          if (exitIdx >= 0) {
                            lines.splice(exitIdx, 0, ...meshBlock);
                            onOpenIn3DStudio(lines.join('\n'));
                          } else {
                            onOpenIn3DStudio(`${raw}\n${meshBlock.join('\n')}`);
                          }
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-600 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-900 hover:bg-cyan-100 whitespace-nowrap"
                    >
                      <Zap className="h-3.5 w-3.5 text-cyan-700" />
                      Inyectar en Estudio 3D (Módulo G)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenInVm(neuralGen.script)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Ejecutar salida neuronal en VM (Módulo F)
                  </button>
                </div>
              </div>
            </div>

            {/* Validador de Checksum de Gödel (Base 33 Tokens · Primos 2..137) */}
            <div
              className={`rounded-lg border p-4 ${
                godelInspectorReport.valid
                  ? 'border-emerald-200 bg-white'
                  : 'border-rose-300 bg-rose-50/60'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {godelInspectorReport.valid ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-rose-700" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Checksum de Gödel (33 Tokens · Primos 2..137)
                  </span>
                </div>
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
                    godelInspectorReport.valid
                      ? 'bg-emerald-600 text-white'
                      : 'bg-rose-600 text-white'
                  }`}
                >
                  {godelInspectorReport.valid ? 'VÁLIDO · RESIDUO=1' : 'ALUCINACIÓN DETECTADA'}
                </span>
              </div>

              <p className="mt-1.5 text-[11px] text-slate-600">
                Factoriza el producto de Gödel y verifica la firma posicional FNV-1a sobre las{' '}
                <span className="font-mono font-semibold text-slate-800">33 runas</span> base para
                rechazar cualquier alucinación fuera del alfabeto cerrado Helix.
              </p>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setGodelProbeText('');
                    setGodelTamperPrime139(false);
                  }}
                  className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Validar salida neuronal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGodelProbeText('ᛇᚢ\nᛊᚠ\nEXEC_SHELL rm -rf\nᚳᛏ');
                    setGodelTamperPrime139(false);
                  }}
                  className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100"
                >
                  Probar inyección (ᛊ / EXEC_SHELL)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGodelProbeText(neuralGen.script);
                    setGodelTamperPrime139(true);
                  }}
                  className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Probar factor primo 139 &gt; 137
                </button>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 font-mono text-[11px]">
                <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-500">Líneas en Base</div>
                  <div className="font-bold text-slate-900">
                    {godelInspectorReport.validLinesCount} / {godelInspectorReport.totalLines}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-500">Tokens / Primos</div>
                  <div className="font-bold text-slate-900">
                    {godelInspectorReport.totalBasisTokens} ({godelInspectorReport.factorizedPrimes.length} únicos)
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-500">Residuo P33</div>
                  <div
                    className={`font-bold ${
                      godelInspectorReport.remainder === '1' ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {godelInspectorReport.remainder}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-500">Firma FNV-1a</div>
                  <div className="truncate font-bold text-slate-800">
                    {godelInspectorReport.positionalSignature}
                  </div>
                </div>
              </div>

              <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px]">
                <div className="truncate text-slate-700">
                  ∏ Gödel: <span className="font-semibold text-slate-900">{godelInspectorReport.programGodelProduct}</span>
                </div>
                <div
                  className={`mt-0.5 ${
                    godelInspectorReport.valid ? 'text-emerald-700' : 'text-rose-700 font-semibold'
                  }`}
                >
                  {godelInspectorReport.summary}
                </div>
              </div>

              {godelInspectorReport.foreignTokens.length > 0 && (
                <div className="mt-2 rounded border border-rose-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-rose-800">
                  Tokens fuera de los 33 primos Helix: [{godelInspectorReport.foreignTokens.join(', ')}]
                </div>
              )}

              {godelInspectorReport.lines.length > 0 && (
                <div className="mt-2 max-h-28 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[10px] space-y-1">
                  {godelInspectorReport.lines.map((line) => (
                    <div
                      key={`${line.lineNumber}-${line.raw}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-slate-700">
                        L{line.lineNumber}: <strong>{line.headToken}</strong>
                        {line.resolvedGlyphs ? ` → ${line.resolvedGlyphs}` : ''}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${
                          line.status === 'VALIDO'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {line.status === 'VALIDO'
                          ? `G=${line.lineGodelProduct} [p:${line.primes.join('·')}]`
                          : `FUERA DE BASE`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Sección 2: Laboratorio Interactivo de Decodificación Restringida */}
      {(subView === 'all' || subView === 'scenarios') && (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              2. Laboratorio Diagnóstico de Máscara de Logits (Escenarios Críticos)
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Cada instrucción candidata pasa en tiempo real por <code className="font-mono text-slate-800">compileHelixScript</code> y{' '}
              <code className="font-mono text-slate-800">verifyHelixProgram</code> antes de permitir el muestreo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setConstrainedMode(true)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  constrainedMode
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Modo Helix (Máscara SMT)
              </button>
              <button
                type="button"
                onClick={() => setConstrainedMode(false)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  !constrainedMode
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Modo Libre (Sin máscara)
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
              <Sliders className="h-3.5 w-3.5 text-slate-500" />
              <label htmlFor="helix-temp-slider" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                Temp: <span className="font-mono font-semibold text-slate-900">{temperature.toFixed(2)}</span>
              </label>
              <input
                id="helix-temp-slider"
                type="range"
                min="0.2"
                max="1.5"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-20 accent-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Selector de escenarios */}
        <div className="mt-4 flex flex-wrap gap-2">
          {AI_DECODING_SCENARIOS.map((sc) => {
            const active = sc.id === scenarioId;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => {
                  setScenarioId(sc.id);
                  setSelectedStep(1);
                }}
                className={`rounded-lg border px-3.5 py-2 text-left text-xs transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold">{sc.title}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
          <span className="font-semibold text-slate-900">Intención del Prompt: </span>
          {runResult.scenario.prompt}
        </div>

        {/* Trazado paso a paso + Salida Final */}
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* Pasos de decodificación */}
          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap gap-1.5">
              {runResult.steps.map((step) => {
                const isSelected = step.stepNumber === activeStep?.stepNumber;
                const diverged =
                  step.stochasticWinner.line !== step.constrainedWinner?.line;
                return (
                  <button
                    key={step.stepNumber}
                    type="button"
                    onClick={() => setSelectedStep(step.stepNumber)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : diverged
                          ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>Paso {step.stepNumber}</span>
                    {step.blockedCount > 0 && (
                      <span
                        className={`rounded px-1 text-[10px] font-bold ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        -{step.blockedCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {activeStep && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Paso {activeStep.stepNumber} de {runResult.steps.length}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {activeStep.intent}
                    </div>
                  </div>
                  <span className="rounded-md bg-white border border-slate-200 px-2.5 py-1 font-mono text-[11px] text-slate-600">
                    {activeStep.blockedCount} bloqueado(s)
                  </span>
                </div>

                <div className="space-y-2.5">
                  {activeStep.candidates.map((cand) => {
                    const isWinner = constrainedMode
                      ? activeStep.constrainedWinner?.line === cand.line
                      : activeStep.stochasticWinner.line === cand.line;
                    const probPct = constrainedMode
                      ? cand.maskedProb * 100
                      : cand.rawProb * 100;

                    return (
                      <div
                        key={cand.line}
                        className={`rounded-lg border p-3 transition-colors ${
                          !cand.allowed && constrainedMode
                            ? 'border-rose-200 bg-rose-50/70'
                            : isWinner
                              ? constrainedMode
                                ? 'border-emerald-300 bg-emerald-50/70'
                                : 'border-amber-300 bg-amber-50/80'
                              : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {!cand.allowed && constrainedMode ? (
                              <Ban className="h-4 w-4 shrink-0 text-rose-600" />
                            ) : isWinner ? (
                              <CheckCircle2
                                className={`h-4 w-4 shrink-0 ${
                                  cand.allowed ? 'text-emerald-600' : 'text-rose-600'
                                }`}
                              />
                            ) : (
                              <div className="h-4 w-4 shrink-0 rounded-full border border-slate-300" />
                            )}
                            <code className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-300">
                              {cand.line}
                            </code>
                            <span className="truncate text-xs font-medium text-slate-700">
                              {cand.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
                            <span className="text-slate-500">
                              logit={cand.rawLogit.toFixed(1)}
                            </span>
                            {constrainedMode && !cand.allowed ? (
                              <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                                MASK -∞ (0.0%)
                              </span>
                            ) : (
                              <span
                                className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                                  isWinner
                                    ? cand.allowed
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-rose-600 text-white'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {probPct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Barra de probabilidad */}
                        <div className="mt-2 grid grid-cols-2 gap-3 text-[11px]">
                          <div>
                            <div className="flex justify-between text-slate-500">
                              <span>Prob. Estocástica Cruda</span>
                              <span className="font-mono">{(cand.rawProb * 100).toFixed(1)}%</span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full ${cand.allowed ? 'bg-slate-500' : 'bg-rose-400'}`}
                                style={{ width: `${Math.min(100, cand.rawProb * 100)}%` }}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-slate-500">
                              <span>Prob. Post-Máscara Helix</span>
                              <span className="font-mono">{(cand.maskedProb * 100).toFixed(1)}%</span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full bg-emerald-600"
                                style={{ width: `${Math.min(100, cand.maskedProb * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {!cand.allowed && (
                          <div className="mt-2 rounded border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] text-rose-800">
                            <span className="font-mono font-bold">
                              [{cand.violatedRules.join(', ')}]
                            </span>{' '}
                            {cand.violationDetails[0] ?? cand.hallucinationNote}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Resultado compilado + Verificación + Ensamblado .hlx */}
          <div className="space-y-4 lg:col-span-5">
            <div
              className={`rounded-lg border p-4 ${
                constrainedMode
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : 'border-rose-200 bg-rose-50/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {constrainedMode ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-rose-700" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    {constrainedMode
                      ? 'Programa Emitido (Modo Helix)'
                      : 'Programa Emitido (Sin Máscara)'}
                  </span>
                </div>
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
                    (constrainedMode
                      ? runResult.constrainedVerification.status
                      : runResult.stochasticVerification.status) === 'VERIFICADO'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-rose-600 text-white'
                  }`}
                >
                  {constrainedMode
                    ? runResult.constrainedVerification.status
                    : runResult.stochasticVerification.status}
                </span>
              </div>

              <pre className="mt-3 max-h-52 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">
                {constrainedMode ? runResult.constrainedScript : runResult.stochasticScript}
              </pre>

              {!constrainedMode && runResult.stochasticVerification.findings.length > 0 && (
                <div className="mt-3 space-y-1 rounded border border-rose-200 bg-white p-2.5 text-[11px] text-rose-800">
                  <div className="font-semibold">
                    Fallos detectados por el verificador estático ({runResult.stochasticVerification.findings.length}):
                  </div>
                  {runResult.stochasticVerification.findings.slice(0, 4).map((f, idx) => (
                    <div key={`${f.rule}-${idx}`} className="font-mono">
                      L{f.lineNumber} [{f.rule}]: {f.detail}
                    </div>
                  ))}
                </div>
              )}

              {constrainedMode && runResult.constrainedVerification.symbolic && (
                <div className="mt-3 space-y-2">
                  <div className="rounded border border-emerald-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-700">
                    <div>
                      SMT: <strong className="text-emerald-700">{runResult.constrainedVerification.symbolic.status}</strong> ·
                      Heap máx {runResult.constrainedVerification.symbolic.maxHeapBytes} /{' '}
                      {runResult.constrainedVerification.symbolic.heapCapacityBytes} B ·
                      Malla {runResult.constrainedVerification.symbolic.totalTriangles} Δ
                    </div>
                    <div className="mt-0.5 truncate text-slate-500">
                      PCC SHA-256: {runResult.constrainedVerification.symbolic.pccCertificate.certificateSha256}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-1 border-t border-slate-100 pt-1 text-[10px] text-emerald-800">
                      <span>
                        Gödel-33: {runResult.constrainedGodel.valid ? 'VÁLIDO' : 'ERROR'} ·{' '}
                        {runResult.constrainedGodel.totalBasisTokens} tokens · residuo={runResult.constrainedGodel.remainder}
                      </span>
                      <span>{runResult.constrainedGodel.positionalSignature}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenInVm(runResult.constrainedScript)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Abrir programa verificado en VM (Módulo F)
                  </button>
                </div>
              )}
            </div>

            {/* Ensamblado directo desde células .hlx */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <Cpu className="h-4 w-4 text-blue-700" />
                  Ensamblado Puro desde Células (.hlx)
                </div>
                <div className="inline-flex rounded border border-slate-200 bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setAssemblyTarget('go')}
                    className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${
                      assemblyTarget === 'go' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Go
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssemblyTarget('js')}
                    className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${
                      assemblyTarget === 'js' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    JS
                  </button>
                </div>
              </div>
              <pre className="mt-2.5 max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-200">
                {assemblyTarget === 'go' ? runResult.pureAssemblyGo.code : runResult.pureAssemblyJs.code}
              </pre>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Sección 3: Generador del Repositorio PyTorch Mini-GPT Helix */}
      {(subView === 'all' || subView === 'repo') && (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700">
              <FolderGit2 className="h-4 w-4" />
              Proyecto Listo para Entrenar Localmente con PyTorch
            </div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              3. Repositorio Exportable PyTorch: <span className="font-mono text-blue-700">mi-ia-helix/</span>
            </h2>
            <p className="text-xs text-slate-600">
              Implementa la arquitectura Transformer <code className="font-mono">MiniGPT</code> (Head, MultiHeadAttention, FeedForward, Block)
              entrenada directamente sobre tu corpus simbólico Helix y protegida por{' '}
              <code className="font-mono">helix_static_guard()</code> dentro de <code className="font-mono">generate_verified()</code>.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadBundle}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Descargar Proyecto Completo
          </button>
        </div>

        {/* Estadísticas reales del corpus */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">Tokens Base</div>
            <div className="font-mono text-sm font-bold text-slate-900">{repo.stats.runeCount}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">Opcodes Léxico</div>
            <div className="font-mono text-sm font-bold text-slate-900">{repo.stats.opcodeCount}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">Células .hlx</div>
            <div className="font-mono text-sm font-bold text-slate-900">{repo.stats.cellCount}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">vocab_size</div>
            <div className="font-mono text-sm font-bold text-slate-900">{repo.stats.vocabChars}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">Caracteres Corpus</div>
            <div className="font-mono text-sm font-bold text-slate-900">
              {repo.stats.corpusChars.toLocaleString('es-ES')}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">Líneas datos_helix.txt</div>
            <div className="font-mono text-sm font-bold text-slate-900">{repo.stats.corpusLines}</div>
          </div>
        </div>

        {/* Pestañas de archivos del repositorio */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'modelo', label: 'modelo_helix.py' },
                { id: 'datos', label: 'datos_helix.txt' },
                { id: 'requirements', label: 'requirements.txt' },
              ] as { id: RepoTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRepoTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  repoTab === tab.id
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopy(repoFileName, repoFileContent)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {copiedKey === repoFileName ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copiar {repoFileName}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => downloadTextFile(repoFileName, repoFileContent)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar
            </button>
          </div>
        </div>

        <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100">
          {repoFileContent}
        </pre>

        {/* Pasos de ejecución local */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
          <div className="font-semibold text-slate-900">Ejecución local en tu equipo (CPU o GPU NVIDIA):</div>
          <div className="mt-2 grid gap-2 font-mono text-[11px] sm:grid-cols-3">
            <div className="rounded bg-white px-3 py-2 border border-slate-200">
              1. pip install -r requirements.txt
            </div>
            <div className="rounded bg-white px-3 py-2 border border-slate-200">
              2. Guarda datos_helix.txt + modelo_helix.py
            </div>
            <div className="rounded bg-white px-3 py-2 border border-slate-200">
              3. python modelo_helix.py
            </div>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}

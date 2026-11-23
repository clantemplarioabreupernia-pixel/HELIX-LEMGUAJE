import { ChangeEvent, useMemo, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FilePlus2,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { RUNES, RUNE_BY_GLYPH } from '../data/runes';
import { CompoundWord } from '../data/vocabulary';
import { computeCompositeColorFromPrimes } from '../utils/primeColor';
import {
  CellTarget,
  computeGodelString,
  DEFAULT_HELIX_CELLS,
  HelixCell,
  makeSignedCell,
  parseHlxCellFile,
  resignHelixCell,
  serializeHlxCellFile,
  verifyCellsForProgram,
} from '../utils/helixCells';
import { PrimeColorSwatch } from './PrimeColorSwatch';

interface CellTemplatesSectionProps {
  cells: HelixCell[];
  vocabulary: CompoundWord[];
  onSaveCell: (cell: HelixCell) => void;
  onDeleteCell: (fileName: string) => void;
  onResetAllCells: () => void;
  onTestCellInVm?: (sampleScriptLine: string) => void;
}

const TARGET_META: { id: CellTarget; label: string; hint: string }[] = [
  {
    id: 'js',
    label: 'JS (ESM)',
    hint: 'Snippet ejecutable sobre hlxState dentro de runHelixCells()',
  },
  {
    id: 'glsl',
    label: 'Shader GLSL',
    hint: 'Operaciones de fragmento GLSL ES 3.00 sobre accum, v_uv y u_time',
  },
  {
    id: 'go',
    label: 'Función Go',
    hint: 'Sentencias Go dentro de func main() + funciones auxiliares en @decls.go',
  },
  {
    id: 'html',
    label: 'HTML5',
    hint: 'Fragmento visual autónomo para documento ensamblado',
  },
];

const PLACEHOLDER_TOKENS = [
  { token: '{{LINE}}', desc: 'Número de línea AST' },
  { token: '{{GLYPHS}}', desc: 'Glifos de la instrucción' },
  { token: '{{OPCODE}}', desc: 'Nombre de opcode' },
  { token: '{{ARG0}}', desc: 'Primer argumento' },
  { token: '{{ARG1}}', desc: 'Segundo argumento' },
  { token: '{{ARGS}}', desc: 'Todos los argumentos' },
  { token: '{{COLOR_HEX}}', desc: 'Color Capa 6 (#RRGGBB)' },
  { token: '{{COLOR_VEC3}}', desc: 'Color GLSL vec3(r,g,b)' },
  { token: '{{JS_ARG0_EXPR}}', desc: 'Arg0 JS (literal o var)' },
  { token: '{{ARG0_NUM_OR_VAR}}', desc: 'Arg0 Go (num o hlxVars)' },
];

const DEFAULT_CELL_ID_SET = new Set(DEFAULT_HELIX_CELLS.map((c) => c.fileName));

function buildBlankCellDraft(existingCount: number): HelixCell {
  const suffix = existingCount + 1;
  const glyphs = 'ᚠᛉ';
  return makeSignedCell({
    id: `custom_op_${suffix}`,
    fileName: `custom_op_${suffix}.hlx`,
    glyphs,
    opcode: `CUSTOM_OP_${suffix}`,
    description: 'Plantilla simbólica personalizada definida por el usuario.',
    imports: { go: ['fmt'] },
    decls: {
      go: `func hlxCustomOp${suffix}(arg string) {\n\tfmt.Printf("[CUSTOM_OP_${suffix}] arg=%s\\n", arg)\n}`,
      glsl: `vec3 hlx_custom_op_${suffix}(vec2 uv, vec3 tint, float t) {\n  float ring = smoothstep(0.04, 0.0, abs(length(uv - 0.5) - 0.25));\n  return tint * ring * (0.7 + 0.3 * sin(t * 2.0));\n}`,
      js: `function hlxCustomOp${suffix}(state, arg) {\n  state.trace.push("CUSTOM_OP_${suffix} arg=" + arg);\n}`,
    },
    codeBlocks: {
      js: `hlxCustomOp${suffix}(hlxState, "{{ARG0}}");`,
      glsl: `accum += hlx_custom_op_${suffix}(v_uv, {{COLOR_VEC3}}, u_time);`,
      go: `hlxCustomOp${suffix}("{{ARG0}}")`,
      html: `<li data-cell="custom_op_${suffix}.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} {{OPCODE}}</strong><span>{{ARGS}}</span></li>`,
    },
  });
}

export function CellTemplatesSection({
  cells,
  vocabulary,
  onSaveCell,
  onDeleteCell,
  onResetAllCells,
  onTestCellInVm,
}: CellTemplatesSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<string>(
    () => cells[0]?.fileName ?? 'kern_boot.hlx',
  );
  const [draft, setDraft] = useState<HelixCell>(() => cells[0] ?? DEFAULT_HELIX_CELLS[0]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [target, setTarget] = useState<CellTarget>('js');
  const [showRawHlx, setShowRawHlx] = useState(false);
  const [showRunePicker, setShowRunePicker] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copiedRaw, setCopiedRaw] = useState(false);

  const filteredCells = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cells;
    return cells.filter(
      (c) =>
        c.fileName.toLowerCase().includes(q) ||
        c.opcode.toLowerCase().includes(q) ||
        c.glyphs.includes(q) ||
        c.description.toLowerCase().includes(q),
    );
  }, [cells, search]);

  const selectExistingCell = (cell: HelixCell) => {
    setIsCreatingNew(false);
    setSelectedFile(cell.fileName);
    setDraft(cell);
    setStatusMsg(null);
  };

  const handleCreateNew = () => {
    const fresh = buildBlankCellDraft(cells.length);
    setIsCreatingNew(true);
    setSelectedFile(fresh.fileName);
    setDraft(fresh);
    setStatusMsg(null);
  };

  const handleLinkFromVocabulary = (wordId: string) => {
    const word = vocabulary.find((w) => w.id === wordId);
    if (!word) return;
    const cleanOpcode = word.opcode.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const cleanFile = `${cleanOpcode.toLowerCase()}.hlx`;
    const existing = cells.find(
      (c) => c.opcode.toUpperCase() === cleanOpcode || c.fileName === cleanFile,
    );
    if (existing) {
      selectExistingCell(existing);
      setStatusMsg({
        type: 'ok',
        text: `Célula "${existing.fileName}" ya existe para ${cleanOpcode}; cargada para edición.`,
      });
      return;
    }
    setDraft((prev) => ({
      ...prev,
      id: cleanOpcode.toLowerCase(),
      fileName: cleanFile,
      glyphs: word.glyphs,
      opcode: cleanOpcode,
      godelProduct: computeGodelString(word.glyphs),
      description: word.osInstruction,
    }));
    setStatusMsg(null);
  };

  // Compute live signed candidate & security verification
  const signedCandidate = useMemo(() => {
    const normalizedOpcode = draft.opcode.trim().toUpperCase() || 'CUSTOM_OP';
    const rawFile = draft.fileName.trim() || `${normalizedOpcode.toLowerCase()}.hlx`;
    const normalizedFile = rawFile.endsWith('.hlx') ? rawFile : `${rawFile}.hlx`;
    return resignHelixCell({
      ...draft,
      id: normalizedFile.replace(/\.hlx$/i, ''),
      fileName: normalizedFile,
      opcode: normalizedOpcode,
      glyphs: draft.glyphs || 'ᚠ',
    });
  }, [draft]);

  const securityFindings = useMemo(
    () => verifyCellsForProgram([signedCandidate]),
    [signedCandidate],
  );
  const isSafeToSign = securityFindings.length === 0;

  const symbolicInfo = useMemo(() => {
    const tokens = Array.from(draft.glyphs)
      .map((g) => RUNE_BY_GLYPH.get(g))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    const primes = tokens.map((t) => t.prime);
    const color = computeCompositeColorFromPrimes(
      primes.length > 0 ? primes : [RUNES[0].prime],
    );
    const godel = computeGodelString(draft.glyphs);
    const phoneme = tokens.map((t) => t.phoneme).join(' ');
    return { tokens, color, godel, phoneme };
  }, [draft.glyphs]);

  const isDirty = useMemo(() => {
    if (isCreatingNew) return true;
    const stored = cells.find((c) => c.fileName === selectedFile);
    if (!stored) return true;
    return (
      stored.cellSha256 !== signedCandidate.cellSha256 ||
      stored.description !== signedCandidate.description
    );
  }, [cells, isCreatingNew, selectedFile, signedCandidate]);

  const handleSave = () => {
    if (!isSafeToSign) {
      setStatusMsg({
        type: 'err',
        text: securityFindings[0]?.detail ?? 'Violación de sandbox detectada.',
      });
      return;
    }
    onSaveCell(signedCandidate);
    setIsCreatingNew(false);
    setSelectedFile(signedCandidate.fileName);
    setDraft(signedCandidate);
    setStatusMsg({
      type: 'ok',
      text: `Plantilla "${signedCandidate.fileName}" firmada (SHA-256 ${signedCandidate.cellSha256.slice(0, 12)}…) y enlazada al ensamblador puro.`,
    });
  };

  const handleUploadHlx = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsed = parseHlxCellFile(content);
      if (!parsed.hashMatched) {
        setStatusMsg({
          type: 'err',
          text: `Integridad rechazada en "${file.name}": el SHA-256 declarado no coincide.`,
        });
        return;
      }
      const findings = verifyCellsForProgram([parsed.cell]);
      if (findings.length > 0) {
        setStatusMsg({ type: 'err', text: findings[0].detail });
        return;
      }
      onSaveCell(parsed.cell);
      setIsCreatingNew(false);
      setSelectedFile(parsed.cell.fileName);
      setDraft(parsed.cell);
      setStatusMsg({
        type: 'ok',
        text: `Célula "${parsed.cell.fileName}" importada y verificada correctamente.`,
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadHlx = () => {
    const raw = serializeHlxCellFile(signedCandidate);
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = signedCandidate.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyRawHlx = async () => {
    await navigator.clipboard.writeText(serializeHlxCellFile(signedCandidate));
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 1600);
  };

  const handleInsertPlaceholder = (token: string) => {
    setDraft((prev) => ({
      ...prev,
      codeBlocks: {
        ...prev.codeBlocks,
        [target]: `${prev.codeBlocks[target]}${prev.codeBlocks[target].endsWith(' ') || prev.codeBlocks[target] === '' ? '' : ' '}${token}`,
      },
    }));
  };

  const rawHlxPreview = useMemo(
    () => serializeHlxCellFile(signedCandidate),
    [signedCandidate],
  );

  const isDefaultCell = DEFAULT_CELL_ID_SET.has(signedCandidate.fileName);
  const currentTargetMeta = TARGET_META.find((t) => t.id === target) ?? TARGET_META[0];

  return (
    <section
      id="plantillas-celula-hlx"
      className="rounded-lg border border-slate-200 bg-white p-6 space-y-6"
    >
      {/* Subsection Header */}
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-blue-700" />
            <span className="text-xs font-medium text-blue-700">
              Subsección · Mapeo Simbólico → Implementación Ejecutable
            </span>
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            Plantillas de Célula (.hlx) ({cells.length} activas)
          </h2>
          <p className="max-w-3xl text-xs leading-relaxed text-slate-600">
            Define o edita cómo cada unidad simbólica (glifo + opcode + producto de Gödel) se
            traduce a su bloque ejecutable real en JavaScript, shader GLSL, función Go o fragmento
            HTML. Los cambios firmados quedan disponibles inmediatamente en el ensamblador puro
            del Módulo F.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCreateNew}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            Nueva célula .hlx
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            Importar .hlx
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".hlx,.txt"
            onChange={handleUploadHlx}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => {
              onResetAllCells();
              const base = DEFAULT_HELIX_CELLS[0];
              setIsCreatingNew(false);
              setSelectedFile(base.fileName);
              setDraft(base);
              setStatusMsg({
                type: 'ok',
                text: `Biblioteca restaurada a las ${DEFAULT_HELIX_CELLS.length} células .hlx originales.`,
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar base
          </button>
        </div>
      </div>

      {/* Main Split Grid: Cell Catalog (Left) + Mapping Editor (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Search & Cell List */}
        <div className="space-y-3 lg:col-span-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar opcode, glifo o .hlx..."
              aria-label="Buscar plantilla de célula .hlx"
              className="w-full rounded-md border border-slate-300 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="max-h-[540px] space-y-1.5 overflow-y-auto pr-1">
            {filteredCells.map((cell) => {
              const active = !isCreatingNew && cell.fileName === selectedFile;
              const isCustom = !DEFAULT_CELL_ID_SET.has(cell.fileName);
              return (
                <button
                  key={cell.fileName}
                  type="button"
                  onClick={() => selectExistingCell(cell)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-50 text-blue-950'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{cell.glyphs}</span>
                      <span className="truncate font-mono text-xs font-semibold text-blue-700">
                        {cell.opcode}
                      </span>
                      {isCustom && (
                        <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                          custom
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                      {cell.fileName} · Gödel={cell.godelProduct}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">
                    {cell.cellSha256.slice(0, 6)}
                  </span>
                </button>
              );
            })}
            {filteredCells.length === 0 && (
              <p className="rounded border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                No hay células que coincidan con «{search}».
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Symbolic Identity + Low-level Target Implementation */}
        <div className="space-y-4 lg:col-span-8">
          {/* 1. Symbolic Logic Identity Card */}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                1 · Lógica Simbólica Asociada
              </span>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="hlx-vocab-link"
                  className="text-[11px] text-slate-500 whitespace-nowrap"
                >
                  Vincular desde léxico:
                </label>
                <select
                  id="hlx-vocab-link"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleLinkFromVocabulary(e.target.value);
                  }}
                  className="rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] text-slate-800 focus:border-blue-600 focus:outline-none"
                >
                  <option value="">Seleccionar instrucción...</option>
                  {vocabulary.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.glyphs} · {w.opcode} ({w.osInstruction.slice(0, 28)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="cell-glyphs" className="text-[11px] font-medium text-slate-700">
                    Glifos simbólicos
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowRunePicker((v) => !v)}
                    className="text-[11px] font-medium text-blue-700 hover:underline"
                  >
                    {showRunePicker ? 'Ocultar runas' : '+ Paleta 33 runas'}
                  </button>
                </div>
                <input
                  id="cell-glyphs"
                  type="text"
                  value={draft.glyphs}
                  onChange={(e) => setDraft((p) => ({ ...p, glyphs: e.target.value }))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="cell-opcode"
                  className="mb-1 block text-[11px] font-medium text-slate-700"
                >
                  Opcode del SO
                </label>
                <input
                  id="cell-opcode"
                  type="text"
                  value={draft.opcode}
                  onChange={(e) => {
                    const nextOp = e.target.value.toUpperCase();
                    setDraft((p) => ({
                      ...p,
                      opcode: nextOp,
                      fileName: isCreatingNew
                        ? `${nextOp.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'custom'}.hlx`
                        : p.fileName,
                    }));
                  }}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="cell-filename"
                  className="mb-1 block text-[11px] font-medium text-slate-700"
                >
                  Archivo de célula (.hlx)
                </label>
                <input
                  id="cell-filename"
                  type="text"
                  value={draft.fileName}
                  onChange={(e) => setDraft((p) => ({ ...p, fileName: e.target.value }))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            {showRunePicker && (
              <div className="flex flex-wrap gap-1 rounded border border-slate-200 bg-white p-2">
                {RUNES.map((r) => (
                  <button
                    key={r.index}
                    type="button"
                    title={`${r.name} (p=${r.prime}, ${r.osTag})`}
                    onClick={() => setDraft((p) => ({ ...p, glyphs: `${p.glyphs}${r.glyph}` }))}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-800 hover:border-blue-500 hover:bg-blue-50"
                  >
                    <span>{r.glyph}</span>
                    <span className="text-[10px] text-slate-500">{r.prime}</span>
                  </button>
                ))}
              </div>
            )}

            <div>
              <label
                htmlFor="cell-desc"
                className="mb-1 block text-[11px] font-medium text-slate-700"
              >
                Descripción semántica
              </label>
              <input
                id="cell-desc"
                type="text"
                value={draft.description}
                onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Live Gödel + Phoneme + Layer-6 Color Readout */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 pt-2.5 font-mono text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <PrimeColorSwatch hex={symbolicInfo.color.colorHex} size={12} />
                Capa 6: {symbolicInfo.color.colorHex} ({symbolicInfo.color.hueDeg}°)
              </span>
              <span>Gödel: {symbolicInfo.godel}</span>
              <span>AFI: {symbolicInfo.phoneme || '—'}</span>
              <span>SHA-256: {signedCandidate.cellSha256.slice(0, 12)}…</span>
            </div>
          </div>

          {/* 2. Low-level Executable Mapping Card */}
          <div className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-slate-800">
                  2 · Implementación de Bajo Nivel por Destino
                </span>
                <p className="text-[11px] text-slate-500">{currentTargetMeta.hint}</p>
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-md bg-slate-100 p-1">
                {TARGET_META.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTarget(t.id)}
                    className={`rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      target === t.id
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Go imports when Go tab active */}
            {target === 'go' && (
              <div>
                <label
                  htmlFor="cell-go-imports"
                  className="mb-1 block text-[11px] font-medium text-slate-700"
                >
                  Paquetes Go (<code className="font-mono">@imports.go</code>, separados por coma)
                </label>
                <input
                  id="cell-go-imports"
                  type="text"
                  value={(draft.imports.go ?? []).join(', ')}
                  onChange={(e) => {
                    const list = e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    setDraft((p) => ({
                      ...p,
                      imports: {
                        ...p.imports,
                        go: list,
                      },
                    }));
                  }}
                  placeholder="Ej: fmt, math"
                  className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>
            )}

            {/* Auxiliary declarations / functions (@decls.*) */}
            {target !== 'html' && (
              <div>
                <label
                  htmlFor="cell-decls-editor"
                  className="mb-1 block text-[11px] font-medium text-slate-700"
                >
                  Declaraciones o funciones auxiliares (<code className="font-mono">@decls.{target}</code>)
                </label>
                <textarea
                  id="cell-decls-editor"
                  rows={3}
                  spellCheck={false}
                  value={draft.decls[target] ?? ''}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      decls: {
                        ...p.decls,
                        [target]: e.target.value,
                      },
                    }))
                  }
                  placeholder={
                    target === 'go'
                      ? 'Ej: func miFuncion(x float64) float64 { return x * 2 }'
                      : target === 'glsl'
                        ? 'Ej: vec3 mi_efecto(vec2 uv, vec3 c) { return c * uv.x; }'
                        : 'Ej: function miHelper(state, v) { state.trace.push(v); }'
                  }
                  className="w-full rounded border border-slate-300 bg-slate-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-100 focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            {/* Main executable block (@target *) */}
            <div>
              <label
                htmlFor="cell-code-editor"
                className="mb-1 block text-[11px] font-medium text-slate-700"
              >
                Bloque de código ejecutable (<code className="font-mono">@target {target}</code>)
              </label>
              <textarea
                id="cell-code-editor"
                rows={5}
                spellCheck={false}
                value={draft.codeBlocks[target]}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    codeBlocks: {
                      ...p.codeBlocks,
                      [target]: e.target.value,
                    },
                  }))
                }
                className="w-full rounded border border-slate-300 bg-slate-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-100 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Placeholder Chips */}
            <div className="space-y-1.5">
              <span className="block text-[11px] font-medium text-slate-600">
                Marcadores simbólicos disponibles (clic para insertar en el bloque):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PLACEHOLDER_TOKENS.map((item) => (
                  <button
                    key={item.token}
                    type="button"
                    title={item.desc}
                    onClick={() => handleInsertPlaceholder(item.token)}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-700 hover:border-blue-500 hover:bg-blue-50"
                  >
                    {item.token}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Security Check, Save, Export & Raw Preview */}
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2.5 text-xs ${
              isSafeToSign
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            <span className="inline-flex items-center gap-1.5 font-medium">
              {isSafeToSign ? (
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
              ) : (
                <ShieldAlert className="h-4 w-4 shrink-0 text-red-700" />
              )}
              {isSafeToSign
                ? isDirty
                  ? `Listo para firmar SHA-256 (${signedCandidate.cellSha256.slice(0, 12)}…)`
                  : `Plantilla íntegra y sincronizada (${signedCandidate.cellSha256.slice(0, 12)}…)`
                : securityFindings[0]?.detail}
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
              {!isDefaultCell && !isCreatingNew && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteCell(signedCandidate.fileName);
                    const next =
                      cells.find((c) => c.fileName !== signedCandidate.fileName) ??
                      DEFAULT_HELIX_CELLS[0];
                    setSelectedFile(next.fileName);
                    setDraft(next);
                    setStatusMsg({
                      type: 'ok',
                      text: `Célula personalizada "${signedCandidate.fileName}" eliminada.`,
                    });
                  }}
                  className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 whitespace-nowrap shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                  Eliminar
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowRawHlx((v) => !v)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {showRawHlx ? 'Ocultar .hlx' : 'Ver formato .hlx'}
              </button>

              <button
                type="button"
                onClick={handleDownloadHlx}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Download className="h-3 w-3" />
                Descargar .hlx
              </button>

              {onTestCellInVm && (
                <button
                  type="button"
                  disabled={!isSafeToSign}
                  onClick={() => {
                    if (isDirty) handleSave();
                    const sampleLine = `${signedCandidate.opcode} ${
                      signedCandidate.opcode === 'SET'
                        ? 'x 32'
                        : signedCandidate.opcode === 'AUTH_CHECK'
                          ? 'sys_admin'
                          : 'demo_arg'
                    }`;
                    onTestCellInVm(`ᛇᚢ\n${sampleLine}\nᚳᛏ`);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-50 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <Play className="h-3 w-3" />
                  Probar en Módulo F
                </button>
              )}

              <button
                type="button"
                disabled={!isSafeToSign}
                onClick={handleSave}
                className="rounded bg-emerald-700 px-3 py-1 text-[11px] font-medium text-white hover:bg-emerald-800 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                Firmar y guardar plantilla .hlx
              </button>
            </div>
          </div>

          {statusMsg && (
            <div
              className={`rounded border px-3 py-2 text-xs ${
                statusMsg.type === 'ok'
                  ? 'border-blue-200 bg-blue-50 text-blue-900'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {statusMsg.text}
            </div>
          )}

          {showRawHlx && (
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-semibold text-slate-700">
                  {signedCandidate.fileName} (formato portable firmado)
                </span>
                <button
                  type="button"
                  onClick={handleCopyRawHlx}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  {copiedRaw ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copiar .hlx
                    </>
                  )}
                </button>
              </div>
              <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                {rawHlxPreview}
              </pre>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, FileCode, RotateCcw, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import { ParsedScriptInstruction } from '../utils/helixVm';
import {
  assemblePureFromCells,
  CellTarget,
  DEFAULT_HELIX_CELLS,
  HelixCell,
  parseHlxCellFile,
  resignHelixCell,
  serializeHlxCellFile,
} from '../utils/helixCells';

interface PureCellAssemblerPanelProps {
  instructions: ParsedScriptInstruction[];
  cells?: HelixCell[];
  onChangeCells?: (updater: HelixCell[] | ((prev: HelixCell[]) => HelixCell[])) => void;
  onResetCells?: () => void;
}

const TARGET_EXT: Record<CellTarget, string> = {
  go: 'helix_pure.go',
  glsl: 'helix_pure.frag',
  js: 'helix_pure.mjs',
  html: 'helix_pure.html',
};

export function PureCellAssemblerPanel({
  instructions,
  cells: controlledCells,
  onChangeCells,
  onResetCells,
}: PureCellAssemblerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [internalCells, setInternalCells] = useState<HelixCell[]>(() => DEFAULT_HELIX_CELLS);
  const cells = controlledCells ?? internalCells;
  const setCells = onChangeCells ?? setInternalCells;
  const [target, setTarget] = useState<CellTarget>('go');
  const [selectedFile, setSelectedFile] = useState<string>('kern_boot.hlx');
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const assembly = useMemo(
    () => assemblePureFromCells(instructions, cells, target),
    [instructions, cells, target],
  );

  const activeCell = useMemo(() => {
    const matchInUsed = assembly.usedCells.find((c) => c.fileName === selectedFile);
    return matchInUsed ?? assembly.usedCells[0] ?? cells[0];
  }, [assembly.usedCells, cells, selectedFile]);

  const displayedBlock = editDraft ?? activeCell.codeBlocks[target];

  const handleSelectCell = (fileName: string) => {
    setSelectedFile(fileName);
    setEditDraft(null);
    setImportError(null);
  };

  const handleChangeTarget = (next: CellTarget) => {
    setTarget(next);
    setEditDraft(null);
  };

  const handleSaveCellEdit = () => {
    if (editDraft === null) return;
    setCells((prev) =>
      prev.map((c) => {
        if (c.fileName !== activeCell.fileName) return c;
        return resignHelixCell({
          ...c,
          codeBlocks: {
            ...c.codeBlocks,
            [target]: editDraft,
          },
        });
      }),
    );
    setEditDraft(null);
  };

  const handleDownloadHlxCell = () => {
    const raw = serializeHlxCellFile(activeCell);
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeCell.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUploadHlxCell = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsed = parseHlxCellFile(content);
      if (!parsed.hashMatched) {
        setImportError(
          `Integridad rechazada en "${file.name}": el SHA-256 declarado no coincide con los bloques de código.`,
        );
        return;
      }
      setImportError(null);
      setCells((prev) => {
        const exists = prev.some((c) => c.opcode === parsed.cell.opcode || c.fileName === parsed.cell.fileName);
        if (exists) {
          return prev.map((c) =>
            c.opcode === parsed.cell.opcode || c.fileName === parsed.cell.fileName ? parsed.cell : c,
          );
        }
        return [parsed.cell, ...prev];
      });
      setSelectedFile(parsed.cell.fileName);
      setEditDraft(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadPureOutput = () => {
    const blob = new Blob([assembly.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = TARGET_EXT[target];
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(assembly.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-blue-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Ensamblador Puro por Células .hlx (Go · GLSL · JS · HTML)
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Cada instrucción enlaza directamente su propia célula{' '}
            <code className="font-mono text-slate-800">.hlx</code> firmada con SHA-256, sin
            plantillas monolíticas fijas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['go', 'glsl', 'js', 'html'] as CellTarget[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleChangeTarget(t)}
              className={`rounded px-2.5 py-1 font-mono text-xs font-medium uppercase transition-colors whitespace-nowrap shrink-0 ${
                target === t
                  ? 'bg-blue-700 text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Used .hlx Cells Bar */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-700">
            Células .hlx enlazadas ({assembly.usedCells.length})
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (onResetCells) {
                  onResetCells();
                } else {
                  setCells(DEFAULT_HELIX_CELLS);
                }
                setEditDraft(null);
                setImportError(null);
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3 w-3" />
              Restaurar células
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Upload className="h-3 w-3" />
              Importar .hlx
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".hlx,.txt"
              onChange={handleUploadHlxCell}
              className="hidden"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {assembly.usedCells.map((cell) => {
            const active = cell.fileName === activeCell.fileName;
            return (
              <button
                key={cell.fileName}
                type="button"
                onClick={() => handleSelectCell(cell.fileName)}
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{cell.glyphs}</span>
                <span>{cell.fileName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected .hlx Cell Editor */}
      {activeCell && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-mono font-semibold text-slate-900">{activeCell.fileName}</span>
              <span className="ml-2 text-slate-500">
                opcode <code className="font-mono">{activeCell.opcode}</code> · Gödel={activeCell.godelProduct} · sha256={activeCell.cellSha256.slice(0, 10)}…
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {editDraft !== null && (
                <button
                  type="button"
                  onClick={handleSaveCellEdit}
                  className="rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
                >
                  Firmar y aplicar célula .hlx
                </button>
              )}
              <button
                type="button"
                onClick={handleDownloadHlxCell}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Download className="h-3 w-3" />
                Descargar .hlx
              </button>
            </div>
          </div>

          <textarea
            aria-label={`Bloque ${target.toUpperCase()} de ${activeCell.fileName}`}
            rows={4}
            spellCheck={false}
            value={displayedBlock}
            onChange={(e) => setEditDraft(e.target.value)}
            className="w-full rounded border border-slate-300 bg-slate-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-100 focus:border-blue-600 focus:outline-none"
          />
        </div>
      )}

      {/* Security / Integrity Verification Banner */}
      {importError && (
        <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-xs ${
          assembly.valid
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-red-200 bg-red-50 text-red-900'
        }`}
      >
        <span className="inline-flex items-center gap-1.5 font-medium">
          {assembly.valid ? (
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-red-700" />
          )}
          {assembly.valid
            ? `Células .hlx íntegras y verificadas (Manifest ${assembly.manifestSha256.slice(0, 12)}…)`
            : assembly.securityFindings[0]?.detail}
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button
            type="button"
            disabled={!assembly.valid}
            onClick={handleDownloadPureOutput}
            className="inline-flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Download className="h-3 w-3" />
            Descargar {TARGET_EXT[target]}
          </button>
        </div>
      </div>

      {/* Assembled Pure Output */}
      <pre className="max-h-72 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-3.5 font-mono text-[11px] leading-relaxed text-slate-100">
        {assembly.code}
      </pre>
    </div>
  );
}

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Copy,
  Check,
  Download,
  Play,
} from 'lucide-react';
import {
  emitTargetCode,
  LEGACY_PRESETS,
  LegacyLanguage,
  TargetLanguage,
  transpileLegacyCode,
} from '../utils/legacyTranspiler';
import { PrimeColorSwatch } from './PrimeColorSwatch';

interface TranspilerViewProps {
  onOpenInParser: (glyphs: string) => void;
  onOpenInVm: (helixScript: string) => void;
}

const DIALECTS: LegacyLanguage[] = [
  'COBOL',
  'C',
  'Pascal',
  'Assembler',
  'Python',
  'Go',
  'Helix',
];

const TARGET_LANGUAGES: TargetLanguage[] = [
  'Helix',
  'Go',
  'Python',
  'TypeScript',
  'C',
  'Rust',
];

const TARGET_EXTENSIONS: Record<TargetLanguage, string> = {
  Helix: 'helix',
  Go: 'go',
  Python: 'py',
  TypeScript: 'ts',
  C: 'c',
  Rust: 'rs',
};

export function TranspilerView({ onOpenInParser, onOpenInVm }: TranspilerViewProps) {
  const [dialect, setDialect] = useState<LegacyLanguage>('Python');
  const [targetLang, setTargetLang] = useState<TargetLanguage>('Helix');
  const [sourceCode, setSourceCode] = useState<string>(LEGACY_PRESETS.Python);
  const [copiedTarget, setCopiedTarget] = useState(false);

  const report = useMemo(
    () => transpileLegacyCode(dialect, sourceCode),
    [dialect, sourceCode],
  );

  const emittedCode = useMemo(
    () => emitTargetCode(report, targetLang),
    [report, targetLang],
  );

  const handleDialectChange = (next: LegacyLanguage) => {
    setDialect(next);
    setSourceCode(LEGACY_PRESETS[next]);
  };

  const handleCopyTarget = async () => {
    await navigator.clipboard.writeText(emittedCode);
    setCopiedTarget(true);
    setTimeout(() => setCopiedTarget(false), 1800);
  };

  const handleDownloadTarget = () => {
    const ext = TARGET_EXTENSIONS[targetLang];
    const blob = new Blob([emittedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `helix_transpiled.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const canRunInVm =
    report.statements.length > 0 &&
    report.rejectedCount === 0 &&
    report.structuralErrors.length === 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-blue-700">
          Módulo E · Transpilador determinista bidireccional (AST / Helix IR / Multi-objetivo)
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
          Traducción multi-lenguaje con verificación estructural y emisión a código ejecutable
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Analiza un subconjunto estructurado de COBOL, C, Pascal, Assembler, Python, Go o Helix
          (asignaciones, aritmética entera, fracciones en el subanillo P33, bucles acotados hasta
          100 iteraciones, bloques IF/ELSE, copias hasta 1024 B y E/S), genera su representación
          intermedia con contratos y la re-emite en 6 lenguajes destino o hacia la VM.
        </p>
      </div>

      {/* Editor + Target Emitter Split */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Source Panel */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              {DIALECTS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleDialectChange(d)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    dialect === d
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
              <span className="text-emerald-700">
                Verificadas: {report.verifiedCount}
              </span>
              <span className="text-slate-300" aria-hidden="true">|</span>
              <span className="text-amber-700">
                Rechazadas: {report.rejectedCount}
              </span>
            </div>
          </div>

          <label
            htmlFor="legacy-source"
            className="mb-1.5 block text-xs font-medium text-slate-700"
          >
            Código fuente de entrada ({dialect})
          </label>
          <textarea
            id="legacy-source"
            rows={10}
            value={sourceCode}
            onChange={(e) => setSourceCode(e.target.value)}
            spellCheck={false}
            className="w-full rounded-md border border-slate-300 bg-slate-900 p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:border-blue-600 focus:outline-none"
          />

          {report.structuralErrors.length > 0 && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
              <div className="font-semibold">Errores de estructura AST:</div>
              <ul className="mt-1 space-y-0.5 font-mono">
                {report.structuralErrors.map((err, idx) => (
                  <li key={`${err}-${idx}`}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Target Emitter Panel */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              {TARGET_LANGUAGES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTargetLang(t)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    targetLang === t
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyTarget}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {copiedTarget ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadTarget}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                .{TARGET_EXTENSIONS[targetLang]}
              </button>
              <button
                type="button"
                disabled={!canRunInVm}
                onClick={() => onOpenInVm(report.helixScriptOutput)}
                title={
                  canRunInVm
                    ? 'Enviar el programa Helix generado al Módulo F y ejecutarlo en la VM'
                    : 'Corrige las sentencias rechazadas antes de enviar a la VM'
                }
                className="inline-flex items-center gap-1.5 rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5" />
                Ejecutar en VM
              </button>
            </div>
          </div>

          <p className="mb-1.5 text-xs font-medium text-slate-700">
            Código emitido en {targetLang} desde Helix IR
          </p>
          <pre className="h-[222px] overflow-auto rounded-md border border-slate-300 bg-slate-900 p-3.5 font-mono text-xs leading-relaxed text-slate-100">
            {emittedCode}
          </pre>
        </section>
      </div>

      {/* IR Audit Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-4 py-3 text-right">Línea</th>
                <th className="px-4 py-3">Origen ({dialect})</th>
                <th className="px-4 py-3">Helix IR / Contrato</th>
                <th className="px-4 py-3">Opcode</th>
                <th className="px-4 py-3 text-right">Firma Gödel / Posicional</th>
                <th className="px-4 py-3">Estado estático</th>
                <th className="px-4 py-3 text-right">Inspección</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.statements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    Escribe al menos una sentencia válida en {dialect} para transpilarla a Helix IR.
                  </td>
                </tr>
              ) : (
                report.statements.map((stmt) => (
                  <tr key={`${stmt.lineNumber}-${stmt.source}`} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-500 tabular-nums">
                      {stmt.lineNumber}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs font-medium text-slate-900">
                        {stmt.source}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{stmt.opKind}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-slate-900">{stmt.helixIr}</div>
                      <div className="mt-1 font-mono text-[11px] text-slate-500">
                        req: {stmt.contractPre} · ens: {stmt.contractPost}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-900">
                        <PrimeColorSwatch hex={stmt.colorHex} size={11} />
                        <span>{stmt.helixGlyphs}</span>
                      </div>
                      <div className="font-mono text-xs font-medium text-blue-700">
                        {stmt.helixOpcode}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                      <div>G: {stmt.godelSignature}</div>
                      <div className="text-[11px] text-slate-500">{stmt.positionalSignature}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          stmt.status === 'VERIFICADO'
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {stmt.status === 'VERIFICADO' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span>{stmt.status}</span>
                      </div>
                      <p className="mt-1 max-w-xs text-xs text-slate-600">{stmt.diagnostic}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenInParser(stmt.helixGlyphs)}
                        title="Abrir tokens en el analizador sintáctico"
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700 whitespace-nowrap shrink-0"
                      >
                        Parser
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Copy, Check, Download, FileArchive, Braces } from 'lucide-react';
import { HELIX_OPERATORS, RUNES } from '../data/runes';
import { CompoundWord } from '../data/vocabulary';
import { downloadAllSourceCodeTxt, getAllSourceFiles } from '../utils/exportSource';
import { buildHelixDnaDocument, HELIX_ECOSYSTEM_MODULES } from '../utils/helixDna';
import { DEFAULT_HELIX_CELLS, HelixCell } from '../utils/helixCells';
import { CellTemplatesSection } from './CellTemplatesSection';
import { CellDependencyGraphSection } from './CellDependencyGraphSection';
import { GoSiliconBridgePanel } from './GoSiliconBridgePanel';
import { downloadHelixSiliconGoZip } from '../utils/helixGoDistribution';

type SpecSubView = 'all' | 'graph' | 'templates' | 'layers';

interface SpecificationViewProps {
  vocabulary: CompoundWord[];
  onExportJson: () => void;
  cells?: HelixCell[];
  currentVmScript?: string;
  onSaveCell?: (cell: HelixCell) => void;
  onDeleteCell?: (fileName: string) => void;
  onResetAllCells?: () => void;
  onTestCellInVm?: (sampleScript: string) => void;
}

export function SpecificationView({
  vocabulary,
  onExportJson,
  cells,
  currentVmScript,
  onSaveCell,
  onDeleteCell,
  onResetAllCells,
  onTestCellInVm,
}: SpecificationViewProps) {
  const [subView, setSubView] = useState<SpecSubView>('all');
  const [localCells, setLocalCells] = useState<HelixCell[]>(() => DEFAULT_HELIX_CELLS);
  const activeCells = cells ?? localCells;
  const handleSaveCell =
    onSaveCell ??
    ((nextCell: HelixCell) =>
      setLocalCells((prev) => {
        const exists = prev.some(
          (c) => c.fileName === nextCell.fileName || c.opcode === nextCell.opcode,
        );
        return exists
          ? prev.map((c) =>
              c.fileName === nextCell.fileName || c.opcode === nextCell.opcode ? nextCell : c,
            )
          : [nextCell, ...prev];
      }));
  const handleDeleteCell =
    onDeleteCell ??
    ((fileName: string) =>
      setLocalCells((prev) => prev.filter((c) => c.fileName !== fileName)));
  const handleResetCells = onResetAllCells ?? (() => setLocalCells(DEFAULT_HELIX_CELLS));
  const [codeLang, setCodeLang] = useState<'python' | 'typescript'>('python');
  const [copied, setCopied] = useState(false);

  const pythonStarter = `# Helix OS — Módulo base de 33 tokens, Gödel y Color Procedural H(p)
from dataclasses import dataclass
from math import prod
import colorsys
from typing import List

GOLDEN_ANGLE = 137.50776405003785

@dataclass(frozen=True)
class RuneToken:
    index: int
    glyph: str
    name: str
    phoneme: str
    prime: int
    freq_hz: float
    role: str
    opcode: str
    color_hex: str

def derive_prime_color(prime: int) -> str:
    hue_deg = (prime * GOLDEN_ANGLE) % 360.0
    r, g, b = colorsys.hls_to_rgb(hue_deg / 360.0, 0.41, 0.72)
    return f"#{round(r * 255):02X}{round(g * 255):02X}{round(b * 255):02X}"

RUNES = [
${RUNES.slice(0, 6)
  .map(
    (r) =>
      `    RuneToken(${r.index}, "${r.glyph}", "${r.name}", "${r.phoneme}", ${r.prime}, ${r.frequencyHz.toFixed(4)}, "${r.role}", "${r.osTag}", "${r.colorHex}"),`,
  )
  .join('\n')}
    # ... 33 tokens completos en la exportación JSON
]

BY_GLYPH = {r.glyph: r for r in RUNES}

def encode_godel(glyphs: str) -> int:
    return prod(BY_GLYPH[ch].prime for ch in glyphs if ch in BY_GLYPH)

def decode_godel(value: int) -> List[RuneToken]:
    out: List[RuneToken] = []
    remaining = value
    for rune in RUNES:
        while remaining % rune.prime == 0:
            out.append(rune)
            remaining //= rune.prime
    if remaining != 1:
        raise ValueError(f"Residuo fuera del alfabeto base: {remaining}")
    return out
`;

  const tsStarter = `// Helix OS — Módulo base de 33 tokens, Gödel y Color Procedural H(p)
export interface RuneToken {
  index: number;
  glyph: string;
  name: string;
  phoneme: string;
  prime: number;
  freqHz: number;
  role: 'Entidad' | 'Operación' | 'Modificador';
  opcode: string;
  colorHex: string;
  hueDeg: number;
}

export function computePrimeHueGolden(prime: number): number {
  return Number(((prime * 137.50776405003785) % 360).toFixed(2));
}

export const RUNES_SAMPLE: RuneToken[] = [
${RUNES.slice(0, 6)
  .map(
    (r) =>
      `  { index: ${r.index}, glyph: '${r.glyph}', name: '${r.name}', phoneme: '${r.phoneme}', prime: ${r.prime}, freqHz: ${r.frequencyHz.toFixed(4)}, role: '${r.role}', opcode: '${r.osTag}', colorHex: '${r.colorHex}', hueDeg: ${r.hueDeg} },`,
  )
  .join('\n')}
  // ... 33 tokens completos en la exportación JSON
];

export function encodeGodel(tokens: RuneToken[]): bigint {
  return tokens.reduce((acc, t) => acc * BigInt(t.prime), 1n);
}
`;

  const activeSnippet = codeLang === 'python' ? pythonStarter : tsStarter;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadHelixDna = () => {
    const doc = buildHelixDnaDocument(vocabulary);
    const blob = new Blob([JSON.stringify(doc, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'helix.dna.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium text-blue-700">Módulo D · Especificación unificada (6 capas · A + B + C + D)</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
            Arquitectura completa de 6 capas del lenguaje Helix
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
            Manual técnico consolidado de las seis capas de representación (glifo visual, fonema,
            número primo, frecuencia acústica, opcode en el sistema operativo y color procedural por
            ángulo áureo), las reglas de renderizado y dirección de lectura, el léxico activo (
            {vocabulary.length} instrucciones) y el código base listo para integrar en tu shell o
            kernel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => downloadHelixSiliconGoZip(currentVmScript)}
            className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-100 whitespace-nowrap shrink-0"
          >
            <FileArchive className="h-4 w-4 text-blue-700" />
            Descargar Go Silicio (.ZIP)
          </button>
          <button
            type="button"
            onClick={downloadAllSourceCodeTxt}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <FileArchive className="h-4 w-4 text-blue-700" />
            Descargar código fuente ({getAllSourceFiles().length} archivos)
          </button>
          <button
            type="button"
            onClick={handleDownloadHelixDna}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Braces className="h-4 w-4 text-blue-700" />
            Exportar helix.dna
          </button>
          <button
            type="button"
            onClick={onExportJson}
            className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4" />
            Exportar especificación JSON
          </button>
        </div>
      </div>

      {/* Sub-view Switcher inside Module D */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5">
        {(
          [
            { id: 'all', label: 'Vista completa' },
            { id: 'graph', label: 'Grafo de Dependencias (D3)' },
            { id: 'templates', label: 'Plantillas de Célula (.hlx)' },
            { id: 'layers', label: 'Capas y Operadores' },
          ] as { id: SpecSubView; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubView(tab.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              subView === tab.id
                ? 'bg-blue-700 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(subView === 'all' || subView === 'graph') && (
        <CellDependencyGraphSection
          cells={activeCells}
          vocabulary={vocabulary}
          currentVmScript={currentVmScript}
          onOpenChainInVm={onTestCellInVm}
        />
      )}

      {(subView === 'all' || subView === 'layers') && (
        <>
          {/* 6 Layers Matrix */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-blue-700">Capa 1 · Glifo vectorial (SVG)</div>
          <h2 className="mt-1 text-base font-semibold text-slate-900">Forma visual</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            El símbolo gráfico (ej. ᚠ) actúa como ancla visual. Se renderiza en SVG escalable, con
            lectura horizontal (Izq → Der) o vertical (Arriba ↓ Abajo), en trazado secuencial o
            enlazado.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Capa 2 · Fonética</div>
          <h2 className="mt-1 text-base font-semibold text-slate-900">Transcripción fonética (AFI)</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Cada glifo asigna un fonema AFI único (/f/, /u/, /θ/...). Permite pronunciar comandos
            compuestos y construir interfaces de voz o trazas audibles legibles.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Capa 3 · Numérica</div>
          <h2 className="mt-1 text-base font-semibold text-slate-900">Codificación de Gödel</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Los 33 primos (2 al 137) garantizan por el teorema fundamental de la aritmética que todo
            multiconjunto de tokens tenga un identificador entero factorizable de forma única,
            desambiguado en orden por firma posicional FNV-1a.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Capa 4 · Acústica</div>
          <h2 className="mt-1 text-base font-semibold text-slate-900">Señalización en Hz</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Cada token mapea una frecuencia audible (261.63 Hz – 519.16 Hz) para generar tonos de
            confirmación, alertas del kernel o retroalimentación auditiva en el sistema operativo.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Capa 5 · Semántica de ejecución</div>
          <h2 className="mt-1 text-base font-semibold text-slate-900">Roles y Opcodes del SO</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Asocia cada símbolo a su rol gramatical (Entidad, Operación o Modificador) y tag
            tipado para compilar sentencias directamente a llamadas de memoria, procesos, seguridad y E/S.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-blue-700">Capa 6 · Cromática (Procedural)</div>
          <h2 className="mt-1 text-base font-semibold text-slate-900">Color primo y síntesis circular</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Cada primo p genera un matiz único mediante H(p) = (p × 137.507764°) mod 360°. Para
            frases compuestas, el color se sintetiza al vuelo por media vectorial circular atan2(∑sin, ∑cos).
          </p>
        </div>
      </section>

      {/* Visual Rendering, Writing & Reading Direction Spec */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Renderizado en pantalla</div>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">Gráfico vectorial SVG</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Cada token se dibuja dentro de una celda proporcional con guías de alineación y salida
            directa a SVG para utilizarse en interfaces gráficas del SO, terminales o documentación.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Escritura y combinación</div>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">Secuencial o Enlazada</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            En modo secuencial los glifos mantienen separación uniforme; en modo enlazado (compuesto)
            se compactan sobre un eje común para distinguir instrucciones de dos o más tokens como
            unidad atómica.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Dirección de lectura</div>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">Horizontal (LTR) y Vertical (TTB)</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Las sentencias se leen de izquierda a derecha en consola de comandos o de arriba hacia
            abajo en paneles laterales, barras de estado y listados de instrucciones.
          </p>
        </div>
      </section>

      {/* Operators Reference */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          Operadores estructurales y semántica de ejecución
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-4 py-2.5">Símbolo</th>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Significado en el SO</th>
                <th className="px-4 py-2.5">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {HELIX_OPERATORS.map((op) => (
                <tr key={op.symbol}>
                  <td className="px-4 py-2.5 font-mono text-lg font-semibold text-blue-700">
                    {op.symbol}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{op.name}</td>
                  <td className="px-4 py-2.5 text-slate-700">{op.osMeaning}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{op.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modular Ecosystem Dispatch & Trust Boundaries */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Frontera de contratos y arquitectura modular ({HELIX_ECOSYSTEM_MODULES.length} artefactos)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Flujo de confianza: helix_agent (intención) → Parser AST → helix-verify (validación estática) → helix-memory / runtime.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-4 py-2.5">Módulo / Binario</th>
                <th className="px-4 py-2.5">Rol</th>
                <th className="px-4 py-2.5">Nivel de confianza</th>
                <th className="px-4 py-2.5">Responsabilidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {HELIX_ECOSYSTEM_MODULES.map((mod) => (
                <tr key={mod.binary}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">
                    {mod.binary}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-medium text-slate-900">{mod.role}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{mod.trustBoundary}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{mod.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
        </>
      )}

      {(subView === 'all' || subView === 'templates') && (
        <CellTemplatesSection
          cells={activeCells}
          vocabulary={vocabulary}
          onSaveCell={handleSaveCell}
          onDeleteCell={handleDeleteCell}
          onResetAllCells={handleResetCells}
          onTestCellInVm={onTestCellInVm}
        />
      )}

      {(subView === 'all' || subView === 'layers') && (
        <>
          {/* Starter Code */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Implementación base del codificador y parser
            </h2>
            <p className="text-xs text-slate-500">
              Fragmento listo para copiar en Python o TypeScript para tu sistema operativo.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setCodeLang('python')}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  codeLang === 'python'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Python
              </button>
              <button
                type="button"
                onClick={() => setCodeLang('typescript')}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  codeLang === 'typescript'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                TypeScript
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copiar código
                </>
              )}
            </button>
          </div>
        </div>

        <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">
          {activeSnippet}
        </pre>
      </section>

      <GoSiliconBridgePanel activeScript={currentVmScript} />
        </>
      )}
    </div>
  );
}

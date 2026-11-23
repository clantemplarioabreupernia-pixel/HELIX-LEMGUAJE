import { useRef, useState } from 'react';
import { Download, Grid } from 'lucide-react';
import { ParsedToken } from '../utils/helixEngine';
import { CompositeColorResult } from '../utils/primeColor';
import { PrimeColorSwatch } from './PrimeColorSwatch';

interface GlyphCanvasProps {
  tokens: ParsedToken[];
  rawExpression: string;
  compositeColor: CompositeColorResult;
}

type ReadingDirection = 'ltr' | 'ttb';
type WritingMode = 'sequential' | 'bound';
type ColorRenderMode = 'prime' | 'mono';

export function GlyphCanvas({
  tokens,
  rawExpression,
  compositeColor,
}: GlyphCanvasProps) {
  const [direction, setDirection] = useState<ReadingDirection>('ltr');
  const [writingMode, setWritingMode] = useState<WritingMode>('sequential');
  const [colorMode, setColorMode] = useState<ColorRenderMode>('prime');
  const [showGrid, setShowGrid] = useState(true);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const visibleTokens = tokens.filter((t) => t.kind !== 'unknown');
  const runeTokens = visibleTokens.filter((t) => t.kind === 'rune' && t.rune);
  const count = Math.max(visibleTokens.length, 1);

  const cellSize = writingMode === 'bound' ? 54 : 64;
  const padding = 28;
  const width =
    direction === 'ltr'
      ? Math.max(360, padding * 2 + count * cellSize)
      : 220;
  const height =
    direction === 'ttb'
      ? Math.max(210, padding * 2 + count * cellSize)
      : 176;

  const spineColor = colorMode === 'prime' ? compositeColor.colorHex : '#1D4ED8';

  const handleDownloadSvg = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `helix-glifo-${rawExpression || 'vacio'}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Renderizado visual procedural (Capas 1 y 6)
          </h3>
          <p className="text-xs text-slate-500">
            Geometría vectorial derivada y firma cromática por ángulo áureo H(p).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setColorMode('prime')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                colorMode === 'prime'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Color primo
            </button>
            <button
              type="button"
              onClick={() => setColorMode('mono')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                colorMode === 'mono'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monocromo
            </button>
          </div>

          <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setDirection('ltr')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                direction === 'ltr'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Izq → Der
            </button>
            <button
              type="button"
              onClick={() => setDirection('ttb')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                direction === 'ttb'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Arriba ↓ Abajo
            </button>
          </div>

          <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setWritingMode('sequential')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                writingMode === 'sequential'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Secuencial
            </button>
            <button
              type="button"
              onClick={() => setWritingMode('bound')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                writingMode === 'bound'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Enlazado
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowGrid((g) => !g)}
            title="Mostrar u ocultar cuadrícula técnica"
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              showGrid
                ? 'border-blue-200 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Grid className="h-3.5 w-3.5" />
            Guías
          </button>

          <button
            type="button"
            disabled={visibleTokens.length === 0}
            onClick={handleDownloadSvg}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            SVG
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-4">
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Renderizado visual de ${rawExpression || 'expresión vacía'}`}
          className="max-w-full"
        >
          <rect width={width} height={height} fill="#F8FAFC" rx="6" />

          {showGrid && (
            <g stroke="#E2E8F0" strokeWidth="1">
              {direction === 'ltr' ? (
                <>
                  <line x1={padding} y1={height / 2 - 4} x2={width - padding} y2={height / 2 - 4} strokeDasharray="4 4" />
                  <line x1={padding} y1={height / 2 - 32} x2={width - padding} y2={height / 2 - 32} />
                  <line x1={padding} y1={height / 2 + 24} x2={width - padding} y2={height / 2 + 24} />
                </>
              ) : (
                <>
                  <line x1={width / 2} y1={padding} x2={width / 2} y2={height - padding} strokeDasharray="4 4" />
                  <line x1={width / 2 - 28} y1={padding} x2={width / 2 - 28} y2={height - padding} />
                  <line x1={width / 2 + 28} y1={padding} x2={width / 2 + 28} y2={height - padding} />
                </>
              )}
            </g>
          )}

          {/* Unifying spine for bound / ligature writing mode */}
          {writingMode === 'bound' && visibleTokens.length > 1 && (
            direction === 'ltr' ? (
              <line
                x1={padding + cellSize / 2}
                y1={height / 2 + 20}
                x2={padding + (visibleTokens.length - 1) * cellSize + cellSize / 2}
                y2={height / 2 + 20}
                stroke={spineColor}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            ) : (
              <line
                x1={width / 2 - 28}
                y1={padding + cellSize / 2}
                x2={width / 2 - 28}
                y2={padding + (visibleTokens.length - 1) * cellSize + cellSize / 2}
                stroke={spineColor}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )
          )}

          {visibleTokens.length === 0 ? (
            <text
              x={width / 2}
              y={height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#94A3B8"
              fontSize="13"
              fontFamily="Public Sans, system-ui, sans-serif"
            >
              Sin glifos válidos
            </text>
          ) : (
            visibleTokens.map((tok, i) => {
              const cx =
                direction === 'ltr'
                  ? padding + i * cellSize + cellSize / 2
                  : width / 2;
              const cy =
                direction === 'ttb'
                  ? padding + i * cellSize + cellSize / 2
                  : height / 2 - 4;

              const isOp = tok.kind === 'operator';
              const glyphFill =
                colorMode === 'prime'
                  ? isOp
                    ? compositeColor.colorHex
                    : tok.rune?.colorHex ?? '#0F172A'
                  : isOp
                    ? '#1D4ED8'
                    : '#0F172A';

              return (
                <g key={`${tok.raw}-${i}`}>
                  {showGrid && (
                    <rect
                      x={cx - 22}
                      y={cy - 24}
                      width="44"
                      height="48"
                      fill="none"
                      stroke={colorMode === 'prime' && tok.rune ? tok.rune.colorHex : '#CBD5E1'}
                      strokeOpacity={colorMode === 'prime' && tok.rune ? 0.35 : 1}
                      strokeWidth="0.9"
                      strokeDasharray={isOp ? undefined : '2 2'}
                      rx="3"
                    />
                  )}

                  {/* Procedural geometric anchor above/behind operators */}
                  {isOp && colorMode === 'prime' && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="16"
                      fill="none"
                      stroke={compositeColor.colorHex}
                      strokeOpacity="0.25"
                      strokeWidth="1.5"
                    />
                  )}

                  {/* Prime color dot marker on each token */}
                  {tok.rune && colorMode === 'prime' && (
                    <circle
                      cx={cx + 16}
                      cy={cy - 18}
                      r="3"
                      fill={tok.rune.colorHex}
                    />
                  )}

                  <text
                    x={cx}
                    y={cy - 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={glyphFill}
                    fontSize={isOp ? '22' : '32'}
                    fontWeight="600"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {tok.raw}
                  </text>
                  <text
                    x={cx}
                    y={cy + 34}
                    textAnchor="middle"
                    fill="#64748B"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {tok.rune ? `p=${tok.rune.prime}` : tok.operatorSymbol}
                  </text>
                </g>
              );
            })
          )}

          {/* Procedural prime spectral DNA bar along bottom of SVG */}
          {colorMode === 'prime' && runeTokens.length > 0 && (
            <g aria-label="Banda cromática procedural">
              {runeTokens.map((tok, idx) => {
                const barWidth = width - padding * 2;
                const segW = barWidth / runeTokens.length;
                return (
                  <rect
                    key={`band-${idx}`}
                    x={padding + idx * segW}
                    y={height - 14}
                    width={Math.max(1, segW - 1)}
                    height="5"
                    rx="1"
                    fill={tok.rune?.colorHex ?? '#94A3B8'}
                  />
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {runeTokens.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <PrimeColorSwatch hex={compositeColor.colorHex} size={14} />
            <span className="font-mono tabular-nums">
              Síntesis circular: {compositeColor.colorHex} · H̄={compositeColor.hueDeg}° · R={compositeColor.coherence}
            </span>
          </div>
          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
            {runeTokens.length} {runeTokens.length === 1 ? 'banda prima' : 'bandas primas'}
          </span>
        </div>
      )}
    </div>
  );
}

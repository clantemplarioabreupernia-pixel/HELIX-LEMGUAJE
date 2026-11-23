import { useMemo } from 'react';
import { CheckCircle2, AlertTriangle, Play, Delete, RotateCcw } from 'lucide-react';
import { HELIX_OPERATORS, RUNES } from '../data/runes';
import { CompoundWord } from '../data/vocabulary';
import { playFrequencySequence } from '../utils/audio';
import { formatBigIntGrouped, parseHelixPhrase } from '../utils/helixEngine';
import { computeCompositeColorFromPrimes } from '../utils/primeColor';
import { GlyphCanvas } from './GlyphCanvas';
import { PrimeColorSwatch } from './PrimeColorSwatch';

interface SyntaxParserViewProps {
  expression: string;
  onChangeExpression: (next: string) => void;
  vocabulary: CompoundWord[];
}

const PRESETS = [
  { label: 'Asignar y proteger memoria', glyphs: 'ᚠᚢᚦ' },
  { label: 'Despachar hilo inmutable', glyphs: 'ᚱᚳᛥ' },
  { label: 'Validar usuario y despertar servicio', glyphs: 'ᛗᚦ⊗ᛢᛣ' },
  { label: 'Combinar flujo y verificar registro', glyphs: 'ᚩᛖ⊕ᛚᚣ⊡ᛣ' },
  { label: 'Liberar recurso al finalizar', glyphs: 'ᚳᛏ⊖ᚠᛠ' },
];

export function SyntaxParserView({
  expression,
  onChangeExpression,
  vocabulary,
}: SyntaxParserViewProps) {
  const parsed = useMemo(
    () => parseHelixPhrase(expression, vocabulary),
    [expression, vocabulary],
  );

  const appendToken = (symbol: string) => {
    onChangeExpression(expression + symbol);
  };

  const handleBackspace = () => {
    const chars = Array.from(expression);
    chars.pop();
    onChangeExpression(chars.join(''));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-blue-700">Módulo B · Sintaxis, gramática y compilador</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
          Gramática formal de frases y analizador sintáctico
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Las frases de Helix siguen una estructura posicional de tres roles (Entidad, Operación,
          Modificador) y admiten composición mediante operadores infijos (⊕, ⊗, ⊖, ⊡) para construir
          instrucciones complejas del sistema operativo.
        </p>
      </div>

      {/* Grammar Specification Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Regla 1 · Token y Lexema Binario</h2>
          <p className="mt-1.5 font-mono text-xs text-slate-700">
            {'<Lexema> ::= <Token> | <Token><Token>'}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            1 token referencia un registro o recurso atómico. 2 tokens conforman una instrucción
            compuesta de operación binaria.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Regla 2 · Sentencia del Sistema (3+ tokens)</h2>
          <p className="mt-1.5 font-mono text-xs text-slate-700">
            {'<Sentencia> ::= <Entidad> <Operación> <Modificador>*'}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Tres o más tokens declaran el destino, la instrucción a ejecutar y las banderas de
            restricción (permisos, bloqueo o inmutabilidad).
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Regla 3 · Expresión con Operadores</h2>
          <p className="mt-1.5 font-mono text-xs text-slate-700">
            {'<Expr> ::= <Cláusula> ( (⊕|⊗|⊖|⊡) <Cláusula> )*'}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Conecta múltiples cláusulas en tuberías, composiciones estrictas, liberaciones o
            verificaciones de invariantes.
          </p>
        </div>
      </div>

      {/* Interactive Editor + Output */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Input & Virtual Keypad */}
        <div className="space-y-4 xl:col-span-7">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="helix-expr" className="text-sm font-semibold text-slate-900">
                Editor de sentencias Helix
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <Delete className="h-3.5 w-3.5" />
                  Borrar
                </button>
                <button
                  type="button"
                  onClick={() => onChangeExpression('')}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Limpiar
                </button>
                <button
                  type="button"
                  disabled={parsed.frequenciesHz.length === 0}
                  onClick={() => playFrequencySequence(parsed.frequenciesHz)}
                  className="inline-flex items-center gap-1.5 rounded bg-blue-700 px-3 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <Play className="h-3.5 w-3.5" />
                  Reproducir
                </button>
              </div>
            </div>

            <input
              id="helix-expr"
              type="text"
              value={expression}
              onChange={(e) => onChangeExpression(e.target.value)}
              placeholder="Introduce o selecciona tokens simbólicos (ej. ᚠᚢᚦ)"
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 font-mono text-2xl tracking-wider text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            />

            {/* Presets */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.glyphs}
                  type="button"
                  onClick={() => onChangeExpression(preset.glyphs)}
                  className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 whitespace-nowrap shrink-0"
                >
                  <span className="font-mono font-semibold">{preset.glyphs}</span> · {preset.label}
                </button>
              ))}
            </div>

            {/* Operators Row */}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-medium text-slate-600">Operadores estructurales</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {HELIX_OPERATORS.map((op) => (
                  <button
                    key={op.symbol}
                    type="button"
                    onClick={() => appendToken(op.symbol)}
                    className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left transition-colors hover:border-blue-400 hover:bg-blue-50"
                  >
                    <span className="font-mono text-lg font-semibold text-blue-700">
                      {op.symbol}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-slate-900">{op.name}</div>
                      <div className="truncate text-[11px] text-slate-500">{op.osMeaning}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 33-Rune Virtual Keypad */}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-medium text-slate-600">
                Matriz de 33 tokens primitivos (clic para insertar)
              </p>
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
                {RUNES.map((rune) => (
                  <button
                    key={rune.glyph}
                    type="button"
                    onClick={() => appendToken(rune.glyph)}
                    title={`${rune.name} · ${rune.phoneme} · Primo ${rune.prime} · ${rune.osTag}`}
                    className="flex flex-col items-center justify-center rounded border border-slate-200 bg-white py-2 transition-colors hover:border-blue-500 hover:bg-blue-50"
                  >
                    <span className="font-mono text-lg font-medium text-slate-900">
                      {rune.glyph}
                    </span>
                    <span className="text-[10px] text-slate-500 truncate max-w-full px-1">
                      {rune.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <GlyphCanvas
            tokens={parsed.tokens}
            rawExpression={expression}
            compositeColor={parsed.compositeColor}
          />
        </div>

        {/* Right: AST, Compilation & Verification */}
        <div className="space-y-4 xl:col-span-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-semibold text-slate-900">Resultado del análisis</h2>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  parsed.isValid ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {parsed.isValid ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {parsed.category}
              </span>
            </div>

            {/* Key metrics */}
            <dl className="mt-4 divide-y divide-slate-100 text-sm">
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-slate-500">Lectura fonética</dt>
                <dd className="font-mono text-xs font-medium text-slate-900">
                  {parsed.phoneticReading || '—'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-slate-500">Cadena mnemotécnica</dt>
                <dd className="text-right font-mono text-xs font-medium text-slate-900">
                  {parsed.literalGloss || '—'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-slate-500">Factores primos</dt>
                <dd className="text-right font-mono text-xs text-slate-700 tabular-nums">
                  {parsed.primeFactors.length > 0 ? parsed.primeFactors.join(' × ') : '—'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-slate-500">Producto de Gödel</dt>
                <dd className="text-right font-mono text-xs font-semibold text-blue-700 tabular-nums break-all">
                  {parsed.runes.length > 0 ? formatBigIntGrouped(BigInt(parsed.godelProduct)) : '—'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-slate-500">Firma posicional (orden)</dt>
                <dd className="text-right font-mono text-xs text-slate-700 tabular-nums">
                  {parsed.runes.length > 0 ? parsed.positionalSignature : '—'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-slate-500">Media armónica (Hz)</dt>
                <dd className="font-mono text-xs text-slate-700 tabular-nums">
                  {parsed.harmonicMeanHz ? `${parsed.harmonicMeanHz.toFixed(2)} Hz` : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <dt className="text-xs text-slate-500">Color compuesto (Capa 6)</dt>
                <dd className="flex items-center gap-2 font-mono text-xs text-slate-700 tabular-nums">
                  {parsed.runes.length > 0 ? (
                    <>
                      <PrimeColorSwatch hex={parsed.compositeColor.colorHex} size={14} />
                      <span>
                        {parsed.compositeColor.colorHex} · H̄={parsed.compositeColor.hueDeg}°
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>

            {/* Compiled OS Pseudocode */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="mb-1.5 text-xs font-medium text-slate-600">
                Traducción a pseudocódigo del sistema operativo
              </p>
              <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-900 p-3 font-mono text-xs text-slate-100">
                {parsed.compiledPseudocode || 'Esperando secuencia válida'}
              </pre>
            </div>

            {/* AST Clauses Breakdown */}
            {parsed.clauses.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-medium text-slate-600">
                  Árbol sintáctico por cláusula ({parsed.clauses.length})
                </p>
                <div className="space-y-2.5">
                  {parsed.clauses.map((clause, idx) => {
                    const clauseColor = computeCompositeColorFromPrimes(
                      clause.tokens.map((t) => t.prime),
                    );
                    return (
                      <div
                        key={idx}
                        className="rounded border border-slate-200 bg-slate-50 p-3 text-xs"
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2 font-mono font-semibold text-slate-800">
                          <span>
                            Cláusula {idx + 1}: {clause.tokens.map((t) => t.glyph).join('')}
                          </span>
                          <span className="inline-flex items-center gap-1.5 font-normal text-[11px] text-slate-600">
                            <PrimeColorSwatch hex={clauseColor.colorHex} size={12} />
                            {clauseColor.colorHex}
                          </span>
                        </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-500">Entidad: </span>
                          <span className="font-mono font-medium text-slate-900">
                            {clause.subject ? `${clause.subject.glyph} ${clause.subject.osTag}` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Operación: </span>
                          <span className="font-mono font-medium text-slate-900">
                            {clause.operation ? `${clause.operation.glyph} ${clause.operation.osTag}` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Flags: </span>
                          <span className="font-mono font-medium text-slate-900">
                            {clause.modifiers.length > 0
                              ? clause.modifiers.map((m) => `${m.glyph} ${m.osTag}`).join(', ')
                              : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Diagnostics */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <ul className="space-y-1 text-xs text-slate-600">
                {parsed.validationNotes.map((note, i) => (
                  <li key={i}>• {note}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

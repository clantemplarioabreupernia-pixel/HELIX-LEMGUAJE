import { useMemo, useState } from 'react';
import { RefreshCw, Plus, Play, Check, AlertCircle, ArrowRight } from 'lucide-react';
import { OsSubsystem } from '../data/runes';
import { CompoundWord } from '../data/vocabulary';
import { playFrequencySequence } from '../utils/audio';
import {
  computeCompositeColor,
  factorizeGodelNumber,
  formatBigIntGrouped,
  GeneratedProposal,
  generateProposalsForSubsystem,
} from '../utils/helixEngine';
import { PrimeColorSwatch } from './PrimeColorSwatch';

interface GeneratorViewProps {
  vocabulary: CompoundWord[];
  onAddWord: (word: CompoundWord) => void;
  onOpenInParser: (glyphs: string) => void;
}

const SUBSYSTEMS: OsSubsystem[] = [
  'Memoria',
  'Kernel',
  'Procesos',
  'Seguridad',
  'Entrada/Salida',
  'Planificador',
];

const QUICK_PRIMES = [
  { label: '6 (ᚠᚢ)', value: '6' },
  { label: '30 (ᚠᚢᚦ)', value: '30' },
  { label: '143 (ᚱᚳ)', value: '143' },
  { label: '2310 (ᚠᚢᚦᚩᚱ)', value: '2310' },
  { label: '10033 (ᛜᛣ)', value: '10033' },
];

export function GeneratorView({
  vocabulary,
  onAddWord,
  onOpenInParser,
}: GeneratorViewProps) {
  const [subsystem, setSubsystem] = useState<OsSubsystem>('Memoria');
  const [seedOffset, setSeedOffset] = useState(0);
  const [savedGlyphs, setSavedGlyphs] = useState<Set<string>>(new Set());

  // Inverse Gödel decoder state
  const [godelInput, setGodelInput] = useState('30');

  const proposals = useMemo(
    () => generateProposalsForSubsystem(subsystem, vocabulary, seedOffset),
    [subsystem, vocabulary, seedOffset],
  );

  const decoded = useMemo(
    () => factorizeGodelNumber(godelInput),
    [godelInput],
  );

  const handleSaveProposal = (p: GeneratedProposal) => {
    const newWord: CompoundWord = {
      id: `gen-${Date.now()}-${p.glyphs}`,
      glyphs: p.glyphs,
      compoundName: p.compoundName,
      literalGloss: p.literalGloss,
      osInstruction: p.osInstruction,
      opcode: p.opcode,
      subsystem: p.subsystem,
      custom: true,
    };
    onAddWord(newWord);
    setSavedGlyphs((prev) => new Set(prev).add(p.glyphs));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-blue-700">Módulo C · Síntesis léxica y decodificación aritmética</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
          Síntesis combinatoria de opcodes y factorización prima
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          El motor combinatorio empareja tokens compatibles por rol gramatical (Entidad + Operación/Modificador),
          verifica unicidad en el léxico mediante firma prima de Gödel y permite decodificar cualquier
          entero compuesto por los 33 primos base en su secuencia exacta de tokens.
        </p>
      </div>

      {/* Part 1: Combinatorial Generator */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-5 flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              1. Generador de instrucciones sin colisión
            </h2>
            <p className="text-xs text-slate-500">
              Selecciona un subsistema del sistema operativo para sintetizar nuevos pares de tokens.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSeedOffset((s) => s + 1)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Generar nuevas combinaciones
          </button>
        </div>

        {/* Subsystem selector */}
        <div className="mb-5 flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {SUBSYSTEMS.map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => {
                setSubsystem(sub);
                setSeedOffset(0);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                subsystem === sub
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>

        {/* Proposals Grid */}
        {proposals.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
            Todas las combinaciones directas para este subsistema ya están registradas en el léxico activo.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {proposals.map((item) => {
              const isSaved =
                savedGlyphs.has(item.glyphs) ||
                vocabulary.some((v) => v.glyphs === item.glyphs);
              return (
                <div
                  key={item.glyphs}
                  className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-2xl font-semibold text-slate-900">
                        {item.glyphs}
                      </span>
                      <span className="font-mono text-xs font-medium text-blue-700">
                        {item.opcode}
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-900">
                      {item.compoundName}
                    </div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-xs text-slate-500 tabular-nums">
                      <PrimeColorSwatch hex={item.colorHex} size={12} />
                      <span>
                        {item.colorHex} · {item.phoneme} · Gödel {formatBigIntGrouped(BigInt(item.godelProduct))}
                      </span>
                    </div>
                    <p className="mt-2.5 text-xs leading-relaxed text-slate-600">
                      {item.osInstruction}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200/80 pt-3">
                    <button
                      type="button"
                      onClick={() => onOpenInParser(item.glyphs)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-700 whitespace-nowrap shrink-0"
                    >
                      Probar en parser
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      disabled={isSaved}
                      onClick={() => handleSaveProposal(item)}
                      className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        isSaved
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-blue-700 text-white hover:bg-blue-800'
                      }`}
                    >
                      {isSaved ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Guardada
                        </>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5" />
                          Guardar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Part 2: Inverse Gödel Decoder */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4 border-b border-slate-100 pb-4">
          <h2 className="text-base font-semibold text-slate-900">
            2. Decodificador inverso de Gödel (Entero → Secuencia de Tokens)
          </h2>
          <p className="text-xs text-slate-500">
            Introduce un número entero para factorizarlo sobre los 33 primos base y reconstruir su
            expresión simbólica en Helix.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            inputMode="numeric"
            value={godelInput}
            onChange={(e) => setGodelInput(e.target.value)}
            placeholder="Ej. 30 o 2310"
            className="w-full rounded-md border border-slate-300 bg-slate-50 px-3.5 py-2 font-mono text-base text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none sm:max-w-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PRIMES.map((qp) => (
              <button
                key={qp.value}
                type="button"
                onClick={() => setGodelInput(qp.value)}
                className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50 whitespace-nowrap shrink-0"
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
          {decoded.valid ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <PrimeColorSwatch
                    hex={computeCompositeColor(decoded.runes).colorHex}
                    size={16}
                  />
                  <span className="font-mono text-2xl font-semibold text-slate-900">
                    {decoded.runes.map((r) => r.glyph).join('')}
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    {decoded.runes.map((r) => r.name).join('-')}
                  </span>
                </div>
                <div className="font-mono text-xs text-slate-600 tabular-nums">
                  Factorización: {decoded.runes.map((r) => r.prime).join(' × ')} · Fonema:{' '}
                  /{decoded.runes.map((r) => r.phoneme.replaceAll('/', '')).join('')}/ · Color{' '}
                  {computeCompositeColor(decoded.runes).colorHex}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    playFrequencySequence(decoded.runes.map((r) => r.frequencyHz))
                  }
                  className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <Play className="h-3.5 w-3.5" />
                  Escuchar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onOpenInParser(decoded.runes.map((r) => r.glyph).join(''))
                  }
                  className="inline-flex items-center gap-1.5 rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
                >
                  Abrir en parser
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{decoded.error}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

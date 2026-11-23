import { useMemo, useState } from 'react';
import { Play, Plus, Search, Trash2, ArrowRight } from 'lucide-react';
import { OsSubsystem, RUNE_BY_GLYPH, RUNES } from '../data/runes';
import { CompoundWord } from '../data/vocabulary';
import { playFrequencySequence } from '../utils/audio';
import {
  computeCompositeColor,
  computeGodelProduct,
  formatBigIntGrouped,
} from '../utils/helixEngine';
import { PrimeColorSwatch } from './PrimeColorSwatch';

interface VocabularyViewProps {
  vocabulary: CompoundWord[];
  onAddWord: (word: CompoundWord) => void;
  onRemoveWord: (id: string) => void;
  onOpenInParser: (glyphs: string) => void;
}

const SUBSYSTEMS: ('Todos' | OsSubsystem)[] = [
  'Todos',
  'Memoria',
  'Kernel',
  'Procesos',
  'Seguridad',
  'Entrada/Salida',
  'Planificador',
];

export function VocabularyView({
  vocabulary,
  onAddWord,
  onRemoveWord,
  onOpenInParser,
}: VocabularyViewProps) {
  const [search, setSearch] = useState('');
  const [subsystemFilter, setSubsystemFilter] = useState<'Todos' | OsSubsystem>('Todos');

  // New compound word builder state
  const [firstGlyph, setFirstGlyph] = useState(RUNES[0].glyph);
  const [secondGlyph, setSecondGlyph] = useState(RUNES[6].glyph);
  const [osInstruction, setOsInstruction] = useState('');
  const [opcode, setOpcode] = useState('');
  const [newSubsystem, setNewSubsystem] = useState<OsSubsystem>('Memoria');
  const [formError, setFormError] = useState<string | null>(null);

  const firstRune = RUNE_BY_GLYPH.get(firstGlyph) ?? RUNES[0];
  const secondRune = RUNE_BY_GLYPH.get(secondGlyph) ?? RUNES[1];
  const previewGlyphs = `${firstRune.glyph}${secondRune.glyph}`;
  const previewGodel = computeGodelProduct([firstRune, secondRune]);
  const previewColor = computeCompositeColor([firstRune, secondRune]);
  const previewPhoneme = `/${firstRune.phoneme.replaceAll('/', '')}${secondRune.phoneme.replaceAll('/', '')}/`;

  const filteredWords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vocabulary.filter((w) => {
      if (subsystemFilter !== 'Todos' && w.subsystem !== subsystemFilter) {
        return false;
      }
      if (!q) return true;
      return (
        w.glyphs.includes(q) ||
        w.compoundName.toLowerCase().includes(q) ||
        w.literalGloss.toLowerCase().includes(q) ||
        w.osInstruction.toLowerCase().includes(q) ||
        w.opcode.toLowerCase().includes(q)
      );
    });
  }, [vocabulary, search, subsystemFilter]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (vocabulary.some((w) => w.glyphs === previewGlyphs)) {
      setFormError(`La instrucción ${previewGlyphs} ya está registrada en el léxico.`);
      return;
    }

    const cleanInstruction = osInstruction.trim();
    const cleanOpcode = opcode.trim().toUpperCase().replace(/\s+/g, '_');

    if (!cleanInstruction || !cleanOpcode) {
      setFormError('Indica un opcode y una especificación funcional para el sistema operativo.');
      return;
    }

    const created: CompoundWord = {
      id: `custom-${Date.now()}`,
      glyphs: previewGlyphs,
      compoundName: `${firstRune.name}-${secondRune.name}`,
      literalGloss: `${firstRune.osTag.toLowerCase()} · ${secondRune.osTag.toLowerCase()}`,
      osInstruction: cleanInstruction,
      opcode: cleanOpcode,
      subsystem: newSubsystem,
      custom: true,
    };

    onAddWord(created);
    setOsInstruction('');
    setOpcode('');
  };

  const handlePlayWord = (glyphs: string) => {
    const freqs = Array.from(glyphs)
      .map((g) => RUNE_BY_GLYPH.get(g)?.frequencyHz)
      .filter((f): f is number => typeof f === 'number');
    playFrequencySequence(freqs);
  };

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-blue-700">Módulo A · Léxico de instrucciones compuestas</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
          Léxico compuesto de instrucciones binarias
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Cada instrucción compuesta combina dos tokens base. El producto de sus números primos genera
          una firma de Gödel unívoca libre de colisiones, mientras que sus fonemas y frecuencias
          definen la lectura técnica y la señalización acústica correspondiente.
        </p>
      </div>

      {/* Compound Builder */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Constructor de instrucción compuesta
            </h2>
            <p className="text-xs text-slate-500">
              Combina dos tokens base para registrar un nuevo opcode en el léxico del sistema.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <PrimeColorSwatch hex={previewColor.colorHex} size={16} />
            <span className="font-mono text-2xl font-semibold text-slate-900">{previewGlyphs}</span>
            <span className="text-slate-300" aria-hidden="true">|</span>
            <span className="font-mono text-xs text-slate-600 tabular-nums">
              {firstRune.name}-{secondRune.name} · {previewPhoneme} · Gödel {formatBigIntGrouped(previewGodel)} · {previewColor.colorHex}
            </span>
            <button
              type="button"
              onClick={() => playFrequencySequence([firstRune.frequencyHz, secondRune.frequencyHz])}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              Escuchar
            </button>
          </div>
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor="rune-1">
              Token 1 (Operando)
            </label>
            <select
              id="rune-1"
              value={firstGlyph}
              onChange={(e) => setFirstGlyph(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              {RUNES.map((r) => (
                <option key={r.glyph} value={r.glyph}>
                  {r.glyph} {r.name} (p={r.prime})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor="rune-2">
              Token 2 (Calificador)
            </label>
            <select
              id="rune-2"
              value={secondGlyph}
              onChange={(e) => setSecondGlyph(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              {RUNES.map((r) => (
                <option key={r.glyph} value={r.glyph}>
                  {r.glyph} {r.name} (p={r.prime})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor="new-subsys">
              Subsistema
            </label>
            <select
              id="new-subsys"
              value={newSubsystem}
              onChange={(e) => setNewSubsystem(e.target.value as OsSubsystem)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              {SUBSYSTEMS.filter((s) => s !== 'Todos').map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor="new-opcode">
              Opcode SO
            </label>
            <input
              id="new-opcode"
              type="text"
              placeholder="Ej. MEM_SYNC"
              value={opcode}
              onChange={(e) => setOpcode(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-4 flex flex-col justify-end gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor="new-desc">
                Acción en el sistema operativo
              </label>
              <input
                id="new-desc"
                type="text"
                placeholder="Ej. Sincronizar caché con disco"
                value={osInstruction}
                onChange={(e) => setOsInstruction(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-[38px] items-center justify-center gap-1.5 rounded-md bg-blue-700 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              Guardar
            </button>
          </div>
        </form>

        {formError && (
          <p className="mt-3 text-xs font-medium text-red-700" role="alert">
            Error: {formError}
          </p>
        )}
      </section>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {SUBSYSTEMS.map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => setSubsystemFilter(sub)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                subsystemFilter === sub
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar glifo, opcode o función..."
            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Dictionary Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-4 py-3">Glifos</th>
                <th className="px-4 py-3">Mnemotécnico</th>
                <th className="px-4 py-3">Fonema</th>
                <th className="px-4 py-3">Subsistema</th>
                <th className="px-4 py-3">Opcode</th>
                <th className="px-4 py-3">Especificación en el SO</th>
                <th className="px-4 py-3">Color</th>
                <th className="px-4 py-3 text-right">Firma Gödel</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                    No hay instrucciones compuestas que coincidan con el filtro actual.
                  </td>
                </tr>
              ) : (
                filteredWords.map((word) => {
                  const runesArr = Array.from(word.glyphs)
                    .map((g) => RUNE_BY_GLYPH.get(g))
                    .filter((r): r is NonNullable<typeof r> => Boolean(r));
                  const godel = computeGodelProduct(runesArr);
                  const compColor = computeCompositeColor(runesArr);
                  const phoneme =
                    '/' +
                    runesArr.map((r) => r.phoneme.replaceAll('/', '')).join('') +
                    '/';

                  return (
                    <tr
                      key={word.id}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <td className="px-4 py-2.5 font-mono text-lg font-semibold text-slate-900">
                        {word.glyphs}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">{word.compoundName}</div>
                        <div className="text-xs text-slate-500">{word.literalGloss}</div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                        {phoneme}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">
                        {word.subsystem}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium text-blue-700">
                        {word.opcode}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {word.osInstruction}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-700 tabular-nums">
                          <PrimeColorSwatch hex={compColor.colorHex} size={13} />
                          <span>{compColor.colorHex}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700 tabular-nums">
                        {formatBigIntGrouped(godel)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handlePlayWord(word.glyphs)}
                            title="Reproducir frecuencias"
                            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenInParser(word.glyphs)}
                            title="Abrir en el analizador sintáctico"
                            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-700"
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                          {word.custom && (
                            <button
                              type="button"
                              onClick={() => onRemoveWord(word.id)}
                              title="Eliminar instrucción personalizada"
                              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

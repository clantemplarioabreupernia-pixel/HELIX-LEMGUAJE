import { useMemo, useState } from 'react';
import { Play, Search } from 'lucide-react';
import { GrammaticalRole, PRIMITIVE_TOKENS } from '../data/runes';
import { playTone } from '../utils/audio';
import { PrimeColorSwatch } from './PrimeColorSwatch';

const ROLES: ('Todos' | GrammaticalRole)[] = [
  'Todos',
  'Entidad',
  'Operación',
  'Modificador',
];

export function RunesTableView() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'Todos' | GrammaticalRole>('Todos');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PRIMITIVE_TOKENS.filter((r) => {
      if (roleFilter !== 'Todos' && r.role !== roleFilter) return false;
      if (!q) return true;
      return (
        r.glyph.includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.meaning.toLowerCase().includes(q) ||
        r.osTag.toLowerCase().includes(q) ||
        String(r.prime) === q
      );
    });
  }, [search, roleFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-blue-700">Especificación léxica · 33 tokens primitivos</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
          Léxico base de 33 tokens, primos, frecuencias y color procedural
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Especificación de los 33 tokens simbólicos con su fonema AFI, identificador primo único,
          frecuencia de señalización en Hz, color derivado por ángulo áureo H(p), rol gramatical y
          función en el núcleo del sistema operativo.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {ROLES.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setRoleFilter(role)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                roleFilter === role
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {role}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar glifo, mnemotécnico o primo..."
            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-4 py-3 text-right">#</th>
                <th className="px-4 py-3">Glifo</th>
                <th className="px-4 py-3">Mnemotécnico</th>
                <th className="px-4 py-3">Fonema</th>
                <th className="px-4 py-3 text-right">Primo</th>
                <th className="px-4 py-3">Color primo</th>
                <th className="px-4 py-3 text-right">Frecuencia (Hz)</th>
                <th className="px-4 py-3">Rol sintáctico</th>
                <th className="px-4 py-3">Opcode SO</th>
                <th className="px-4 py-3">Especificación técnica</th>
                <th className="px-4 py-3 text-right">Señal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.index} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-2 text-right font-mono text-xs text-slate-500 tabular-nums">
                    {r.index}
                  </td>
                  <td className="px-4 py-2 font-mono text-lg font-semibold text-slate-900">
                    {r.glyph}
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-900">{r.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.phoneme}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs font-semibold text-blue-700 tabular-nums">
                    {r.prime}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
                      <PrimeColorSwatch hex={r.colorHex} size={14} />
                      <span className="text-slate-800">{r.colorHex}</span>
                      <span className="text-slate-400">{r.hueDeg.toFixed(1)}°</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-slate-700 tabular-nums">
                    {r.frequencyHz.toFixed(4)}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-700">{r.role}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.osTag}</td>
                  <td className="px-4 py-2 text-xs text-slate-600">{r.meaning}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => playTone(r.frequencyHz)}
                      title={`Escuchar ${r.frequencyHz.toFixed(2)} Hz`}
                      className="inline-flex items-center justify-center rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-700"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

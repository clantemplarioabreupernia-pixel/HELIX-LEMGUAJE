import React, { useState } from 'react';
import catalog from '../data/helix_dna_catalog.json';

export const CreatorStudioBanner: React.FC<{ onRunProgram?: (code: string) => void }> = ({ onRunProgram }) => {
  const [prompt, setPrompt] = useState('');
  const [domain, setDomain] = useState('ALL');
  const [status, setStatus] = useState('Listo · 164 células .hlx verificadas con SHA-256');
  const [listening, setListening] = useState(false);

  const cells = (catalog as any).cells || [];
  const filtered = domain === 'ALL' ? cells : cells.filter((c: any) => c.domain === domain);

  const runIntent = (text: string) => {
    const q = text.toLowerCase();
    const match = cells.find((c: any) =>
      (q.includes('mar') || q.includes('ocean') || q.includes('fluido')) ? c.domain === 'PHYSICS_FLUIDS' :
      (q.includes('espacio') || q.includes('nasa') || q.includes('radar') || q.includes('sat')) ? c.domain === 'SPACE_TELECOM' :
      (q.includes('salud') || q.includes('astro') || q.includes('audio') || q.includes('voz')) ? c.domain === 'BIOMED_AUDIO' :
      (q.includes('3d') || q.includes('cine') || q.includes('meme') || q.includes('tarjeta')) ? c.domain === 'CINEMA_3D' :
      (q.includes('finanz') || q.includes('dinero') || q.includes('banco')) ? c.domain === 'FINANCE_P33' :
      c.id.toLowerCase().includes(q)
    ) || cells[0];
    if (match) {
      setStatus(`✅ Célula activada: ${match.file} [${match.domain}] · SHA-256: ${match.sha256.slice(0, 14)}...`);
      if (onRunProgram) onRunProgram(match.code);
      fetch('http://127.0.0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text })
      }).catch(() => {});
    }
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setStatus('⚠️ Usa el cuadro de texto (navegador sin API de voz).'); return; }
    const rec = new SR();
    rec.lang = 'es-ES';
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setPrompt(t);
      runIntent(t);
    };
    rec.start();
  };

  return (
    <div className="mb-4 rounded-xl border border-cyan-500/40 bg-slate-900/90 p-4 text-slate-100 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">HELIX · MODO CREADOR DIRECTO & CATÁLOGO UNIFICADO</span>
          <h2 className="text-base font-semibold text-white">Crea por voz o texto sobre 164 células .hlx verificadas</h2>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {['ALL','CINEMA_3D','PHYSICS_FLUIDS','SPACE_TELECOM','BIOMED_AUDIO','FINANCE_P33'].map(d => (
            <button key={d} onClick={() => setDomain(d)}
              className={`px-2.5 py-1 rounded-md font-medium ${domain === d ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              {d === 'ALL' ? `Todas (${cells.length})` : d}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        <input value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && runIntent(prompt)}
          placeholder="Di o escribe qué crear: 'simulación fondo del mar', 'monitor salud astronauta', 'tarjeta 3D'..."
          className="flex-1 min-w-[240px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none" />
        <button onClick={startVoice} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500">
          {listening ? '🎙️ Escuchando...' : '🎙️ Voz'}
        </button>
        <button onClick={() => runIntent(prompt)} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400">
          ⚡ Crear y Verificar
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-cyan-300">
        <span>{status}</span>
        <select onChange={e => { const c = cells.find((x: any) => x.id === e.target.value); if (c) { setStatus(`Célula: ${c.file} · SHA-256: ${c.sha256.slice(0,16)}...`); if (onRunProgram) onRunProgram(c.code); } }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 max-w-[280px]">
          <option value="">Explorar {filtered.length} células del dominio...</option>
          {filtered.slice(0, 80).map((c: any) => <option key={c.id} value={c.id}>{c.file} ({c.domain})</option>)}
        </select>
      </div>
    </div>
  );
};
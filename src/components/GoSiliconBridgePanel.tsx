import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Cpu,
  Download,
  FileCode2,
  FolderArchive,
  Play,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import {
  buildHelixSiliconGoProject,
  downloadHelixSiliconGoZip,
} from '../utils/helixGoDistribution';

interface GoSiliconBridgePanelProps {
  activeScript?: string;
}

interface DaemonStatus {
  connected: boolean;
  message: string;
  telemetry?: {
    hostname: string;
    os: string;
    arch: string;
    num_cpu: number;
    go_version: string;
    heap_alloc_kb: number;
    arena_bytes: number;
    z3_available: boolean;
  };
}

export function GoSiliconBridgePanel({ activeScript }: GoSiliconBridgePanelProps) {
  const files = useMemo(() => buildHelixSiliconGoProject(activeScript), [activeScript]);
  const [selectedPath, setSelectedPath] = useState<string>('cmd/helixd/main.go');
  const [copiedFile, setCopiedFile] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);
  const [daemonUrl, setDaemonUrl] = useState('http://127.0.0.1:7733');
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);
  const [humanIntent, setHumanIntent] = useState('simular fluido navier stokes con ley nemesis');
  const [daemonResponse, setDaemonResponse] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedFile = files.find((f) => f.path === selectedPath) ?? files[0];
  const buildCommands = `unzip helix-silicon-go.zip && cd helix-silicon-go
go test -v ./...
go build -o helixd ./cmd/helixd
./helixd -mode daemon -addr 127.0.0.1:7733 -root ./helix_rootfs -native`;

  const handleDownloadZip = () => {
    const info = downloadHelixSiliconGoZip(activeScript);
    setDownloadFeedback(
      `Paquete helix-silicon-go.zip generado (${info.fileCount} archivos, ${(info.zipBytesLength / 1024).toFixed(1)} KB).`,
    );
  };

  const handleCopyFile = async () => {
    if (!selectedFile) return;
    await navigator.clipboard.writeText(selectedFile.content);
    setCopiedFile(true);
    setTimeout(() => setCopiedFile(false), 1600);
  };

  const handleCopyCommands = async () => {
    await navigator.clipboard.writeText(buildCommands);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1600);
  };

  const handlePingDaemon = async () => {
    setBusy(true);
    setDaemonResponse(null);
    try {
      const res = await fetch(`${daemonUrl.replace(/\/+$/, '')}/health`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setDaemonStatus({
        connected: true,
        message: 'Puente Go local conectado y verificando en tiempo real.',
        telemetry: data.silicon,
      });
    } catch {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      setDaemonStatus({
        connected: false,
        message: isHttps
          ? 'No se detectó helixd o el navegador bloqueó HTTP local desde origen HTTPS. Compila el ZIP en tu PC y abre http://127.0.0.1:7733 directamente.'
          : 'No se detectó helixd escuchando en ' + daemonUrl + '. Descarga el ZIP, compila con `go build` y ejecuta `./helixd -mode daemon`.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoteTranslateAndExec = async () => {
    setBusy(true);
    try {
      const base = daemonUrl.replace(/\/+$/, '');
      const tRes = await fetch(`${base}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: humanIntent }),
      });
      const tData = await tRes.json();
      const eRes = await fetch(`${base}/api/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: tData.helix_script }),
      });
      const eData = await eRes.json();
      setDaemonResponse(JSON.stringify({ translation: tData.matched_rule, execution: eData }, null, 2));
    } catch (err) {
      setDaemonResponse(
        `Error comunicando con helixd (${err instanceof Error ? err.message : 'sin conexión'}).`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-5">
      {/* Header + ZIP CTA */}
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
            <Cpu className="h-4 w-4" />
            <span>Runtime Industrial Nativo en Go 1.22+ · Puente Humano ⇄ PC (Silicio) ⇄ IA Web</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Distribución compilable en Go (cero dependencias externas, 12 archivos)
          </h3>
          <p className="max-w-3xl text-xs leading-relaxed text-slate-600">
            Módulo Go completo listo para extraer y compilar en tu ordenador: codificador Gödel P33
            (<code className="font-mono">math/big</code>), arena Zero-GC Pauli-SoA (28 B/celda),
            Curl Noise 3D, Némesis, Bloch SU(2), verificador estático + exportador{' '}
            <code className="font-mono">SMT-LIBv2</code> (con detección automática de Z3 local) y
            demonio asistente <code className="font-mono">helixd</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadZip}
            className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
          >
            <FolderArchive className="h-4 w-4" />
            Descargar proyecto Go (.ZIP)
          </button>
        </div>
      </div>

      {downloadFeedback && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs text-emerald-900">
          {downloadFeedback}
        </div>
      )}

      {/* Compile commands */}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <Terminal className="h-3.5 w-3.5 text-blue-700" />
            Compilación y pruebas en tu silicio (Linux / macOS / Windows)
          </span>
          <button
            type="button"
            onClick={handleCopyCommands}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            {copiedCmd ? (
              <>
                <Check className="h-3 w-3 text-emerald-600" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copiar comandos
              </>
            )}
          </button>
        </div>
        <pre className="overflow-x-auto rounded border border-slate-200 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">
          {buildCommands}
        </pre>
      </div>

      {/* Multi-file browser */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-1.5">
          <div className="text-xs font-semibold text-slate-700">
            Estructura del módulo Go ({files.length} archivos)
          </div>
          <div className="max-h-80 overflow-y-auto rounded-md border border-slate-200 divide-y divide-slate-100">
            {files.map((f) => {
              const active = f.path === selectedFile?.path;
              return (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setSelectedPath(f.path)}
                  className={`w-full text-left px-3 py-2 transition-colors ${
                    active ? 'bg-blue-50 text-blue-900' : 'bg-white hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                    <FileCode2 className="h-3.5 w-3.5 shrink-0 text-blue-700" />
                    <span className="truncate">{f.path}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">{f.role}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-8 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-mono text-xs font-semibold text-slate-900">
                {selectedFile?.path}
              </span>
              <span className="ml-2 text-xs text-slate-500">{selectedFile?.role}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyFile}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {copiedFile ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar archivo
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadZip}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                ZIP
              </button>
            </div>
          </div>

          <pre className="max-h-80 overflow-auto rounded-md border border-slate-200 bg-slate-900 p-3.5 font-mono text-xs leading-relaxed text-slate-100">
            {selectedFile?.content}
          </pre>
        </div>
      </div>

      {/* Optional local bridge connector */}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold text-slate-900">
              Conector vivo con el demonio local <code className="font-mono">helixd</code>
            </h4>
            <p className="text-[11px] text-slate-600">
              Cuando ejecutes <code className="font-mono">./helixd -mode daemon</code> en tu PC,
              también abre su propia consola local en{' '}
              <code className="font-mono">http://127.0.0.1:7733</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={daemonUrl}
              onChange={(e) => setDaemonUrl(e.target.value)}
              aria-label="URL local de helixd"
              className="w-48 rounded border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900"
            />
            <button
              type="button"
              onClick={handlePingDaemon}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Probar puente PC
            </button>
          </div>
        </div>

        {daemonStatus && (
          <div
            className={`rounded border px-3 py-2 text-xs ${
              daemonStatus.connected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <p className="font-medium">{daemonStatus.message}</p>
            {daemonStatus.telemetry && (
              <p className="mt-1 font-mono text-[11px]">
                Host={daemonStatus.telemetry.hostname} · {daemonStatus.telemetry.os}/
                {daemonStatus.telemetry.arch} ({daemonStatus.telemetry.num_cpu} CPUs) ·{' '}
                {daemonStatus.telemetry.go_version} · Heap={daemonStatus.telemetry.heap_alloc_kb} KB ·
                SoA={daemonStatus.telemetry.arena_bytes} B · Z3={' '}
                {daemonStatus.telemetry.z3_available ? 'Sí' : 'No (usando solver Go)'}
              </p>
            )}
          </div>
        )}

        {daemonStatus?.connected && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={humanIntent}
                onChange={(e) => setHumanIntent(e.target.value)}
                placeholder="Intención humana para traducir y ejecutar en el silicio..."
                className="flex-1 min-w-[240px] rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
              <button
                type="button"
                onClick={handleRemoteTranslateAndExec}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5" />
                Traducir y ejecutar en PC
              </button>
            </div>
            {daemonResponse && (
              <pre className="max-h-56 overflow-auto rounded border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] text-slate-100">
                {daemonResponse}
              </pre>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

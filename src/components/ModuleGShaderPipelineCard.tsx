import { useState } from 'react';
import { Code2, Cpu, Layers, Sparkles } from 'lucide-react';
import { OpcodeForceFieldProfile } from '../utils/helixBiopixelSurface';
import {
  HELIX_MESH_KV_DEFORM_FRAGMENT_CHUNK,
  HELIX_MESH_KV_DEFORM_VERTEX_CHUNK,
  HELIX_NS_KV_SIM_FRAGMENT_SHADER,
  ModuleGFluidEngineSnapshot,
} from '../utils/helixModuleGFluidShaders';

interface ModuleGShaderPipelineCardProps {
  profile: OpcodeForceFieldProfile;
  gpuSnapshot: ModuleGFluidEngineSnapshot;
  meshDeformGain: number;
  onChangeMeshDeformGain: (next: number) => void;
  glslMembraneVisible: boolean;
  onToggleGlslMembrane: () => void;
}

type ShaderTab = 'fbo' | 'vertex' | 'fragment';

export function ModuleGShaderPipelineCard({
  profile,
  gpuSnapshot,
  meshDeformGain,
  onChangeMeshDeformGain,
  glslMembraneVisible,
  onToggleGlslMembrane,
}: ModuleGShaderPipelineCardProps) {
  const [showShaderCode, setShowShaderCode] = useState(false);
  const [shaderTab, setShaderTab] = useState<ShaderTab>('fbo');

  const activeShaderSource =
    shaderTab === 'fbo'
      ? HELIX_NS_KV_SIM_FRAGMENT_SHADER
      : shaderTab === 'vertex'
        ? HELIX_MESH_KV_DEFORM_VERTEX_CHUNK
        : HELIX_MESH_KV_DEFORM_FRAGMENT_CHUNK;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Layers className="h-4 w-4 text-blue-700" />
            Arquitectura GPU del Módulo G · WebGL FBO Ping-Pong (NS + Kelvin-Voigt)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Pipeline de 4 etapas en GPU que acopla opcodes de Helix VM (<code className="font-mono">tOpcodeField 32×1</code>)
            al solver FBO <code className="font-mono">{gpuSnapshot.fboResolution}×{gpuSnapshot.fboResolution}</code> y
            deforma los vértices 3D en GLSL.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleGlslMembrane}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
              glslMembraneVisible
                ? 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            Membrana GLSL Continua: {glslMembraneVisible ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => setShowShaderCode((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Code2 className="h-3 w-3" />
            {showShaderCode ? 'Ocultar GLSL' : 'Inspeccionar GLSL'}
          </button>
        </div>
      </div>

      {/* 4 Pipeline Stages */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 text-[11px]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="font-semibold text-slate-800">1. Opcodes VM ➔ Textura</div>
          <div className="mt-0.5 font-mono text-slate-600 tabular-nums">
            tOpcodeField: {gpuSnapshot.activeInjectors}/{gpuSnapshot.opcodeTexelsCount} texels
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500">
            hash=0x{gpuSnapshot.opcodeDataHash.toString(16).padStart(8, '0')}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="font-semibold text-slate-800">2. FBO Ping-Pong GPU</div>
          <div className="mt-0.5 font-mono text-slate-600 tabular-nums">
            {gpuSnapshot.fboResolution}×{gpuSnapshot.fboResolution} RGBA · Pases: {gpuSnapshot.gpuPassCount}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500">
            ν={gpuSnapshot.nsViscosity.toFixed(3)} · g={gpuSnapshot.nsCurlGain.toFixed(2)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="font-semibold text-slate-800">3. Vertex Shader KV</div>
          <div className="mt-0.5 font-mono text-slate-600 tabular-nums">
            E={gpuSnapshot.kvElasticityE.toFixed(1)} · η={gpuSnapshot.kvDampingEta.toFixed(1)}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500">
            γ_Némesis={gpuSnapshot.nemesisGamma.toFixed(3)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="font-semibold text-slate-800">4. Deformación Malla 3D</div>
          <label className="mt-1 flex items-center gap-2 font-mono text-slate-700">
            <Cpu className="h-3 w-3 shrink-0 text-blue-700" />
            <input
              type="range"
              min={0}
              max={2.0}
              step={0.05}
              value={meshDeformGain}
              onChange={(e) => onChangeMeshDeformGain(Number(e.target.value))}
              aria-label="Ganancia deformación GLSL"
              className="w-full accent-blue-700"
            />
            <span className="w-9 text-right tabular-nums">{meshDeformGain.toFixed(2)}</span>
          </label>
        </div>
      </div>

      {/* Opcode Injectors Mapping Preview */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
        <span className="font-sans text-[11px] font-medium text-slate-600 mr-1">
          Inyectores GPU ({profile.injectors.length}):
        </span>
        {profile.injectors.slice(0, 8).map((inj, idx) => (
          <span
            key={`${inj.lineNumber}-${inj.opcode}-${idx}`}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-700"
            title={`L${inj.lineNumber} ${inj.opcode} -> UV(${inj.uNorm.toFixed(2)}, ${inj.vNorm.toFixed(2)})`}
          >
            <span
              className="inline-block h-2 w-2 rounded-xs shrink-0"
              style={{ backgroundColor: inj.colorHex }}
            />
            <span>{inj.opcode}</span>
            <span className="text-slate-400">ε*={inj.targetStrain.toFixed(2)}</span>
          </span>
        ))}
      </div>

      {/* Live GLSL Code Inspector */}
      {showShaderCode && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'fbo', label: 'Pass 1 · FBO Navier-Stokes + Kelvin-Voigt (.frag)' },
                { id: 'vertex', label: 'Pass 2 · Deformación de Vértices (.vert)' },
                { id: 'fragment', label: 'Pass 2 · Óptica Cauchy + Vorticidad (.frag)' },
              ] as { id: ShaderTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setShaderTab(tab.id)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  shaderTab === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
            {activeShaderSource.trim()}
          </pre>
        </div>
      )}
    </div>
  );
}

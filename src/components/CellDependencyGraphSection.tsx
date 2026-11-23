import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  ArrowRight,
  GitBranch,
  Maximize2,
  Play,
  RefreshCw,
} from 'lucide-react';
import { CompoundWord } from '../data/vocabulary';
import { HelixCell } from '../utils/helixCells';
import {
  buildCellDependencyGraph,
  CellEdgeKind,
  CellGraphNode,
  GraphScope,
} from '../utils/helixCellGraph';
import { PrimeColorSwatch } from './PrimeColorSwatch';

interface CellDependencyGraphSectionProps {
  cells: HelixCell[];
  vocabulary: CompoundWord[];
  currentVmScript?: string;
  onOpenChainInVm?: (script: string) => void;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  data: CellGraphNode;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  source: string | SimNode;
  target: string | SimNode;
  kind: CellEdgeKind;
  label: string;
  pairOffset: number;
}

const EDGE_COLORS: Record<CellEdgeKind, string> = {
  control: '#2563EB', // Azul flujo de ejecución
  state: '#059669',   // Esmeralda estado/símbolo compartido
  guard: '#D97706',   // Ámbar invariante / guarda
};

const EDGE_LABELS: Record<CellEdgeKind, string> = {
  control: 'Flujo de programa',
  state: 'Estado compartido',
  guard: 'Guarda / Invariante',
};

const SCOPE_OPTIONS: { id: GraphScope; label: string }[] = [
  { id: 'default_os', label: 'OS Clásico' },
  { id: 'scene_3d', label: 'Escena 3D + WS' },
  { id: 'current_vm', label: 'VM Actual (Mód. F)' },
  { id: 'all', label: 'Todas las células' },
];

function getNodeId(ref: string | SimNode): string {
  return typeof ref === 'string' ? ref : ref.id;
}

export function CellDependencyGraphSection({
  cells,
  vocabulary,
  currentVmScript,
  onOpenChainInVm,
}: CellDependencyGraphSectionProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [scope, setScope] = useState<GraphScope>('default_os');
  const [enabledKinds, setEnabledKinds] = useState<Record<CellEdgeKind, boolean>>({
    control: true,
    state: true,
    guard: true,
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const [inspectorTarget, setInspectorTarget] = useState<'js' | 'glsl' | 'go'>('js');

  const graph = useMemo(
    () => buildCellDependencyGraph(cells, scope, vocabulary, currentVmScript),
    [cells, scope, vocabulary, currentVmScript],
  );

  const visibleEdges = useMemo(
    () => graph.edges.filter((e) => enabledKinds[e.kind]),
    [graph.edges, enabledKinds],
  );

  const activeSelectedNode = useMemo(() => {
    if (selectedNodeId) {
      const found = graph.nodes.find((n) => n.id === selectedNodeId);
      if (found) return found;
    }
    return graph.nodes[0] ?? null;
  }, [graph.nodes, selectedNodeId]);

  const selectedRelations = useMemo(() => {
    if (!activeSelectedNode) return { incoming: [], outgoing: [] };
    const incoming = visibleEdges
      .filter((e) => e.target === activeSelectedNode.id)
      .map((e) => ({
        edge: e,
        peer: graph.nodes.find((n) => n.id === e.source),
      }))
      .filter((item): item is { edge: typeof item.edge; peer: CellGraphNode } => Boolean(item.peer));

    const outgoing = visibleEdges
      .filter((e) => e.source === activeSelectedNode.id)
      .map((e) => ({
        edge: e,
        peer: graph.nodes.find((n) => n.id === e.target),
      }))
      .filter((item): item is { edge: typeof item.edge; peer: CellGraphNode } => Boolean(item.peer));

    return { incoming, outgoing };
  }, [activeSelectedNode, graph.nodes, visibleEdges]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = 760;
    const height = 460;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (graph.nodes.length === 0) return;

    // Arrowhead markers per edge kind
    const defs = svg.append('defs');
    (['control', 'state', 'guard'] as CellEdgeKind[]).forEach((kind) => {
      defs
        .append('marker')
        .attr('id', `arrow-${kind}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 27)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', EDGE_COLORS[kind]);
    });

    const zoomLayer = svg.append('g').attr('class', 'zoom-layer');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 2.5])
      .on('zoom', (event) => {
        zoomLayer.attr('transform', event.transform.toString());
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);
    svg.on('click', (event) => {
      if (event.target === svgEl) {
        setSelectedNodeId(null);
      }
    });

    // Count parallel edges between the same source/target pair so curves separate cleanly
    const pairCounters = new Map<string, number>();
    const simNodes: SimNode[] = graph.nodes.map((n, idx) => ({
      id: n.id,
      data: n,
      x: width / 2 + Math.cos((idx / Math.max(1, graph.nodes.length)) * Math.PI * 2) * 140,
      y: height / 2 + Math.sin((idx / Math.max(1, graph.nodes.length)) * Math.PI * 2) * 120,
    }));

    const simLinks: SimLink[] = visibleEdges.map((e) => {
      const pairKey = [e.source, e.target].sort().join('|');
      const count = pairCounters.get(pairKey) ?? 0;
      pairCounters.set(pairKey, count + 1);
      const offsetSign = e.source < e.target ? 1 : -1;
      const pairOffset = count === 0 ? 14 * offsetSign : (14 + count * 18) * offsetSign;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        kind: e.kind,
        label: e.label,
        pairOffset,
      };
    });

    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((l) => (l.kind === 'control' ? 115 : 145))
          .strength(0.65),
      )
      .force('charge', d3.forceManyBody<SimNode>().strength(-390))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<SimNode>().radius(34))
      .force(
        'x',
        d3.forceX<SimNode>((d) => (d.data.isEntry ? 120 : d.data.isExit ? width - 120 : width / 2)).strength((d) =>
          d.data.isEntry || d.data.isExit ? 0.16 : 0.03,
        ),
      )
      .force('y', d3.forceY<SimNode>(height / 2).strength(0.05));

    const linkGroup = zoomLayer.append('g').attr('class', 'links');
    const linkPaths = linkGroup
      .selectAll<SVGPathElement, SimLink>('path')
      .data(simLinks)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => EDGE_COLORS[d.kind])
      .attr('stroke-width', (d) => (d.kind === 'control' ? 2 : 1.5))
      .attr('stroke-dasharray', (d) => (d.kind === 'guard' ? '4 3' : null))
      .attr('marker-end', (d) => `url(#arrow-${d.kind})`)
      .attr('opacity', 0.8);

    const linkLabels = zoomLayer
      .append('g')
      .attr('class', 'link-labels')
      .selectAll<SVGTextElement, SimLink>('text')
      .data(simLinks)
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .attr('fill', '#475569')
      .attr('pointer-events', 'none')
      .text((d) => d.label);

    const nodeGroup = zoomLayer.append('g').attr('class', 'nodes');
    const nodeElems = nodeGroup
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .join('g')
      .attr('cursor', 'grab')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNodeId(d.id);
      });

    // Outer circle (Layer-6 Prime Spectral Color)
    nodeElems
      .append('circle')
      .attr('r', (d) => (d.data.isEntry || d.data.isExit ? 22 : Math.min(24, 17 + d.data.callCount)))
      .attr('fill', '#FFFFFF')
      .attr('stroke', (d) => d.data.colorHex)
      .attr('stroke-width', (d) => (d.data.isEntry || d.data.isExit ? 3.5 : 2.5));

    // Glyphs inside node
    nodeElems
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', 13)
      .attr('font-weight', 700)
      .attr('fill', '#0F172A')
      .attr('pointer-events', 'none')
      .text((d) => d.data.cell.glyphs);

    // Opcode label below node
    nodeElems
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 34)
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .attr('fill', '#1E293B')
      .attr('pointer-events', 'none')
      .text((d) => d.data.cell.opcode);

    // Optional call-count badge for loops / repeated opcodes
    nodeElems
      .filter((d) => d.data.callCount > 1)
      .append('circle')
      .attr('cx', 16)
      .attr('cy', -15)
      .attr('r', 8)
      .attr('fill', '#1D4ED8');

    nodeElems
      .filter((d) => d.data.callCount > 1)
      .append('text')
      .attr('x', 16)
      .attr('y', -12)
      .attr('text-anchor', 'middle')
      .attr('font-size', 8)
      .attr('font-weight', 700)
      .attr('font-family', 'ui-monospace, monospace')
      .attr('fill', '#FFFFFF')
      .attr('pointer-events', 'none')
      .text((d) => `×${d.data.callCount}`);

    // Drag behavior
    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeElems.call(drag);

    // Apply selection highlighting
    const applyHighlight = (focusId: string | null) => {
      if (!focusId) {
        nodeElems.attr('opacity', 1);
        linkPaths.attr('opacity', 0.8);
        linkLabels.attr('opacity', 0.75);
        return;
      }
      const neighbors = new Set<string>([focusId]);
      simLinks.forEach((l) => {
        const s = getNodeId(l.source);
        const t = getNodeId(l.target);
        if (s === focusId) neighbors.add(t);
        if (t === focusId) neighbors.add(s);
      });
      nodeElems.attr('opacity', (d) => (neighbors.has(d.id) ? 1 : 0.22));
      linkPaths.attr('opacity', (l) =>
        getNodeId(l.source) === focusId || getNodeId(l.target) === focusId ? 1 : 0.1,
      );
      linkLabels.attr('opacity', (l) =>
        getNodeId(l.source) === focusId || getNodeId(l.target) === focusId ? 1 : 0.05,
      );
    };

    applyHighlight(selectedNodeId);

    simulation.on('tick', () => {
      linkPaths.attr('d', (d) => {
        const src = d.source as SimNode;
        const dst = d.target as SimNode;
        const sx = src.x ?? 0;
        const sy = src.y ?? 0;
        const tx = dst.x ?? 0;
        const ty = dst.y ?? 0;
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const dx = tx - sx;
        const dy = ty - sy;
        const len = Math.hypot(dx, dy) || 1;
        const cx = mx - (dy / len) * d.pairOffset;
        const cy = my + (dx / len) * d.pairOffset;
        return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;
      });

      linkLabels
        .attr('x', (d) => {
          const src = d.source as SimNode;
          const dst = d.target as SimNode;
          const sx = src.x ?? 0;
          const sy = src.y ?? 0;
          const tx = dst.x ?? 0;
          const ty = dst.y ?? 0;
          const dx = tx - sx;
          const dy = ty - sy;
          const len = Math.hypot(dx, dy) || 1;
          return (sx + tx) / 2 - (dy / len) * (d.pairOffset * 0.65);
        })
        .attr('y', (d) => {
          const src = d.source as SimNode;
          const dst = d.target as SimNode;
          const sx = src.x ?? 0;
          const sy = src.y ?? 0;
          const tx = dst.x ?? 0;
          const ty = dst.y ?? 0;
          const dx = tx - sx;
          const dy = ty - sy;
          const len = Math.hypot(dx, dy) || 1;
          return (sy + ty) / 2 + (dx / len) * (d.pairOffset * 0.65);
        });

      nodeElems.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graph.nodes, visibleEdges, selectedNodeId, layoutTick]);

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(250)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  return (
    <section
      id="grafo-dependencias-hlx"
      className="rounded-lg border border-slate-200 bg-white p-6 space-y-5"
    >
      {/* Header + Scope Switcher */}
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-blue-700" />
            <span className="text-xs font-medium text-blue-700">
              Subsección · Grafo Dirigido D3 de Células (.hlx)
            </span>
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            Grafo de Dependencias y Encadenamiento de Opcodes ({graph.nodes.length} nodos ·{' '}
            {visibleEdges.length} conexiones)
          </h2>
          <p className="max-w-3xl text-xs leading-relaxed text-slate-600">
            Visualización interactiva con D3 que muestra cómo las células{' '}
            <code className="font-mono">.hlx</code> se encadenan secuencialmente en un programa
            y cómo comparten símbolos de estado (<code className="font-mono">hlxVars</code>,{' '}
            <code className="font-mono">usedMemBytes</code>,{' '}
            <code className="font-mono">procQueue</code>,{' '}
            <code className="font-mono">sceneNodes</code>) e invariantes de control.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-md bg-slate-100 p-1 shrink-0">
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setScope(opt.id);
                setSelectedNodeId(null);
              }}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                scope === opt.id
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Legend & Graph Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {(['control', 'state', 'guard'] as CellEdgeKind[]).map((kind) => (
            <label
              key={kind}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
            >
              <input
                type="checkbox"
                checked={enabledKinds[kind]}
                onChange={() =>
                  setEnabledKinds((prev) => ({ ...prev, [kind]: !prev[kind] }))
                }
                className="accent-blue-700"
              />
              <span
                className="inline-block h-2 w-3.5 rounded-xs"
                style={{ backgroundColor: EDGE_COLORS[kind] }}
              />
              <span>{EDGE_LABELS[kind]}</span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLayoutTick((t) => t + 1)}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            Reorganizar D3
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Maximize2 className="h-3 w-3" />
            Centrar zoom
          </button>
        </div>
      </div>

      {/* Main Split: D3 Canvas (Left) + Node Dependency Inspector (Right) */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <div className="relative overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500">
              <span className="font-medium text-slate-700">{graph.scopeLabel}</span>
              <span>Arrastra nodos · Rueda para zoom · Clic para inspeccionar</span>
            </div>
            <svg
              ref={svgRef}
              viewBox="0 0 760 460"
              className="h-[460px] w-full select-none bg-slate-50"
              role="img"
              aria-label="Grafo de dependencias D3 entre células .hlx"
            />
          </div>
        </div>

        {/* Right: Node Inspector */}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-4 xl:col-span-4">
          {activeSelectedNode ? (
            <>
              <div className="border-b border-slate-200 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PrimeColorSwatch hex={activeSelectedNode.colorHex} size={14} />
                    <span className="font-mono text-base font-bold text-slate-900">
                      {activeSelectedNode.cell.glyphs}
                    </span>
                    <span className="font-mono text-xs font-semibold text-blue-700">
                      {activeSelectedNode.cell.opcode}
                    </span>
                  </div>
                  <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    {activeSelectedNode.subsystem}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600">
                  {activeSelectedNode.cell.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-slate-500">
                  <span>{activeSelectedNode.cell.fileName}</span>
                  <span>Gödel={activeSelectedNode.cell.godelProduct}</span>
                  <span>Entrantes={selectedRelations.incoming.length}</span>
                  <span>Salientes={selectedRelations.outgoing.length}</span>
                </div>
              </div>

              {/* Incoming Dependencies */}
              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Depende de ({selectedRelations.incoming.length})
                </h3>
                {selectedRelations.incoming.length === 0 ? (
                  <p className="text-xs text-slate-400">Nodo raíz / sin predecesores en esta vista.</p>
                ) : (
                  <div className="max-h-28 space-y-1 overflow-y-auto">
                    {selectedRelations.incoming.map(({ edge, peer }) => (
                      <button
                        key={edge.id}
                        type="button"
                        onClick={() => setSelectedNodeId(peer.id)}
                        className="flex w-full items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-1 text-left text-[11px] hover:border-blue-400"
                      >
                        <span className="font-mono font-medium text-slate-800">
                          {peer.cell.glyphs} {peer.cell.opcode}
                        </span>
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: EDGE_COLORS[edge.kind] }}
                        >
                          {edge.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Outgoing Dependents */}
              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Encadena hacia ({selectedRelations.outgoing.length})
                </h3>
                {selectedRelations.outgoing.length === 0 ? (
                  <p className="text-xs text-slate-400">Nodo terminal en esta vista.</p>
                ) : (
                  <div className="max-h-28 space-y-1 overflow-y-auto">
                    {selectedRelations.outgoing.map(({ edge, peer }) => (
                      <button
                        key={edge.id}
                        type="button"
                        onClick={() => setSelectedNodeId(peer.id)}
                        className="flex w-full items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-1 text-left text-[11px] hover:border-blue-400"
                      >
                        <span className="font-mono font-medium text-slate-800">
                          {peer.cell.glyphs} {peer.cell.opcode}
                        </span>
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: EDGE_COLORS[edge.kind] }}
                        >
                          {edge.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Snippet preview */}
              <div className="space-y-1.5 border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-700">
                    Implementación de la célula
                  </span>
                  <div className="flex gap-1">
                    {(['js', 'glsl', 'go'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setInspectorTarget(t)}
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                          inspectorTarget === t
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-600 border border-slate-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <pre className="max-h-28 overflow-auto rounded border border-slate-200 bg-slate-950 p-2 font-mono text-[10px] leading-relaxed text-slate-100">
                  {activeSelectedNode.cell.codeBlocks[inspectorTarget]}
                </pre>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">Selecciona un nodo del grafo para inspeccionar sus dependencias.</p>
          )}
        </div>
      </div>

      {/* Sequential Opcode Chain Strip */}
      {graph.activeChainOpcodes.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800">
              Secuencia de encadenamiento en ejecución ({graph.activeChainOpcodes.length} pasos)
            </span>
            {onOpenChainInVm && scope !== 'current_vm' && (
              <button
                type="button"
                onClick={() => {
                  const preset =
                    scope === 'scene_3d'
                      ? 'ᛇᚢ\nᛗᚦ render_admin\nSET rotorScale 1.15\nMESH_NODE hub lathe 960 1.0\nMAT_ORM hub 0.92 0.28 0.85\nCAM_6DOF 3.2 2.1 3.8 38 18 45\nWS_EMIT telemetry rotor_ready\nᛣᚪ\nᚳᛏ'
                      : 'ᛇᚢ\nᛗᚦ sys_admin\nSET tam 64\nLOOP 3\n  ᚠᚷ tam\n  ADD tam 64\nEND\nᛣᚪ\nᚳᛏ';
                  onOpenChainInVm(preset);
                }}
                className="inline-flex items-center gap-1 rounded border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-50 whitespace-nowrap shrink-0"
              >
                <Play className="h-3 w-3" />
                Ejecutar cadena en Módulo F
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {graph.activeChainOpcodes.map((op, i) => {
              const cell = cells.find((c) => c.opcode.toUpperCase() === op);
              const isSelected = cell && activeSelectedNode?.id === cell.fileName;
              return (
                <div key={`${op}-${i}`} className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => cell && setSelectedNodeId(cell.fileName)}
                    className={`rounded border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-100 text-blue-900 font-semibold'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400'
                    }`}
                  >
                    <span className="text-slate-400 mr-1">#{i + 1}</span>
                    {cell ? `${cell.glyphs} ` : ''}
                    {op}
                  </button>
                  {i < graph.activeChainOpcodes.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingDown } from 'lucide-react';
import { NeuralTrainingPoint } from '../utils/helixNeuralEngine';

export interface MiniGptLossChartProps {
  lossHistory: NeuralTrainingPoint[];
  isTraining: boolean;
  trainedSteps: number;
  targetStepBatch: number;
}

interface EnrichedLossPoint extends NeuralTrainingPoint {
  emaLoss: number;
  plotLoss: number;
  plotValLoss: number;
  plotEmaLoss: number;
}

export function MiniGptLossChart({
  lossHistory,
  isTraining,
  trainedSteps,
  targetStepBatch,
}: MiniGptLossChartProps) {
  const [scaleMode, setScaleMode] = useState<'linear' | 'log'>('linear');
  const [showTrain, setShowTrain] = useState<boolean>(true);
  const [showVal, setShowVal] = useState<boolean>(true);
  const [showEma, setShowEma] = useState<boolean>(true);

  const { enrichedData, bestLoss, bestStep, latestEma, convergenceLabel } = useMemo(() => {
    if (lossHistory.length === 0) {
      return {
        enrichedData: [] as EnrichedLossPoint[],
        bestLoss: null as number | null,
        bestStep: null as number | null,
        latestEma: null as number | null,
        convergenceLabel: 'Sin entrenar',
      };
    }

    const alpha = 0.28;
    let ema = lossHistory[0].loss;
    let minLoss = Infinity;
    let minStep = lossHistory[0].step;

    const points: EnrichedLossPoint[] = lossHistory.map((pt, idx) => {
      ema = idx === 0 ? pt.loss : alpha * pt.loss + (1 - alpha) * ema;
      if (pt.loss < minLoss) {
        minLoss = pt.loss;
        minStep = pt.step;
      }
      const emaRounded = Number(ema.toFixed(4));
      return {
        ...pt,
        emaLoss: emaRounded,
        plotLoss: Math.max(0.02, pt.loss),
        plotValLoss: Math.max(0.02, pt.valLoss),
        plotEmaLoss: Math.max(0.02, emaRounded),
      };
    });

    const first = points[0].loss;
    const lastEma = points[points.length - 1].emaLoss;
    let label = 'Descendiendo';
    if (isTraining) {
      label = 'Convergiendo en vivo';
    } else if (lastEma <= 0.8) {
      label = 'Convergencia estable';
    } else if (first > 0 && lastEma < first * 0.65) {
      label = 'Tendencia descendente';
    }

    return {
      enrichedData: points,
      bestLoss: minLoss,
      bestStep: minStep,
      latestEma: lastEma,
      convergenceLabel: label,
    };
  }, [lossHistory, isTraining]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-slate-100">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingDown
            className={`h-4 w-4 ${isTraining ? 'animate-pulse text-emerald-400' : 'text-emerald-400'}`}
          />
          <span className="font-mono text-xs font-semibold text-slate-100">
            Convergencia Mini-GPT · Cross-Entropy Loss (Recharts)
          </span>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
              isTraining
                ? 'bg-blue-500/20 text-blue-300'
                : latestEma !== null && latestEma <= 0.8
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-slate-800 text-slate-300'
            }`}
          >
            {convergenceLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
          <button
            type="button"
            onClick={() => setShowTrain((v) => !v)}
            className={`rounded border px-1.5 py-0.5 transition-colors ${
              showTrain
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                : 'border-slate-700 bg-slate-900 text-slate-500'
            }`}
          >
            Train
          </button>
          <button
            type="button"
            onClick={() => setShowVal((v) => !v)}
            className={`rounded border px-1.5 py-0.5 transition-colors ${
              showVal
                ? 'border-blue-500/50 bg-blue-500/20 text-blue-300'
                : 'border-slate-700 bg-slate-900 text-slate-500'
            }`}
          >
            Val
          </button>
          <button
            type="button"
            onClick={() => setShowEma((v) => !v)}
            className={`rounded border px-1.5 py-0.5 transition-colors ${
              showEma
                ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                : 'border-slate-700 bg-slate-900 text-slate-500'
            }`}
          >
            EMA
          </button>
          <span className="mx-0.5 text-slate-700">|</span>
          <button
            type="button"
            onClick={() => setScaleMode((m) => (m === 'linear' ? 'log' : 'linear'))}
            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:bg-slate-800"
          >
            Escala: {scaleMode === 'linear' ? 'Lineal' : 'Log₁₀'}
          </button>
        </div>
      </div>

      {enrichedData.length >= 2 ? (
        <>
          <div className="h-56 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={enrichedData}
                margin={{ top: 8, right: 14, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="helixMiniGptTrainGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="helixMiniGptValGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="step"
                  stroke="#64748b"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={(v) => `P${v}`}
                />
                <YAxis
                  stroke="#64748b"
                  scale={scaleMode}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  domain={scaleMode === 'log' ? [0.05, 'auto'] : [0, 'auto']}
                  allowDataOverflow={scaleMode === 'log'}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#f8fafc',
                  }}
                  labelFormatter={(step) => `Paso AdamW #${step}`}
                  formatter={(value, name) => [Number(value).toFixed(4), String(name)]}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                <ReferenceLine
                  y={1.0}
                  stroke="#334155"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Meta 1.0',
                    position: 'insideTopRight',
                    fill: '#64748b',
                    fontSize: 10,
                  }}
                />
                {showTrain && (
                  <Area
                    type="monotone"
                    dataKey={scaleMode === 'log' ? 'plotLoss' : 'loss'}
                    name="Train Loss"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#helixMiniGptTrainGrad)"
                    isAnimationActive={false}
                  />
                )}
                {showVal && (
                  <Area
                    type="monotone"
                    dataKey={scaleMode === 'log' ? 'plotValLoss' : 'valLoss'}
                    name="Val Loss"
                    stroke="#3b82f6"
                    strokeWidth={1.75}
                    fill="url(#helixMiniGptValGrad)"
                    isAnimationActive={false}
                  />
                )}
                {showEma && (
                  <Line
                    type="monotone"
                    dataKey={scaleMode === 'log' ? 'plotEmaLoss' : 'emaLoss'}
                    name="Tendencia EMA"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800 pt-2.5 font-mono text-[11px]">
            <div className="text-slate-400">
              Muestras: <span className="font-semibold text-slate-200">{enrichedData.length}</span>{' '}
              <span className="text-slate-500">({trainedSteps} pasos)</span>
            </div>
            <div className="text-slate-400">
              Mínimo:{' '}
              <span className="font-semibold text-emerald-400">
                {bestLoss !== null ? bestLoss.toFixed(4) : '—'}
              </span>{' '}
              <span className="text-slate-500">(P{bestStep})</span>
            </div>
            <div className="text-right text-slate-400">
              EMA actual:{' '}
              <span className="font-semibold text-amber-300">
                {latestEma !== null ? latestEma.toFixed(4) : '—'}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-56 flex-col items-center justify-center gap-1.5 font-mono text-xs text-slate-400">
          <span>
            Pulsa &ldquo;Entrenar (+{targetStepBatch} pasos)&rdquo; o carga un .pth para ver la curva de convergencia
          </span>
          <span className="text-[11px] text-slate-500">
            Recharts graficará Train Loss, Val Loss y Tendencia EMA en tiempo real
          </span>
        </div>
      )}
    </div>
  );
}

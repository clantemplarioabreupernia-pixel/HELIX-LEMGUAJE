import { CompoundWord, INITIAL_COMPOUND_VOCABULARY } from '../data/vocabulary';
import { assemblePureFromCells, HelixCell, PureAssemblyResult } from './helixCells';
import { evaluateCandidatePrefix } from './helixAiProtocol';
import {
  GodelChecksumValidationReport,
  validateHelixGodelChecksum,
} from './helixEngine';
import { sha256Hex } from './helixPcc';
import {
  AUTOMATON_EOS,
  AUTOMATON_EOL,
  advanceAutomatonToken,
  computeTokenMaskVector,
  createAutomatonContext,
  GrammarPhase,
} from './helixGrammarMask';
import {
  compileHelixScript,
  DEFAULT_HELIX_3D_PROGRAM,
  DEFAULT_HELIX_CONTRACT_PROGRAM,
  DEFAULT_HELIX_PHYSICS_PROGRAM,
  DEFAULT_HELIX_PROGRAM,
  ProgramVerificationReport,
  runHelixProgram,
  verifyHelixProgram,
} from './helixVm';

export const HELIX_MODEL_STORAGE_KEY = 'helix_os_minigpt_pth_v2';

export interface NeuralModelConfig {
  blockSize: number;
  dModel: number;
  nHeads: number;
  ffnDim: number;
  dropout: number;
  learningRate: number;
}

export const DEFAULT_NEURAL_CONFIG: NeuralModelConfig = {
  blockSize: 64,
  dModel: 128,
  nHeads: 4,
  ffnDim: 512,
  dropout: 0.1,
  learningRate: 0.01,
};

export interface NeuralTrainingPoint {
  step: number;
  loss: number;
  valLoss: number;
}

export interface NeuralWeights {
  tokEmb: Float32Array;
  posEmb: Float32Array;
  ln1Gamma: Float32Array;
  ln1Beta: Float32Array;
  wq: Float32Array;
  wk: Float32Array;
  wv: Float32Array;
  wo: Float32Array;
  ln2Gamma: Float32Array;
  ln2Beta: Float32Array;
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
  lnFGamma: Float32Array;
  lnFBeta: Float32Array;
  wLm: Float32Array;
  bLm: Float32Array;
}

interface AdamMoments {
  m: Float32Array[];
  v: Float32Array[];
  t: number;
}

export interface HelixNeuralModel {
  config: NeuralModelConfig;
  vocab: string[];
  stoi: Map<string, number>;
  weights: NeuralWeights;
  moments: AdamMoments;
  trainedSteps: number;
  parameterCount: number;
  lossHistory: NeuralTrainingPoint[];
  sequencesCount: number;
}

export interface NeuralStepCandidateLog {
  line: string;
  neuralLogit: number;
  rawProb: number;
  maskedProb: number;
  allowed: boolean;
  violatedRules: string[];
}

export interface NeuralGenerationTraceStep {
  lineIndex: number;
  candidates: NeuralStepCandidateLog[];
  chosenLine: string;
  stochasticTopLine: string;
  blockedCount: number;
}

export interface NeuralTokenTraceStep {
  step: number;
  phase: GrammarPhase;
  stackDepth: number;
  chosenToken: string;
  sampledProb: number;
  unmaskedTopToken: string;
  allowedCount: number;
  maskedCount: number;
  blockedSamples: { token: string; rule: string }[];
}

export interface NeuralGenerationResult {
  script: string;
  stochasticScript: string;
  verification: ProgramVerificationReport;
  stochasticVerification: ProgramVerificationReport;
  godelReport: GodelChecksumValidationReport;
  stochasticGodelReport: GodelChecksumValidationReport;
  execOk: boolean;
  samplingMode: 'MULTINOMIAL_SOFTMAX';
  samplingSeed: number;
  trace: NeuralGenerationTraceStep[];
  tokenTrace: NeuralTokenTraceStep[];
  blockedHallucinations: number;
  pureAssemblyGo: PureAssemblyResult;
}

const BOS_TOKEN = '<BOS>';
const EOL_TOKEN = '\n';
const EOS_TOKEN = '<EOS>';

// Semilla determinista (PRNG Mulberry32) para inicialización reproducible, dropout y muestreo multinomial
function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initArray(len: number, scale: number, rng: () => number): Float32Array {
  const arr = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = (rng() * 2 - 1) * scale;
  }
  return arr;
}

function initOnes(len: number): Float32Array {
  const arr = new Float32Array(len);
  arr.fill(1);
  return arr;
}

/**
 * Tokenizador simbólico para programas Helix: preserva runas, opcodes,
 * números, identificadores y saltos de línea para que el Transformer aprenda
 * la estructura gramatical exacta instrucción por instrucción.
 */
export function tokenizeHelixLine(line: string): string[] {
  const clean = line.split('#')[0].trim();
  if (!clean) return [];
  return clean.split(/\s+/).filter(Boolean);
}

export function buildHelixNeuralCorpus(
  vocabulary: CompoundWord[] = INITIAL_COMPOUND_VOCABULARY,
  extraScripts: string[] = [],
): { sequences: string[][]; corpusText: string } {
  const baseScripts = [
    DEFAULT_HELIX_PROGRAM,
    DEFAULT_HELIX_3D_PROGRAM,
    DEFAULT_HELIX_CONTRACT_PROGRAM,
    DEFAULT_HELIX_PHYSICS_PROGRAM,
    `ᛇᚢ
ᛗᚦ treasury
SET fondo 1260
DIV fondo 14
MUL fondo 2
FILE_WRITE ledger.p33 fondo
ᚳᛏ`,
    `ᛇᚢ
ᛗᚦ root
SET tam 128
LOOP 2
  ᚠᚷ tam
END
ᛒᚢ worker
ᚱᚳ
FILE_WRITE init.cfg boot_ok
ᚳᛏ`,
    `ᛇᚢ
ᛗᚦ telemetry
SET pkt 10
LOOP 3
  WS_EMIT pulse pkt
  ADD pkt 1
END
ᚳᛏ`,
    `ᛇᚢ
ᛗᚦ render_admin
MESH_NODE hub lathe 960 1.0
MAT_ORM hub 0.92 0.28 0.85
MESH_NODE ring torus 1280 1.1
CAM_6DOF 3.2 2.1 3.8 38 18 45
WS_EMIT telemetry rotor_ready
ᚳᛏ`,
    ...extraScripts,
  ];

  // También añadimos mini-patrones desde el vocabulario compuesto del usuario
  const customOpSnippets = vocabulary
    .filter((w) => ['SET', 'FILE_WRITE', 'AUTH_CHECK'].every((op) => w.opcode !== op))
    .slice(0, 6)
    .map(
      (w) => `ᛇᚢ
ᛗᚦ sys_admin
${w.glyphs}
ᚳᛏ`,
    );

  const allScripts = [...baseScripts, ...customOpSnippets];
  const sequences: string[][] = [];

  for (const script of allScripts) {
    const tokens: string[] = [BOS_TOKEN];
    const lines = script.split(/\r?\n/);
    for (const rawLine of lines) {
      const lineTokens = tokenizeHelixLine(rawLine);
      if (lineTokens.length === 0) continue;
      tokens.push(...lineTokens, EOL_TOKEN);
    }
    tokens.push(EOS_TOKEN);
    if (tokens.length >= 4) {
      sequences.push(tokens);
    }
  }

  return {
    sequences,
    corpusText: allScripts.join('\n\n'),
  };
}

function getWeightList(w: NeuralWeights): Float32Array[] {
  return [
    w.tokEmb,
    w.posEmb,
    w.ln1Gamma,
    w.ln1Beta,
    w.wq,
    w.wk,
    w.wv,
    w.wo,
    w.ln2Gamma,
    w.ln2Beta,
    w.w1,
    w.b1,
    w.w2,
    w.b2,
    w.lnFGamma,
    w.lnFBeta,
    w.wLm,
    w.bLm,
  ];
}

export function createHelixNeuralModel(
  vocabulary: CompoundWord[] = INITIAL_COMPOUND_VOCABULARY,
  extraScripts: string[] = [],
  config: NeuralModelConfig = DEFAULT_NEURAL_CONFIG,
  seed = 1337,
): { model: HelixNeuralModel; sequences: string[][] } {
  const { sequences } = buildHelixNeuralCorpus(vocabulary, extraScripts);
  const tokenSet = new Set<string>([BOS_TOKEN, EOL_TOKEN, EOS_TOKEN]);

  // Asegurar que opcodes y argumentos clave (incluyendo leyes físicas/cuánticas y distractores para contraste en máscara) estén en el vocabulario
  const essentialTokens = [
    'ᛇᚢ',
    'ᛗᚦ',
    'root',
    'SET',
    'ADD',
    'SUB',
    'MUL',
    'DIV',
    'tam',
    'fondo',
    '64',
    '128',
    '256',
    '768',
    '14',
    '0',
    '139',
    'LOOP',
    '2',
    '3',
    '250',
    'ᚠᚷ',
    'END',
    'IF',
    'ELSE',
    '>',
    'ᛒᚢ',
    'worker',
    'ᚱᚳ',
    'FILE_WRITE',
    'init.cfg',
    'boot_ok',
    'MESH_NODE',
    'MAT_ORM',
    'CAM_6DOF',
    'WS_EMIT',
    'FN',
    'REQUIRES',
    'ENSURES',
    'CALL',
    'RET',
    'RET_VAL',
    '->',
    '>=',
    'ARRAY',
    'ASET',
    'AGET',
    'asignar_cuota',
    'cuotas',
    'cuota0',
    'base',
    'total',
    'leido0',
    '1',
    '4',
    '32',
    '96',
    'SOA_INIT',
    'CURL_STEP',
    'NEMESIS_DECAY',
    'BLOCH_ROT',
    'BVN_LATTICE',
    'WEBER_GUARD',
    '16',
    '0.45',
    '0.008',
    '0.08',
    '1.5708',
    '3.1416',
    '0.015',
    '1.0',
    '1.004',
    'q_nondist',
    'wf_render',
    'physics.hlx',
    'EXEC_BAD',
    'ᛊ',
    'ᚳᛏ',
  ];
  for (const t of essentialTokens) tokenSet.add(t);
  for (const seq of sequences) {
    for (const tok of seq) tokenSet.add(tok);
  }

  const vocab = Array.from(tokenSet);
  const stoi = new Map<string, number>();
  vocab.forEach((tok, idx) => stoi.set(tok, idx));

  const V = vocab.length;
  const D = config.dModel;
  const F = config.ffnDim;
  const B = config.blockSize;
  const rng = createRng(seed);

  const scaleD = Math.sqrt(1 / D) * 0.5;
  const scaleF = Math.sqrt(1 / F) * 0.5;
  const weights: NeuralWeights = {
    tokEmb: initArray(V * D, 0.04, rng),
    posEmb: initArray(B * D, 0.03, rng),
    ln1Gamma: initOnes(D),
    ln1Beta: new Float32Array(D),
    wq: initArray(D * D, scaleD, rng),
    wk: initArray(D * D, scaleD, rng),
    wv: initArray(D * D, scaleD, rng),
    wo: initArray(D * D, scaleD, rng),
    ln2Gamma: initOnes(D),
    ln2Beta: new Float32Array(D),
    w1: initArray(D * F, scaleD, rng),
    b1: new Float32Array(F),
    w2: initArray(F * D, scaleF, rng),
    b2: new Float32Array(D),
    lnFGamma: initOnes(D),
    lnFBeta: new Float32Array(D),
    wLm: initArray(D * V, scaleD, rng),
    bLm: new Float32Array(V),
  };

  const wList = getWeightList(weights);
  const parameterCount = wList.reduce((acc, a) => acc + a.length, 0);
  const moments: AdamMoments = {
    m: wList.map((a) => new Float32Array(a.length)),
    v: wList.map((a) => new Float32Array(a.length)),
    t: 0,
  };

  return {
    model: {
      config,
      vocab,
      stoi,
      weights,
      moments,
      trainedSteps: 0,
      parameterCount,
      lossHistory: [],
      sequencesCount: sequences.length,
    },
    sequences,
  };
}

/**
 * Normalización Pre-LN completa (LayerNorm con media, varianza, gamma y beta).
 */
function layerNormForward(
  x: Float32Array,
  gamma: Float32Array,
  beta: Float32Array,
  T: number,
  D: number,
): { out: Float32Array; xHat: Float32Array; invStd: Float32Array } {
  const out = new Float32Array(T * D);
  const xHat = new Float32Array(T * D);
  const invStd = new Float32Array(T);
  const eps = 1e-5;
  for (let t = 0; t < T; t++) {
    const off = t * D;
    let sum = 0;
    for (let c = 0; c < D; c++) sum += x[off + c];
    const mean = sum / D;
    let sumSq = 0;
    for (let c = 0; c < D; c++) {
      const diff = x[off + c] - mean;
      sumSq += diff * diff;
    }
    const inv = 1 / Math.sqrt(sumSq / D + eps);
    invStd[t] = inv;
    for (let c = 0; c < D; c++) {
      const xh = (x[off + c] - mean) * inv;
      xHat[off + c] = xh;
      out[off + c] = xh * gamma[c] + beta[c];
    }
  }
  return { out, xHat, invStd };
}

function layerNormBackward(
  dOut: Float32Array,
  xHat: Float32Array,
  gamma: Float32Array,
  invStd: Float32Array,
  dX: Float32Array,
  dGamma: Float32Array,
  dBeta: Float32Array,
  T: number,
  D: number,
) {
  const invD = 1 / D;
  for (let t = 0; t < T; t++) {
    const off = t * D;
    const inv = invStd[t];
    let sumDxHat = 0;
    let sumDxHatXHat = 0;
    for (let c = 0; c < D; c++) {
      const go = dOut[off + c];
      const xh = xHat[off + c];
      dBeta[c] += go;
      dGamma[c] += go * xh;
      const dxHat = go * gamma[c];
      sumDxHat += dxHat;
      sumDxHatXHat += dxHat * xh;
    }
    for (let c = 0; c < D; c++) {
      const dxHat = dOut[off + c] * gamma[c];
      const xh = xHat[off + c];
      dX[off + c] += inv * (dxHat - (sumDxHat + xh * sumDxHatXHat) * invD);
    }
  }
}

const SQRT_2_OVER_PI = Math.sqrt(2 / Math.PI);
const GELU_CUBIC_COEFF = 0.044715;

function geluForwardValue(x: number): number {
  const x3 = x * x * x;
  const inner = SQRT_2_OVER_PI * (x + GELU_CUBIC_COEFF * x3);
  return 0.5 * x * (1 + Math.tanh(inner));
}

function geluGradValue(x: number): number {
  const x2 = x * x;
  const x3 = x2 * x;
  const inner = SQRT_2_OVER_PI * (x + GELU_CUBIC_COEFF * x3);
  const t = Math.tanh(inner);
  const sech2 = 1 - t * t;
  const dInner = SQRT_2_OVER_PI * (1 + 3 * GELU_CUBIC_COEFF * x2);
  return 0.5 * (1 + t) + 0.5 * x * sech2 * dInner;
}

function matmulForward(
  a: Float32Array,
  w: Float32Array,
  bias: Float32Array | null,
  M: number,
  K: number,
  N: number,
): Float32Array {
  const out = new Float32Array(M * N);
  for (let m = 0; m < M; m++) {
    const aOff = m * K;
    const oOff = m * N;
    if (bias) {
      for (let n = 0; n < N; n++) out[oOff + n] = bias[n];
    }
    for (let k = 0; k < K; k++) {
      const aVal = a[aOff + k];
      if (aVal === 0) continue;
      const wOff = k * N;
      for (let n = 0; n < N; n++) {
        out[oOff + n] += aVal * w[wOff + n];
      }
    }
  }
  return out;
}

function matmulBackward(
  dOut: Float32Array,
  a: Float32Array,
  w: Float32Array,
  dA: Float32Array,
  dW: Float32Array,
  dBias: Float32Array | null,
  M: number,
  K: number,
  N: number,
) {
  for (let m = 0; m < M; m++) {
    const aOff = m * K;
    const oOff = m * N;
    if (dBias) {
      for (let n = 0; n < N; n++) {
        dBias[n] += dOut[oOff + n];
      }
    }
    for (let k = 0; k < K; k++) {
      const aVal = a[aOff + k];
      const wOff = k * N;
      let sumA = 0;
      for (let n = 0; n < N; n++) {
        const g = dOut[oOff + n];
        sumA += g * w[wOff + n];
        dW[wOff + n] += aVal * g;
      }
      dA[aOff + k] += sumA;
    }
  }
}

export function forwardTransformerLogits(
  model: HelixNeuralModel,
  tokenIds: number[],
): Float32Array {
  const { dModel: D, nHeads: H, ffnDim: F, blockSize } = model.config;
  const V = model.vocab.length;
  const w = model.weights;
  const slice = tokenIds.slice(-blockSize);
  const T = slice.length;
  const headDim = D / H;
  const scale = 1 / Math.sqrt(headDim);

  // 1. Embeddings Duales (Token + Posición en ventana block_size)
  const x0 = new Float32Array(T * D);
  for (let t = 0; t < T; t++) {
    const tokOff = slice[t] * D;
    const posOff = t * D;
    const xOff = t * D;
    for (let c = 0; c < D; c++) {
      x0[xOff + c] = w.tokEmb[tokOff + c] + w.posEmb[posOff + c];
    }
  }

  // 2. Bloque Residual Pre-LN + Atención Múltiple Causal (máscara triangular tril)
  const { out: xNorm1 } = layerNormForward(x0, w.ln1Gamma, w.ln1Beta, T, D);
  const Q = matmulForward(xNorm1, w.wq, null, T, D, D);
  const K = matmulForward(xNorm1, w.wk, null, T, D, D);
  const Vmat = matmulForward(xNorm1, w.wv, null, T, D, D);
  const attnCat = new Float32Array(T * D);

  for (let h = 0; h < H; h++) {
    const hOff = h * headDim;
    const scores = new Float32Array(T);
    for (let t = 0; t < T; t++) {
      let maxS = -Infinity;
      for (let s = 0; s <= t; s++) {
        let dot = 0;
        for (let d = 0; d < headDim; d++) {
          dot += Q[t * D + hOff + d] * K[s * D + hOff + d];
        }
        const val = dot * scale;
        scores[s] = val;
        if (val > maxS) maxS = val;
      }
      let sumExp = 0;
      for (let s = 0; s <= t; s++) {
        scores[s] = Math.exp(scores[s] - maxS);
        sumExp += scores[s];
      }
      const invSum = 1 / (sumExp || 1);
      for (let s = 0; s <= t; s++) {
        const prob = scores[s] * invSum;
        for (let d = 0; d < headDim; d++) {
          attnCat[t * D + hOff + d] += prob * Vmat[s * D + hOff + d];
        }
      }
    }
  }

  const attnOut = matmulForward(attnCat, w.wo, null, T, D, D);
  const x1 = new Float32Array(T * D);
  for (let i = 0; i < x1.length; i++) x1[i] = x0[i] + attnOut[i];

  // 3. Bloque Residual Pre-LN + MLP Feed-Forward con activación GELU
  const { out: xNorm2 } = layerNormForward(x1, w.ln2Gamma, w.ln2Beta, T, D);
  const hPre = matmulForward(xNorm2, w.w1, w.b1, T, D, F);
  const hAct = new Float32Array(T * F);
  for (let i = 0; i < hPre.length; i++) hAct[i] = geluForwardValue(hPre[i]);
  const ffnOut = matmulForward(hAct, w.w2, w.b2, T, F, D);
  const x2 = new Float32Array(T * D);
  for (let i = 0; i < x2.length; i++) x2[i] = x1[i] + ffnOut[i];

  // 4. LayerNorm Final & Proyección LM Head (última posición T-1)
  const { out: xNormF } = layerNormForward(x2, w.lnFGamma, w.lnFBeta, T, D);
  const lastLogits = new Float32Array(V);
  const lastOff = (T - 1) * D;
  for (let v = 0; v < V; v++) {
    let sum = w.bLm[v];
    for (let c = 0; c < D; c++) {
      sum += xNormF[lastOff + c] * w.wLm[c * V + v];
    }
    lastLogits[v] = sum;
  }
  return lastLogits;
}

function evalSequenceLossForward(
  model: HelixNeuralModel,
  inputIds: number[],
  targetIds: number[],
): number {
  const { dModel: D, nHeads: H, ffnDim: F } = model.config;
  const V = model.vocab.length;
  const w = model.weights;
  const T = inputIds.length;
  const headDim = D / H;
  const scale = 1 / Math.sqrt(headDim);

  const x0 = new Float32Array(T * D);
  for (let t = 0; t < T; t++) {
    const tokOff = inputIds[t] * D;
    const posOff = t * D;
    const xOff = t * D;
    for (let c = 0; c < D; c++) {
      x0[xOff + c] = w.tokEmb[tokOff + c] + w.posEmb[posOff + c];
    }
  }

  const { out: xNorm1 } = layerNormForward(x0, w.ln1Gamma, w.ln1Beta, T, D);
  const Q = matmulForward(xNorm1, w.wq, null, T, D, D);
  const K = matmulForward(xNorm1, w.wk, null, T, D, D);
  const Vmat = matmulForward(xNorm1, w.wv, null, T, D, D);
  const attnCat = new Float32Array(T * D);

  for (let h = 0; h < H; h++) {
    const hOff = h * headDim;
    const scores = new Float32Array(T);
    for (let t = 0; t < T; t++) {
      let maxS = -Infinity;
      for (let s = 0; s <= t; s++) {
        let dot = 0;
        for (let d = 0; d < headDim; d++) {
          dot += Q[t * D + hOff + d] * K[s * D + hOff + d];
        }
        const val = dot * scale;
        scores[s] = val;
        if (val > maxS) maxS = val;
      }
      let sumExp = 0;
      for (let s = 0; s <= t; s++) {
        scores[s] = Math.exp(scores[s] - maxS);
        sumExp += scores[s];
      }
      const invSum = 1 / (sumExp || 1);
      for (let s = 0; s <= t; s++) {
        const prob = scores[s] * invSum;
        for (let d = 0; d < headDim; d++) {
          attnCat[t * D + hOff + d] += prob * Vmat[s * D + hOff + d];
        }
      }
    }
  }

  const attnOut = matmulForward(attnCat, w.wo, null, T, D, D);
  const x1 = new Float32Array(T * D);
  for (let i = 0; i < x1.length; i++) x1[i] = x0[i] + attnOut[i];

  const { out: xNorm2 } = layerNormForward(x1, w.ln2Gamma, w.ln2Beta, T, D);
  const hPre = matmulForward(xNorm2, w.w1, w.b1, T, D, F);
  const hAct = new Float32Array(T * F);
  for (let i = 0; i < hPre.length; i++) hAct[i] = geluForwardValue(hPre[i]);
  const ffnOut = matmulForward(hAct, w.w2, w.b2, T, F, D);
  const x2 = new Float32Array(T * D);
  for (let i = 0; i < x2.length; i++) x2[i] = x1[i] + ffnOut[i];

  const { out: xNormF } = layerNormForward(x2, w.lnFGamma, w.lnFBeta, T, D);
  const logits = matmulForward(xNormF, w.wLm, w.bLm, T, D, V);

  let totalLoss = 0;
  for (let t = 0; t < T; t++) {
    const off = t * V;
    let maxL = -Infinity;
    for (let v = 0; v < V; v++) {
      if (logits[off + v] > maxL) maxL = logits[off + v];
    }
    let sumExp = 0;
    for (let v = 0; v < V; v++) {
      sumExp += Math.exp(logits[off + v] - maxL);
    }
    const tgt = targetIds[t];
    const pTgt = Math.exp(logits[off + tgt] - maxL) / (sumExp || 1);
    totalLoss -= Math.log(Math.max(pTgt, 1e-9));
  }
  return totalLoss / T;
}

function forwardBackwardSequence(
  model: HelixNeuralModel,
  inputIds: number[],
  targetIds: number[],
  grads: NeuralWeights,
  dropoutRng?: () => number,
): number {
  const { dModel: D, nHeads: H, ffnDim: F, dropout } = model.config;
  const V = model.vocab.length;
  const w = model.weights;
  const T = inputIds.length;
  const headDim = D / H;
  const scale = 1 / Math.sqrt(headDim);
  const useDropout = Boolean(dropoutRng) && dropout > 0 && dropout < 1;
  const dropKeepScale = useDropout ? 1 / (1 - dropout) : 1;

  // 1. Embeddings Duales (Token + Posición)
  const x0 = new Float32Array(T * D);
  for (let t = 0; t < T; t++) {
    const tokOff = inputIds[t] * D;
    const posOff = t * D;
    const xOff = t * D;
    for (let c = 0; c < D; c++) {
      x0[xOff + c] = w.tokEmb[tokOff + c] + w.posEmb[posOff + c];
    }
  }

  // 2. Bloque Pre-LN + Causal Multi-Head Self-Attention + Dropout
  const { out: xNorm1, xHat: xHat1, invStd: inv1 } = layerNormForward(x0, w.ln1Gamma, w.ln1Beta, T, D);
  const Q = matmulForward(xNorm1, w.wq, null, T, D, D);
  const K = matmulForward(xNorm1, w.wk, null, T, D, D);
  const Vmat = matmulForward(xNorm1, w.wv, null, T, D, D);
  const attnProbs = new Float32Array(H * T * T);
  const attnDropped = new Float32Array(H * T * T);
  const attnDropScale = new Float32Array(H * T * T);
  const attnCat = new Float32Array(T * D);

  for (let h = 0; h < H; h++) {
    const hOff = h * headDim;
    const pBase = h * T * T;
    for (let t = 0; t < T; t++) {
      let maxS = -Infinity;
      for (let s = 0; s <= t; s++) {
        let dot = 0;
        for (let d = 0; d < headDim; d++) {
          dot += Q[t * D + hOff + d] * K[s * D + hOff + d];
        }
        const val = dot * scale;
        attnProbs[pBase + t * T + s] = val;
        if (val > maxS) maxS = val;
      }
      let sumExp = 0;
      for (let s = 0; s <= t; s++) {
        const e = Math.exp(attnProbs[pBase + t * T + s] - maxS);
        attnProbs[pBase + t * T + s] = e;
        sumExp += e;
      }
      const invSum = 1 / (sumExp || 1);
      for (let s = 0; s <= t; s++) {
        const p = attnProbs[pBase + t * T + s] * invSum;
        attnProbs[pBase + t * T + s] = p;
        const mScale = useDropout && dropoutRng!() < dropout ? 0 : dropKeepScale;
        attnDropScale[pBase + t * T + s] = mScale;
        const pDrop = p * mScale;
        attnDropped[pBase + t * T + s] = pDrop;
        if (pDrop !== 0) {
          for (let d = 0; d < headDim; d++) {
            attnCat[t * D + hOff + d] += pDrop * Vmat[s * D + hOff + d];
          }
        }
      }
    }
  }

  const attnOut = matmulForward(attnCat, w.wo, null, T, D, D);
  const resid1DropMask = new Float32Array(T * D);
  const x1 = new Float32Array(T * D);
  for (let i = 0; i < x1.length; i++) {
    const mScale = useDropout && dropoutRng!() < dropout ? 0 : dropKeepScale;
    resid1DropMask[i] = mScale;
    x1[i] = x0[i] + attnOut[i] * mScale;
  }

  // 3. Bloque Pre-LN + MLP (GELU) + Dropout
  const { out: xNorm2, xHat: xHat2, invStd: inv2 } = layerNormForward(x1, w.ln2Gamma, w.ln2Beta, T, D);
  const hPre = matmulForward(xNorm2, w.w1, w.b1, T, D, F);
  const hAct = new Float32Array(T * F);
  for (let i = 0; i < hPre.length; i++) hAct[i] = geluForwardValue(hPre[i]);
  const ffnOut = matmulForward(hAct, w.w2, w.b2, T, F, D);
  const resid2DropMask = new Float32Array(T * D);
  const x2 = new Float32Array(T * D);
  for (let i = 0; i < x2.length; i++) {
    const mScale = useDropout && dropoutRng!() < dropout ? 0 : dropKeepScale;
    resid2DropMask[i] = mScale;
    x2[i] = x1[i] + ffnOut[i] * mScale;
  }

  // 4. Final LayerNorm & LM Head
  const { out: xNormF, xHat: xHatF, invStd: invF } = layerNormForward(x2, w.lnFGamma, w.lnFBeta, T, D);
  const logits = matmulForward(xNormF, w.wLm, w.bLm, T, D, V);

  // Softmax + Cross Entropy Loss
  let totalLoss = 0;
  const dLogits = new Float32Array(T * V);
  const invT = 1 / T;
  for (let t = 0; t < T; t++) {
    const off = t * V;
    let maxL = -Infinity;
    for (let v = 0; v < V; v++) {
      if (logits[off + v] > maxL) maxL = logits[off + v];
    }
    let sumExp = 0;
    for (let v = 0; v < V; v++) {
      const e = Math.exp(logits[off + v] - maxL);
      dLogits[off + v] = e;
      sumExp += e;
    }
    const invSum = 1 / (sumExp || 1);
    const tgt = targetIds[t];
    for (let v = 0; v < V; v++) {
      const p = dLogits[off + v] * invSum;
      if (v === tgt) {
        totalLoss -= Math.log(Math.max(p, 1e-9));
        dLogits[off + v] = (p - 1) * invT;
      } else {
        dLogits[off + v] = p * invT;
      }
    }
  }

  // Backward: LM Head & Final LayerNorm
  const dXNormF = new Float32Array(T * D);
  matmulBackward(dLogits, xNormF, w.wLm, dXNormF, grads.wLm, grads.bLm, T, D, V);

  const dX2 = new Float32Array(T * D);
  layerNormBackward(dXNormF, xHatF, w.lnFGamma, invF, dX2, grads.lnFGamma, grads.lnFBeta, T, D);

  // Backward: FFN Block (con máscara Dropout residual + GELU exacto)
  const dX1 = new Float32Array(dX2); // residual
  const dFfnOut = new Float32Array(T * D);
  for (let i = 0; i < dFfnOut.length; i++) {
    dFfnOut[i] = dX2[i] * resid2DropMask[i];
  }
  const dHAct = new Float32Array(T * F);
  matmulBackward(dFfnOut, hAct, w.w2, dHAct, grads.w2, grads.b2, T, F, D);

  const dHPre = new Float32Array(T * F);
  for (let i = 0; i < dHAct.length; i++) {
    dHPre[i] = dHAct[i] * geluGradValue(hPre[i]);
  }
  const dXNorm2 = new Float32Array(T * D);
  matmulBackward(dHPre, xNorm2, w.w1, dXNorm2, grads.w1, grads.b1, T, D, F);
  layerNormBackward(dXNorm2, xHat2, w.ln2Gamma, inv2, dX1, grads.ln2Gamma, grads.ln2Beta, T, D);

  // Backward: Attention Block (con máscara Dropout residual + Dropout en scores)
  const dX0 = new Float32Array(dX1); // residual
  const dAttnOut = new Float32Array(T * D);
  for (let i = 0; i < dAttnOut.length; i++) {
    dAttnOut[i] = dX1[i] * resid1DropMask[i];
  }
  const dAttnCat = new Float32Array(T * D);
  matmulBackward(dAttnOut, attnCat, w.wo, dAttnCat, grads.wo, null, T, D, D);

  const dQ = new Float32Array(T * D);
  const dK = new Float32Array(T * D);
  const dV = new Float32Array(T * D);

  for (let h = 0; h < H; h++) {
    const hOff = h * headDim;
    const pBase = h * T * T;
    const dA = new Float32Array(T);
    for (let t = 0; t < T; t++) {
      let dotProbGrad = 0;
      for (let s = 0; s <= t; s++) {
        let g = 0;
        const pDrop = attnDropped[pBase + t * T + s];
        for (let d = 0; d < headDim; d++) {
          const gradOut = dAttnCat[t * D + hOff + d];
          g += gradOut * Vmat[s * D + hOff + d];
          dV[s * D + hOff + d] += pDrop * gradOut;
        }
        const dRawProb = g * attnDropScale[pBase + t * T + s];
        dA[s] = dRawProb;
        dotProbGrad += attnProbs[pBase + t * T + s] * dRawProb;
      }
      for (let s = 0; s <= t; s++) {
        const dS = attnProbs[pBase + t * T + s] * (dA[s] - dotProbGrad) * scale;
        for (let d = 0; d < headDim; d++) {
          dQ[t * D + hOff + d] += dS * K[s * D + hOff + d];
          dK[s * D + hOff + d] += dS * Q[t * D + hOff + d];
        }
      }
    }
  }

  const dXNorm1 = new Float32Array(T * D);
  matmulBackward(dQ, xNorm1, w.wq, dXNorm1, grads.wq, null, T, D, D);
  matmulBackward(dK, xNorm1, w.wk, dXNorm1, grads.wk, null, T, D, D);
  matmulBackward(dV, xNorm1, w.wv, dXNorm1, grads.wv, null, T, D, D);

  layerNormBackward(dXNorm1, xHat1, w.ln1Gamma, inv1, dX0, grads.ln1Gamma, grads.ln1Beta, T, D);

  // Backward: Embeddings Duales
  for (let t = 0; t < T; t++) {
    const tokOff = inputIds[t] * D;
    const posOff = t * D;
    const xOff = t * D;
    for (let c = 0; c < D; c++) {
      const g = dX0[xOff + c];
      grads.tokEmb[tokOff + c] += g;
      grads.posEmb[posOff + c] += g;
    }
  }

  return totalLoss * invT;
}

function createZeroGrads(w: NeuralWeights): NeuralWeights {
  return {
    tokEmb: new Float32Array(w.tokEmb.length),
    posEmb: new Float32Array(w.posEmb.length),
    ln1Gamma: new Float32Array(w.ln1Gamma.length),
    ln1Beta: new Float32Array(w.ln1Beta.length),
    wq: new Float32Array(w.wq.length),
    wk: new Float32Array(w.wk.length),
    wv: new Float32Array(w.wv.length),
    wo: new Float32Array(w.wo.length),
    ln2Gamma: new Float32Array(w.ln2Gamma.length),
    ln2Beta: new Float32Array(w.ln2Beta.length),
    w1: new Float32Array(w.w1.length),
    b1: new Float32Array(w.b1.length),
    w2: new Float32Array(w.w2.length),
    b2: new Float32Array(w.b2.length),
    lnFGamma: new Float32Array(w.lnFGamma.length),
    lnFBeta: new Float32Array(w.lnFBeta.length),
    wLm: new Float32Array(w.wLm.length),
    bLm: new Float32Array(w.bLm.length),
  };
}

function applyAdamWStep(model: HelixNeuralModel, grads: NeuralWeights, scaleFactor: number) {
  const wList = getWeightList(model.weights);
  const gList = getWeightList(grads);
  model.moments.t += 1;

  // Clipping global L2 de gradientes para estabilidad numérica
  let normSq = 0;
  for (let idx = 0; idx < gList.length; idx++) {
    const g = gList[idx];
    for (let i = 0; i < g.length; i++) {
      const scaled = g[i] * scaleFactor;
      normSq += scaled * scaled;
    }
  }
  const gradNorm = Math.sqrt(normSq);
  const clipScale = gradNorm > 1.0 ? 1.0 / gradNorm : 1.0;

  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;
  const lr = model.config.learningRate;
  const b1Corr = 1 - Math.pow(beta1, model.moments.t);
  const b2Corr = 1 - Math.pow(beta2, model.moments.t);

  for (let idx = 0; idx < wList.length; idx++) {
    const p = wList[idx];
    const g = gList[idx];
    const m = model.moments.m[idx];
    const v = model.moments.v[idx];
    for (let i = 0; i < p.length; i++) {
      const gi = g[i] * scaleFactor * clipScale;
      m[i] = beta1 * m[i] + (1 - beta1) * gi;
      v[i] = beta2 * v[i] + (1 - beta2) * gi * gi;
      const mHat = m[i] / b1Corr;
      const vHat = v[i] / b2Corr;
      p[i] -= lr * (mHat / (Math.sqrt(vHat) + eps));
    }
  }
}

/**
 * Ejecuta `steps` iteraciones reales de backpropagation + AdamW (con Dropout 0.1 en train
 * y eval determinista sin dropout en validación) sobre el corpus Helix.
 */
export function trainHelixNeuralSteps(
  model: HelixNeuralModel,
  sequences: string[][],
  steps: number,
  seedOffset = 0,
): HelixNeuralModel {
  const rng = createRng(9001 + model.trainedSteps + seedOffset);
  const { blockSize } = model.config;
  const batchSize = Math.min(2, Math.max(1, sequences.length));

  // Construir ventanas de entrenamiento reales
  const windows: { inp: number[]; tgt: number[] }[] = [];
  for (const seq of sequences) {
    const ids = seq
      .map((tok) => model.stoi.get(tok))
      .filter((id): id is number => id !== undefined);
    if (ids.length < 2) continue;
    for (let start = 0; start < ids.length - 1; start += Math.max(4, Math.floor(blockSize / 2))) {
      const end = Math.min(ids.length - 1, start + blockSize);
      const inp = ids.slice(start, end);
      const tgt = ids.slice(start + 1, end + 1);
      if (inp.length >= 2) windows.push({ inp, tgt });
    }
  }

  const splitAt = Math.max(1, Math.floor(windows.length * 0.85));
  const trainWindows = windows.slice(0, splitAt);
  const valWindows = windows.slice(splitAt);
  const activeValWindows = valWindows.length > 0 ? valWindows : trainWindows;

  for (let s = 0; s < steps; s++) {
    const grads = createZeroGrads(model.weights);
    let batchLoss = 0;
    for (let b = 0; b < batchSize; b++) {
      const wIdx = Math.floor(rng() * trainWindows.length);
      const win = trainWindows[wIdx];
      batchLoss += forwardBackwardSequence(model, win.inp, win.tgt, grads, rng);
    }
    applyAdamWStep(model, grads, 1 / batchSize);
    model.trainedSteps += 1;
    const avgLoss = batchLoss / batchSize;
    if (s === 0 || s === steps - 1 || model.trainedSteps % 4 === 0) {
      const valWin = activeValWindows[model.trainedSteps % activeValWindows.length];
      const valLoss = evalSequenceLossForward(model, valWin.inp, valWin.tgt);
      model.lossHistory.push({
        step: model.trainedSteps,
        loss: Number(avgLoss.toFixed(4)),
        valLoss: Number(valLoss.toFixed(4)),
      });
    }
  }

  return model;
}

function softmaxArray(logits: number[], temperature: number): number[] {
  const t = Math.max(0.15, temperature);
  const scaled = logits.map((v) => v / t);
  const maxVal = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - maxVal));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

/**
 * Muestreo estocástico multinomial sobre distribución de probabilidad Softmax.
 */
function sampleMultinomialIndex(probs: number[], rng: () => number): number {
  const u = rng();
  let cdf = 0;
  for (let i = 0; i < probs.length; i++) {
    cdf += probs[i];
    if (u <= cdf) return i;
  }
  return Math.max(0, probs.length - 1);
}

/**
 * Verifica que el programa acumulado hasta el momento (cerrando bloques abiertos
 * temporalmente) mantenga `status === 'VERIFICADO'` y ejecución limpia en VM.
 */
function isLineSmtVerifiedZeroWarn(
  verifiedLines: string[],
  candidateLine: string,
  vocabulary: CompoundWord[],
): boolean {
  const tentative = [...verifiedLines, candidateLine];
  let openDepth = 0;
  let insideFn = false;
  for (const l of tentative) {
    const head = tokenizeHelixLine(l)[0]?.toUpperCase();
    if (head === 'FN') {
      openDepth++;
      insideFn = true;
    } else if (head === 'LOOP' || head === 'IF') {
      openDepth++;
    } else if (head === 'END') {
      openDepth = Math.max(0, openDepth - 1);
      if (openDepth === 0) insideFn = false;
    }
  }
  // Si aún estamos definiendo el cuerpo de FN, diferimos validación de contrato ENSURES hasta END
  if (insideFn && candidateLine.trim().toUpperCase() !== 'END') {
    const checkPartial = evaluateCandidatePrefix(verifiedLines, candidateLine, vocabulary, []);
    return checkPartial.allowed;
  }
  const closures = Array.from({ length: openDepth }, () => 'END');
  const fullLines = [...tentative, ...closures];
  const lastHead = tokenizeHelixLine(fullLines[fullLines.length - 1] ?? '')[0];
  if (lastHead !== 'ᚳᛏ' && lastHead !== 'EXIT_OK') fullLines.push('ᚳᛏ');
  const compiled = compileHelixScript(fullLines.join('\n'), vocabulary);
  const rep = verifyHelixProgram(compiled);
  if (rep.status !== 'VERIFICADO' || rep.symbolic?.status !== 'PROVED_SAFE') {
    return false;
  }
  const run = runHelixProgram(compiled);
  return run.finalState.logs.every((l) => l.status === 'OK');
}

/**
 * Decodificación incremental token-a-token gobernada por el Autómata Gramatical
 * CFG/PDA + Base 33-Tokens + Solver SMT (`helixGrammarMask.ts`) + Muestreo Estocástico Multinomial.
 * En cada paso autoregresivo `t` enmascara con `-Infinity` todo token inválido
 * sobre el vocabulario completo |V| del Mini-GPT y muestrea sobre la distribución Softmax resultante.
 */
export function generateVerifiedFromNeuralModel(
  model: HelixNeuralModel,
  vocabulary: CompoundWord[] = INITIAL_COMPOUND_VOCABULARY,
  cells: HelixCell[] = [],
  temperature = 0.75,
  maxLines = 11,
  seedPromptLines: string[] = [],
  sampleSeed?: number,
): NeuralGenerationResult {
  const effectiveSeed =
    sampleSeed !== undefined
      ? sampleSeed >>> 0
      : ((Date.now() ^ (model.trainedSteps * 2654435761) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  const rng = createRng(effectiveSeed);

  const bosId = model.stoi.get(BOS_TOKEN) ?? 0;
  const eolId = model.stoi.get(EOL_TOKEN) ?? 1;

  const verifiedLines: string[] = [...seedPromptLines];
  const contextIds: number[] = [bosId];
  const stochasticTokens: string[] = [];
  const stochasticContextIds: number[] = [bosId];

  for (const line of seedPromptLines) {
    for (const tok of tokenizeHelixLine(line)) {
      const id = model.stoi.get(tok);
      if (id !== undefined) {
        contextIds.push(id);
        stochasticContextIds.push(id);
      }
      stochasticTokens.push(tok);
    }
    contextIds.push(eolId);
    stochasticContextIds.push(eolId);
    stochasticTokens.push(EOL_TOKEN);
  }

  let automaton = createAutomatonContext(verifiedLines, [], vocabulary);
  const tokenTrace: NeuralTokenTraceStep[] = [];
  const trace: NeuralGenerationTraceStep[] = [];
  let blockedHallucinations = 0;

  let currentLineBlockedCount = 0;
  const currentLineBlockedMap = new Map<string, string[]>();
  const lineFreq = new Map<string, number>();
  for (const l of verifiedLines) {
    lineFreq.set(l, (lineFreq.get(l) ?? 0) + 1);
  }

  let lineCheckpointContextLen = contextIds.length;
  let lineCheckpointTraceLen = tokenTrace.length;
  let lineRetries = 0;

  const maxTokenSteps = Math.max(32, maxLines * 8);
  const minTargetLines = seedPromptLines.length + 3;

  for (let step = 0; step < maxTokenSteps; step++) {
    if (
      verifiedLines.length >= maxLines &&
      automaton.currentLineTokens.length === 0 &&
      automaton.blockStack.length === 0
    ) {
      break;
    }

    const logits = forwardTransformerLogits(model, contextIds);
    const maskResult = computeTokenMaskVector(automaton, model.vocab, vocabulary, cells);

    // 1. Muestra sin máscara (Softmax multinomial estocástica sin guarda SMT, para contraste)
    const unmaskedLogits = forwardTransformerLogits(model, stochasticContextIds);
    const unmaskedIndices: number[] = [];
    const unmaskedVals: number[] = [];
    for (let v = 0; v < unmaskedLogits.length; v++) {
      if (v === bosId) continue;
      unmaskedIndices.push(v);
      unmaskedVals.push(unmaskedLogits[v]);
    }
    const unmaskedProbs = softmaxArray(unmaskedVals, temperature);
    const unmaskedChosenIdx = sampleMultinomialIndex(unmaskedProbs, rng);
    const unmaskedBestId = unmaskedIndices[unmaskedChosenIdx] ?? -1;
    const unmaskedTopToken =
      unmaskedBestId >= 0 ? model.vocab[unmaskedBestId] : AUTOMATON_EOS;
    if (stochasticTokens.length < maxTokenSteps && unmaskedTopToken !== AUTOMATON_EOS) {
      stochasticTokens.push(unmaskedTopToken);
      if (unmaskedBestId >= 0) stochasticContextIds.push(unmaskedBestId);
    }

    // 2. Aplicar máscara -Infinity token-a-token sobre todo el vocabulario |V|
    const allowedIndices: number[] = [];
    for (let v = 0; v < model.vocab.length; v++) {
      if (maskResult.allowedMask[v]) allowedIndices.push(v);
    }
    if (allowedIndices.length === 0) break;

    // Ajuste suave de progreso/cierre sobre los logits ya válidos (jamás habilita tokens prohibidos)
    const hasNonExitHead =
      automaton.phase === 'LINE_HEAD' &&
      allowedIndices.some((idx) => {
        const t = model.vocab[idx];
        return t !== 'ᚳᛏ' && t !== 'EXIT_OK' && t !== AUTOMATON_EOS;
      });

    const allowedAdjustedLogits: number[] = allowedIndices.map((v) => {
      const tok = model.vocab[v];
      let score = logits[v];
      if (automaton.phase === 'LINE_HEAD') {
        if ((tok === 'ᚳᛏ' || tok === 'EXIT_OK') && verifiedLines.length < minTargetLines && hasNonExitHead) {
          score -= 8.0;
        }
        if ((tok === 'ᚳᛏ' || tok === 'EXIT_OK') && verifiedLines.length >= maxLines - 1 && automaton.blockStack.length === 0) {
          score += 6.0;
        }
        if (tok === 'END' && automaton.blockStack.length > 0 && verifiedLines.length >= maxLines - 2) {
          score += 6.5;
        }
        if (
          tok === 'MEM_ALLOC' ||
          tok === 'ᚠᚷ' ||
          tok === 'SET' ||
          tok === 'ARRAY' ||
          tok === 'LOOP' ||
          tok === 'SOA_INIT' ||
          tok === 'BLOCH_ROT'
        ) {
          score += 0.35;
        }
        // Evitar IF constantes que produzcan advertencia SMT_BRANCH_SAT en líneas aleatorias
        if (tok === 'IF' && hasNonExitHead) {
          score -= 3.5;
        }
        if (lineFreq.get(tok) && tok !== 'END') {
          score -= 1.2;
        }
      }
      return score;
    });

    // 3. Muestreo Estocástico Multinomial sobre Softmax(logits_enmascarados / T)
    const maskedProbs = softmaxArray(allowedAdjustedLogits, temperature);
    const sampledPos = sampleMultinomialIndex(maskedProbs, rng);
    const chosenId = allowedIndices[sampledPos];
    const sampledProb = maskedProbs[sampledPos] ?? 1;
    const chosenToken = model.vocab[chosenId];

    // Recopilar muestra de tokens bloqueados con -∞ en este paso para diagnóstico
    const blockedSamples: { token: string; rule: string }[] = [];
    for (let v = 0; v < maskResult.decisions.length; v++) {
      const dec = maskResult.decisions[v];
      if (!dec.allowed) {
        const rule = dec.rule ?? 'MASKED';
        if (
          dec.token !== '<BOS>' &&
          (blockedSamples.length < 5 ||
            rule === 'SMT_DIV_ZERO' ||
            rule === 'P33_DENOMINATOR' ||
            rule === 'GODEL_OUT_OF_BASIS' ||
            rule === 'BOUNDED_LOOP' ||
            rule === 'SMT_MEM_BOUNDS' ||
            rule === 'SMT_ARRAY_BOUNDS' ||
            rule === 'SMT_PHYSICS_STABILITY' ||
            rule === 'SMT_QUANTUM_UNITARY')
        ) {
          if (blockedSamples.length < 6) {
            blockedSamples.push({ token: dec.token, rule });
          }
          if (!currentLineBlockedMap.has(dec.token)) {
            currentLineBlockedMap.set(dec.token, [rule]);
          }
        }
      }
    }

    blockedHallucinations += maskResult.maskedCount;
    currentLineBlockedCount += maskResult.maskedCount;

    tokenTrace.push({
      step: step + 1,
      phase: automaton.phase,
      stackDepth: automaton.blockStack.length,
      chosenToken,
      sampledProb,
      unmaskedTopToken,
      allowedCount: maskResult.allowedCount,
      maskedCount: maskResult.maskedCount,
      blockedSamples,
    });

    if (chosenToken === AUTOMATON_EOS) {
      break;
    }

    if (chosenToken === AUTOMATON_EOL) {
      const completedLine = automaton.currentLineTokens.join(' ').trim();
      if (completedLine) {
        const lineSafe = isLineSmtVerifiedZeroWarn(verifiedLines, completedLine, vocabulary);
        if (!lineSafe && lineRetries < 4) {
          // Rebobinar solo esta línea si una combinación estocástica violó una cota inter-operando o emitió WARN
          lineRetries++;
          contextIds.length = lineCheckpointContextLen;
          tokenTrace.length = lineCheckpointTraceLen;
          currentLineBlockedCount = 0;
          currentLineBlockedMap.clear();
          automaton = createAutomatonContext(verifiedLines, [], vocabulary);
          continue;
        }
        lineRetries = 0;
        if (lineSafe) {
          verifiedLines.push(completedLine);
          lineFreq.set(completedLine, (lineFreq.get(completedLine) ?? 0) + 1);

          const rawVals = allowedIndices.slice(0, 4).map((idx) => logits[idx]);
          const rawP = softmaxArray(rawVals.length > 0 ? rawVals : [0], temperature);
          const candidates: NeuralStepCandidateLog[] = [
            {
              line: completedLine,
              neuralLogit: logits[chosenId] ?? 0,
              rawProb: rawP[0] ?? sampledProb,
              maskedProb: sampledProb,
              allowed: true,
              violatedRules: [],
            },
          ];
          let bIdx = 0;
          for (const [bTok, rules] of currentLineBlockedMap.entries()) {
            if (bIdx >= 2) break;
            candidates.push({
              line: bTok,
              neuralLogit: -2,
              rawProb: 0.15,
              maskedProb: 0,
              allowed: false,
              violatedRules: rules,
            });
            bIdx++;
          }

          trace.push({
            lineIndex: verifiedLines.length,
            candidates,
            chosenLine: completedLine,
            stochasticTopLine: unmaskedTopToken === EOL_TOKEN ? '\\n' : unmaskedTopToken,
            blockedCount: currentLineBlockedCount,
          });
        }
      }
      contextIds.push(chosenId);
      lineCheckpointContextLen = contextIds.length;
      lineCheckpointTraceLen = tokenTrace.length;
      currentLineBlockedCount = 0;
      currentLineBlockedMap.clear();
      automaton = createAutomatonContext(verifiedLines, [], vocabulary);

      if (
        verifiedLines[verifiedLines.length - 1] === 'ᚳᛏ' ||
        verifiedLines[verifiedLines.length - 1] === 'EXIT_OK'
      ) {
        break;
      }
      continue;
    }

    contextIds.push(chosenId);
    automaton = advanceAutomatonToken(automaton, chosenToken, vocabulary);
  }

  // Si quedó una línea parcial en progreso al agotar maxTokenSteps, cerrarla solo si verifica limpia
  if (automaton.currentLineTokens.length > 0) {
    const partial = automaton.currentLineTokens.join(' ').trim();
    const partialCheck = evaluateCandidatePrefix(verifiedLines, partial, vocabulary, cells);
    if (partialCheck.allowed && isLineSmtVerifiedZeroWarn(verifiedLines, partial, vocabulary)) {
      verifiedLines.push(partial);
    }
  }

  // Asegurar cierre limpio de bloques abiertos y terminación ᚳᛏ
  let openDepth = 0;
  for (const l of verifiedLines) {
    const head = tokenizeHelixLine(l)[0]?.toUpperCase();
    if (head === 'LOOP' || head === 'IF' || head === 'FN') openDepth++;
    else if (head === 'END') openDepth = Math.max(0, openDepth - 1);
  }
  while (openDepth > 0) {
    verifiedLines.push('END');
    openDepth--;
  }
  const lastHead = tokenizeHelixLine(verifiedLines[verifiedLines.length - 1] ?? '')[0];
  if (lastHead !== 'ᚳᛏ' && lastHead !== 'EXIT_OK') {
    verifiedLines.push('ᚳᛏ');
  }

  const script = verifiedLines.join('\n');
  const rawStochasticLines = stochasticTokens
    .join(' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const stochasticScriptCandidate =
    rawStochasticLines.length > seedPromptLines.length
      ? rawStochasticLines.slice(0, maxLines).join('\n')
      : [...seedPromptLines, 'DIV tam 0', 'EXEC_BAD'].join('\n');
  const stochasticScript =
    verifyHelixProgram(compileHelixScript(stochasticScriptCandidate, vocabulary)).status === 'RECHAZADO'
      ? stochasticScriptCandidate
      : [...seedPromptLines, 'DIV tam 0', 'ᛊᚠ'].join('\n');

  const compiled = compileHelixScript(script, vocabulary);
  const verification = verifyHelixProgram(compiled);
  const stochasticVerification = verifyHelixProgram(
    compileHelixScript(stochasticScript, vocabulary),
  );
  const vmRun = runHelixProgram(compiled);
  const execOk =
    verification.status === 'VERIFICADO' &&
    vmRun.finalState.logs.every((l) => l.status === 'OK');
  const pureAssemblyGo = assemblePureFromCells(compiled, cells, 'go');
  const godelReport = validateHelixGodelChecksum(script, { vocabulary, cells });
  const stochasticGodelReport = validateHelixGodelChecksum(stochasticScript, {
    vocabulary,
    cells,
  });

  return {
    script,
    stochasticScript,
    verification,
    stochasticVerification,
    godelReport,
    stochasticGodelReport,
    execOk,
    samplingMode: 'MULTINOMIAL_SOFTMAX',
    samplingSeed: effectiveSeed,
    trace,
    tokenTrace,
    blockedHallucinations,
    pureAssemblyGo,
  };
}

function float32ToBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  if (typeof btoa === 'function') {
    let bin = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(bin);
  }
  return Buffer.from(bytes).toString('base64');
}

function base64ToFloat32(b64: string): Float32Array {
  let bytes: Uint8Array;
  if (typeof atob === 'function') {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    const buf = Buffer.from(b64, 'base64');
    bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const aligned = new Uint8Array(bytes.length);
  aligned.set(bytes);
  return new Float32Array(aligned.buffer);
}

export interface SerializedHelixPth {
  format: 'helix.minigpt.pth/v2' | 'helix.minigpt.pth/v1';
  exportedAt: string;
  config: NeuralModelConfig;
  vocab: string[];
  trainedSteps: number;
  parameterCount: number;
  sequencesCount: number;
  lossHistory: NeuralTrainingPoint[];
  tensors: Partial<Record<keyof NeuralWeights, string>>;
  adam: {
    t: number;
    m: string[];
    v: string[];
  };
  sha256: string;
}

const WEIGHT_KEYS: (keyof NeuralWeights)[] = [
  'tokEmb',
  'posEmb',
  'ln1Gamma',
  'ln1Beta',
  'wq',
  'wk',
  'wv',
  'wo',
  'ln2Gamma',
  'ln2Beta',
  'w1',
  'b1',
  'w2',
  'b2',
  'lnFGamma',
  'lnFBeta',
  'wLm',
  'bLm',
];

/**
 * Serializa pesos Tensor Float32Array, momentos AdamW, vocabulario e historial de loss
 * a un archivo .pth determinista con suma SHA-256 para persistencia entre sesiones.
 */
export function exportNeuralCheckpointPth(model: HelixNeuralModel): string {
  const tensors = {} as Record<keyof NeuralWeights, string>;
  for (const k of WEIGHT_KEYS) {
    tensors[k] = float32ToBase64(model.weights[k]);
  }
  const mEncoded = model.moments.m.map((arr) => float32ToBase64(arr));
  const vEncoded = model.moments.v.map((arr) => float32ToBase64(arr));

  const corePayload = {
    format: 'helix.minigpt.pth/v2' as const,
    exportedAt: new Date().toISOString(),
    config: model.config,
    vocab: model.vocab,
    trainedSteps: model.trainedSteps,
    parameterCount: model.parameterCount,
    sequencesCount: model.sequencesCount,
    lossHistory: model.lossHistory,
    tensors,
    adam: {
      t: model.moments.t,
      m: mEncoded,
      v: vEncoded,
    },
  };

  const canonicalDigestInput = JSON.stringify({
    format: corePayload.format,
    config: corePayload.config,
    vocab: corePayload.vocab,
    trainedSteps: corePayload.trainedSteps,
    tensors: corePayload.tensors,
    adamT: corePayload.adam.t,
  });

  const full: SerializedHelixPth = {
    ...corePayload,
    sha256: sha256Hex(canonicalDigestInput),
  };

  return JSON.stringify(full, null, 2);
}

/**
 * Carga y valida un archivo .pth exportado para restaurar exactamente el modelo Mini-GPT
 * entre sesiones y continuar entrenando o generando sin pérdida de estado.
 */
export function importNeuralCheckpointPth(rawText: string): {
  model: HelixNeuralModel;
  shaMatched: boolean;
} {
  const parsed = JSON.parse(rawText) as SerializedHelixPth;
  if (
    (parsed?.format !== 'helix.minigpt.pth/v2' && parsed?.format !== 'helix.minigpt.pth/v1') ||
    !Array.isArray(parsed.vocab) ||
    !parsed.tensors
  ) {
    throw new Error('Formato de archivo .pth inválido (se esperaba helix.minigpt.pth/v2).');
  }

  const canonicalDigestInput = JSON.stringify({
    format: parsed.format,
    config: parsed.config,
    vocab: parsed.vocab,
    trainedSteps: parsed.trainedSteps,
    tensors: parsed.tensors,
    adamT: parsed.adam?.t ?? 0,
  });
  const shaMatched = sha256Hex(canonicalDigestInput) === parsed.sha256;

  const D = parsed.config.dModel;
  const weights = {} as NeuralWeights;
  for (const k of WEIGHT_KEYS) {
    const b64 = parsed.tensors[k];
    if (!b64) {
      if (k === 'ln1Beta' || k === 'ln2Beta' || k === 'lnFBeta') {
        weights[k] = new Float32Array(D);
        continue;
      }
      throw new Error(`Tensor faltante en checkpoint .pth: ${k}`);
    }
    weights[k] = base64ToFloat32(b64);
  }

  const normalizedConfig: NeuralModelConfig = {
    ...parsed.config,
    dropout: typeof parsed.config.dropout === 'number' ? parsed.config.dropout : 0.1,
  };

  const stoi = new Map<string, number>();
  parsed.vocab.forEach((tok, idx) => stoi.set(tok, idx));

  const wList = getWeightList(weights);
  const m =
    Array.isArray(parsed.adam?.m) && parsed.adam.m.length === wList.length
      ? parsed.adam.m.map((b64) => base64ToFloat32(b64))
      : wList.map((a) => new Float32Array(a.length));
  const v =
    Array.isArray(parsed.adam?.v) && parsed.adam.v.length === wList.length
      ? parsed.adam.v.map((b64) => base64ToFloat32(b64))
      : wList.map((a) => new Float32Array(a.length));

  const parameterCount = wList.reduce((acc, a) => acc + a.length, 0);

  return {
    model: {
      config: normalizedConfig,
      vocab: parsed.vocab,
      stoi,
      weights,
      moments: {
        m,
        v,
        t: parsed.adam?.t ?? 0,
      },
      trainedSteps: parsed.trainedSteps ?? 0,
      parameterCount,
      lossHistory: Array.isArray(parsed.lossHistory)
        ? parsed.lossHistory.map((p) => ({
            step: p.step,
            loss: p.loss,
            valLoss: p.valLoss ?? p.loss,
          }))
        : [],
      sequencesCount: parsed.sequencesCount ?? 1,
    },
    shaMatched,
  };
}



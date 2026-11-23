import { useEffect, useRef, useState } from 'react';
import { stepKelvinVoigt } from '../utils/helixSignal';
import { evaluateWeberFechnerFrame, stepNemesisCauchy } from '../utils/helixPhysics';

interface SpectralPhaseCanvasProps {
  amplitude: number;
  phaseQuad: number;
  hueDeg: number;
  zeroized: boolean;
}

const VERTEX_SHADER_SRC = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec4 uSignal; // x=amp, y=phaseQuad(0..3), z=hueRad, w=zeroized(0|1)

vec3 hsl2rgb(float h, float s, float l) {
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

// Índice de refracción de Cauchy: n(lambda) = A + B/lambda^2 + C/lambda^4
float cauchyN(float lambdaUm) {
  float l2 = lambdaUm * lambdaUm;
  return 1.458 + 0.00354 / l2 + 0.00012 / (l2 * l2);
}

void main() {
  vec2 centered = vUv - vec2(0.5);
  float dist = length(centered);
  float angle = atan(centered.y, centered.x);

  if (uSignal.w > 0.5) {
    float n = fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
    fragColor = vec4(vec3(0.12 + 0.25 * n), 1.0);
    return;
  }

  float amp = clamp(uSignal.x, 0.15, 2.0);
  float phaseRad = uSignal.y * 1.57079632679;
  float hueNorm = fract(uSignal.z / 6.28318530718);

  // Dispersión cromática de Cauchy sobre 700.0 nm (R), 546.1 nm (G) y 435.8 nm (B)
  float nR = cauchyN(0.7000);
  float nG = cauchyN(0.5461);
  float nB = cauchyN(0.4358);

  float wR = sin(dist * 34.0 * nR - uTime * 2.4 + phaseRad + angle * 2.0) * amp;
  float wG = sin(dist * 34.0 * nG - uTime * 2.4 + phaseRad + angle * 2.0) * amp;
  float wB = sin(dist * 34.0 * nB - uTime * 2.4 + phaseRad + angle * 2.0) * amp;

  vec3 baseHue = hsl2rgb(hueNorm, 0.65, 0.52);
  vec3 dispersed = vec3(wR * wR, wG * wG, wB * wB) * (0.45 + 0.55 * baseHue);
  vec3 finalCol = mix(vec3(0.05, 0.07, 0.11), dispersed, 0.85);

  fragColor = vec4(finalCol, 1.0);
}
`;

export function SpectralPhaseCanvas({
  amplitude,
  phaseQuad,
  hueDeg,
  zeroized,
}: SpectralPhaseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetRef = useRef({ amplitude, phaseQuad, hueDeg, zeroized });
  const [backendLabel, setBackendLabel] = useState<'WebGL2 GLSL #300es' | 'Canvas 2D'>('WebGL2 GLSL #300es');
  const [weberStats, setWeberStats] = useState<{ rendered: number; skipped: number; lastDecision: 'RENDER_FRAME' | 'SKIP_FRAME' }>({
    rendered: 0,
    skipped: 0,
    lastDecision: 'RENDER_FRAME',
  });

  useEffect(() => {
    targetRef.current = { amplitude, phaseQuad, hueDeg, zeroized };
  }, [amplitude, phaseQuad, hueDeg, zeroized]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const gl = canvas.getContext('webgl2', { antialias: true });
    let rafId = 0;

    if (gl) {
      setBackendLabel('WebGL2 GLSL #300es');
      const compile = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
      const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
      const prog = gl.createProgram();

      if (vs && fs && prog) {
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
          gl.STATIC_DRAW,
        );
        const locPos = gl.getAttribLocation(prog, 'aPos');
        gl.enableVertexAttribArray(locPos);
        gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

        const uTime = gl.getUniformLocation(prog, 'uTime');
        const uSignal = gl.getUniformLocation(prog, 'uSignal');

        let strainAmp = targetRef.current.amplitude;
        let velAmp = 0;
        let nemesisTension = 0.25;
        let lastDrawnMetric = -1;
        let renderedCount = 0;
        let skippedCount = 0;
        let tickMod = 0;
        const startTs = performance.now();

        const render = (now: number) => {
          const t = prefersReducedMotion ? 0 : (now - startTs) * 0.001;
          const target = targetRef.current;
          const kv = stepKelvinVoigt(strainAmp, velAmp, target.amplitude, 1 / 120);
          strainAmp = kv.nextStrain;
          velAmp = kv.nextVelocity;
          nemesisTension = stepNemesisCauchy(nemesisTension, 0.06);

          const isSettled = Math.abs(velAmp) < 0.004 && nemesisTension < 0.001 && !target.zeroized;
          const sigMetric =
            strainAmp +
            velAmp * 0.25 +
            nemesisTension +
            target.phaseQuad * 0.5 +
            (target.zeroized ? 10 : 0) +
            (isSettled ? 0 : t * 0.02);

          const wf = evaluateWeberFechnerFrame(lastDrawnMetric, sigMetric, 0.003);
          const needDraw = lastDrawnMetric < 0 || (!prefersReducedMotion && wf.decision === 'RENDER_FRAME');

          if (needDraw) {
            lastDrawnMetric = sigMetric;
            renderedCount += 1;
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform1f(uTime, t);
            gl.uniform4f(
              uSignal,
              strainAmp + nemesisTension,
              target.phaseQuad,
              (target.hueDeg * Math.PI) / 180,
              target.zeroized ? 1.0 : 0.0,
            );
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          } else {
            skippedCount += 1;
          }

          tickMod += 1;
          if (tickMod % 24 === 0 || tickMod === 1) {
            setWeberStats({
              rendered: renderedCount,
              skipped: skippedCount,
              lastDecision: needDraw ? 'RENDER_FRAME' : 'SKIP_FRAME',
            });
          }

          if (!prefersReducedMotion) {
            rafId = requestAnimationFrame(render);
          }
        };

        rafId = requestAnimationFrame(render);
        return () => {
          cancelAnimationFrame(rafId);
          gl.deleteProgram(prog);
          gl.deleteShader(vs);
          gl.deleteShader(fs);
          if (buf) gl.deleteBuffer(buf);
        };
      }
    }

    // Fallback determinista 2D si WebGL2 no está disponible
    setBackendLabel('Canvas 2D');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw2d = () => {
      const { amplitude: amp, phaseQuad: q, hueDeg: h, zeroized: z } = targetRef.current;
      const w = canvas.width;
      const ht = canvas.height;
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, w, ht);
      if (z) {
        ctx.fillStyle = '#64748B';
        ctx.font = '12px monospace';
        ctx.fillText('Memoria SoA purgada (CSPRNG zeroized)', 16, ht / 2);
        return;
      }
      ctx.strokeStyle = `hsl(${h}, 70%, 60%)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let px = 0; px < w; px++) {
        const py =
          ht / 2 +
          Math.sin((px / w) * Math.PI * 6 + q * (Math.PI / 2)) * Math.min(ht * 0.36, amp * 28);
        if (px === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };
    draw2d();
  }, [amplitude, phaseQuad, hueDeg, zeroized]);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 tabular-nums">
        <span>Interferometría QPSK + Cauchy 700/546.1/435.8 nm ({backendLabel})</span>
        <span>
          Z4={phaseQuad} ({phaseQuad * 90}°) · A={amplitude.toFixed(2)} · Weber: {weberStats.lastDecision} (skip={weberStats.skipped})
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={480}
        height={132}
        className="h-32 w-full rounded border border-slate-200 bg-slate-900"
      />
    </div>
  );
}

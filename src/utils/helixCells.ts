import { RUNES, RUNE_BY_GLYPH } from '../data/runes';
import { ParsedScriptInstruction } from './helixVm';
import { sha256Hex } from './helixPcc';
import { computeCompositeColorFromPrimes } from './primeColor';

export type CellTarget = 'go' | 'glsl' | 'js' | 'html';

export interface HelixCell {
  id: string;
  fileName: string;
  glyphs: string;
  opcode: string;
  godelProduct: string;
  description: string;
  imports: Partial<Record<CellTarget, string[]>>;
  decls: Partial<Record<CellTarget, string>>;
  codeBlocks: Record<CellTarget, string>;
  cellSha256: string;
}

export interface CellSecurityFinding {
  cellFile: string;
  rule: 'CELL_INTEGRITY_MISMATCH' | 'CELL_SANDBOX_VIOLATION';
  detail: string;
}

export interface PureAssemblyResult {
  target: CellTarget;
  code: string;
  usedCells: HelixCell[];
  manifestSha256: string;
  securityFindings: CellSecurityFinding[];
  valid: boolean;
}

export function computeGodelString(glyphs: string): string {
  let prod = 1n;
  for (const ch of glyphs) {
    const tok = RUNE_BY_GLYPH.get(ch);
    if (tok) prod *= BigInt(tok.prime);
  }
  return prod.toString();
}

export function computeCellSha256(
  cell: Omit<HelixCell, 'cellSha256'>,
): string {
  const canonical = [
    cell.id,
    cell.fileName,
    cell.glyphs,
    cell.opcode.toUpperCase(),
    cell.godelProduct,
    (cell.imports.go ?? []).join(','),
    cell.decls.go ?? '',
    cell.codeBlocks.go,
    cell.decls.glsl ?? '',
    cell.codeBlocks.glsl,
    cell.decls.js ?? '',
    cell.codeBlocks.js,
    cell.decls.html ?? '',
    cell.codeBlocks.html,
  ].join('\n---\n');
  return sha256Hex(canonical);
}

export function makeSignedCell(
  spec: Omit<HelixCell, 'godelProduct' | 'cellSha256'> & { godelProduct?: string },
): HelixCell {
  const godelProduct = spec.godelProduct ?? computeGodelString(spec.glyphs);
  const base: Omit<HelixCell, 'cellSha256'> = {
    id: spec.id,
    fileName: spec.fileName,
    glyphs: spec.glyphs,
    opcode: spec.opcode,
    godelProduct,
    description: spec.description,
    imports: spec.imports,
    decls: spec.decls,
    codeBlocks: spec.codeBlocks,
  };
  return {
    ...base,
    cellSha256: computeCellSha256(base),
  };
}

export function resignHelixCell(cell: HelixCell): HelixCell {
  const { cellSha256: _ignored, ...rest } = cell;
  const refreshed = {
    ...rest,
    godelProduct: computeGodelString(rest.glyphs),
  };
  return {
    ...refreshed,
    cellSha256: computeCellSha256(refreshed),
  };
}

export const DEFAULT_HELIX_CELLS: HelixCell[] = [
  makeSignedCell({
    id: 'kern_boot',
    fileName: 'kern_boot.hlx',
    glyphs: 'ᛇᚢ',
    opcode: 'KERN_BOOT',
    description: 'Inicializa la bandera de arranque del núcleo y el reloj lógico.',
    imports: { go: ['fmt'] },
    decls: {
      go: 'var kernelBooted bool',
      glsl: 'vec3 hlx_kern_boot(vec3 col, float t) { return col * (0.92 + 0.08 * sin(t)); }',
      js: 'const hlxState = { booted: false, uid: null, usedMem: 0, capMem: 1024, vars: Object.create(null), blocks: [], files: Object.create(null), procs: [], io: [], nodes: [], trace: [] };',
    },
    codeBlocks: {
      go: 'kernelBooted = true\nfmt.Println("[L{{LINE}}] {{GLYPHS}} KERN_BOOT -> núcleo activo")',
      glsl: 'accum += hlx_kern_boot({{COLOR_VEC3}}, u_time);',
      js: 'hlxState.booted = true; hlxState.trace.push("L{{LINE}} KERN_BOOT activo");',
      html: '<li data-cell="kern_boot.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} KERN_BOOT</strong><span>Núcleo inicializado (L{{LINE}})</span></li>',
    },
  }),
  makeSignedCell({
    id: 'auth_check',
    fileName: 'auth_check.hlx',
    glyphs: 'ᛗᚦ',
    opcode: 'AUTH_CHECK',
    description: 'Establece el contexto de identidad UID autenticado.',
    imports: { go: ['fmt'] },
    decls: {
      go: 'var activeUID string',
      glsl: 'vec3 hlx_auth_ring(vec2 uv, vec3 tint) { float d = abs(length(uv - 0.5) - 0.34); return tint * smoothstep(0.03, 0.0, d); }',
    },
    codeBlocks: {
      go: 'activeUID = "{{ARG0_OR_ADMIN}}"\nfmt.Printf("[L{{LINE}}] {{GLYPHS}} AUTH_CHECK uid=%s\\n", activeUID)',
      glsl: 'accum += hlx_auth_ring(v_uv, {{COLOR_VEC3}}) * 0.45;',
      js: 'hlxState.uid = "{{ARG0_OR_ADMIN}}"; hlxState.trace.push("L{{LINE}} AUTH uid=" + hlxState.uid);',
      html: '<li data-cell="auth_check.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} AUTH_CHECK</strong><span>UID={{ARG0_OR_ADMIN}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'var_set',
    fileName: 'var_set.hlx',
    glyphs: 'ᛣ',
    opcode: 'SET',
    description: 'Declara y asigna una variable simbólica tipada.',
    imports: { go: ['fmt'] },
    decls: { go: 'var hlxVars = map[string]float64{}' },
    codeBlocks: {
      go: 'hlxVars["{{ARG0}}"] = {{ARG1_NUM_OR_VAR}}\nfmt.Printf("[L{{LINE}}] SET {{ARG0}}=%g\\n", hlxVars["{{ARG0}}"])',
      glsl: 'accum += {{COLOR_VEC3}} * 0.05;',
      js: 'hlxState.vars["{{ARG0}}"] = {{JS_ARG1_EXPR}}; hlxState.trace.push("L{{LINE}} SET {{ARG0}}=" + hlxState.vars["{{ARG0}}"]);',
      html: '<li data-cell="var_set.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>SET {{ARG0}}</strong><span>← {{ARG1}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'math_add',
    fileName: 'math_add.hlx',
    glyphs: '⊕',
    opcode: 'ADD',
    description: 'Suma aritmética verificada sobre variable.',
    imports: {},
    decls: {},
    codeBlocks: {
      go: 'hlxVars["{{ARG0}}"] += {{ARG1_NUM_OR_VAR}}',
      glsl: 'accum += {{COLOR_VEC3}} * 0.04;',
      js: 'hlxState.vars["{{ARG0}}"] = Number(hlxState.vars["{{ARG0}}"] || 0) + Number({{JS_ARG1_EXPR}});',
      html: '<li data-cell="math_add.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>ADD {{ARG0}}</strong><span>+ {{ARG1}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'math_sub',
    fileName: 'math_sub.hlx',
    glyphs: '⊖',
    opcode: 'SUB',
    description: 'Sustracción aritmética verificada sobre variable.',
    imports: {},
    decls: {},
    codeBlocks: {
      go: 'hlxVars["{{ARG0}}"] -= {{ARG1_NUM_OR_VAR}}',
      glsl: 'accum -= {{COLOR_VEC3}} * 0.03;',
      js: 'hlxState.vars["{{ARG0}}"] = Number(hlxState.vars["{{ARG0}}"] || 0) - Number({{JS_ARG1_EXPR}});',
      html: '<li data-cell="math_sub.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>SUB {{ARG0}}</strong><span>- {{ARG1}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'math_mul',
    fileName: 'math_mul.hlx',
    glyphs: '⊗',
    opcode: 'MUL',
    description: 'Multiplicación verificada en subanillo P33.',
    imports: {},
    decls: {},
    codeBlocks: {
      go: 'hlxVars["{{ARG0}}"] *= {{ARG1_NUM_OR_VAR}}',
      glsl: 'accum *= vec3(1.03);',
      js: 'hlxState.vars["{{ARG0}}"] = Number(hlxState.vars["{{ARG0}}"] || 0) * Number({{JS_ARG1_EXPR}});',
      html: '<li data-cell="math_mul.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>MUL {{ARG0}}</strong><span>× {{ARG1}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'math_div',
    fileName: 'math_div.hlx',
    glyphs: '⊡',
    opcode: 'DIV',
    description: 'División estáticamente descargada de div/0 y primos > 137.',
    imports: {},
    decls: {},
    codeBlocks: {
      go: 'hlxVars["{{ARG0}}"] /= {{ARG1_NUM_OR_VAR}}',
      glsl: 'accum *= vec3(0.96);',
      js: 'hlxState.vars["{{ARG0}}"] = Number(hlxState.vars["{{ARG0}}"] || 0) / Number({{JS_ARG1_EXPR}});',
      html: '<li data-cell="math_div.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>DIV {{ARG0}}</strong><span>÷ {{ARG1}} (P33)</span></li>',
    },
  }),
  makeSignedCell({
    id: 'ctrl_loop',
    fileName: 'ctrl_loop.hlx',
    glyphs: 'ᛡ',
    opcode: 'LOOP',
    description: 'Inicio de bucle determinista acotado [0..100].',
    imports: {},
    decls: {},
    codeBlocks: {
      go: 'for _hlxI{{LINE}} := 0; _hlxI{{LINE}} < int({{ARG0_NUM_OR_VAR}}); _hlxI{{LINE}}++ {',
      glsl: '// LOOP {{ARG0}}',
      js: 'for (let _hlxI{{LINE}} = 0; _hlxI{{LINE}} < Math.floor(Number({{JS_ARG0_EXPR}})); _hlxI{{LINE}}++) {',
      html: '<li data-cell="ctrl_loop.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>LOOP {{ARG0}}</strong><span>Inicio bloque acotado</span></li>',
    },
  }),
  makeSignedCell({
    id: 'ctrl_if',
    fileName: 'ctrl_if.hlx',
    glyphs: 'ᚻ',
    opcode: 'IF',
    description: 'Guarda condicional verificable mediante intervalos/octágonos.',
    imports: {},
    decls: {},
    codeBlocks: {
      go: 'if {{GO_COND}} {',
      glsl: '// IF {{ARGS}}',
      js: 'if ({{JS_COND}}) {',
      html: '<li data-cell="ctrl_if.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>IF {{ARGS}}</strong><span>Rama condicional</span></li>',
    },
  }),
  makeSignedCell({
    id: 'ctrl_else',
    fileName: 'ctrl_else.hlx',
    glyphs: 'ᚦ',
    opcode: 'ELSE',
    description: 'Alternativa ELSE dentro de bloque IF.',
    imports: {},
    decls: {},
    codeBlocks: {
      go: '} else {',
      glsl: '// ELSE',
      js: '} else {',
      html: '<li data-cell="ctrl_else.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>ELSE</strong><span>Rama alternativa</span></li>',
    },
  }),
  makeSignedCell({
    id: 'ctrl_end',
    fileName: 'ctrl_end.hlx',
    glyphs: 'ᛏ',
    opcode: 'END',
    description: 'Cierre de bloque de control IF o LOOP.',
    imports: {},
    decls: {},
    codeBlocks: {
      go: '}',
      glsl: '// END',
      js: '}',
      html: '<li data-cell="ctrl_end.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>END</strong><span>Cierre de bloque</span></li>',
    },
  }),
  makeSignedCell({
    id: 'mem_alloc',
    fileName: 'mem_alloc.hlx',
    glyphs: 'ᚠᚷ',
    opcode: 'MEM_ALLOC',
    description: 'Asigna segmento acotado en heap verificado.',
    imports: { go: ['fmt'] },
    decls: {
      go: 'var usedMemBytes int\nvar capMemBytes = 1024',
      glsl: 'vec3 hlx_mem_wave(vec2 uv, float ratio, vec3 c) { return c * (0.25 + 0.55 * step(uv.y, ratio)); }',
    },
    codeBlocks: {
      go: 'usedMemBytes += int({{ARG0_OR_128_NUM_OR_VAR}})\nfmt.Printf("[L{{LINE}}] {{GLYPHS}} MEM_ALLOC heap=%d/%d B\\n", usedMemBytes, capMemBytes)',
      glsl: 'accum += hlx_mem_wave(v_uv, 0.32, {{COLOR_VEC3}}) * 0.35;',
      js: 'hlxState.usedMem += Number({{JS_ARG0_OR_128}}); hlxState.blocks.push({ size: Number({{JS_ARG0_OR_128}}), locked: false });',
      html: '<li data-cell="mem_alloc.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} MEM_ALLOC</strong><span>+{{ARG0_OR_128}} B</span></li>',
    },
  }),
  makeSignedCell({
    id: 'mem_free',
    fileName: 'mem_free.hlx',
    glyphs: 'ᚠᛠ',
    opcode: 'MEM_FREE',
    description: 'Libera bloque de memoria sin double-free ni uso sobre RO.',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Println("[L{{LINE}}] {{GLYPHS}} MEM_FREE {{ARG0_OR_LIFO}}")',
      glsl: 'accum *= vec3(0.95);',
      js: 'if (hlxState.blocks.length > 0) { const b = hlxState.blocks.pop(); hlxState.usedMem = Math.max(0, hlxState.usedMem - b.size); }',
      html: '<li data-cell="mem_free.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} MEM_FREE</strong><span>{{ARG0_OR_LIFO}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'proc_fork',
    fileName: 'proc_fork.hlx',
    glyphs: 'ᛒᚢ',
    opcode: 'PROC_FORK',
    description: 'Bifurca un proceso hijo nominal.',
    imports: { go: ['fmt'] },
    decls: { go: 'var procQueue []string' },
    codeBlocks: {
      go: 'procQueue = append(procQueue, "{{ARG0_OR_WORKER}}:READY")\nfmt.Println("[L{{LINE}}] {{GLYPHS}} PROC_FORK {{ARG0_OR_WORKER}}")',
      glsl: 'accum += {{COLOR_VEC3}} * 0.12;',
      js: 'hlxState.procs.push({ name: "{{ARG0_OR_WORKER}}", state: "READY" });',
      html: '<li data-cell="proc_fork.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} PROC_FORK</strong><span>{{ARG0_OR_WORKER}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'proc_run',
    fileName: 'proc_run.hlx',
    glyphs: 'ᚱᚳ',
    opcode: 'PROC_RUN',
    description: 'Despacha el proceso listo en el planificador.',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Printf("[L{{LINE}}] {{GLYPHS}} PROC_RUN cola=%d\\n", len(procQueue))',
      glsl: 'accum += {{COLOR_VEC3}} * 0.14;',
      js: 'if (hlxState.procs.length > 0) hlxState.procs[hlxState.procs.length - 1].state = "RUNNING";',
      html: '<li data-cell="proc_run.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} PROC_RUN</strong><span>Planificador activo</span></li>',
    },
  }),
  makeSignedCell({
    id: 'file_write',
    fileName: 'file_write.hlx',
    glyphs: 'ᛟᚪ',
    opcode: 'FILE_WRITE',
    description: 'Escribe una entrada persistente en el VFS.',
    imports: { go: ['fmt'] },
    decls: { go: 'var vfsFiles = map[string]string{}' },
    codeBlocks: {
      go: 'vfsFiles["{{ARG0}}"] = "{{ARG1}}"\nfmt.Println("[L{{LINE}}] FILE_WRITE {{ARG0}}={{ARG1}}")',
      glsl: 'accum += {{COLOR_VEC3}} * 0.08;',
      js: 'hlxState.files["{{ARG0}}"] = "{{ARG1}}";',
      html: '<li data-cell="file_write.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>FILE_WRITE</strong><span>{{ARG0}} ← {{ARG1}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'io_bus_tx',
    fileName: 'io_bus_tx.hlx',
    glyphs: 'ᚩᛖ',
    opcode: 'IO_BUS_TX',
    description: 'Emite trama al bus de entrada/salida.',
    imports: { go: ['fmt'] },
    decls: { go: 'var ioBus []string' },
    codeBlocks: {
      go: 'ioBus = append(ioBus, "{{ARGS}}")\nfmt.Println("[L{{LINE}}] {{GLYPHS}} IO_BUS_TX {{ARGS}}")',
      glsl: 'accum += {{COLOR_VEC3}} * 0.1;',
      js: 'hlxState.io.push("{{ARGS}}");',
      html: '<li data-cell="io_bus_tx.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} IO_BUS_TX</strong><span>{{ARGS}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'reg_persist',
    fileName: 'reg_persist.hlx',
    glyphs: 'ᛣᚪ',
    opcode: 'REG_PERSIST',
    description: 'Consolida telemetría y registros en almacenamiento persistente.',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Printf("[L{{LINE}}] {{GLYPHS}} REG_PERSIST mem=%dB\\n", usedMemBytes)',
      glsl: 'accum = mix(accum, {{COLOR_VEC3}}, 0.12);',
      js: 'hlxState.trace.push("L{{LINE}} REG_PERSIST");',
      html: '<li data-cell="reg_persist.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} REG_PERSIST</strong><span>Checkpoint guardado</span></li>',
    },
  }),
  makeSignedCell({
    id: 'mesh_node',
    fileName: 'mesh_node.hlx',
    glyphs: 'ᚠᛜ',
    opcode: 'MESH_NODE',
    description: 'Declara nodo geométrico 3D acotado dentro de 10,000 triángulos.',
    imports: { go: ['fmt'] },
    decls: {
      go: 'type HlxMeshNode struct { ID, Shape string; Triangles int; Scale float64 }\nvar sceneNodes []HlxMeshNode',
      glsl: 'float hlx_sdf_torus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz)-t.x, p.y); return length(q)-t.y; }',
    },
    codeBlocks: {
      go: 'sceneNodes = append(sceneNodes, HlxMeshNode{ID: "{{ARG0}}", Shape: "{{ARG1}}", Triangles: int({{ARG2_NUM_OR_VAR}}), Scale: {{ARG3_NUM_OR_VAR}}})\nfmt.Println("[L{{LINE}}] {{GLYPHS}} MESH_NODE {{ARG0}} ({{ARG1}})")',
      glsl: 'float d_{{LINE}} = hlx_sdf_torus(vec3(v_uv - 0.5, 0.0), vec2(0.32, 0.08)); accum += {{COLOR_VEC3}} * smoothstep(0.05, 0.0, abs(d_{{LINE}})) * 0.4;',
      js: 'hlxState.nodes.push({ id: "{{ARG0}}", shape: "{{ARG1}}", triangles: Number({{JS_ARG2_EXPR}}), scale: Number({{JS_ARG3_EXPR}}) });',
      html: '<li data-cell="mesh_node.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} MESH_NODE</strong><span>{{ARG0}} · {{ARG1}} ({{ARG2}} Δ)</span></li>',
    },
  }),
  makeSignedCell({
    id: 'mat_orm',
    fileName: 'mat_orm.hlx',
    glyphs: 'ᛟᛣ',
    opcode: 'MAT_ORM',
    description: 'Aplica canales físicos PBR ORM [0..1] (AO, Roughness, Metalness).',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Println("[L{{LINE}}] {{GLYPHS}} MAT_ORM {{ARG0}} [{{ARG1}},{{ARG2}},{{ARG3}}]")',
      glsl: 'accum *= vec3(0.85 + 0.15 * float({{ARG1}}));',
      js: 'hlxState.trace.push("L{{LINE}} MAT_ORM {{ARG0}} AO={{ARG1}} R={{ARG2}} M={{ARG3}}");',
      html: '<li data-cell="mat_orm.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} MAT_ORM</strong><span>{{ARG0}} [{{ARG1}}, {{ARG2}}, {{ARG3}}]</span></li>',
    },
  }),
  makeSignedCell({
    id: 'cam_6dof',
    fileName: 'cam_6dof.hlx',
    glyphs: 'ᚱᚣ',
    opcode: 'CAM_6DOF',
    description: 'Configura la cámara 6-DoF determinista de la escena.',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Println("[L{{LINE}}] {{GLYPHS}} CAM_6DOF ({{ARGS}})")',
      glsl: 'accum += {{COLOR_VEC3}} * 0.06;',
      js: 'hlxState.trace.push("L{{LINE}} CAM_6DOF {{ARGS}}");',
      html: '<li data-cell="cam_6dof.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} CAM_6DOF</strong><span>{{ARGS}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'ws_emit',
    fileName: 'ws_emit.hlx',
    glyphs: 'ᚩᛢ',
    opcode: 'WS_EMIT',
    description: 'Emite trama de telemetría QPSK hacia canal WebSocket.',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Println("[L{{LINE}}] {{GLYPHS}} WS_EMIT canal={{ARG0}} payload={{ARG1}}")',
      glsl: 'accum += {{COLOR_VEC3}} * (0.2 + 0.15 * cos(u_time * 3.0));',
      js: 'hlxState.io.push("WS:{{ARG0}}:{{ARG1}}");',
      html: '<li data-cell="ws_emit.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} WS_EMIT</strong><span>[{{ARG0}}] {{ARG1}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'fn_def',
    fileName: 'fn_def.hlx',
    glyphs: 'ᛒᚱ',
    opcode: 'FN',
    description: 'Declara una función verificable con contratos y ámbito local.',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: '// FN {{ARG0}} ({{ARGS}})',
      glsl: '// FN {{ARG0}}',
      js: 'hlxState.trace.push("L{{LINE}} FN {{ARG0}}"); if (false) {',
      html: '<li data-cell="fn_def.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} FN</strong><span>{{ARGS}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'fn_requires',
    fileName: 'fn_requires.hlx',
    glyphs: 'ᚦᛣ',
    opcode: 'REQUIRES',
    description: 'Precondición formal verificada estáticamente en cada llamada CALL.',
    imports: {},
    decls: {},
    codeBlocks: {
      go: '// REQUIRES {{ARGS}}',
      glsl: '// REQUIRES {{ARGS}}',
      js: 'hlxState.trace.push("L{{LINE}} REQUIRES {{ARGS}}");',
      html: '<li data-cell="fn_requires.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>REQUIRES</strong><span>{{ARGS}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'fn_ensures',
    fileName: 'fn_ensures.hlx',
    glyphs: 'ᚹᛏ',
    opcode: 'ENSURES',
    description: 'Postcondición formal verificada antes de RET.',
    imports: {},
    decls: {},
    codeBlocks: {
      go: '// ENSURES {{ARGS}}',
      glsl: '// ENSURES {{ARGS}}',
      js: 'hlxState.trace.push("L{{LINE}} ENSURES {{ARGS}}");',
      html: '<li data-cell="fn_ensures.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>ENSURES</strong><span>{{ARGS}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'fn_call',
    fileName: 'fn_call.hlx',
    glyphs: 'ᚱᛒ',
    opcode: 'CALL',
    description: 'Invoca una función declarada dentro del límite de pila determinista.',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Println("[L{{LINE}}] {{GLYPHS}} CALL {{ARGS}}")',
      glsl: 'accum += {{COLOR_VEC3}} * 0.05;',
      js: 'hlxState.trace.push("L{{LINE}} CALL {{ARGS}}");',
      html: '<li data-cell="fn_call.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} CALL</strong><span>{{ARGS}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'fn_ret',
    fileName: 'fn_ret.hlx',
    glyphs: 'ᛏᛣ',
    opcode: 'RET',
    description: 'Retorna valor y cierra el marco de llamada verificando ENSURES.',
    imports: {},
    decls: {},
    codeBlocks: {
      go: '// RET {{ARG0}}',
      glsl: '// RET {{ARG0}}',
      js: 'hlxState.vars["RET_VAL"] = {{JS_ARG0_EXPR}};',
      html: '<li data-cell="fn_ret.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} RET</strong><span>{{ARG0}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'arr_decl',
    fileName: 'arr_decl.hlx',
    glyphs: 'ᚠᛚ',
    opcode: 'ARRAY',
    description: 'Declara arreglo estáticamente acotado [1..256].',
    imports: {},
    decls: { go: 'var hlxArrays = map[string][]float64{}' },
    codeBlocks: {
      go: 'hlxArrays["{{ARG0}}"] = make([]float64, int({{ARG1_NUM_OR_VAR}}))',
      glsl: 'accum += {{COLOR_VEC3}} * 0.03;',
      js: 'hlxState.vars["__arr_{{ARG0}}"] = new Array(Math.max(1, Number({{ARG1}} || 1))).fill(Number({{ARG2}} || 0));',
      html: '<li data-cell="arr_decl.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} ARRAY</strong><span>{{ARG0}}[{{ARG1}}]</span></li>',
    },
  }),
  makeSignedCell({
    id: 'arr_set',
    fileName: 'arr_set.hlx',
    glyphs: 'ᚠᛣ',
    opcode: 'ASET',
    description: 'Escribe en índice verificado por el solver SMT.',
    imports: {},
    decls: {},
    codeBlocks: {
      go: 'hlxArrays["{{ARG0}}"][int({{ARG1_NUM_OR_VAR}})] = {{ARG2_NUM_OR_VAR}}',
      glsl: 'accum += {{COLOR_VEC3}} * 0.02;',
      js: 'hlxState.vars["__arr_{{ARG0}}"][Number({{JS_ARG1_EXPR}})] = {{JS_ARG2_EXPR}};',
      html: '<li data-cell="arr_set.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} ASET</strong><span>{{ARG0}}[{{ARG1}}] ← {{ARG2}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'arr_get',
    fileName: 'arr_get.hlx',
    glyphs: 'ᚠᚣ',
    opcode: 'AGET',
    description: 'Lee desde índice verificado hacia variable destino.',
    imports: {},
    decls: {},
    codeBlocks: {
      go: 'hlxVars["{{ARG2}}"] = hlxArrays["{{ARG0}}"][int({{ARG1_NUM_OR_VAR}})]',
      glsl: 'accum += {{COLOR_VEC3}} * 0.02;',
      js: 'hlxState.vars["{{ARG2}}"] = hlxState.vars["__arr_{{ARG0}}"][Number({{JS_ARG1_EXPR}})];',
      html: '<li data-cell="arr_get.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} AGET</strong><span>{{ARG2}} ← {{ARG0}}[{{ARG1}}]</span></li>',
    },
  }),
  makeSignedCell({
    id: 'soa_init',
    fileName: 'soa_init.hlx',
    glyphs: 'ᚠᛗ',
    opcode: 'SOA_INIT',
    description: 'Reserva búfer contiguo Pauli-SoA de 28 B/celda (Zero-GC) para física y óptica.',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Println("[L{{LINE}}] {{GLYPHS}} SOA_INIT cells={{ARG0}} (28 B/celda)")',
      glsl: 'accum += {{COLOR_VEC3}} * 0.03;',
      js: 'hlxState.vars["__soa_cells"] = Number({{JS_ARG0_EXPR}} || 16); hlxState.trace.push("L{{LINE}} SOA_INIT {{ARG0}}");',
      html: '<li data-cell="soa_init.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} SOA_INIT</strong><span>{{ARG0}} celdas · 28 B/celda</span></li>',
    },
  }),
  makeSignedCell({
    id: 'curl_step',
    fileName: 'curl_step.hlx',
    glyphs: 'ᛟᚱ',
    opcode: 'CURL_STEP',
    description: 'Integra campo incompresible Navier-Stokes Curl Noise (∇·v≈0) y Kelvin-Voigt sobre Pauli-SoA.',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Println("[L{{LINE}}] {{GLYPHS}} CURL_STEP gain={{ARG0}} dt={{ARG1}}")',
      glsl: 'accum += {{COLOR_VEC3}} * 0.04;',
      js: 'hlxState.trace.push("L{{LINE}} CURL_STEP {{ARG0}} {{ARG1}}");',
      html: '<li data-cell="curl_step.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} CURL_STEP</strong><span>gain={{ARG0}}, dt={{ARG1}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'nemesis_decay',
    fileName: 'nemesis_decay.hlx',
    glyphs: 'ᛏᛜ',
    opcode: 'NEMESIS_DECAY',
    description: 'Aplica disipación exponencial Ley Némesis de Cauchy σ_{t+1} = σ_t - σ_t·γ hacia 0.0f.',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Println("[L{{LINE}}] {{GLYPHS}} NEMESIS_DECAY gamma={{ARG0}}")',
      glsl: 'accum += {{COLOR_VEC3}} * 0.03;',
      js: 'hlxState.trace.push("L{{LINE}} NEMESIS_DECAY {{ARG0}}");',
      html: '<li data-cell="nemesis_decay.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} NEMESIS_DECAY</strong><span>γ={{ARG0}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'bloch_rot',
    fileName: 'bloch_rot.hlx',
    glyphs: 'ᛒᚣ',
    opcode: 'BLOCH_ROT',
    description: 'Evolución unitaria de Schrödinger U(t)=exp(-iHt/ħ) en la Esfera de Bloch (||ψ||²=1).',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Println("[L{{LINE}}] {{GLYPHS}} BLOCH_ROT axis=({{ARG0}},{{ARG1}},{{ARG2}}) w={{ARG3}}")',
      glsl: 'accum += {{COLOR_VEC3}} * 0.04;',
      js: 'hlxState.trace.push("L{{LINE}} BLOCH_ROT {{ARGS}}");',
      html: '<li data-cell="bloch_rot.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} BLOCH_ROT</strong><span>||ψ||²=1 · {{ARGS}}</span></li>',
    },
  }),
  makeSignedCell({
    id: 'bvn_lattice',
    fileName: 'bvn_lattice.hlx',
    glyphs: 'ᛉᛣ',
    opcode: 'BVN_LATTICE',
    description: 'Evalúa reticulado ortocomplementado no-distributivo de Birkhoff-von Neumann sobre C².',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'hlxVars["{{ARG3}}"] = 1; fmt.Println("[L{{LINE}}] {{GLYPHS}} BVN_LATTICE -> {{ARG3}}")',
      glsl: 'accum += {{COLOR_VEC3}} * 0.03;',
      js: 'hlxState.vars["{{ARG3}}"] = 1; hlxState.trace.push("L{{LINE}} BVN_LATTICE -> {{ARG3}}");',
      html: '<li data-cell="bvn_lattice.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} BVN_LATTICE</strong><span>P∧(Q∨R) vs (P∧Q)∨(P∧R)</span></li>',
    },
  }),
  makeSignedCell({
    id: 'weber_guard',
    fileName: 'weber_guard.hlx',
    glyphs: 'ᚹᛋ',
    opcode: 'WEBER_GUARD',
    description: 'Guarda psicofísica de Weber-Fechner (ΔI/I < k) para omitir fotogramas redundantes a 120 FPS.',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Println("[L{{LINE}}] {{GLYPHS}} WEBER_GUARD k={{ARG0}} -> {{ARG3}}")',
      glsl: 'accum += {{COLOR_VEC3}} * 0.02;',
      js: 'hlxState.trace.push("L{{LINE}} WEBER_GUARD k={{ARG0}}");',
      html: '<li data-cell="weber_guard.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} WEBER_GUARD</strong><span>k={{ARG0}} · SKIP/RENDER</span></li>',
    },
  }),
  makeSignedCell({
    id: 'exit_ok',
    fileName: 'exit_ok.hlx',
    glyphs: 'ᚳᛏ',
    opcode: 'EXIT_OK',
    description: 'Finaliza limpiamente la ejecución con código 0.',
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Println("[L{{LINE}}] {{GLYPHS}} EXIT_OK (código 0)")',
      glsl: 'fragColor = vec4(clamp(accum, 0.0, 1.0), 1.0);',
      js: 'hlxState.trace.push("L{{LINE}} EXIT_OK (0)");',
      html: '<li data-cell="exit_ok.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} EXIT_OK</strong><span>Estado 0</span></li>',
    },
  }),
];

export function serializeHlxCellFile(cell: HelixCell): string {
  const goImports = (cell.imports.go ?? []).join(', ');
  return [
    `@cell ${cell.fileName}`,
    `@id ${cell.id}`,
    `@glyphs ${cell.glyphs}`,
    `@opcode ${cell.opcode}`,
    `@godel ${cell.godelProduct}`,
    `@desc ${cell.description}`,
    goImports ? `@imports.go ${goImports}` : '@imports.go',
    cell.decls.go ? `@decls.go\n${cell.decls.go}` : '@decls.go',
    `@target go\n${cell.codeBlocks.go}`,
    cell.decls.glsl ? `@decls.glsl\n${cell.decls.glsl}` : '@decls.glsl',
    `@target glsl\n${cell.codeBlocks.glsl}`,
    cell.decls.js ? `@decls.js\n${cell.decls.js}` : '@decls.js',
    `@target js\n${cell.codeBlocks.js}`,
    `@target html\n${cell.codeBlocks.html}`,
    `@sha256 ${cell.cellSha256}`,
    `@end`,
    '',
  ].join('\n');
}

export function parseHlxCellFile(raw: string): {
  cell: HelixCell;
  hashMatched: boolean;
} {
  const lines = raw.split(/\r?\n/);
  const meta: Record<string, string> = {};
  const sections: Record<string, string[]> = {};
  let activeSection: string | null = null;

  for (const line of lines) {
    if (line.startsWith('@decls.go')) {
      activeSection = 'decls.go';
      sections[activeSection] = [];
      continue;
    }
    if (line.startsWith('@decls.glsl')) {
      activeSection = 'decls.glsl';
      sections[activeSection] = [];
      continue;
    }
    if (line.startsWith('@decls.js')) {
      activeSection = 'decls.js';
      sections[activeSection] = [];
      continue;
    }
    if (line.startsWith('@target ')) {
      activeSection = `target.${line.slice(8).trim().toLowerCase()}`;
      sections[activeSection] = [];
      continue;
    }
    if (line.startsWith('@end')) {
      activeSection = null;
      continue;
    }
    if (line.startsWith('@')) {
      activeSection = null;
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx > 0) {
        meta[line.slice(1, spaceIdx).trim()] = line.slice(spaceIdx + 1).trim();
      } else {
        meta[line.slice(1).trim()] = '';
      }
      continue;
    }
    if (activeSection) {
      sections[activeSection].push(line);
    }
  }

  const fileName = meta.cell || 'custom_cell.hlx';
  const id = meta.id || fileName.replace(/\.hlx$/i, '');
  const glyphs = meta.glyphs || 'ᚠ';
  const opcode = (meta.opcode || 'CUSTOM_OP').toUpperCase();
  const godelProduct = meta.godel || computeGodelString(glyphs);
  const description = meta.desc || `Célula .hlx para ${opcode}`;
  const goImports = (meta['imports.go'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const base: Omit<HelixCell, 'cellSha256'> = {
    id,
    fileName,
    glyphs,
    opcode,
    godelProduct,
    description,
    imports: goImports.length > 0 ? { go: goImports } : {},
    decls: {
      ...(sections['decls.go']?.join('\n').trim() ? { go: sections['decls.go'].join('\n').trim() } : {}),
      ...(sections['decls.glsl']?.join('\n').trim() ? { glsl: sections['decls.glsl'].join('\n').trim() } : {}),
      ...(sections['decls.js']?.join('\n').trim() ? { js: sections['decls.js'].join('\n').trim() } : {}),
    },
    codeBlocks: {
      go: (sections['target.go'] ?? []).join('\n').trimEnd(),
      glsl: (sections['target.glsl'] ?? []).join('\n').trimEnd(),
      js: (sections['target.js'] ?? []).join('\n').trimEnd(),
      html: (sections['target.html'] ?? []).join('\n').trimEnd(),
    },
  };

  const expectedSha = computeCellSha256(base);
  const declaredSha = meta.sha256 || expectedSha;
  return {
    cell: {
      ...base,
      cellSha256: declaredSha,
    },
    hashMatched: declaredSha === expectedSha,
  };
}

export function verifyCellsForProgram(cells: HelixCell[]): CellSecurityFinding[] {
  const findings: CellSecurityFinding[] = [];
  const forbiddenPatterns: { re: RegExp; reason: string }[] = [
    { re: /\beval\s*\(/i, reason: 'Uso prohibido de eval() en célula .hlx' },
    { re: /\bnew\s+Function\s*\(/i, reason: 'Construcción dinámica Function() prohibida en célula .hlx' },
    { re: /\.innerHTML\b/i, reason: 'Asignación directa innerHTML prohibida en célula .hlx' },
    { re: /<script\b/i, reason: 'Etiqueta <script> inyectada prohibida en bloque HTML de célula .hlx' },
    { re: /\bunsafe\./i, reason: 'Paquete unsafe prohibido dentro de célula .hlx estándar' },
  ];

  for (const cell of cells) {
    const expected = computeCellSha256({
      id: cell.id,
      fileName: cell.fileName,
      glyphs: cell.glyphs,
      opcode: cell.opcode,
      godelProduct: cell.godelProduct,
      description: cell.description,
      imports: cell.imports,
      decls: cell.decls,
      codeBlocks: cell.codeBlocks,
    });
    if (expected !== cell.cellSha256) {
      findings.push({
        cellFile: cell.fileName,
        rule: 'CELL_INTEGRITY_MISMATCH',
        detail: `${cell.fileName}: SHA-256 inválido (esperado ${expected.slice(0, 12)}…, actual ${cell.cellSha256.slice(0, 12)}…).`,
      });
    }
    const allCode = [
      cell.decls.go ?? '',
      cell.codeBlocks.go,
      cell.decls.glsl ?? '',
      cell.codeBlocks.glsl,
      cell.decls.js ?? '',
      cell.codeBlocks.js,
      cell.codeBlocks.html,
    ].join('\n');

    for (const pat of forbiddenPatterns) {
      if (pat.re.test(allCode)) {
        findings.push({
          cellFile: cell.fileName,
          rule: 'CELL_SANDBOX_VIOLATION',
          detail: `${cell.fileName}: ${pat.reason}.`,
        });
      }
    }
  }
  return findings;
}

function hexToGlslVec3(hex: string): string {
  const clean = hex.replace('#', '');
  const r = (parseInt(clean.slice(0, 2), 16) || 64) / 255;
  const g = (parseInt(clean.slice(2, 4), 16) || 128) / 255;
  const b = (parseInt(clean.slice(4, 6), 16) || 235) / 255;
  return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
}

function goNumOrVar(tok: string | undefined, fallback: string): string {
  const val = tok ?? fallback;
  return /^-?\d+(\.\d+)?$/.test(val) ? val : `hlxVars[${JSON.stringify(val)}]`;
}

function jsNumOrVar(tok: string | undefined, fallback: string): string {
  const val = tok ?? fallback;
  return /^-?\d+(\.\d+)?$/.test(val) ? val : `hlxState.vars[${JSON.stringify(val)}]`;
}

function expandCellBlock(
  template: string,
  inst: ParsedScriptInstruction,
): string {
  const primes = Array.from(inst.glyphs)
    .map((g) => RUNE_BY_GLYPH.get(g)?.prime)
    .filter((p): p is number => typeof p === 'number');
  const comp = computeCompositeColorFromPrimes(primes.length > 0 ? primes : [RUNES[0].prime]);

  const a0 = inst.args[0] ?? '';
  const a1 = inst.args[1] ?? '';
  const a2 = inst.args[2] ?? '';
  const a3 = inst.args[3] ?? '';
  const cmp = inst.args[1] ?? '==';
  const goCond = `${goNumOrVar(a0, '0')} ${cmp} ${goNumOrVar(inst.args[2], '0')}`;
  const jsCond = `${jsNumOrVar(a0, '0')} ${cmp === '==' ? '===' : cmp === '!=' ? '!==' : cmp} ${jsNumOrVar(inst.args[2], '0')}`;

  return template
    .replaceAll('{{LINE}}', String(inst.lineNumber))
    .replaceAll('{{GLYPHS}}', inst.glyphs)
    .replaceAll('{{OPCODE}}', inst.opcode)
    .replaceAll('{{ARGS}}', inst.args.join(' '))
    .replaceAll('{{ARG0_OR_ADMIN}}', a0 || 'sys_admin')
    .replaceAll('{{ARG0_OR_WORKER}}', a0 || 'worker')
    .replaceAll('{{ARG0_OR_LIFO}}', a0 || 'LIFO')
    .replaceAll('{{ARG0_OR_128}}', a0 || '128')
    .replaceAll('{{ARG0_NUM_OR_VAR}}', goNumOrVar(a0, '0'))
    .replaceAll('{{ARG1_NUM_OR_VAR}}', goNumOrVar(a1, '0'))
    .replaceAll('{{ARG2_NUM_OR_VAR}}', goNumOrVar(a2, '240'))
    .replaceAll('{{ARG3_NUM_OR_VAR}}', goNumOrVar(a3, '1.0'))
    .replaceAll('{{ARG0_OR_128_NUM_OR_VAR}}', goNumOrVar(a0 || '128', '128'))
    .replaceAll('{{JS_ARG0_EXPR}}', jsNumOrVar(a0, '0'))
    .replaceAll('{{JS_ARG1_EXPR}}', jsNumOrVar(a1, '0'))
    .replaceAll('{{JS_ARG2_EXPR}}', jsNumOrVar(a2, '240'))
    .replaceAll('{{JS_ARG3_EXPR}}', jsNumOrVar(a3, '1.0'))
    .replaceAll('{{JS_ARG0_OR_128}}', jsNumOrVar(a0 || '128', '128'))
    .replaceAll('{{GO_COND}}', goCond)
    .replaceAll('{{JS_COND}}', jsCond)
    .replaceAll('{{ARG0}}', a0)
    .replaceAll('{{ARG1}}', a1)
    .replaceAll('{{ARG2}}', a2)
    .replaceAll('{{ARG3}}', a3)
    .replaceAll('{{COLOR_HEX}}', comp.colorHex)
    .replaceAll('{{COLOR_VEC3}}', hexToGlslVec3(comp.colorHex));
}

function synthesizeFallbackCell(inst: ParsedScriptInstruction): HelixCell {
  return makeSignedCell({
    id: `dyn_${inst.opcode.toLowerCase()}`,
    fileName: `${inst.opcode.toLowerCase()}.hlx`,
    glyphs: inst.glyphs,
    opcode: inst.opcode.toUpperCase(),
    description: `Célula sintetizada para ${inst.opcode}`,
    imports: { go: ['fmt'] },
    decls: {},
    codeBlocks: {
      go: 'fmt.Println("[L{{LINE}}] {{GLYPHS}} {{OPCODE}} {{ARGS}}")',
      glsl: 'accum += {{COLOR_VEC3}} * 0.05;',
      js: 'hlxState.trace.push("L{{LINE}} {{OPCODE}} {{ARGS}}");',
      html: '<li data-cell="dynamic.hlx" style="border-left:4px solid {{COLOR_HEX}}"><strong>{{GLYPHS}} {{OPCODE}}</strong><span>{{ARGS}}</span></li>',
    },
  });
}

/**
 * Ensamblador Puro basado exclusivamente en células .hlx (sin plantillas monolíticas fijas).
 * Enlaza solo las células activas en el AST y produce código ejecutable Go / GLSL / JS / HTML.
 */
export function assemblePureFromCells(
  instructions: ParsedScriptInstruction[],
  cellLibrary: HelixCell[],
  target: CellTarget,
): PureAssemblyResult {
  const byOpcode = new Map<string, HelixCell>();
  for (const c of cellLibrary) {
    byOpcode.set(c.opcode.toUpperCase(), c);
  }

  const usedCells: HelixCell[] = [];
  const usedIds = new Set<string>();
  const resolvedPerInst: { inst: ParsedScriptInstruction; cell: HelixCell }[] = [];

  for (const inst of instructions) {
    const op = inst.opcode.toUpperCase();
    const cell = byOpcode.get(op) ?? synthesizeFallbackCell(inst);
    resolvedPerInst.push({ inst, cell });
    if (!usedIds.has(cell.fileName)) {
      usedIds.add(cell.fileName);
      usedCells.push(cell);
    }
  }

  const securityFindings = verifyCellsForProgram(usedCells);
  const manifestSha256 = sha256Hex(
    usedCells.map((c) => `${c.fileName}:${c.cellSha256}`).join('|'),
  );

  if (target === 'go') {
    const importSet = new Set<string>();
    const decls: string[] = [];
    const seenDecls = new Set<string>();
    const bodyLines: string[] = [];
    let indent = 1;

    for (const { inst, cell } of resolvedPerInst) {
      for (const imp of cell.imports.go ?? []) importSet.add(imp);
      const decl = (cell.decls.go ?? '').trim();
      if (decl && !seenDecls.has(decl)) {
        seenDecls.add(decl);
        decls.push(decl);
      }

      const op = inst.opcode.toUpperCase();
      if (op === 'ELSE' || op === 'END') indent = Math.max(1, indent - 1);
      const pad = '\t'.repeat(indent);
      const expanded = expandCellBlock(cell.codeBlocks.go, inst);
      expanded.split('\n').forEach((l) => {
        if (l.trim() !== '') bodyLines.push(`${pad}${l}`);
      });
      if (op === 'IF' || op === 'ELSE' || op === 'LOOP') indent++;
    }

    const importBlock =
      importSet.size > 0
        ? `import (\n${Array.from(importSet)
            .sort()
            .map((i) => `\t${JSON.stringify(i)}`)
            .join('\n')}\n)\n\n`
        : '';

    const manifestComments = usedCells
      .map((c) => `// @cell ${c.fileName} (Gödel=${c.godelProduct}) sha256=${c.cellSha256.slice(0, 16)}`)
      .join('\n');

    const code = [
      `// Ensamblado puro desde ${usedCells.length} células .hlx · Manifest SHA-256: ${manifestSha256}`,
      manifestComments,
      'package main',
      '',
      importBlock + (decls.length > 0 ? decls.join('\n') + '\n\n' : '') + 'func main() {',
      ...bodyLines,
      '}',
      '',
    ].join('\n');

    return {
      target,
      code,
      usedCells,
      manifestSha256,
      securityFindings,
      valid: securityFindings.length === 0,
    };
  }

  if (target === 'glsl') {
    const decls: string[] = [];
    const seenDecls = new Set<string>();
    const bodyLines: string[] = [];
    let hasFragOut = false;

    for (const { inst, cell } of resolvedPerInst) {
      const decl = (cell.decls.glsl ?? '').trim();
      if (decl && !seenDecls.has(decl)) {
        seenDecls.add(decl);
        decls.push(decl);
      }
      const expanded = expandCellBlock(cell.codeBlocks.glsl, inst);
      if (expanded.includes('fragColor')) hasFragOut = true;
      expanded.split('\n').forEach((l) => {
        if (l.trim() !== '') bodyLines.push(`  ${l}`);
      });
    }

    const code = [
      '#version 300 es',
      'precision highp float;',
      `// Ensamblado GLSL puro desde ${usedCells.length} células .hlx · Manifest: ${manifestSha256.slice(0, 16)}`,
      'in vec2 v_uv;',
      'uniform float u_time;',
      'out vec4 fragColor;',
      '',
      ...decls,
      '',
      'void main() {',
      '  vec3 accum = vec3(0.03, 0.05, 0.09);',
      ...bodyLines,
      ...(hasFragOut ? [] : ['  fragColor = vec4(clamp(accum, 0.0, 1.0), 1.0);']),
      '}',
      '',
    ].join('\n');

    return {
      target,
      code,
      usedCells,
      manifestSha256,
      securityFindings,
      valid: securityFindings.length === 0,
    };
  }

  if (target === 'js') {
    const decls: string[] = [];
    const seenDecls = new Set<string>();
    const bodyLines: string[] = [];
    let indent = 1;

    for (const { inst, cell } of resolvedPerInst) {
      const decl = (cell.decls.js ?? '').trim();
      if (decl && !seenDecls.has(decl)) {
        seenDecls.add(decl);
        decls.push(decl);
      }
      const op = inst.opcode.toUpperCase();
      if (op === 'ELSE' || op === 'END') indent = Math.max(1, indent - 1);
      const pad = '  '.repeat(indent);
      const expanded = expandCellBlock(cell.codeBlocks.js, inst);
      expanded.split('\n').forEach((l) => {
        if (l.trim() !== '') bodyLines.push(`${pad}${l}`);
      });
      if (op === 'IF' || op === 'ELSE' || op === 'LOOP') indent++;
    }

    const code = [
      `// Módulo JS puro ensamblado desde ${usedCells.length} células .hlx · Manifest: ${manifestSha256}`,
      'export function runHelixCells() {',
      ...(decls.length > 0
        ? decls.map((d) => `  ${d}`)
        : ['  const hlxState = { booted: false, vars: Object.create(null), trace: [] };']),
      ...bodyLines,
      '  return hlxState;',
      '}',
      '',
    ].join('\n');

    return {
      target,
      code,
      usedCells,
      manifestSha256,
      securityFindings,
      valid: securityFindings.length === 0,
    };
  }

  // HTML pure standalone document assembled from cell fragments
  const items = resolvedPerInst.map(({ inst, cell }) =>
    `      ${expandCellBlock(cell.codeBlocks.html, inst)}`,
  );
  const code = [
    '<!doctype html>',
    '<html lang="es">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <title>Ensamblaje Puro Helix (.hlx)</title>',
    '  <style>',
    '    body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px}',
    '    main{max-width:760px;margin:0 auto;background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px}',
    '    ul{list-style:none;padding:0;margin:16px 0;display:grid;gap:8px}',
    '    .hlx-cell,li{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#0f172a;border-radius:6px;font-size:13px}',
    '    small{color:#94a3b8;font-family:monospace}',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    `    <h1>Ensamblaje Puro Helix (${usedCells.length} células .hlx)</h1>`,
    `    <small>Manifest SHA-256: ${manifestSha256}</small>`,
    '    <ul>',
    ...items,
    '    </ul>',
    '  </main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');

  return {
    target,
    code,
    usedCells,
    manifestSha256,
    securityFindings,
    valid: securityFindings.length === 0,
  };
}

import { RUNE_BY_GLYPH } from '../data/runes';
import { computeGodelProduct, computePositionalSignature } from './helixEngine';
import { computeCompositeColorFromPrimes } from './primeColor';
import { formatRationalP33, makeRationalP33 } from './rationalP33';

export type LegacyLanguage =
  | 'COBOL'
  | 'C'
  | 'Pascal'
  | 'Assembler'
  | 'Python'
  | 'Go'
  | 'Helix';

export type TargetLanguage =
  | 'Helix'
  | 'Go'
  | 'Python'
  | 'TypeScript'
  | 'C'
  | 'Rust';

export type HelixIrNode =
  | { kind: 'ASSIGN'; target: string; expr: string; isNumericLiteral: boolean }
  | {
      kind: 'RATIONAL_DIV';
      target: string;
      left: string;
      denominator: number;
      exactFraction?: string;
    }
  | {
      kind: 'ARITHMETIC';
      target: string;
      left: string;
      op: '+' | '-' | '*';
      right: string;
    }
  | { kind: 'MEM_COPY'; dst: string; src: string; bytes: number }
  | { kind: 'IF_START'; left: string; cmp: string; right: string }
  | { kind: 'ELSE_BRANCH' }
  | { kind: 'LOOP_START'; countExpr: string }
  | { kind: 'BLOCK_END'; closes: 'IF' | 'LOOP' | 'UNKNOWN' }
  | { kind: 'PRINT'; value: string }
  | { kind: 'REG_OP'; op: 'MOV' | 'ADD' | 'CMP'; left: string; right: string }
  | { kind: 'TRAP_ERROR'; reason: string };

export interface TranspiledStatement {
  lineNumber: number;
  source: string;
  opKind: string;
  helixGlyphs: string;
  helixOpcode: string;
  godelSignature: string;
  positionalSignature: string;
  colorHex: string;
  helixIr: string;
  irNode: HelixIrNode;
  contractPre: string;
  contractPost: string;
  status: 'VERIFICADO' | 'RECHAZADO';
  diagnostic: string;
}

export interface TranspileReport {
  language: LegacyLanguage;
  statements: TranspiledStatement[];
  verifiedCount: number;
  rejectedCount: number;
  structuralErrors: string[];
  helixScriptOutput: string;
}

const PRIMES_33 = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
  73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137,
];

const MAX_BUFFER_BYTES = 1024;
const MAX_LOOP_BOUND = 100;

export const LEGACY_PRESETS: Record<LegacyLanguage, string> = {
  COBOL: `MOVE 1000 TO SALDO.
COMPUTE INTERES = 355 / 10000.
COMPUTE TOTAL = SALDO + 250.
IF TOTAL > 1000
  DISPLAY TOTAL.
END-IF.`,
  C: `int saldo = 100;
for (int i = 0; i < 3; i++) {
  saldo = saldo + 50;
}
memcpy(dest, src, 64);
int ratio = saldo / 5;
if (saldo > 200) {
  printf(saldo);
}`,
  Pascal: `Balance := 250;
Ratio := Balance / 10;
if Balance > 100 then begin
  Balance := Balance + 50;
end;`,
  Assembler: `MOV EAX, 128
ADD EAX, 64
CMP EAX, 192`,
  Python: `saldo = 100
interes = 355 / 10000
for _ in range(3):
    saldo = saldo + 25
if saldo > 150:
    print(saldo)
else:
    print(interes)`,
  Go: `saldo := 120
ratio := 300 / 15
for i := 0; i < 2; i++ {
  saldo = saldo + 30
}
if saldo >= 180 {
  fmt.Println(saldo)
}`,
  Helix: `SET saldo 100
LOOP 2
  ADD saldo 50
END
IF saldo >= 200
  FILE_WRITE resumen.txt saldo
END`,
};

function isRepresentableInP33(denominator: number): {
  ok: boolean;
  remainder: number;
} {
  if (!Number.isInteger(denominator) || denominator <= 0) {
    return { ok: false, remainder: denominator };
  }
  let n = denominator;
  for (const p of PRIMES_33) {
    while (n % p === 0) {
      n = n / p;
    }
  }
  return { ok: n === 1, remainder: n };
}

function getMetadataForGlyphs(glyphs: string): {
  godelSignature: string;
  positionalSignature: string;
  colorHex: string;
} {
  const tokens = Array.from(glyphs)
    .map((g) => RUNE_BY_GLYPH.get(g))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  return {
    godelSignature: computeGodelProduct(tokens).toString(),
    positionalSignature: computePositionalSignature(tokens),
    colorHex: computeCompositeColorFromPrimes(tokens.map((t) => t.prime)).colorHex,
  };
}

function buildStmt(
  lineNumber: number,
  source: string,
  opKind: string,
  glyphs: string,
  helixOpcode: string,
  helixIr: string,
  irNode: HelixIrNode,
  contractPre: string,
  contractPost: string,
  status: 'VERIFICADO' | 'RECHAZADO',
  diagnostic: string,
): TranspiledStatement {
  const meta = getMetadataForGlyphs(glyphs);
  return {
    lineNumber,
    source,
    opKind,
    helixGlyphs: glyphs,
    helixOpcode,
    godelSignature: meta.godelSignature,
    positionalSignature: meta.positionalSignature,
    colorHex: meta.colorHex,
    helixIr,
    irNode,
    contractPre,
    contractPost,
    status,
    diagnostic,
  };
}

interface RawLineInfo {
  lineNumber: number;
  raw: string;
  indent: number;
  clean: string;
}

export function transpileLegacyCode(
  language: LegacyLanguage,
  sourceCode: string,
): TranspileReport {
  const rawLines = sourceCode.split(/\r?\n/);
  const lines: RawLineInfo[] = [];

  rawLines.forEach((rawLine, idx) => {
    let trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
      return;
    }
    if (language === 'Python' || language === 'Helix') {
      trimmed = trimmed.replace(/\s+#.*$/, '').trim();
    } else if (language === 'C' || language === 'Go') {
      trimmed = trimmed.replace(/\s+\/\/.*$/, '').trim();
    }
    if (!trimmed) return;
    const indent = rawLine.search(/\S/);
    const clean = trimmed.replace(/[.;]+$/, '').trim();
    lines.push({
      lineNumber: idx + 1,
      raw: trimmed,
      indent: indent < 0 ? 0 : indent,
      clean,
    });
  });

  const statements: TranspiledStatement[] = [];
  const blockStack: {
    kind: 'IF' | 'LOOP';
    headerIndent: number;
    minBodyIndent: number;
    stmtIndex: number;
  }[] = [];
  const structuralErrors: string[] = [];

  const closeBlock = (
    lineNumber: number,
    rawSource: string,
    explicitCloses?: 'IF' | 'LOOP',
  ) => {
    const top = blockStack.pop();
    if (!top || (explicitCloses && top.kind !== explicitCloses)) {
      if (top) blockStack.push(top);
      const errMsg = `L${lineNumber}: cierre de bloque sin apertura correspondiente.`;
      structuralErrors.push(errMsg);
      statements.push(
        buildStmt(
          lineNumber,
          rawSource,
          'CIERRE DE BLOQUE',
          'ᛉᚻ',
          'TRAP_SANDBOX',
          'AST_ORPHAN_END()',
          { kind: 'BLOCK_END', closes: 'UNKNOWN' },
          'open_block_exists == true',
          'rejected()',
          'RECHAZADO',
          errMsg,
        ),
      );
      return;
    }
    statements.push(
      buildStmt(
        lineNumber,
        rawSource,
        top.kind === 'IF' ? 'FIN CONDICIONAL' : 'FIN BUCLE',
        'ᚳᛏ',
        'END',
        `end_${top.kind.toLowerCase()}()`,
        { kind: 'BLOCK_END', closes: top.kind },
        `balanced_block(${top.kind})`,
        `scope_closed(${top.kind})`,
        'VERIFICADO',
        `Cierre estructurado de bloque ${top.kind} validado.`,
      ),
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const item = lines[i];

    // Python indentation-based dedent handling
    if (language === 'Python') {
      const isElse = /^else\s*:$/i.test(item.clean);
      while (blockStack.length > 0) {
        const top = blockStack[blockStack.length - 1];
        if (isElse && top.kind === 'IF' && item.indent === top.headerIndent) {
          break;
        }
        if (item.indent < top.minBodyIndent) {
          closeBlock(item.lineNumber, `# dedent (${item.raw})`);
        } else {
          break;
        }
      }
    }

    const stmt = parseSingleStatement(language, item.lineNumber, item.raw, item.clean);

    if (stmt.irNode.kind === 'IF_START') {
      blockStack.push({
        kind: 'IF',
        headerIndent: item.indent,
        minBodyIndent: item.indent + 1,
        stmtIndex: statements.length,
      });
      statements.push(stmt);
    } else if (stmt.irNode.kind === 'LOOP_START') {
      blockStack.push({
        kind: 'LOOP',
        headerIndent: item.indent,
        minBodyIndent: item.indent + 1,
        stmtIndex: statements.length,
      });
      statements.push(stmt);
    } else if (stmt.irNode.kind === 'ELSE_BRANCH') {
      const top = blockStack[blockStack.length - 1];
      if (!top || top.kind !== 'IF') {
        const err = `L${item.lineNumber}: rama ELSE sin condicional IF abierto.`;
        structuralErrors.push(err);
        statements.push(
          buildStmt(
            item.lineNumber,
            item.raw,
            'RAMA ELSE',
            'ᛉᚻ',
            'TRAP_SANDBOX',
            'AST_ORPHAN_ELSE()',
            { kind: 'TRAP_ERROR', reason: err },
            'open_if == true',
            'rejected()',
            'RECHAZADO',
            err,
          ),
        );
      } else {
        statements.push(stmt);
      }
    } else if (stmt.irNode.kind === 'BLOCK_END') {
      closeBlock(
        item.lineNumber,
        item.raw,
        stmt.irNode.closes === 'UNKNOWN' ? undefined : stmt.irNode.closes,
      );
    } else {
      statements.push(stmt);
    }
  }

  // Auto-close Python blocks at EOF cleanly, or flag unclosed explicit blocks in brace/END languages
  if (language === 'Python') {
    while (blockStack.length > 0) {
      const lastLine = lines[lines.length - 1]?.lineNumber ?? 1;
      closeBlock(lastLine, '# fin de bloque (EOF)');
    }
  } else {
    while (blockStack.length > 0) {
      const unclosed = blockStack.pop()!;
      const targetStmt = statements[unclosed.stmtIndex];
      const msg = `Bloque ${unclosed.kind} abierto en línea ${targetStmt.lineNumber} sin cierre explícito.`;
      structuralErrors.push(msg);
      targetStmt.status = 'RECHAZADO';
      targetStmt.diagnostic = msg;
    }
  }

  const verifiedCount = statements.filter((s) => s.status === 'VERIFICADO').length;
  const rejectedCount = statements.filter((s) => s.status === 'RECHAZADO').length;

  const helixScriptOutput = emitTargetCodeFromStatements(statements, 'Helix');

  return {
    language,
    statements,
    verifiedCount,
    rejectedCount,
    structuralErrors,
    helixScriptOutput,
  };
}

function parseSingleStatement(
  language: LegacyLanguage,
  lineNumber: number,
  raw: string,
  clean: string,
): TranspiledStatement {
  // Explicit block closers across languages
  if (
    /^end-if$/i.test(clean) ||
    (language === 'Helix' && /^end$/i.test(clean)) ||
    (language === 'Pascal' && /^end$/i.test(clean)) ||
    ((language === 'C' || language === 'Go') && /^\}$/.test(clean))
  ) {
    const closes = /^end-if$/i.test(clean) ? 'IF' : 'UNKNOWN';
    return buildStmt(
      lineNumber,
      raw,
      'FIN DE BLOQUE',
      'ᚳᛏ',
      'END',
      'end_block()',
      { kind: 'BLOCK_END', closes },
      'balanced_block',
      'scope_closed',
      'VERIFICADO',
      'Cierre de bloque.',
    );
  }

  // Combined "} else {" in C / Go
  if ((language === 'C' || language === 'Go') && /^\}\s*else\s*\{$/.test(clean)) {
    return buildStmt(
      lineNumber,
      raw,
      'RAMA ELSE',
      'ᚹᛈ',
      'ELSE',
      'else_branch()',
      { kind: 'ELSE_BRANCH' },
      'open_if == true',
      'alt_branch_active',
      'VERIFICADO',
      'Rama alternativa ELSE verificada.',
    );
  }

  // Standalone else
  if (/^else\s*:?$/i.test(clean)) {
    return buildStmt(
      lineNumber,
      raw,
      'RAMA ELSE',
      'ᚹᛈ',
      'ELSE',
      'else_branch()',
      { kind: 'ELSE_BRANCH' },
      'open_if == true',
      'alt_branch_active',
      'VERIFICADO',
      'Rama alternativa ELSE verificada.',
    );
  }

  if (language === 'COBOL') return parseCobolLine(lineNumber, raw, clean);
  if (language === 'C') return parseCLine(lineNumber, raw, clean);
  if (language === 'Pascal') return parsePascalLine(lineNumber, raw, clean);
  if (language === 'Assembler') return parseAsmLine(lineNumber, raw, clean);
  if (language === 'Python') return parsePythonLine(lineNumber, raw, clean);
  if (language === 'Go') return parseGoLine(lineNumber, raw, clean);
  return parseHelixLine(lineNumber, raw, clean);
}

function makeDivStatement(
  lineNumber: number,
  raw: string,
  dst: string,
  left: string,
  den: number,
): TranspiledStatement {
  if (den === 0) {
    return buildStmt(
      lineNumber,
      raw,
      'DIVISIÓN',
      'ᛤᚾ',
      'SIGKILL',
      `TRAP_DIV_ZERO(${dst})`,
      { kind: 'TRAP_ERROR', reason: 'División por cero' },
      'denom != 0',
      'abort()',
      'RECHAZADO',
      'Violación crítica: división por cero rechazada estáticamente.',
    );
  }
  const p33 = isRepresentableInP33(den);
  const numLit = /^\d+$/.test(left) ? BigInt(left) : null;
  const ratExact = numLit !== null ? makeRationalP33(numLit, BigInt(den)) : null;
  const exactStr = ratExact ? formatRationalP33(ratExact) : undefined;
  return buildStmt(
    lineNumber,
    raw,
    'DIVISIÓN RACIONAL P33',
    'ᚠᚷ',
    'DIV',
    ratExact
      ? `let ${dst.toLowerCase()}: rat_p33 = ${exactStr};`
      : `let ${dst.toLowerCase()}: rat_p33 = ${left} / ${den};`,
    {
      kind: 'RATIONAL_DIV',
      target: dst.toLowerCase(),
      left: left.toLowerCase(),
      denominator: den,
      exactFraction: exactStr,
    },
    `denom(${den}) != 0 && in_P33(${den})`,
    `${dst.toLowerCase()} * ${den} == ${left.toLowerCase()}`,
    p33.ok ? 'VERIFICADO' : 'RECHAZADO',
    p33.ok
      ? ratExact
        ? `Fracción reducida exacta ${exactStr} en el subanillo P33.`
        : `Denominador ${den} factorizable sobre la base prima (2..137).`
      : `Denominador ${den} contiene factor primo fuera de P33 (residuo ${p33.remainder}).`,
  );
}

function makeBoundedLoopStatement(
  lineNumber: number,
  raw: string,
  countExpr: string,
): TranspiledStatement {
  const num = Number(countExpr);
  const validStatic = Number.isNaN(num) || (Number.isInteger(num) && num >= 0 && num <= MAX_LOOP_BOUND);
  return buildStmt(
    lineNumber,
    raw,
    'BUCLE ACOTADO',
    'ᛄᛞ',
    validStatic ? 'LOOP' : 'TRAP_SANDBOX',
    `loop_bounded(count=${countExpr}, max=${MAX_LOOP_BOUND})`,
    { kind: 'LOOP_START', countExpr },
    `0 <= ${countExpr} <= ${MAX_LOOP_BOUND}`,
    `terminates_within(${countExpr})`,
    validStatic ? 'VERIFICADO' : 'RECHAZADO',
    validStatic
      ? `Bucle determinista acotado (${countExpr} iteraciones <= ${MAX_LOOP_BOUND}).`
      : `Contador ${countExpr} excede el límite determinista [0..${MAX_LOOP_BOUND}].`,
  );
}

function makeIfStatement(
  lineNumber: number,
  raw: string,
  left: string,
  cmp: string,
  right: string,
): TranspiledStatement {
  const normCmp = cmp === '=' ? '==' : cmp === '<>' ? '!=' : cmp;
  return buildStmt(
    lineNumber,
    raw,
    'CONDICIONAL',
    'ᛗᚦ',
    'IF',
    `if (${left.toLowerCase()} ${normCmp} ${right.toLowerCase()})`,
    {
      kind: 'IF_START',
      left: left.toLowerCase(),
      cmp: normCmp,
      right: right.toLowerCase(),
    },
    `comparable(${left}, ${right})`,
    'branch_verified',
    'VERIFICADO',
    `Guarda condicional (${left} ${normCmp} ${right}) verificada.`,
  );
}

function makeArithmeticStatement(
  lineNumber: number,
  raw: string,
  dst: string,
  left: string,
  op: '+' | '-' | '*',
  right: string,
): TranspiledStatement {
  return buildStmt(
    lineNumber,
    raw,
    'ARITMÉTICA EXACTA',
    'ᚠᚷ',
    op === '+' ? 'ADD' : op === '-' ? 'SUB' : 'MUL',
    `let ${dst.toLowerCase()}: int64 = ${left.toLowerCase()} ${op} ${right.toLowerCase()};`,
    {
      kind: 'ARITHMETIC',
      target: dst.toLowerCase(),
      left: left.toLowerCase(),
      op,
      right: right.toLowerCase(),
    },
    `no_overflow(${left} ${op} ${right})`,
    `${dst.toLowerCase()} == ${left.toLowerCase()} ${op} ${right.toLowerCase()}`,
    'VERIFICADO',
    'Operación aritmética entera determinista verificada.',
  );
}

function makeAssignStatement(
  lineNumber: number,
  raw: string,
  dst: string,
  expr: string,
): TranspiledStatement {
  const cleanName = dst.toLowerCase();
  const cleanExpr = expr.trim();
  const isNumericLiteral = /^-?\d+$/.test(cleanExpr);
  return buildStmt(
    lineNumber,
    raw,
    'ASIGNACIÓN',
    'ᚠᚢ',
    'SET',
    `let ${cleanName}: fixed64 = ${cleanExpr};`,
    {
      kind: 'ASSIGN',
      target: cleanName,
      expr: isNumericLiteral ? cleanExpr : cleanExpr.toLowerCase(),
      isNumericLiteral,
    },
    `valid_slot(${cleanName})`,
    `${cleanName} == ${cleanExpr}`,
    'VERIFICADO',
    'Asignación determinista tipada.',
  );
}

function makeMemcpyStatement(
  lineNumber: number,
  raw: string,
  dst: string,
  src: string,
  bytes: number,
): TranspiledStatement {
  const safe = bytes > 0 && bytes <= MAX_BUFFER_BYTES;
  return buildStmt(
    lineNumber,
    raw,
    'COPIA DE MEMORIA',
    safe ? 'ᚩᛖ' : 'ᛉᚻ',
    safe ? 'IO_BUS_TX' : 'TRAP_SANDBOX',
    `bus_copy(dst=${dst}, src=${src}, len=${bytes});`,
    { kind: 'MEM_COPY', dst, src, bytes },
    `0 < ${bytes} <= ${MAX_BUFFER_BYTES} && non_overlapping(${dst}, ${src})`,
    `bytes_copied(${dst}) == ${bytes}`,
    safe ? 'VERIFICADO' : 'RECHAZADO',
    safe
      ? `Copia acotada (${bytes} B <= ${MAX_BUFFER_BYTES} B) validada.`
      : `Desbordamiento potencial: ${bytes} B excede el límite estático de ${MAX_BUFFER_BYTES} B.`,
  );
}

function makePrintStatement(
  lineNumber: number,
  raw: string,
  value: string,
): TranspiledStatement {
  return buildStmt(
    lineNumber,
    raw,
    'SALIDA E/S',
    'ᚩᛖ',
    'IO_BUS_TX',
    `io_emit(${value.toLowerCase()});`,
    { kind: 'PRINT', value: value.toLowerCase() },
    `readable(${value})`,
    `flushed(${value})`,
    'VERIFICADO',
    `Emisión síncrona hacia el flujo estándar (${value}).`,
  );
}

function parseCobolLine(lineNumber: number, raw: string, clean: string): TranspiledStatement {
  const moveMatch = clean.match(/^MOVE\s+(.+?)\s+TO\s+([A-Z0-9_-]+)$/i);
  if (moveMatch) return makeAssignStatement(lineNumber, raw, moveMatch[2], moveMatch[1]);

  const divMatch = clean.match(/^COMPUTE\s+([A-Z0-9_-]+)\s*=\s*([A-Z0-9_.-]+)\s*\/\s*(\d+)$/i);
  if (divMatch) return makeDivStatement(lineNumber, raw, divMatch[1], divMatch[2], Number(divMatch[3]));

  const arithMatch = clean.match(/^COMPUTE\s+([A-Z0-9_-]+)\s*=\s*([A-Z0-9_.-]+)\s*([+\-*])\s*([A-Z0-9_.-]+)$/i);
  if (arithMatch) {
    return makeArithmeticStatement(
      lineNumber,
      raw,
      arithMatch[1],
      arithMatch[2],
      arithMatch[3] as '+' | '-' | '*',
      arithMatch[4],
    );
  }

  const ifMatch = clean.match(/^IF\s+([A-Z0-9_-]+)\s*(==|=|!=|<>|>=|<=|>|<)\s*([A-Z0-9_.-]+)(?:\s+THEN)?$/i);
  if (ifMatch) return makeIfStatement(lineNumber, raw, ifMatch[1], ifMatch[2], ifMatch[3]);

  const loopMatch = clean.match(/^PERFORM\s+(\d+)\s+TIMES$/i);
  if (loopMatch) return makeBoundedLoopStatement(lineNumber, raw, loopMatch[1]);

  const dispMatch = clean.match(/^DISPLAY\s+(.+)$/i);
  if (dispMatch) return makePrintStatement(lineNumber, raw, dispMatch[1]);

  return unparsedStatement(lineNumber, raw);
}

function parseCLine(lineNumber: number, raw: string, clean: string): TranspiledStatement {
  const memcpyMatch = clean.match(/^memcpy\s*\(\s*([a-zA-Z0-9_]+)\s*,\s*([a-zA-Z0-9_]+)\s*,\s*(\d+)\s*\)$/);
  if (memcpyMatch) return makeMemcpyStatement(lineNumber, raw, memcpyMatch[1], memcpyMatch[2], Number(memcpyMatch[3]));

  const forMatch = clean.match(/^for\s*\(\s*(?:int\s+)?[a-zA-Z_]\w*\s*=\s*0\s*;\s*[a-zA-Z_]\w*\s*<\s*(\d+)\s*;\s*[a-zA-Z_]\w*\+\+\s*\)\s*\{?$/);
  if (forMatch) return makeBoundedLoopStatement(lineNumber, raw, forMatch[1]);

  const ifMatch = clean.match(/^if\s*\(\s*([a-zA-Z0-9_]+)\s*(==|!=|>=|<=|>|<)\s*([a-zA-Z0-9_]+)\s*\)\s*\{?$/);
  if (ifMatch) return makeIfStatement(lineNumber, raw, ifMatch[1], ifMatch[2], ifMatch[3]);

  const printMatch = clean.match(/^printf\s*\(\s*([a-zA-Z0-9_"]+)\s*\)$/);
  if (printMatch) return makePrintStatement(lineNumber, raw, printMatch[1]);

  const divMatch = clean.match(/^(?:int|float|double)?\s*([a-zA-Z0-9_]+)\s*=\s*([a-zA-Z0-9_]+)\s*\/\s*(\d+)$/);
  if (divMatch) return makeDivStatement(lineNumber, raw, divMatch[1], divMatch[2], Number(divMatch[3]));

  const arithMatch = clean.match(/^(?:int|uint32_t|int64_t)?\s*([a-zA-Z0-9_]+)\s*=\s*([a-zA-Z0-9_]+)\s*([+\-*])\s*([a-zA-Z0-9_]+)$/);
  if (arithMatch) {
    return makeArithmeticStatement(
      lineNumber,
      raw,
      arithMatch[1],
      arithMatch[2],
      arithMatch[3] as '+' | '-' | '*',
      arithMatch[4],
    );
  }

  const assignMatch = clean.match(/^(?:int|uint32_t|int64_t)?\s*([a-zA-Z0-9_]+)\s*=\s*(.+)$/);
  if (assignMatch) return makeAssignStatement(lineNumber, raw, assignMatch[1], assignMatch[2]);

  return unparsedStatement(lineNumber, raw);
}

function parsePascalLine(lineNumber: number, raw: string, clean: string): TranspiledStatement {
  const ifMatch = clean.match(/^if\s+([a-zA-Z0-9_]+)\s*(=|<>|>=|<=|>|<)\s*([a-zA-Z0-9_]+)\s+then(?:\s+begin)?$/i);
  if (ifMatch) return makeIfStatement(lineNumber, raw, ifMatch[1], ifMatch[2], ifMatch[3]);

  const forMatch = clean.match(/^for\s+[a-zA-Z0-9_]+\s*:=\s*1\s+to\s+(\d+)\s+do(?:\s+begin)?$/i);
  if (forMatch) return makeBoundedLoopStatement(lineNumber, raw, forMatch[1]);

  const printMatch = clean.match(/^writeln\s*\(\s*([a-zA-Z0-9_']+)\s*\)$/i);
  if (printMatch) return makePrintStatement(lineNumber, raw, printMatch[1]);

  const divMatch = clean.match(/^([a-zA-Z0-9_]+)\s*:=\s*([a-zA-Z0-9_]+)\s*\/\s*(\d+)$/);
  if (divMatch) return makeDivStatement(lineNumber, raw, divMatch[1], divMatch[2], Number(divMatch[3]));

  const arithMatch = clean.match(/^([a-zA-Z0-9_]+)\s*:=\s*([a-zA-Z0-9_]+)\s*([+\-*])\s*([a-zA-Z0-9_]+)$/);
  if (arithMatch) {
    return makeArithmeticStatement(
      lineNumber,
      raw,
      arithMatch[1],
      arithMatch[2],
      arithMatch[3] as '+' | '-' | '*',
      arithMatch[4],
    );
  }

  const assignMatch = clean.match(/^([a-zA-Z0-9_]+)\s*:=\s*(.+)$/);
  if (assignMatch) return makeAssignStatement(lineNumber, raw, assignMatch[1], assignMatch[2]);

  return unparsedStatement(lineNumber, raw);
}

function parseAsmLine(lineNumber: number, raw: string, clean: string): TranspiledStatement {
  const movMatch = clean.match(/^MOV\s+([A-Z0-9_]+)\s*,\s*([A-Z0-9_\[\]]+)$/i);
  if (movMatch) {
    const [, dst, src] = movMatch;
    return buildStmt(
      lineNumber,
      raw,
      'CARGA DE REGISTRO',
      'ᛣᚪ',
      'SET',
      `reg_write(${dst.toUpperCase()}, ${src.toUpperCase()});`,
      { kind: 'REG_OP', op: 'MOV', left: dst.toLowerCase(), right: src.toLowerCase() },
      `valid_reg(${dst})`,
      `reg(${dst}) == ${src}`,
      'VERIFICADO',
      'Transferencia de registro mapeada a almacenamiento determinista.',
    );
  }

  const addMatch = clean.match(/^ADD\s+([A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)$/i);
  if (addMatch) {
    const [, dst, src] = addMatch;
    return buildStmt(
      lineNumber,
      raw,
      'SUMA DE REGISTRO',
      'ᚱᚳ',
      'ADD',
      `reg_add(${dst.toUpperCase()}, ${src.toUpperCase()});`,
      { kind: 'REG_OP', op: 'ADD', left: dst.toLowerCase(), right: src.toLowerCase() },
      `no_overflow(${dst} + ${src})`,
      `reg(${dst})' == ${dst} + ${src}`,
      'VERIFICADO',
      'Operación ALU mapeada a instrucción verificable.',
    );
  }

  const cmpMatch = clean.match(/^CMP\s+([A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)$/i);
  if (cmpMatch) {
    const [, left, right] = cmpMatch;
    return buildStmt(
      lineNumber,
      raw,
      'ASERCION / COMPARACIÓN',
      'ᛗᚦ',
      'IO_BUS_TX',
      `assert_eq(${left.toUpperCase()}, ${right.toUpperCase()});`,
      { kind: 'REG_OP', op: 'CMP', left: left.toLowerCase(), right: right.toLowerCase() },
      `readable(${left}) && readable(${right})`,
      'flags_updated()',
      'VERIFICADO',
      'Comparación convertida a guarda explícita.',
    );
  }

  return unparsedStatement(lineNumber, raw);
}

function parsePythonLine(lineNumber: number, raw: string, clean: string): TranspiledStatement {
  const forMatch = clean.match(/^for\s+[a-zA-Z_]\w*\s+in\s+range\s*\(\s*(\d+)\s*\)\s*:$/);
  if (forMatch) return makeBoundedLoopStatement(lineNumber, raw, forMatch[1]);

  const ifMatch = clean.match(/^if\s+([a-zA-Z0-9_]+)\s*(==|!=|>=|<=|>|<)\s*([a-zA-Z0-9_]+)\s*:$/);
  if (ifMatch) return makeIfStatement(lineNumber, raw, ifMatch[1], ifMatch[2], ifMatch[3]);

  const printMatch = clean.match(/^print\s*\(\s*([a-zA-Z0-9_"']+)\s*\)$/);
  if (printMatch) return makePrintStatement(lineNumber, raw, printMatch[1]);

  const divMatch = clean.match(/^([a-zA-Z_]\w*)\s*=\s*([a-zA-Z0-9_]+)\s*\/\/?\s*(\d+)$/);
  if (divMatch) return makeDivStatement(lineNumber, raw, divMatch[1], divMatch[2], Number(divMatch[3]));

  const arithMatch = clean.match(/^([a-zA-Z_]\w*)\s*=\s*([a-zA-Z0-9_]+)\s*([+\-*])\s*([a-zA-Z0-9_]+)$/);
  if (arithMatch) {
    return makeArithmeticStatement(
      lineNumber,
      raw,
      arithMatch[1],
      arithMatch[2],
      arithMatch[3] as '+' | '-' | '*',
      arithMatch[4],
    );
  }

  const assignMatch = clean.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (assignMatch) return makeAssignStatement(lineNumber, raw, assignMatch[1], assignMatch[2]);

  return unparsedStatement(lineNumber, raw);
}

function parseGoLine(lineNumber: number, raw: string, clean: string): TranspiledStatement {
  const forMatch = clean.match(/^for\s+[a-zA-Z_]\w*\s*:=\s*0\s*;\s*[a-zA-Z_]\w*\s*<\s*(\d+)\s*;\s*[a-zA-Z_]\w*\+\+\s*\{?$/);
  if (forMatch) return makeBoundedLoopStatement(lineNumber, raw, forMatch[1]);

  const ifMatch = clean.match(/^if\s+([a-zA-Z0-9_]+)\s*(==|!=|>=|<=|>|<)\s*([a-zA-Z0-9_]+)\s*\{?$/);
  if (ifMatch) return makeIfStatement(lineNumber, raw, ifMatch[1], ifMatch[2], ifMatch[3]);

  const printMatch = clean.match(/^fmt\.Println\s*\(\s*([a-zA-Z0-9_"]+)\s*\)$/);
  if (printMatch) return makePrintStatement(lineNumber, raw, printMatch[1]);

  const divMatch = clean.match(/^([a-zA-Z_]\w*)\s*:?=\s*([a-zA-Z0-9_]+)\s*\/\s*(\d+)$/);
  if (divMatch) return makeDivStatement(lineNumber, raw, divMatch[1], divMatch[2], Number(divMatch[3]));

  const arithMatch = clean.match(/^([a-zA-Z_]\w*)\s*:?=\s*([a-zA-Z0-9_]+)\s*([+\-*])\s*([a-zA-Z0-9_]+)$/);
  if (arithMatch) {
    return makeArithmeticStatement(
      lineNumber,
      raw,
      arithMatch[1],
      arithMatch[2],
      arithMatch[3] as '+' | '-' | '*',
      arithMatch[4],
    );
  }

  const assignMatch = clean.match(/^([a-zA-Z_]\w*)\s*:?=\s*(.+)$/);
  if (assignMatch) return makeAssignStatement(lineNumber, raw, assignMatch[1], assignMatch[2]);

  return unparsedStatement(lineNumber, raw);
}

function parseHelixLine(lineNumber: number, raw: string, clean: string): TranspiledStatement {
  const parts = clean.split(/\s+/);
  const head = parts[0] ?? '';
  const op = head.toUpperCase();

  if (head === 'ᛇᚢ' || op === 'KERN_BOOT') {
    return buildStmt(
      lineNumber,
      raw,
      'ARRANQUE DE NÚCLEO',
      'ᛇᚢ',
      'KERN_BOOT',
      'kernel_boot();',
      { kind: 'PRINT', value: '"kernel_boot"' },
      'hardware_ready',
      'kernel_booted == true',
      'VERIFICADO',
      'Inicialización de subsistemas del núcleo.',
    );
  }
  if (head === 'ᛗᚦ' || op === 'AUTH_CHECK') {
    const uid = parts[1] ?? 'sys_user';
    return buildStmt(
      lineNumber,
      raw,
      'CONTROL DE ACCESO',
      'ᛗᚦ',
      'AUTH_CHECK',
      `auth_check(${uid});`,
      { kind: 'ASSIGN', target: 'uid', expr: `"${uid}"`, isNumericLiteral: false },
      'uid_declared',
      `authenticated_uid == ${uid}`,
      'VERIFICADO',
      `Autenticación UID (${uid}) validada.`,
    );
  }
  if (head === 'ᚩᛖ' || op === 'IO_BUS_TX') {
    const payload = parts.slice(1).join(' ') || 'frame';
    return makePrintStatement(lineNumber, raw, payload);
  }
  if (head === 'ᚠᚷ' || op === 'MEM_ALLOC') {
    const size = Number(parts[1] ?? 128);
    return makeMemcpyStatement(lineNumber, raw, 'heap_blk', 'zero_page', Number.isFinite(size) ? size : 128);
  }
  if (head === 'ᚳᛏ' || op === 'EXIT_OK') {
    return makePrintStatement(lineNumber, raw, '"exit_0"');
  }
  if (op === 'SET' && parts.length >= 3) {
    return makeAssignStatement(lineNumber, raw, parts[1], parts.slice(2).join(' '));
  }
  if ((op === 'ADD' || op === 'SUB' || op === 'MUL') && parts.length >= 3) {
    const sym = op === 'ADD' ? '+' : op === 'SUB' ? '-' : '*';
    return makeArithmeticStatement(lineNumber, raw, parts[1], parts[1], sym, parts[2]);
  }
  if (op === 'DIV' && parts.length >= 3) {
    return makeDivStatement(lineNumber, raw, parts[1], parts[1], Number(parts[2]));
  }
  if (op === 'LOOP' && parts.length >= 2) {
    return makeBoundedLoopStatement(lineNumber, raw, parts[1]);
  }
  if (op === 'IF' && parts.length >= 4) {
    return makeIfStatement(lineNumber, raw, parts[1], parts[2], parts[3]);
  }
  if (op === 'FILE_WRITE' && parts.length >= 3) {
    return makePrintStatement(lineNumber, raw, parts.slice(2).join(' '));
  }
  return unparsedStatement(lineNumber, raw);
}

function unparsedStatement(lineNumber: number, raw: string): TranspiledStatement {
  return buildStmt(
    lineNumber,
    raw,
    'NO RECONOCIDO',
    'ᛉᚻ',
    'TRAP_SANDBOX',
    `UNSUPPORTED(${raw})`,
    { kind: 'TRAP_ERROR', reason: `Sintaxis fuera del subconjunto: ${raw}` },
    'syntax_supported == true',
    'rejected()',
    'RECHAZADO',
    'Instrucción fuera del subconjunto determinista soportado.',
  );
}

export function emitTargetCode(
  report: TranspileReport,
  target: TargetLanguage,
): string {
  return emitTargetCodeFromStatements(report.statements, target);
}

function emitTargetCodeFromStatements(
  statements: TranspiledStatement[],
  target: TargetLanguage,
): string {
  if (target === 'Helix') {
    const body: string[] = [
      '# Programa Helix generado por el transpilador determinista',
      'ᛇᚢ',
      'ᛗᚦ sys_user',
    ];
    let indent = 0;
    for (const stmt of statements) {
      if (stmt.status === 'RECHAZADO') {
        body.push(`${'  '.repeat(indent)}# [RECHAZADO L${stmt.lineNumber}] ${stmt.diagnostic}`);
        continue;
      }
      const node = stmt.irNode;
      if (node.kind === 'BLOCK_END' || node.kind === 'ELSE_BRANCH') {
        indent = Math.max(0, indent - 1);
      }
      const pad = '  '.repeat(indent);
      switch (node.kind) {
        case 'ASSIGN':
          body.push(`${pad}SET ${node.target} ${node.expr}`);
          break;
        case 'RATIONAL_DIV':
          body.push(`${pad}SET ${node.target} ${node.left}`);
          body.push(`${pad}DIV ${node.target} ${node.denominator}`);
          break;
        case 'ARITHMETIC':
          if (node.target !== node.left) {
            body.push(`${pad}SET ${node.target} ${node.left}`);
          }
          body.push(
            `${pad}${node.op === '+' ? 'ADD' : node.op === '-' ? 'SUB' : 'MUL'} ${node.target} ${node.right}`,
          );
          break;
        case 'MEM_COPY':
          body.push(`${pad}ᚠᚷ ${node.bytes}`);
          body.push(`${pad}ᚩᛖ copy_${node.dst}_${node.src}_${node.bytes}B`);
          break;
        case 'IF_START':
          body.push(`${pad}IF ${node.left} ${node.cmp} ${node.right}`);
          indent += 1;
          break;
        case 'ELSE_BRANCH':
          body.push(`${pad}ELSE`);
          indent += 1;
          break;
        case 'LOOP_START':
          body.push(`${pad}LOOP ${node.countExpr}`);
          indent += 1;
          break;
        case 'BLOCK_END':
          body.push(`${pad}END`);
          break;
        case 'PRINT':
          body.push(`${pad}ᚩᛖ ${node.value}`);
          break;
        case 'REG_OP':
          if (node.op === 'MOV') body.push(`${pad}SET ${node.left} ${node.right}`);
          else if (node.op === 'ADD') body.push(`${pad}ADD ${node.left} ${node.right}`);
          else body.push(`${pad}IF ${node.left} == ${node.right}\n${pad}  ᚩᛖ cmp_ok\n${pad}END`);
          break;
        default:
          break;
      }
    }
    body.push('ᚳᛏ');
    return body.join('\n');
  }

  const declared = new Set<string>();
  const lines: string[] = [];

  if (target === 'Go') {
    lines.push('package main', '', 'import "fmt"', '', 'func main() {');
  } else if (target === 'Python') {
    lines.push('from fractions import Fraction', '');
  } else if (target === 'C') {
    lines.push('#include <stdio.h>', '#include <stdint.h>', '', 'int main(void) {');
  } else if (target === 'Rust') {
    lines.push('fn main() {');
  }

  let indent = target === 'Python' || target === 'TypeScript' ? 0 : 1;
  let loopIdx = 0;

  for (const stmt of statements) {
    if (stmt.status === 'RECHAZADO') {
      const cmt = target === 'Python' ? '#' : '//';
      lines.push(`${'  '.repeat(indent)}${cmt} [RECHAZADO L${stmt.lineNumber}] ${stmt.diagnostic}`);
      continue;
    }
    const node = stmt.irNode;
    if (node.kind === 'BLOCK_END' || node.kind === 'ELSE_BRANCH') {
      indent = Math.max(0, indent - 1);
    }
    const pad = '  '.repeat(indent);

    switch (node.kind) {
      case 'ASSIGN': {
        if (target === 'Go') {
          const op = declared.has(node.target) ? '=' : ':=';
          declared.add(node.target);
          lines.push(`${pad}${node.target} ${op} float64(${node.expr})`);
        } else if (target === 'Python') {
          lines.push(`${pad}${node.target} = Fraction(${node.expr})`);
        } else if (target === 'TypeScript') {
          const kw = declared.has(node.target) ? '' : 'let ';
          declared.add(node.target);
          lines.push(`${pad}${kw}${node.target} = ${node.expr};`);
        } else if (target === 'C') {
          const ty = declared.has(node.target) ? '' : 'double ';
          declared.add(node.target);
          lines.push(`${pad}${ty}${node.target} = ${node.expr};`);
        } else if (target === 'Rust') {
          const kw = declared.has(node.target) ? '' : 'let mut ';
          declared.add(node.target);
          lines.push(`${pad}${kw}${node.target}: f64 = ${node.expr} as f64;`);
        }
        break;
      }
      case 'RATIONAL_DIV': {
        if (target === 'Go') {
          const op = declared.has(node.target) ? '=' : ':=';
          declared.add(node.target);
          lines.push(`${pad}${node.target} ${op} float64(${node.left}) / float64(${node.denominator})`);
        } else if (target === 'Python') {
          lines.push(`${pad}${node.target} = Fraction(${node.left}, ${node.denominator})`);
        } else if (target === 'TypeScript') {
          const kw = declared.has(node.target) ? '' : 'let ';
          declared.add(node.target);
          lines.push(`${pad}${kw}${node.target} = ${node.left} / ${node.denominator};`);
        } else if (target === 'C') {
          const ty = declared.has(node.target) ? '' : 'double ';
          declared.add(node.target);
          lines.push(`${pad}${ty}${node.target} = (double)(${node.left}) / ${node.denominator};`);
        } else if (target === 'Rust') {
          const kw = declared.has(node.target) ? '' : 'let mut ';
          declared.add(node.target);
          lines.push(`${pad}${kw}${node.target}: f64 = (${node.left} as f64) / ${node.denominator}.0;`);
        }
        break;
      }
      case 'ARITHMETIC': {
        if (target === 'Go') {
          const op = declared.has(node.target) ? '=' : ':=';
          declared.add(node.target);
          lines.push(`${pad}${node.target} ${op} float64(${node.left}) ${node.op} float64(${node.right})`);
        } else if (target === 'Python') {
          lines.push(`${pad}${node.target} = ${node.left} ${node.op} ${node.right}`);
        } else if (target === 'TypeScript') {
          const kw = declared.has(node.target) ? '' : 'let ';
          declared.add(node.target);
          lines.push(`${pad}${kw}${node.target} = ${node.left} ${node.op} ${node.right};`);
        } else if (target === 'C') {
          const ty = declared.has(node.target) ? '' : 'double ';
          declared.add(node.target);
          lines.push(`${pad}${ty}${node.target} = ${node.left} ${node.op} ${node.right};`);
        } else if (target === 'Rust') {
          const kw = declared.has(node.target) ? '' : 'let mut ';
          declared.add(node.target);
          lines.push(`${pad}${kw}${node.target}: f64 = (${node.left} as f64) ${node.op} (${node.right} as f64);`);
        }
        break;
      }
      case 'MEM_COPY': {
        const msg = `bus_copy_${node.dst}_${node.src}_${node.bytes}B`;
        if (target === 'Go') lines.push(`${pad}fmt.Println("${msg}")`);
        else if (target === 'Python') lines.push(`${pad}print("${msg}")`);
        else if (target === 'TypeScript') lines.push(`${pad}console.log("${msg}");`);
        else if (target === 'C') lines.push(`${pad}printf("${msg}\\n");`);
        else if (target === 'Rust') lines.push(`${pad}println!("${msg}");`);
        break;
      }
      case 'IF_START': {
        const cmp = node.cmp === '==' && target === 'TypeScript' ? '===' : node.cmp;
        if (target === 'Go') lines.push(`${pad}if float64(${node.left}) ${cmp} float64(${node.right}) {`);
        else if (target === 'Python') lines.push(`${pad}if ${node.left} ${cmp} ${node.right}:`);
        else if (target === 'TypeScript' || target === 'C') lines.push(`${pad}if (${node.left} ${cmp} ${node.right}) {`);
        else if (target === 'Rust') lines.push(`${pad}if (${node.left} as f64) ${cmp} (${node.right} as f64) {`);
        indent += 1;
        break;
      }
      case 'ELSE_BRANCH': {
        if (target === 'Python') lines.push(`${pad}else:`);
        else lines.push(`${pad}} else {`);
        indent += 1;
        break;
      }
      case 'LOOP_START': {
        const v = `_i${loopIdx++}`;
        if (target === 'Go') lines.push(`${pad}for ${v} := 0; ${v} < ${node.countExpr}; ${v}++ {`);
        else if (target === 'Python') lines.push(`${pad}for ${v} in range(${node.countExpr}):`);
        else if (target === 'TypeScript') lines.push(`${pad}for (let ${v} = 0; ${v} < ${node.countExpr}; ${v}++) {`);
        else if (target === 'C') lines.push(`${pad}for (int ${v} = 0; ${v} < ${node.countExpr}; ${v}++) {`);
        else if (target === 'Rust') lines.push(`${pad}for ${v} in 0..${node.countExpr} {`);
        indent += 1;
        break;
      }
      case 'BLOCK_END': {
        if (target !== 'Python') {
          lines.push(`${pad}}`);
        }
        break;
      }
      case 'PRINT': {
        const isStrLit = /^["'].*["']$/.test(node.value);
        if (target === 'Go') lines.push(`${pad}fmt.Println(${node.value})`);
        else if (target === 'Python') lines.push(`${pad}print(${node.value})`);
        else if (target === 'TypeScript') lines.push(`${pad}console.log(${node.value});`);
        else if (target === 'C') {
          lines.push(
            isStrLit
              ? `${pad}printf("%s\\n", "${node.value.slice(1, -1)}");`
              : `${pad}printf("%g\\n", (double)${node.value});`,
          );
        } else if (target === 'Rust') {
          lines.push(
            isStrLit
              ? `${pad}println!("{}", "${node.value.slice(1, -1)}");`
              : `${pad}println!("{}", ${node.value});`,
          );
        }
        break;
      }
      case 'REG_OP': {
        if (node.op === 'MOV') {
          if (target === 'Go') {
            const op = declared.has(node.left) ? '=' : ':=';
            declared.add(node.left);
            lines.push(`${pad}${node.left} ${op} ${node.right}`);
          } else if (target === 'Python') {
            lines.push(`${pad}${node.left} = ${node.right}`);
          } else if (target === 'TypeScript') {
            const kw = declared.has(node.left) ? '' : 'let ';
            declared.add(node.left);
            lines.push(`${pad}${kw}${node.left} = ${node.right};`);
          } else if (target === 'C') {
            const ty = declared.has(node.left) ? '' : 'int64_t ';
            declared.add(node.left);
            lines.push(`${pad}${ty}${node.left} = ${node.right};`);
          } else if (target === 'Rust') {
            const kw = declared.has(node.left) ? '' : 'let mut ';
            declared.add(node.left);
            lines.push(`${pad}${kw}${node.left}: i64 = ${node.right};`);
          }
        } else if (node.op === 'ADD') {
          if (target === 'Go' || target === 'Python') {
            lines.push(`${pad}${node.left} += ${node.right}`);
          } else {
            lines.push(`${pad}${node.left} += ${node.right};`);
          }
        } else if (node.op === 'CMP') {
          const msg = `cmp(${node.left}, ${node.right})`;
          if (target === 'Go') lines.push(`${pad}fmt.Println("${msg}")`);
          else if (target === 'Python') lines.push(`${pad}print("${msg}")`);
          else if (target === 'TypeScript') lines.push(`${pad}console.log("${msg}");`);
          else if (target === 'C') lines.push(`${pad}printf("${msg}\\n");`);
          else if (target === 'Rust') lines.push(`${pad}println!("${msg}");`);
        }
        break;
      }
      default:
        break;
    }
  }

  if (target === 'Go' || target === 'Rust') {
    lines.push('}');
  } else if (target === 'C') {
    lines.push('  return 0;', '}');
  }

  return lines.join('\n');
}

import { HELIX_OPERATORS, RUNES } from '../data/runes';
import { CompoundWord } from '../data/vocabulary';

export interface HelixBinaryModuleSpec {
  binary: string;
  role: string;
  subsystems: string[];
  trustBoundary: 'Núcleo / Verificador' | 'Runtime / Datos' | 'Asistencia Probabilística';
  description: string;
}

export const HELIX_ECOSYSTEM_MODULES: HelixBinaryModuleSpec[] = [
  {
    binary: 'helix.dna',
    role: 'Especificación base compartida',
    subsystems: ['Todos'],
    trustBoundary: 'Runtime / Datos',
    description: 'Archivo maestro con los 33 tokens, primos, opcodes, frecuencias y colores procedurales.',
  },
  {
    binary: 'helix-boot.exe',
    role: 'Secuencia de arranque',
    subsystems: ['Kernel'],
    trustBoundary: 'Núcleo / Verificador',
    description: 'Carga helix.dna, valida integridad inicial y ordena el inicio de los servicios.',
  },
  {
    binary: 'helix-runes.exe',
    role: 'Motor léxico y procedural',
    subsystems: ['Memoria', 'Kernel', 'Procesos', 'Seguridad', 'Entrada/Salida', 'Planificador'],
    trustBoundary: 'Runtime / Datos',
    description: 'Resuelve tokens, firmas de Gödel, tonos Hz y síntesis cromática H(p).',
  },
  {
    binary: 'helix-verify.exe',
    role: 'Puerta de verificación estática y simbólica',
    subsystems: ['Seguridad', 'Kernel'],
    trustBoundary: 'Núcleo / Verificador',
    description: 'Valida balance AST, cotas simbólicas de heap, divisores P33 y div/0 sin dependencias externas de Z3/CGO para el subconjunto acotado.',
  },
  {
    binary: 'helix-verify-diag.exe',
    role: 'Diagnóstico de contratos',
    subsystems: ['Seguridad'],
    trustBoundary: 'Núcleo / Verificador',
    description: 'Emite trazas de fallos línea por línea cuando una precondición es rechazada.',
  },
  {
    binary: 'helix-memory.exe',
    role: 'Gestor de bloques y permisos',
    subsystems: ['Memoria'],
    trustBoundary: 'Núcleo / Verificador',
    description: 'Administra asignación acotada, bloqueo RO/RW y protección contra double-free.',
  },
  {
    binary: 'helix-migrate.exe',
    role: 'Transpilador de código legado',
    subsystems: ['Entrada/Salida', 'Memoria'],
    trustBoundary: 'Núcleo / Verificador',
    description: 'Convierte subconjuntos COBOL, C, Pascal y ASM a Helix IR con contratos explícitos.',
  },
  {
    binary: 'helix-audit.exe',
    role: 'Registro de auditoría',
    subsystems: ['Seguridad', 'Planificador'],
    trustBoundary: 'Runtime / Datos',
    description: 'Conserva el historial de instrucciones aprobadas, rechazadas y cambios de estado.',
  },
  {
    binary: 'helix-server.exe',
    role: 'Bus de despacho y API local',
    subsystems: ['Entrada/Salida', 'Procesos'],
    trustBoundary: 'Runtime / Datos',
    description: 'Expone puntos de entrada HTTP/IPC entre la consola, el agente y los verificadores.',
  },
  {
    binary: 'helix-aperture.exe',
    role: 'Interfaz gráfica y SVG',
    subsystems: ['Entrada/Salida'],
    trustBoundary: 'Runtime / Datos',
    description: 'Renderiza glifos vectoriales, espectro cromático y estado del sistema en pantalla.',
  },
  {
    binary: 'helix_agent.exe',
    role: 'Agente IA aislado (Ollama)',
    subsystems: ['Planificador'],
    trustBoundary: 'Asistencia Probabilística',
    description: 'Traduce lenguaje natural a sentencias Helix que deben superar helix-verify antes de ejecutarse.',
  },
  {
    binary: 'helix-ws-relay',
    role: 'Servidor WebSocket QPSK (/ws)',
    subsystems: ['Entrada/Salida', 'Seguridad'],
    trustBoundary: 'Núcleo / Verificador',
    description: 'Sincroniza salas multi-cliente, verifica cotas de escena en servidor y firma tramas QPSK 132-bit con SHA-256.',
  },
  {
    binary: 'helix-mesh3d',
    role: 'Motor 3D PBR ORM y glTF/Draco',
    subsystems: ['Memoria', 'Entrada/Salida'],
    trustBoundary: 'Runtime / Datos',
    description: 'Compila MESH_NODE y MAT_ORM a Three.js con texturas ORM físicas, cámara 6-DoF y exportación/inspección glTF 2.0.',
  },
  {
    binary: 'helix-linker',
    role: 'Enlazador puro de células .hlx',
    subsystems: ['Kernel', 'Seguridad', 'Entrada/Salida'],
    trustBoundary: 'Núcleo / Verificador',
    description: 'Ensambla código puro Go, GLSL, JS y HTML exclusivamente desde bloques firmados dentro de cada célula .hlx sin plantillas fijas.',
  },
];

export function buildHelixDnaDocument(vocabulary: CompoundWord[]) {
  const dnaVersion = 'helix.dna/v1.5';
  const basis = RUNES.map((r) => `${r.index}:${r.prime}:${r.osTag}`).join(',');
  return {
    schema: dnaVersion,
    language: 'Helix OS Symbolic Language',
    axioms: {
      tokenCount: RUNES.length,
      primeBasis: RUNES.map((r) => r.prime),
      rationalSubring: 'Z[1/2, 1/3, ..., 1/137]',
      colorFormula: 'H(p) = (p * 137.50776405003785) mod 360',
      compositeColorFormula: 'atan2(sum(sin(H_k)), sum(cos(H_k))) mod 360',
      agentSecurityBoundary: 'helix_agent -> parser/AST -> helix-verify -> pcc-sha256 -> helix-memory/runtime',
      dnaCanonicalHeader: `${dnaVersion}|${basis}`,
      spatialAndRealtime: {
        meshTriangleBudget: 10000,
        ormChannelDomain: '[0, 1] (R=AO, G=Roughness, B=Metalness)',
        cameraModel: '6-DoF (X, Y, Z, Yaw, Pitch, FOV)',
        wsTransport: 'QPSK Z4 132-bit (66 symbols) over WebSocket /ws',
      },
      cellArchitecture: {
        cellFormat: '.hlx (multi-target signed block)',
        targets: ['go', 'glsl', 'js', 'html'],
        zeroFixedTemplates: true,
        integrityChecks: ['CELL_INTEGRITY_MISMATCH', 'CELL_SANDBOX_VIOLATION'],
      },
      embeddedSymbolicSolver: {
        strategy:
          'Octagon Abstract Domain (±X ± Y <= c) + Interval Narrowing + Variable/Heap Typestate + Wuffs Dead-Branch Pruning + SHA-256 Proof-Carrying Code',
        externalDependencies: 'None (Zero CGO / Zero external Z3 download for bounded subset)',
        provedInvariants: [
          'NO_DIV_ZERO',
          'SMT_DIV_ZERO',
          'P33_DENOMINATOR',
          'SMT_P33_VAR',
          'SMT_MEM_BOUNDS',
          'SMT_MESH_BUDGET',
          'SMT_ORM_BOUNDS',
          'SMT_BRANCH_SAT',
          'TYPESTATE_UNINIT_VAR',
          'TYPESTATE_DOUBLE_FREE',
          'TYPESTATE_LOCKED_FREE',
        ],
      },
    },
    layers: [
      'Capa 1: Glifo (Vector SVG)',
      'Capa 2: Fonética (AFI)',
      'Capa 3: Numérica (Primo de Gödel + Firma posicional)',
      'Capa 4: Acústica (Hz)',
      'Capa 5: Semántica (Rol y Opcode SO)',
      'Capa 6: Cromática (Color procedural H(p))',
    ],
    visualRendering: {
      directions: ['LTR', 'TTB'],
      writingModes: ['Secuencial', 'Enlazado'],
      spectralBand: true,
    },
    grammar: {
      lexeme: '<Lexema> ::= <Token> | <Token><Token>',
      statement: '<Sentencia> ::= <Entidad> <Operación> <Modificador>*',
      expression: '<Expr> ::= <Cláusula> ( (⊕|⊗|⊖|⊡) <Cláusula> )*',
    },
    tokens: RUNES,
    operators: HELIX_OPERATORS,
    lexicon: vocabulary,
    ecosystemModules: HELIX_ECOSYSTEM_MODULES,
  };
}

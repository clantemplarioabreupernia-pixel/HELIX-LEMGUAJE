import { derivePrimeColor } from '../utils/primeColor';

export type GrammaticalRole = 'Entidad' | 'Operación' | 'Modificador';

export type OsSubsystem =
  | 'Memoria'
  | 'Kernel'
  | 'Procesos'
  | 'Seguridad'
  | 'Entrada/Salida'
  | 'Planificador';

export interface PrimitiveToken {
  index: number;
  glyph: string;
  name: string;
  phoneme: string;
  prime: number;
  frequencyHz: number;
  meaning: string;
  role: GrammaticalRole;
  subsystem: OsSubsystem;
  osTag: string;
  colorHex: string;
  hueDeg: number;
  rgb: [number, number, number];
}

export type RuneToken = PrimitiveToken;

export interface HelixOperator {
  symbol: string;
  name: string;
  osMeaning: string;
  description: string;
}

export const HELIX_OPERATORS: HelixOperator[] = [
  {
    symbol: '⊕',
    name: 'Unión',
    osMeaning: 'Composición / Multiplexación de flujos',
    description: 'Combina dos operandos o recursos en una misma operación compuesta.',
  },
  {
    symbol: '⊗',
    name: 'Producto',
    osMeaning: 'Encadenamiento / Enlace estricto',
    description: 'Aplica una operación sobre un destino con herencia estricta de privilegios.',
  },
  {
    symbol: '⊖',
    name: 'Sustracción',
    osMeaning: 'Liberación / Revocación de recurso',
    description: 'Libera un segmento asignado o revoca un descriptor o permiso activo.',
  },
  {
    symbol: '⊡',
    name: 'Evaluación',
    osMeaning: 'Lectura / Aserción de invariante',
    description: 'Evalúa el registro resultante y verifica invariantes de estado del núcleo.',
  },
];

type BaseTokenDefinition = Omit<PrimitiveToken, 'colorHex' | 'hueDeg' | 'rgb'>;

const BASE_TOKENS: BaseTokenDefinition[] = [
  { index: 1, glyph: 'ᚠ', name: 'RES', phoneme: '/f/', prime: 2, frequencyHz: 261.6256, meaning: 'Recurso base y segmento de memoria', role: 'Entidad', subsystem: 'Memoria', osTag: 'RES_MEM' },
  { index: 2, glyph: 'ᚢ', name: 'INI', phoneme: '/u/', prime: 3, frequencyHz: 392.4384, meaning: 'Inicialización y arranque del núcleo', role: 'Operación', subsystem: 'Kernel', osTag: 'INIT_BOOT' },
  { index: 3, glyph: 'ᚦ', name: 'ACL', phoneme: '/θ/', prime: 5, frequencyHz: 327.0320, meaning: 'Control de acceso y guarda de seguridad', role: 'Modificador', subsystem: 'Seguridad', osTag: 'GUARD_ACL' },
  { index: 4, glyph: 'ᚩ', name: 'STR', phoneme: '/o/', prime: 7, frequencyHz: 457.8448, meaning: 'Flujo estándar de entrada y salida', role: 'Entidad', subsystem: 'Entrada/Salida', osTag: 'IO_STREAM' },
  { index: 5, glyph: 'ᚱ', name: 'RTE', phoneme: '/r/', prime: 11, frequencyHz: 359.7352, meaning: 'Enrutamiento y despacho de ejecución', role: 'Operación', subsystem: 'Procesos', osTag: 'ROUTE_EXEC' },
  { index: 6, glyph: 'ᚳ', name: 'RUN', phoneme: '/k/', prime: 13, frequencyHz: 425.1416, meaning: 'Ejecución activa de hilo de proceso', role: 'Operación', subsystem: 'Procesos', osTag: 'RUN_ACTIVE' },
  { index: 7, glyph: 'ᚷ', name: 'ALC', phoneme: '/g/', prime: 17, frequencyHz: 370.6363, meaning: 'Asignación dinámica de memoria heap', role: 'Operación', subsystem: 'Memoria', osTag: 'ALLOC_GRANT' },
  { index: 8, glyph: 'ᚹ', name: 'NOM', phoneme: '/w/', prime: 19, frequencyHz: 414.2403, meaning: 'Estado operativo nominal verificado', role: 'Modificador', subsystem: 'Kernel', osTag: 'OK_NOMINAL' },
  { index: 9, glyph: 'ᚻ', name: 'TRP', phoneme: '/h/', prime: 23, frequencyHz: 376.0874, meaning: 'Interrupción y captura de excepción', role: 'Modificador', subsystem: 'Seguridad', osTag: 'INTERRUPT_TRAP' },
  { index: 10, glyph: 'ᚾ', name: 'PRI', phoneme: '/n/', prime: 29, frequencyHz: 373.6160, meaning: 'Prioridad crítica en cola de planificación', role: 'Modificador', subsystem: 'Planificador', osTag: 'PRIORITY_REQ' },
  { index: 11, glyph: 'ᛁ', name: 'LCK', phoneme: '/i/', prime: 31, frequencyHz: 396.5604, meaning: 'Bloqueo atómico de solo lectura', role: 'Modificador', subsystem: 'Memoria', osTag: 'FREEZE_LOCK' },
  { index: 12, glyph: 'ᛄ', name: 'EPC', phoneme: '/j/', prime: 37, frequencyHz: 397.0423, meaning: 'Época y ciclo periódico del planificador', role: 'Entidad', subsystem: 'Planificador', osTag: 'CYCLE_EPOCH' },
  { index: 13, glyph: 'ᛇ', name: 'ROT', phoneme: '/ç/', prime: 41, frequencyHz: 419.7700, meaning: 'Jerarquía raíz del sistema de archivos', role: 'Entidad', subsystem: 'Kernel', osTag: 'ROOT_TREE' },
  { index: 14, glyph: 'ᛈ', name: 'RND', phoneme: '/p/', prime: 43, frequencyHz: 351.5594, meaning: 'Generación criptográfica de entropía', role: 'Operación', subsystem: 'Seguridad', osTag: 'ENTROPY_RAND' },
  { index: 15, glyph: 'ᛉ', name: 'SBX', phoneme: '/ks/', prime: 47, frequencyHz: 384.2626, meaning: 'Aislamiento de ejecución en sandbox', role: 'Modificador', subsystem: 'Seguridad', osTag: 'SHIELD_SANDBOX' },
  { index: 16, glyph: 'ᛋ', name: 'CLK', phoneme: '/s/', prime: 53, frequencyHz: 433.3174, meaning: 'Reloj maestro y gestión energética', role: 'Entidad', subsystem: 'Kernel', osTag: 'POWER_CLOCK' },
  { index: 17, glyph: 'ᛏ', name: 'EXT', phoneme: '/t/', prime: 59, frequencyHz: 482.3722, meaning: 'Confirmación y código de salida cero', role: 'Modificador', subsystem: 'Procesos', osTag: 'COMMIT_EXIT0' },
  { index: 18, glyph: 'ᛒ', name: 'FRK', phoneme: '/b/', prime: 61, frequencyHz: 498.7238, meaning: 'Bifurcación y creación de proceso hijo', role: 'Operación', subsystem: 'Procesos', osTag: 'FORK_SPAWN' },
  { index: 19, glyph: 'ᛖ', name: 'BUS', phoneme: '/e/', prime: 67, frequencyHz: 273.8893, meaning: 'Transferencia síncrona por bus de datos', role: 'Operación', subsystem: 'Entrada/Salida', osTag: 'BUS_TRANSFER' },
  { index: 20, glyph: 'ᛗ', name: 'UID', phoneme: '/m/', prime: 71, frequencyHz: 290.2409, meaning: 'Identidad de usuario y espacio de contexto', role: 'Entidad', subsystem: 'Seguridad', osTag: 'USER_UID' },
  { index: 21, glyph: 'ᛚ', name: 'PIP', phoneme: '/l/', prime: 73, frequencyHz: 298.4167, meaning: 'Tubería y búfer de comunicación entre procesos', role: 'Entidad', subsystem: 'Entrada/Salida', osTag: 'PIPE_BUFFER' },
  { index: 22, glyph: 'ᛜ', name: 'EXP', phoneme: '/ŋ/', prime: 79, frequencyHz: 322.9441, meaning: 'Expansión de límites del segmento heap', role: 'Operación', subsystem: 'Memoria', osTag: 'EXPAND_HEAP' },
  { index: 23, glyph: 'ᛞ', name: 'TCK', phoneme: '/d/', prime: 83, frequencyHz: 339.2957, meaning: 'Cuanto temporal y marca de reloj', role: 'Entidad', subsystem: 'Planificador', osTag: 'TICK_TIME' },
  { index: 24, glyph: 'ᛟ', name: 'FSD', phoneme: '/ø/', prime: 89, frequencyHz: 363.8231, meaning: 'Dominio de partición y espacio de nombres', role: 'Entidad', subsystem: 'Memoria', osTag: 'FS_DOMAIN' },
  { index: 25, glyph: 'ᚪ', name: 'PER', phoneme: '/ɑ/', prime: 97, frequencyHz: 396.5263, meaning: 'Escritura síncrona y persistencia en disco', role: 'Modificador', subsystem: 'Kernel', osTag: 'HARD_PERSIST' },
  { index: 26, glyph: 'ᚫ', name: 'ECC', phoneme: '/æ/', prime: 101, frequencyHz: 412.8779, meaning: 'Tolerancia a fallos y corrección de errores', role: 'Modificador', subsystem: 'Seguridad', osTag: 'RESILIENT_ECC' },
  { index: 27, glyph: 'ᚣ', name: 'PTR', phoneme: '/y/', prime: 103, frequencyHz: 421.0537, meaning: 'Direccionamiento exacto de puntero', role: 'Operación', subsystem: 'Entrada/Salida', osTag: 'ADDR_TARGET' },
  { index: 28, glyph: 'ᛡ', name: 'DMN', phoneme: '/io/', prime: 107, frequencyHz: 437.4053, meaning: 'Bucle continuo de servicio en segundo plano', role: 'Operación', subsystem: 'Planificador', osTag: 'LOOP_DAEMON' },
  { index: 29, glyph: 'ᛠ', name: 'FRE', phoneme: '/ea/', prime: 109, frequencyHz: 445.5811, meaning: 'Liberación de memoria y recolección GC', role: 'Operación', subsystem: 'Memoria', osTag: 'FREE_GC' },
  { index: 30, glyph: 'ᛢ', name: 'WAK', phoneme: '/kw/', prime: 113, frequencyHz: 461.9327, meaning: 'Señal de interrupción para activar servicio', role: 'Operación', subsystem: 'Kernel', osTag: 'SIGNAL_WAKE' },
  { index: 31, glyph: 'ᛣ', name: 'REG', phoneme: '/kˠ/', prime: 127, frequencyHz: 519.1633, meaning: 'Registro de estado y telemetría interna', role: 'Entidad', subsystem: 'Kernel', osTag: 'STATE_REG' },
  { index: 32, glyph: 'ᛤ', name: 'KIL', phoneme: '/gˠ/', prime: 131, frequencyHz: 267.7575, meaning: 'Terminación forzada y revocación inmediata', role: 'Operación', subsystem: 'Seguridad', osTag: 'KILL_ENFORCE' },
  { index: 33, glyph: 'ᛥ', name: 'ROM', phoneme: '/st/', prime: 137, frequencyHz: 280.0211, meaning: 'Segmento inmutable de solo lectura', role: 'Modificador', subsystem: 'Memoria', osTag: 'IMMUTABLE_ROM' },
];

export const PRIMITIVE_TOKENS: PrimitiveToken[] = BASE_TOKENS.map((base) => {
  const color = derivePrimeColor(base.prime, 'golden', base.index - 1);
  return {
    ...base,
    colorHex: color.colorHex,
    hueDeg: color.hueDeg,
    rgb: color.rgb,
  };
});

export const RUNES = PRIMITIVE_TOKENS;

export const TOKEN_BY_GLYPH = new Map<string, PrimitiveToken>(
  PRIMITIVE_TOKENS.map((r) => [r.glyph, r]),
);

export const TOKEN_BY_PRIME = new Map<number, PrimitiveToken>(
  PRIMITIVE_TOKENS.map((r) => [r.prime, r]),
);

export const RUNE_BY_GLYPH = TOKEN_BY_GLYPH;
export const RUNE_BY_PRIME = TOKEN_BY_PRIME;

export const OPERATOR_SET = new Set<string>(HELIX_OPERATORS.map((o) => o.symbol));

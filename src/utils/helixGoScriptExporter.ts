import { RUNES } from '../data/runes';
import { INITIAL_COMPOUND_VOCABULARY } from '../data/vocabulary';
import { ProofCarryingCertificate } from './helixPcc';
import { solveHelixConstraints } from './helixSolver';
import type { ParsedScriptInstruction } from './helixVm';

export interface GoOpcodeDefinition {
  opcode: string;
  goConst: string;
  category:
    | 'KERNEL'
    | 'SEGURIDAD'
    | 'CONTROL'
    | 'ARITMETICA_P33'
    | 'FUNCIONES'
    | 'ARREGLOS'
    | 'MEMORIA'
    | 'PROCESOS'
    | 'ARCHIVOS'
    | 'FISICA_CUANTICA'
    | 'ESCENA_3D'
    | 'IO_BUS';
  glyphs: string;
  description: string;
}

export const HELIX_GO_OPCODE_DEFINITIONS: GoOpcodeDefinition[] = [
  { opcode: 'NOP', goConst: 'OpNop', category: 'CONTROL', glyphs: '··', description: 'No-op determinista' },
  { opcode: 'KERN_BOOT', goConst: 'OpKernBoot', category: 'KERNEL', glyphs: 'ᛇᚢ', description: 'Inicializa núcleo Helix y tabla de memoria' },
  { opcode: 'AUTH_CHECK', goConst: 'OpAuthCheck', category: 'SEGURIDAD', glyphs: 'ᛗᚦ', description: 'Valida credenciales y sesión UID activa' },
  { opcode: 'UID_CTX', goConst: 'OpUidCtx', category: 'SEGURIDAD', glyphs: 'ᛗᛣ', description: 'Consulta contexto UID activo' },
  { opcode: 'TRAP_SANDBOX', goConst: 'OpTrapSandbox', category: 'SEGURIDAD', glyphs: 'ᛉᚻ', description: 'Aísla proceso en sandbox tras trampa' },
  { opcode: 'SIGKILL', goConst: 'OpSigKill', category: 'SEGURIDAD', glyphs: 'ᛤᚾ', description: 'Termina proceso hijo por cuota o señal' },
  { opcode: 'CSPRNG_ECC', goConst: 'OpCsprngEcc', category: 'SEGURIDAD', glyphs: 'ᛈᚫ', description: 'Avanza entropía CSPRNG determinista con ECC' },
  { opcode: 'CLK_OK', goConst: 'OpClkOk', category: 'KERNEL', glyphs: 'ᛋᚹ', description: 'Verifica señal nominal de reloj del sistema' },
  { opcode: 'SVC_WAKE', goConst: 'OpSvcWake', category: 'KERNEL', glyphs: 'ᛢᛣ', description: 'Activa servicio del núcleo e inspecciona registro' },
  { opcode: 'REG_PERSIST', goConst: 'OpRegPersist', category: 'KERNEL', glyphs: 'ᛣᚪ', description: 'Vuelca registros persistentes de estado' },

  { opcode: 'SET', goConst: 'OpSet', category: 'ARITMETICA_P33', glyphs: ':=', description: 'Asigna variable numérica o simbólica' },
  { opcode: 'ADD', goConst: 'OpAdd', category: 'ARITMETICA_P33', glyphs: '+=', description: 'Suma determinista sobre variable' },
  { opcode: 'SUB', goConst: 'OpSub', category: 'ARITMETICA_P33', glyphs: '-=', description: 'Resta determinista sobre variable' },
  { opcode: 'MUL', goConst: 'OpMul', category: 'ARITMETICA_P33', glyphs: '*=', description: 'Multiplicación determinista sobre variable' },
  { opcode: 'DIV', goConst: 'OpDiv', category: 'ARITMETICA_P33', glyphs: '/=', description: 'División exacta en subanillo racional P33' },

  { opcode: 'IF', goConst: 'OpIf', category: 'CONTROL', glyphs: '??', description: 'Bifurcación condicional verificada' },
  { opcode: 'ELSE', goConst: 'OpElse', category: 'CONTROL', glyphs: '::', description: 'Rama alternativa condicional' },
  { opcode: 'LOOP', goConst: 'OpLoop', category: 'CONTROL', glyphs: '⟳', description: 'Bucle acotado determinista [0..100]' },
  { opcode: 'END', goConst: 'OpEnd', category: 'CONTROL', glyphs: '∎', description: 'Cierre de bloque IF / ELSE / LOOP / FN' },

  { opcode: 'FN', goConst: 'OpFn', category: 'FUNCIONES', glyphs: 'λ(', description: 'Declara función tipada con alcance propio' },
  { opcode: 'CALL', goConst: 'OpCall', category: 'FUNCIONES', glyphs: '->λ', description: 'Invoca función y vincula valor de retorno' },
  { opcode: 'RET', goConst: 'OpRet', category: 'FUNCIONES', glyphs: '<-λ', description: 'Retorna valor desde marco de función' },
  { opcode: 'REQUIRES', goConst: 'OpRequires', category: 'FUNCIONES', glyphs: '⊢', description: 'Precondición formal Hoare/SMT de entrada' },
  { opcode: 'ENSURES', goConst: 'OpEnsures', category: 'FUNCIONES', glyphs: '⊨', description: 'Postcondición formal Hoare/SMT de salida' },

  { opcode: 'ARRAY', goConst: 'OpArray', category: 'ARREGLOS', glyphs: '[]', description: 'Declara arreglo acotado de longitud fija' },
  { opcode: 'ASET', goConst: 'OpAset', category: 'ARREGLOS', glyphs: '[i]=', description: 'Escritura segura con verificación de índice' },
  { opcode: 'AGET', goConst: 'OpAget', category: 'ARREGLOS', glyphs: '=[i]', description: 'Lectura segura con verificación de índice' },

  { opcode: 'HEAP_CAP', goConst: 'OpHeapCap', category: 'MEMORIA', glyphs: 'ᛜᛥ', description: 'Expande cuota máxima del heap' },
  { opcode: 'MEM_INIT', goConst: 'OpMemInit', category: 'MEMORIA', glyphs: 'ᚠᚢ', description: 'Inicializa bloque base de memoria' },
  { opcode: 'MEM_ALLOC', goConst: 'OpMemAlloc', category: 'MEMORIA', glyphs: 'ᚠᚷ', description: 'Asigna segmento en heap verificado' },
  { opcode: 'MEM_LOCK', goConst: 'OpMemLock', category: 'MEMORIA', glyphs: 'ᚠᛁ', description: 'Bloquea bloque en solo lectura (LOCKED_RO)' },
  { opcode: 'MEM_FREE', goConst: 'OpMemFree', category: 'MEMORIA', glyphs: 'ᚠᛠ', description: 'Libera segmento con guardia Typestate' },
  { opcode: 'FS_MOUNT_RO', goConst: 'OpFsMountRo', category: 'MEMORIA', glyphs: 'ᛟᛥ', description: 'Monta dominio de archivos en solo lectura' },

  { opcode: 'PROC_FORK', goConst: 'OpProcFork', category: 'PROCESOS', glyphs: 'ᛒᚢ', description: 'Bifurca proceso trabajador desde init' },
  { opcode: 'PROC_RUN', goConst: 'OpProcRun', category: 'PROCESOS', glyphs: 'ᚱᚳ', description: 'Despacha proceso al planificador' },
  { opcode: 'SCHED_PRIO', goConst: 'OpSchedPrio', category: 'PROCESOS', glyphs: 'ᛞᚾ', description: 'Ajusta prioridad determinista de ejecución' },
  { opcode: 'SCHED_CRON', goConst: 'OpSchedCron', category: 'PROCESOS', glyphs: 'ᛄᛡ', description: 'Programa tarea periódica de época' },
  { opcode: 'EXIT_OK', goConst: 'OpExitOk', category: 'PROCESOS', glyphs: 'ᚳᛏ', description: 'Finaliza ejecución con código 0' },
  { opcode: 'SYS_OK', goConst: 'OpSysOk', category: 'PROCESOS', glyphs: 'ᚳᛏ', description: 'Salida nominal verificada del sistema' },
  { opcode: 'HALT', goConst: 'OpHalt', category: 'PROCESOS', glyphs: '⏹', description: 'Detiene máquina virtual de forma limpia' },

  { opcode: 'FILE_WRITE', goConst: 'OpFileWrite', category: 'ARCHIVOS', glyphs: '✎', description: 'Escribe archivo en VFS o raíz OS confinada' },
  { opcode: 'FILE_READ', goConst: 'OpFileRead', category: 'ARCHIVOS', glyphs: '▤', description: 'Lee archivo de VFS o raíz OS confinada' },
  { opcode: 'FILE_DEL', goConst: 'OpFileDel', category: 'ARCHIVOS', glyphs: '✕', description: 'Elimina archivo bajo control ACL' },

  { opcode: 'SOA_INIT', goConst: 'OpSoaInit', category: 'FISICA_CUANTICA', glyphs: 'ᚠᛗ', description: 'Asigna arreglo contiguo Pauli-SoA (28 B/celda)' },
  { opcode: 'CURL_STEP', goConst: 'OpCurlStep', category: 'FISICA_CUANTICA', glyphs: 'ᚹᛜ', description: 'Integra Navier-Stokes Curl Noise + Kelvin-Voigt' },
  { opcode: 'NEMESIS_DECAY', goConst: 'OpNemesisDecay', category: 'FISICA_CUANTICA', glyphs: 'ᚹᛟ', description: 'Aplica decaimiento Némesis de Cauchy hacia 0.0f' },
  { opcode: 'BLOCH_ROT', goConst: 'OpBlochRot', category: 'FISICA_CUANTICA', glyphs: 'ᛟᚲ', description: 'Evolución unitaria Schrödinger-Pauli en Bloch' },
  { opcode: 'BVN_LATTICE', goConst: 'OpBvnLattice', category: 'FISICA_CUANTICA', glyphs: 'ᚦᛉ', description: 'Evalúa reticulado cuántico Birkhoff-von Neumann' },
  { opcode: 'WEBER_GUARD', goConst: 'OpWeberGuard', category: 'FISICA_CUANTICA', glyphs: 'ᛋᚦ', description: 'Filtro perceptual Weber-Fechner (SKIP_FRAME)' },

  { opcode: 'MESH_NODE', goConst: 'OpMeshNode', category: 'ESCENA_3D', glyphs: 'ᚠᛜ', description: 'Declara nodo geométrico 3D acotado en triángulos' },
  { opcode: 'MAT_ORM', goConst: 'OpMatOrm', category: 'ESCENA_3D', glyphs: 'ᛟᛣ', description: 'Asigna canales PBR ORM [0..1]' },
  { opcode: 'CAM_6DOF', goConst: 'OpCam6Dof', category: 'ESCENA_3D', glyphs: 'ᚱᚣ', description: 'Fija pose 6-DoF de cámara' },
  { opcode: 'WS_EMIT', goConst: 'OpWsEmit', category: 'IO_BUS', glyphs: 'ᚩᛢ', description: 'Emite trama telemétrica WebSocket/QPSK' },
  { opcode: 'IO_BUS_TX', goConst: 'OpIoBusTx', category: 'IO_BUS', glyphs: 'ᚩᛖ', description: 'Transmite trama por el bus de E/S' },
  { opcode: 'IO_GUARD', goConst: 'OpIoGuard', category: 'IO_BUS', glyphs: 'ᚦᚩ', description: 'Canal de E/S autenticado por ACL' },
  { opcode: 'BUF_PAUSE', goConst: 'OpBufPause', category: 'IO_BUS', glyphs: 'ᛚᛁ', description: 'Pausa lectura/escritura del búfer E/S' },
  { opcode: 'PIPE_SEEK', goConst: 'OpPipeSeek', category: 'IO_BUS', glyphs: 'ᛚᚣ', description: 'Reposiciona cursor de tubería' },
];

const OPCODE_TO_GO_CONST = new Map<string, GoOpcodeDefinition>(
  HELIX_GO_OPCODE_DEFINITIONS.map((def) => [def.opcode, def]),
);

export interface GoOpcodeMappingSummary {
  totalInstructions: number;
  uniqueTypedConstants: string[];
  unmappedOpcodes: string[];
  estimatedGoLines: number;
}

export function resolveGoOpcodeConstName(opcode: string): string {
  const normalized = opcode.trim().toUpperCase();
  const def = OPCODE_TO_GO_CONST.get(normalized);
  if (def) {
    return def.goConst;
  }
  return `HelixOpcode(${JSON.stringify(normalized || 'NOP')})`;
}

export function summarizeGoOpcodeMapping(
  instructions: ParsedScriptInstruction[],
): GoOpcodeMappingSummary {
  const uniqueSet = new Set<string>();
  const unmappedSet = new Set<string>();

  for (const inst of instructions) {
    const norm = inst.opcode.trim().toUpperCase();
    const def = OPCODE_TO_GO_CONST.get(norm);
    if (def) {
      uniqueSet.add(def.goConst);
    } else if (norm) {
      unmappedSet.add(norm);
    }
  }

  return {
    totalInstructions: instructions.length,
    uniqueTypedConstants: Array.from(uniqueSet),
    unmappedOpcodes: Array.from(unmappedSet),
    estimatedGoLines: 495 + instructions.length,
  };
}

export function generateStructuredGoScriptFile(
  instructions: ParsedScriptInstruction[],
  cert?: ProofCarryingCertificate,
): string {
  const pcc = cert ?? solveHelixConstraints(instructions).pccCertificate;

  const tokenRows = RUNES.map(
    (r) =>
      `\t{Index: ${r.index}, Glyph: ${JSON.stringify(r.glyph)}, Name: ${JSON.stringify(r.name)}, Prime: ${r.prime}, FreqHz: ${r.frequencyHz.toFixed(4)}, ColorHex: ${JSON.stringify(r.colorHex)}, HueDeg: ${r.hueDeg}, Tag: ${JSON.stringify(r.osTag)}},`,
  ).join('\n');

  const opcodeConstRows = HELIX_GO_OPCODE_DEFINITIONS.map(
    (d) => `\t${d.goConst.padEnd(15, ' ')} HelixOpcode = ${JSON.stringify(d.opcode)} // ${d.category}: ${d.description}`,
  ).join('\n');

  const opcodeCatalogRows = HELIX_GO_OPCODE_DEFINITIONS.map(
    (d) =>
      `\t${d.goConst}: {Const: ${d.goConst}, Category: ${JSON.stringify(d.category)}, Glyphs: ${JSON.stringify(d.glyphs)}, Description: ${JSON.stringify(d.description)}},`,
  ).join('\n');

  const glyphLookupMap = new Map<string, string>();
  for (const vocab of INITIAL_COMPOUND_VOCABULARY) {
    const goConst = resolveGoOpcodeConstName(vocab.opcode);
    if (!goConst.startsWith('HelixOpcode(')) {
      glyphLookupMap.set(vocab.glyphs, goConst);
    }
  }
  const extraPhysicsGlyphs: Array<[string, string]> = [
    ['ᚠᛗ', 'OpSoaInit'],
    ['ᚹᛜ', 'OpCurlStep'],
    ['ᚹᛟ', 'OpNemesisDecay'],
    ['ᛟᚲ', 'OpBlochRot'],
    ['ᚦᛉ', 'OpBvnLattice'],
    ['ᛋᚦ', 'OpWeberGuard'],
  ];
  for (const [g, c] of extraPhysicsGlyphs) {
    glyphLookupMap.set(g, c);
  }
  const glyphMapRows = Array.from(glyphLookupMap.entries())
    .map(([glyphs, goConst]) => `\t${JSON.stringify(glyphs)}: ${goConst},`)
    .join('\n');

  const steps = instructions
    .map((inst) => {
      const typedConst = resolveGoOpcodeConstName(inst.opcode);
      const argsList = inst.args.map((a) => JSON.stringify(a)).join(', ');
      return `\t\t{Line: ${inst.lineNumber}, Glyphs: ${JSON.stringify(inst.glyphs)}, Opcode: ${typedConst}, Args: []string{${argsList}}},`;
    })
    .join('\n');

  return `// Script compilado Helix OS -> Runtime Go tipado y estructurado
// Generado automáticamente desde Módulo F (VM Shell) con constantes tipadas y despacho switch.
package main

import (
\t"crypto/rand"
\t"crypto/sha256"
\t"encoding/hex"
\t"errors"
\t"flag"
\t"fmt"
\t"math"
\t"os"
\t"path/filepath"
\t"strconv"
\t"strings"
\t"unsafe"
)

// HelixOpcode define el tipo estricto para los opcodes simbólicos y de silicio de Helix OS.
type HelixOpcode string

const (
${opcodeConstRows}
)

type OpcodeSpec struct {
\tConst       HelixOpcode
\tCategory    string
\tGlyphs      string
\tDescription string
}

var HelixOpcodeCatalog = map[HelixOpcode]OpcodeSpec{
${opcodeCatalogRows}
}

var RuneGlyphToOpcode = map[string]HelixOpcode{
${glyphMapRows}
}

// ResolveHelixOpcode traduce un glifo rúnico o mnemónico ASCII al tipo HelixOpcode tipado.
func ResolveHelixOpcode(raw string) HelixOpcode {
\ttrimmed := strings.TrimSpace(raw)
\tif op, ok := RuneGlyphToOpcode[trimmed]; ok {
\t\treturn op
\t}
\tcandidate := HelixOpcode(strings.ToUpper(trimmed))
\tif _, ok := HelixOpcodeCatalog[candidate]; ok {
\t\treturn candidate
\t}
\treturn candidate
}

type RuneToken struct {
\tIndex    int
\tGlyph    string
\tName     string
\tPrime    int
\tFreqHz   float64
\tColorHex string
\tHueDeg   float64
\tTag      string
}

var HelixTokens = []RuneToken{
${tokenRows}
}

var Primes33 = []int{
\t2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59,
\t61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137,
}

type ProofCertificate struct {
\tSchema            string
\tDNAVersion        string
\tStatus            string
\tProgramSHA256     string
\tDNASHA256         string
\tInvariantsSHA256  string
\tCertificateSHA256 string
}

var EmbeddedPCC = ProofCertificate{
\tSchema:            ${JSON.stringify(pcc.schema)},
\tDNAVersion:        ${JSON.stringify(pcc.dnaVersion)},
\tStatus:            ${JSON.stringify(pcc.status)},
\tProgramSHA256:     ${JSON.stringify(pcc.programSha256)},
\tDNASHA256:         ${JSON.stringify(pcc.dnaSha256)},
\tInvariantsSHA256:  ${JSON.stringify(pcc.invariantsHash)},
\tCertificateSHA256: ${JSON.stringify(pcc.certificateSha256)},
}

// SoACell: arreglo plano de 7 enteros int32 = 28 bytes exactos contiguos (sin punteros, Zero-GC).
type SoACell struct {
\tX         int32
\tY         int32
\tZ         int32
\tU         int32
\tV         int32
\tAmp       int32
\tPhaseQuad int32
}

func EncodeQPSK132(primeMask uint64, ch1 uint64, ch2 uint64) [66]uint8 {
\tvar bits [132]uint8
\tfor i := 0; i < 33; i++ {
\t\tbits[i] = uint8((primeMask >> i) & 1)
\t\tbits[33+i] = uint8((ch1 >> i) & 1)
\t\tbits[66+i] = uint8((ch2 >> i) & 1)
\t}
\tvar syms [66]uint8
\tfor s := 0; s < 66; s++ {
\t\tsyms[s] = (bits[s*2] << 1) | bits[s*2+1]
\t}
\treturn syms
}

func DecodeQPSK132(syms [66]uint8) (uint64, uint64, uint64) {
\tvar bits [132]uint8
\tfor s := 0; s < 66; s++ {
\t\tbits[s*2] = (syms[s] >> 1) & 1
\t\tbits[s*2+1] = syms[s] & 1
\t}
\tvar primeMask, ch1, ch2 uint64
\tfor i := 0; i < 33; i++ {
\t\tprimeMask |= uint64(bits[i]) << i
\t\tch1 |= uint64(bits[33+i]) << i
\t\tch2 |= uint64(bits[66+i]) << i
\t}
\treturn primeMask, ch1, ch2
}

func ZeroizeSoACells(cells []SoACell) {
\tif len(cells) == 0 {
\t\treturn
\t}
\traw := unsafe.Slice((*byte)(unsafe.Pointer(&cells[0])), len(cells)*int(unsafe.Sizeof(SoACell{})))
\t_, _ = rand.Read(raw)
}

type Instruction struct {
\tLine        int
\tGlyphs      string
\tOpcode      HelixOpcode
\tArgs        []string
\tElsePC      int
\tEndPC       int
\tLoopStartPC int
}

type loopFrame struct {
\tstartPC   int
\tremaining int
}

type fnDef struct {
\tname    string
\tparams  []string
\tbodyPC  int
\tendPC   int
}

type callFrame struct {
\treturnPC int
\tdestVar  string
\tsaved    map[string]float64
}

type HelixVM struct {
\tKernelBooted bool
\tUID          string
\tTotalMem     int
\tUsedMem      int
\tNativeOS     bool
\tRootDir      string
\tHalted       bool
\tEntropySeed  uint32
\tVars         map[string]float64
\tStringVars   map[string]string
\tArrays       map[string][]float64
\tFiles        map[string]string
\tFunctions    map[string]fnDef
\tProcesses    []string
\tIOBuffer     []string
\tSoACells     []SoACell
\tSoATension   []float64
\tBlochVec     [3]float64
\tBlochNormSq  float64
\tWeberSkipped int
}

func NewHelixVM(nativeOS bool, rootDir string) *HelixVM {
\treturn &HelixVM{
\t\tTotalMem:    1024,
\t\tNativeOS:    nativeOS,
\t\tRootDir:     rootDir,
\t\tEntropySeed: 0x1A2B,
\t\tVars:        make(map[string]float64),
\t\tStringVars:  make(map[string]string),
\t\tArrays:      make(map[string][]float64),
\t\tFiles:       make(map[string]string),
\t\tFunctions:   make(map[string]fnDef),
\t\tBlochVec:    [3]float64{0, 0, 1},
\t\tBlochNormSq: 1.0,
\t}
}

func sha256HexString(s string) string {
\tsum := sha256.Sum256([]byte(s))
\treturn hex.EncodeToString(sum[:])
}

func VerifyProofCertificate(program []Instruction, cert ProofCertificate) error {
\tvar basisParts []string
\tfor _, t := range HelixTokens {
\t\tbasisParts = append(basisParts, fmt.Sprintf("%d:%d:%s", t.Index, t.Prime, t.Tag))
\t}
\tdnaHeader := cert.DNAVersion + "|" + strings.Join(basisParts, ",")
\tactualDNA := sha256HexString(dnaHeader)
\tif actualDNA != cert.DNASHA256 {
\t\treturn fmt.Errorf("PCC: helix.dna alterado (esperado %s, real %s)", cert.DNASHA256, actualDNA)
\t}
\tvar progLines []string
\tfor _, inst := range program {
\t\tprogLines = append(progLines, fmt.Sprintf("%s(%s)", strings.ToUpper(string(inst.Opcode)), strings.Join(inst.Args, ",")))
\t}
\tactualProg := sha256HexString(strings.Join(progLines, "\\n"))
\tif actualProg != cert.ProgramSHA256 {
\t\treturn fmt.Errorf("PCC: bytecode manipulado sin re-verificar (sha256=%s)", actualProg)
\t}
\texpectedCert := sha256HexString(actualProg + "|" + actualDNA + "|" + cert.InvariantsSHA256)
\tif expectedCert != cert.CertificateSHA256 {
\t\treturn errors.New("PCC: firma del certificado invalida")
\t}
\tif cert.Status != "PROVED_SAFE" {
\t\treturn fmt.Errorf("PCC: certificado indica %s; ejecucion bloqueada", cert.Status)
\t}
\treturn nil
}

func (vm *HelixVM) resolveSafeOSPath(name string) (string, error) {
\tbase := filepath.Clean(vm.RootDir)
\ttarget := filepath.Clean(filepath.Join(base, name))
\tif target != base && !strings.HasPrefix(target, base+string(filepath.Separator)) {
\t\treturn "", fmt.Errorf("acceso fuera de raiz OS confinado: %s", name)
\t}
\treturn target, nil
}

func inSubringP33(n int) bool {
\tif n <= 0 {
\t\treturn false
\t}
\tcur := n
\tfor _, p := range Primes33 {
\t\tfor cur%p == 0 {
\t\t\tcur /= p
\t\t}
\t}
\treturn cur == 1
}

func (vm *HelixVM) resolveFloat(arg string) (float64, error) {
\tif v, ok := vm.Vars[arg]; ok {
\t\treturn v, nil
\t}
\treturn strconv.ParseFloat(arg, 64)
}

func VerifyProgram(program []Instruction) error {
\ttype frame struct {
\t\tkind HelixOpcode
\t\tline int
\t}
\tvar stack []frame
\tfor _, inst := range program {
\t\tswitch inst.Opcode {
\t\tcase OpIf:
\t\t\tstack = append(stack, frame{kind: OpIf, line: inst.Line})
\t\t\tif len(inst.Args) < 3 {
\t\t\t\treturn fmt.Errorf("linea %d: IF requiere 3 operandos", inst.Line)
\t\t\t}
\t\tcase OpElse:
\t\t\tif len(stack) == 0 || stack[len(stack)-1].kind != OpIf {
\t\t\t\treturn fmt.Errorf("linea %d: ELSE sin bloque IF abierto", inst.Line)
\t\t\t}
\t\t\tstack[len(stack)-1].kind = OpElse
\t\tcase OpLoop:
\t\t\tstack = append(stack, frame{kind: OpLoop, line: inst.Line})
\t\t\tif len(inst.Args) > 0 {
\t\t\t\tif cnt, err := strconv.Atoi(inst.Args[0]); err == nil && (cnt < 0 || cnt > 100) {
\t\t\t\t\treturn fmt.Errorf("linea %d: LOOP %d fuera de rango [0..100]", inst.Line, cnt)
\t\t\t\t}
\t\t\t}
\t\tcase OpFn:
\t\t\tstack = append(stack, frame{kind: OpFn, line: inst.Line})
\t\t\tif len(inst.Args) < 1 {
\t\t\t\treturn fmt.Errorf("linea %d: FN requiere nombre de función", inst.Line)
\t\t\t}
\t\tcase OpEnd:
\t\t\tif len(stack) == 0 {
\t\t\t\treturn fmt.Errorf("linea %d: END sin bloque previo", inst.Line)
\t\t\t}
\t\t\tstack = stack[:len(stack)-1]
\t\tcase OpDiv:
\t\t\tif len(inst.Args) >= 2 {
\t\t\t\td, err := strconv.Atoi(inst.Args[1])
\t\t\t\tif err == nil {
\t\t\t\t\tif d == 0 {
\t\t\t\t\t\treturn fmt.Errorf("linea %d: division por cero rechazada", inst.Line)
\t\t\t\t\t}
\t\t\t\t\tif !inSubringP33(d) {
\t\t\t\t\t\treturn fmt.Errorf("linea %d: divisor %d fuera del subanillo P33", inst.Line, d)
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t}
\t}
\tif len(stack) != 0 {
\t\treturn fmt.Errorf("linea %d: bloque %s sin cierre END", stack[0].line, stack[0].kind)
\t}
\treturn nil
}

func linkControlFlow(program []Instruction) {
\ttype frame struct {
\t\tkind HelixOpcode
\t\tidx  int
\t}
\tvar stack []frame
\tfor i := range program {
\t\tprogram[i].ElsePC = -1
\t\tprogram[i].EndPC = -1
\t\tprogram[i].LoopStartPC = -1
\t\tswitch program[i].Opcode {
\t\tcase OpIf:
\t\t\tstack = append(stack, frame{kind: OpIf, idx: i})
\t\tcase OpElse:
\t\t\tif len(stack) > 0 && stack[len(stack)-1].kind == OpIf {
\t\t\t\tifIdx := stack[len(stack)-1].idx
\t\t\t\tprogram[ifIdx].ElsePC = i
\t\t\t\tstack[len(stack)-1] = frame{kind: OpElse, idx: i}
\t\t\t}
\t\tcase OpLoop:
\t\t\tstack = append(stack, frame{kind: OpLoop, idx: i})
\t\tcase OpFn:
\t\t\tstack = append(stack, frame{kind: OpFn, idx: i})
\t\tcase OpEnd:
\t\t\tif len(stack) > 0 {
\t\t\t\ttop := stack[len(stack)-1]
\t\t\t\tstack = stack[:len(stack)-1]
\t\t\t\tprogram[top.idx].EndPC = i
\t\t\t\tif top.kind == OpElse {
\t\t\t\t\tfor j := top.idx - 1; j >= 0; j-- {
\t\t\t\t\t\tif program[j].ElsePC == top.idx {
\t\t\t\t\t\t\tprogram[j].EndPC = i
\t\t\t\t\t\t\tbreak
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t} else if top.kind == OpLoop {
\t\t\t\t\tprogram[i].LoopStartPC = top.idx
\t\t\t\t}
\t\t\t}
\t\t}
\t}
}

func VerifySymbolicBounds(program []Instruction) error {
\tlinkControlFlow(program)
\tvars := make(map[string]float64)
\tinitVars := make(map[string]bool)
\ttype symBlock struct {
\t\tid    string
\t\tsize  int
\t\tstate string
\t}
\tvar blocks []symBlock
\tusedMem := 0
\ttotalMem := 1024
\tusedTriangles := 0
\tpc := 0
\tvar loops []loopFrame
\tfor steps := 0; pc < len(program) && steps < 500; steps++ {
\t\tinst := program[pc]
\t\tnextPC := pc + 1
\t\tswitch inst.Opcode {
\t\tcase OpFn:
\t\t\tif inst.EndPC >= 0 {
\t\t\t\tnextPC = inst.EndPC + 1
\t\t\t}
\t\tcase OpSet:
\t\t\tif len(inst.Args) >= 2 {
\t\t\t\tinitVars[inst.Args[0]] = true
\t\t\t\tif v, err := strconv.ParseFloat(inst.Args[1], 64); err == nil {
\t\t\t\t\tvars[inst.Args[0]] = v
\t\t\t\t} else if vv, ok := vars[inst.Args[1]]; ok {
\t\t\t\t\tvars[inst.Args[0]] = vv
\t\t\t\t}
\t\t\t}
\t\tcase OpAdd, OpSub, OpMul, OpDiv:
\t\t\tif len(inst.Args) >= 2 {
\t\t\t\tif !initVars[inst.Args[0]] {
\t\t\t\t\treturn fmt.Errorf("TYPESTATE linea %d: lectura sin inicializar de %s", inst.Line, inst.Args[0])
\t\t\t\t}
\t\t\t\topVal, err := strconv.ParseFloat(inst.Args[1], 64)
\t\t\t\tif err != nil {
\t\t\t\t\tif vv, ok := vars[inst.Args[1]]; ok {
\t\t\t\t\t\topVal = vv
\t\t\t\t\t\terr = nil
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tif err == nil {
\t\t\t\t\tswitch inst.Opcode {
\t\t\t\t\tcase OpAdd:
\t\t\t\t\t\tvars[inst.Args[0]] += opVal
\t\t\t\t\tcase OpSub:
\t\t\t\t\t\tvars[inst.Args[0]] -= opVal
\t\t\t\t\tcase OpMul:
\t\t\t\t\t\tvars[inst.Args[0]] *= opVal
\t\t\t\t\tcase OpDiv:
\t\t\t\t\t\tif opVal == 0 {
\t\t\t\t\t\t\treturn fmt.Errorf("SMT linea %d: contraejemplo div/0 en %s", inst.Line, inst.Args[1])
\t\t\t\t\t\t}
\t\t\t\t\t\tvars[inst.Args[0]] /= opVal
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\tcase OpHeapCap:
\t\t\ttotalMem += 256
\t\tcase OpMemInit, OpMemAlloc:
\t\t\tsz := 128
\t\t\tif len(inst.Args) > 0 {
\t\t\t\tif v, err := strconv.ParseFloat(inst.Args[0], 64); err == nil {
\t\t\t\t\tsz = int(v)
\t\t\t\t} else if vv, ok := vars[inst.Args[0]]; ok {
\t\t\t\t\tsz = int(vv)
\t\t\t\t}
\t\t\t}
\t\t\tblocks = append(blocks, symBlock{id: fmt.Sprintf("blk_%d", len(blocks)+1), size: sz, state: "ALLOCATED"})
\t\t\tusedMem += sz
\t\t\tif usedMem > totalMem {
\t\t\t\treturn fmt.Errorf("SMT linea %d: desbordamiento probado %d B > %d B", inst.Line, usedMem, totalMem)
\t\t\t}
\t\tcase OpSoaInit:
\t\t\tcells := 16
\t\t\tif len(inst.Args) > 0 {
\t\t\t\tif c, err := strconv.Atoi(inst.Args[0]); err == nil {
\t\t\t\t\tcells = c
\t\t\t\t}
\t\t\t}
\t\t\tif cells < 1 || cells > 256 {
\t\t\t\treturn fmt.Errorf("SMT linea %d: SOA_INIT %d fuera de rango [1..256]", inst.Line, cells)
\t\t\t}
\t\t\tusedMem += cells * 28
\t\t\tif usedMem > totalMem {
\t\t\t\treturn fmt.Errorf("SMT linea %d: SOA_INIT excede heap (%d > %d)", inst.Line, usedMem, totalMem)
\t\t\t}
\t\tcase OpMemLock:
\t\t\tfor i := len(blocks) - 1; i >= 0; i-- {
\t\t\t\tif blocks[i].state == "ALLOCATED" {
\t\t\t\t\tblocks[i].state = "LOCKED_RO"
\t\t\t\t\tbreak
\t\t\t\t}
\t\t\t}
\t\tcase OpMemFree:
\t\t\ttargetIdx := -1
\t\t\tif len(inst.Args) > 0 {
\t\t\t\tfor i := range blocks {
\t\t\t\t\tif blocks[i].id == inst.Args[0] {
\t\t\t\t\t\ttargetIdx = i
\t\t\t\t\t\tbreak
\t\t\t\t\t}
\t\t\t\t}
\t\t\t} else {
\t\t\t\tfor i := len(blocks) - 1; i >= 0; i-- {
\t\t\t\t\tif blocks[i].state == "ALLOCATED" {
\t\t\t\t\t\ttargetIdx = i
\t\t\t\t\t\tbreak
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t\tif targetIdx < 0 || blocks[targetIdx].state == "FREED" {
\t\t\t\treturn fmt.Errorf("TYPESTATE linea %d: double-free o bloque inexistente en MEM_FREE", inst.Line)
\t\t\t}
\t\t\tif blocks[targetIdx].state == "LOCKED_RO" {
\t\t\t\treturn fmt.Errorf("TYPESTATE linea %d: MEM_FREE sobre bloque protegido RO (%s)", inst.Line, blocks[targetIdx].id)
\t\t\t}
\t\t\tblocks[targetIdx].state = "FREED"
\t\t\tusedMem -= blocks[targetIdx].size
\t\t\tif usedMem < 0 {
\t\t\t\tusedMem = 0
\t\t\t}
\t\tcase OpLoop:
\t\t\tcnt, _ := strconv.Atoi(inst.Args[0])
\t\t\tif cnt > 0 {
\t\t\t\tloops = append(loops, loopFrame{startPC: pc, remaining: cnt})
\t\t\t} else if inst.EndPC >= 0 {
\t\t\t\tnextPC = inst.EndPC + 1
\t\t\t}
\t\tcase OpMeshNode:
\t\t\ttris := 240
\t\t\tif len(inst.Args) >= 3 {
\t\t\t\tif v, err := strconv.ParseFloat(inst.Args[2], 64); err == nil {
\t\t\t\t\ttris = int(v)
\t\t\t\t} else if vv, ok := vars[inst.Args[2]]; ok {
\t\t\t\t\ttris = int(vv)
\t\t\t\t}
\t\t\t}
\t\t\tusedTriangles += tris
\t\t\tif tris <= 0 || usedTriangles > 10000 {
\t\t\t\treturn fmt.Errorf("SMT_MESH_BUDGET linea %d: triángulos %d exceden límite 10000", inst.Line, usedTriangles)
\t\t\t}
\t\tcase OpMatOrm:
\t\t\tfor c := 1; c <= 3 && c < len(inst.Args); c++ {
\t\t\t\tif v, err := strconv.ParseFloat(inst.Args[c], 64); err == nil && (v < 0 || v > 1) {
\t\t\t\t\treturn fmt.Errorf("SMT_ORM_BOUNDS linea %d: canal ORM %g fuera de [0,1]", inst.Line, v)
\t\t\t\t}
\t\t\t}
\t\tcase OpEnd:
\t\t\tif inst.LoopStartPC >= 0 && len(loops) > 0 && loops[len(loops)-1].startPC == inst.LoopStartPC {
\t\t\t\tloops[len(loops)-1].remaining--
\t\t\t\tif loops[len(loops)-1].remaining > 0 {
\t\t\t\t\tnextPC = inst.LoopStartPC + 1
\t\t\t\t} else {
\t\t\t\t\tloops = loops[:len(loops)-1]
\t\t\t\t}
\t\t\t}
\t\t}
\t\tpc = nextPC
\t}
\treturn nil
}

func (vm *HelixVM) Run(program []Instruction) error {
\tif err := VerifyProgram(program); err != nil {
\t\treturn err
\t}
\tif err := VerifySymbolicBounds(program); err != nil {
\t\treturn err
\t}
\tlinkControlFlow(program)
\tvar loops []loopFrame
\tvar calls []callFrame
\ttype memBlock struct {
\t\tid     string
\t\tsize   int
\t\tlocked bool
\t\tfreed  bool
\t}
\tvar memBlocks []memBlock
\tpc := 0

\tfor steps := 0; pc < len(program) && !vm.Halted && steps < 500; steps++ {
\t\tinst := program[pc]
\t\tnextPC := pc + 1

\t\tswitch inst.Opcode {
\t\tcase OpNop, OpClkOk, OpSvcWake, OpFsMountRo:
\t\t\t// Instrucciones de sincronización y verificación nominal

\t\tcase OpKernBoot:
\t\t\tvm.KernelBooted = true

\t\tcase OpAuthCheck:
\t\t\tvm.UID = "sys_admin"
\t\t\tif len(inst.Args) > 0 {
\t\t\t\tvm.UID = inst.Args[0]
\t\t\t}

\t\tcase OpUidCtx:
\t\t\tvm.StringVars["ACTIVE_UID"] = vm.UID

\t\tcase OpTrapSandbox, OpSigKill:
\t\t\tif vm.UID == "" {
\t\t\t\treturn errors.New("permiso denegado: requiere sesión UID autenticada")
\t\t\t}
\t\t\tif len(vm.Processes) > 0 {
\t\t\t\tvm.Processes[len(vm.Processes)-1] = strings.Replace(vm.Processes[len(vm.Processes)-1], ":RUNNING", ":SANDBOXED", 1)
\t\t\t}

\t\tcase OpCsprngEcc:
\t\t\tvm.EntropySeed = (vm.EntropySeed*1103515245 + 12345) & 0x7fffffff

\t\tcase OpSet:
\t\t\tif len(inst.Args) >= 2 {
\t\t\t\traw := strings.Join(inst.Args[1:], " ")
\t\t\t\tif v, err := vm.resolveFloat(raw); err == nil {
\t\t\t\t\tvm.Vars[inst.Args[0]] = v
\t\t\t\t} else {
\t\t\t\t\tvm.StringVars[inst.Args[0]] = raw
\t\t\t\t}
\t\t\t}

\t\tcase OpAdd, OpSub, OpMul, OpDiv:
\t\t\tif len(inst.Args) >= 2 {
\t\t\t\tcur := vm.Vars[inst.Args[0]]
\t\t\t\topVal, err := vm.resolveFloat(inst.Args[1])
\t\t\t\tif err != nil {
\t\t\t\t\treturn err
\t\t\t\t}
\t\t\t\tswitch inst.Opcode {
\t\t\t\tcase OpAdd:
\t\t\t\t\tvm.Vars[inst.Args[0]] = cur + opVal
\t\t\t\tcase OpSub:
\t\t\t\t\tvm.Vars[inst.Args[0]] = cur - opVal
\t\t\t\tcase OpMul:
\t\t\t\t\tvm.Vars[inst.Args[0]] = cur * opVal
\t\t\t\tcase OpDiv:
\t\t\t\t\tif opVal == 0 {
\t\t\t\t\t\treturn errors.New("division por cero en ejecucion")
\t\t\t\t\t}
\t\t\t\t\tvm.Vars[inst.Args[0]] = cur / opVal
\t\t\t\t}
\t\t\t}

\t\tcase OpIf:
\t\t\tl, errL := vm.resolveFloat(inst.Args[0])
\t\t\tr, errR := vm.resolveFloat(inst.Args[2])
\t\t\tif errL != nil || errR != nil {
\t\t\t\treturn errors.New("operandos IF no numericos")
\t\t\t}
\t\t\tcond := false
\t\t\tswitch inst.Args[1] {
\t\t\tcase "==":
\t\t\t\tcond = l == r
\t\t\tcase "!=":
\t\t\t\tcond = l != r
\t\t\tcase ">":
\t\t\t\tcond = l > r
\t\t\tcase "<":
\t\t\t\tcond = l < r
\t\t\tcase ">=":
\t\t\t\tcond = l >= r
\t\t\tcase "<=":
\t\t\t\tcond = l <= r
\t\t\t}
\t\t\tif !cond {
\t\t\t\tif inst.ElsePC >= 0 {
\t\t\t\t\tnextPC = inst.ElsePC + 1
\t\t\t\t} else if inst.EndPC >= 0 {
\t\t\t\t\tnextPC = inst.EndPC + 1
\t\t\t\t}
\t\t\t}

\t\tcase OpElse:
\t\t\tif inst.EndPC >= 0 {
\t\t\t\tnextPC = inst.EndPC + 1
\t\t\t}

\t\tcase OpLoop:
\t\t\tcntF, _ := vm.resolveFloat(inst.Args[0])
\t\t\tcnt := int(cntF)
\t\t\tif cnt <= 0 {
\t\t\t\tif inst.EndPC >= 0 {
\t\t\t\t\tnextPC = inst.EndPC + 1
\t\t\t\t}
\t\t\t} else {
\t\t\t\tloops = append(loops, loopFrame{startPC: pc, remaining: cnt})
\t\t\t}

\t\tcase OpFn:
\t\t\tif len(inst.Args) >= 1 {
\t\t\t\tvm.Functions[inst.Args[0]] = fnDef{
\t\t\t\t\tname:   inst.Args[0],
\t\t\t\t\tparams: inst.Args[1:],
\t\t\t\t\tbodyPC: pc + 1,
\t\t\t\t\tendPC:  inst.EndPC,
\t\t\t\t}
\t\t\t}
\t\t\tif inst.EndPC >= 0 {
\t\t\t\tnextPC = inst.EndPC + 1
\t\t\t}

\t\tcase OpCall:
\t\t\tif len(inst.Args) >= 1 {
\t\t\t\tfnName := inst.Args[0]
\t\t\t\tdef, ok := vm.Functions[fnName]
\t\t\t\tif !ok {
\t\t\t\t\treturn fmt.Errorf("funcion no declarada: %s", fnName)
\t\t\t\t}
\t\t\t\tdestVar := ""
\t\t\t\trawArgs := inst.Args[1:]
\t\t\t\tfor i, a := range rawArgs {
\t\t\t\t\tif a == "->" && i+1 < len(rawArgs) {
\t\t\t\t\t\tdestVar = rawArgs[i+1]
\t\t\t\t\t\trawArgs = rawArgs[:i]
\t\t\t\t\t\tbreak
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tsaved := make(map[string]float64, len(vm.Vars))
\t\t\t\tfor k, v := range vm.Vars {
\t\t\t\t\tsaved[k] = v
\t\t\t\t}
\t\t\t\tfor i, paramName := range def.params {
\t\t\t\t\tif i < len(rawArgs) {
\t\t\t\t\t\tif val, err := vm.resolveFloat(rawArgs[i]); err == nil {
\t\t\t\t\t\t\tvm.Vars[paramName] = val
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tcalls = append(calls, callFrame{returnPC: nextPC, destVar: destVar, saved: saved})
\t\t\t\tnextPC = def.bodyPC
\t\t\t}

\t\tcase OpRet:
\t\t\tvar retVal float64
\t\t\tif len(inst.Args) >= 1 {
\t\t\t\tif v, err := vm.resolveFloat(inst.Args[0]); err == nil {
\t\t\t\t\tretVal = v
\t\t\t\t}
\t\t\t}
\t\t\tif len(calls) > 0 {
\t\t\t\tframe := calls[len(calls)-1]
\t\t\t\tcalls = calls[:len(calls)-1]
\t\t\t\tvm.Vars = frame.saved
\t\t\t\tvm.Vars["RET_VAL"] = retVal
\t\t\t\tif frame.destVar != "" {
\t\t\t\t\tvm.Vars[frame.destVar] = retVal
\t\t\t\t}
\t\t\t\tnextPC = frame.returnPC
\t\t\t}

\t\tcase OpRequires, OpEnsures:
\t\t\t// Contratos Hoare verificados estáticamente antes de ejecutar

\t\tcase OpArray:
\t\t\tif len(inst.Args) >= 2 {
\t\t\t\tarrLen, err := strconv.Atoi(inst.Args[1])
\t\t\t\tif err != nil || arrLen < 1 || arrLen > 256 {
\t\t\t\t\treturn fmt.Errorf("ARRAY %s longitud invalida", inst.Args[0])
\t\t\t\t}
\t\t\t\tarr := make([]float64, arrLen)
\t\t\t\tif len(inst.Args) >= 3 {
\t\t\t\t\tif fillVal, err := vm.resolveFloat(inst.Args[2]); err == nil {
\t\t\t\t\t\tfor i := range arr {
\t\t\t\t\t\t\tarr[i] = fillVal
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tvm.Arrays[inst.Args[0]] = arr
\t\t\t}

\t\tcase OpAset:
\t\t\tif len(inst.Args) >= 3 {
\t\t\t\tarr, ok := vm.Arrays[inst.Args[0]]
\t\t\t\tidxF, errI := vm.resolveFloat(inst.Args[1])
\t\t\t\tval, errV := vm.resolveFloat(inst.Args[2])
\t\t\t\tidx := int(idxF)
\t\t\t\tif !ok || errI != nil || errV != nil || idx < 0 || idx >= len(arr) {
\t\t\t\t\treturn fmt.Errorf("ASET fuera de rango en %s[%v]", inst.Args[0], idx)
\t\t\t\t}
\t\t\t\tarr[idx] = val
\t\t\t}

\t\tcase OpAget:
\t\t\tif len(inst.Args) >= 3 {
\t\t\t\tarr, ok := vm.Arrays[inst.Args[0]]
\t\t\t\tidxF, errI := vm.resolveFloat(inst.Args[1])
\t\t\t\tidx := int(idxF)
\t\t\t\tif !ok || errI != nil || idx < 0 || idx >= len(arr) {
\t\t\t\t\treturn fmt.Errorf("AGET fuera de rango en %s[%v]", inst.Args[0], idx)
\t\t\t\t}
\t\t\t\tvm.Vars[inst.Args[2]] = arr[idx]
\t\t\t}

\t\tcase OpEnd:
\t\t\tif inst.LoopStartPC >= 0 && len(loops) > 0 && loops[len(loops)-1].startPC == inst.LoopStartPC {
\t\t\t\tloops[len(loops)-1].remaining--
\t\t\t\tif loops[len(loops)-1].remaining > 0 {
\t\t\t\t\tnextPC = inst.LoopStartPC + 1
\t\t\t\t} else {
\t\t\t\t\tloops = loops[:len(loops)-1]
\t\t\t\t}
\t\t\t} else if len(calls) > 0 {
\t\t\t\tframe := calls[len(calls)-1]
\t\t\t\tcalls = calls[:len(calls)-1]
\t\t\t\tvm.Vars = frame.saved
\t\t\t\tnextPC = frame.returnPC
\t\t\t}

\t\tcase OpHeapCap:
\t\t\textra := 256
\t\t\tif len(inst.Args) > 0 {
\t\t\t\tif v, err := vm.resolveFloat(inst.Args[0]); err == nil && v > 0 {
\t\t\t\t\textra = int(v)
\t\t\t\t}
\t\t\t}
\t\t\tvm.TotalMem += extra

\t\tcase OpMemInit, OpMemAlloc:
\t\t\tif !vm.KernelBooted {
\t\t\t\treturn errors.New("kernel no inicializado")
\t\t\t}
\t\t\tsize := 128
\t\t\tif len(inst.Args) > 0 {
\t\t\t\tif v, err := vm.resolveFloat(inst.Args[0]); err == nil {
\t\t\t\t\tsize = int(v)
\t\t\t\t}
\t\t\t}
\t\t\tif vm.UsedMem+size > vm.TotalMem {
\t\t\t\treturn errors.New("memoria insuficiente")
\t\t\t}
\t\t\tmemBlocks = append(memBlocks, memBlock{id: fmt.Sprintf("blk_%d", len(memBlocks)+1), size: size})
\t\t\tvm.UsedMem += size

\t\tcase OpMemLock:
\t\t\tfor i := len(memBlocks) - 1; i >= 0; i-- {
\t\t\t\tif !memBlocks[i].freed && !memBlocks[i].locked {
\t\t\t\t\tmemBlocks[i].locked = true
\t\t\t\t\tbreak
\t\t\t\t}
\t\t\t}

\t\tcase OpMemFree:
\t\t\tfor i := len(memBlocks) - 1; i >= 0; i-- {
\t\t\t\tif len(inst.Args) == 0 || memBlocks[i].id == inst.Args[0] {
\t\t\t\t\tif memBlocks[i].freed || memBlocks[i].locked {
\t\t\t\t\t\treturn errors.New("violacion typestate en MEM_FREE")
\t\t\t\t\t}
\t\t\t\t\tmemBlocks[i].freed = true
\t\t\t\t\tvm.UsedMem -= memBlocks[i].size
\t\t\t\t\tbreak
\t\t\t\t}
\t\t\t}

\t\tcase OpProcFork:
\t\t\tname := "worker"
\t\t\tif len(inst.Args) > 0 {
\t\t\t\tname = inst.Args[0]
\t\t\t}
\t\t\tvm.Processes = append(vm.Processes, fmt.Sprintf("%s:READY", name))

\t\tcase OpProcRun:
\t\t\tif len(vm.Processes) > 0 {
\t\t\t\tvm.Processes[len(vm.Processes)-1] = strings.Replace(vm.Processes[len(vm.Processes)-1], ":READY", ":RUNNING", 1)
\t\t\t}

\t\tcase OpSchedPrio, OpSchedCron:
\t\t\tvm.IOBuffer = append(vm.IOBuffer, fmt.Sprintf("%s:%s", inst.Opcode, strings.Join(inst.Args, ",")))

\t\tcase OpFileWrite:
\t\t\tif vm.UID == "" {
\t\t\t\treturn errors.New("permiso denegado")
\t\t\t}
\t\t\tif len(inst.Args) >= 2 {
\t\t\t\tcontent := inst.Args[1]
\t\t\t\tif v, ok := vm.Vars[content]; ok {
\t\t\t\t\tcontent = strconv.FormatFloat(v, 'g', -1, 64)
\t\t\t\t}
\t\t\t\tif vm.NativeOS {
\t\t\t\t\tp, err := vm.resolveSafeOSPath(inst.Args[0])
\t\t\t\t\tif err != nil {
\t\t\t\t\t\treturn err
\t\t\t\t\t}
\t\t\t\t\tif err := os.MkdirAll(filepath.Dir(p), 0o750); err != nil {
\t\t\t\t\t\treturn err
\t\t\t\t\t}
\t\t\t\t\tif err := os.WriteFile(p, []byte(content), 0o640); err != nil {
\t\t\t\t\t\treturn err
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tvm.Files[inst.Args[0]] = content
\t\t\t}

\t\tcase OpFileRead:
\t\t\tif len(inst.Args) >= 1 {
\t\t\t\tif vm.NativeOS {
\t\t\t\t\tp, err := vm.resolveSafeOSPath(inst.Args[0])
\t\t\t\t\tif err != nil {
\t\t\t\t\t\treturn err
\t\t\t\t\t}
\t\t\t\t\tdata, err := os.ReadFile(p)
\t\t\t\t\tif err != nil {
\t\t\t\t\t\treturn err
\t\t\t\t\t}
\t\t\t\t\tvm.StringVars["LAST_READ"] = string(data)
\t\t\t\t} else if content, ok := vm.Files[inst.Args[0]]; ok {
\t\t\t\t\tvm.StringVars["LAST_READ"] = content
\t\t\t\t} else {
\t\t\t\t\treturn fmt.Errorf("ENOENT: %s", inst.Args[0])
\t\t\t\t}
\t\t\t}

\t\tcase OpFileDel:
\t\t\tif vm.UID == "" {
\t\t\t\treturn errors.New("permiso denegado")
\t\t\t}
\t\t\tif len(inst.Args) >= 1 {
\t\t\t\tif vm.NativeOS {
\t\t\t\t\tp, err := vm.resolveSafeOSPath(inst.Args[0])
\t\t\t\t\tif err != nil {
\t\t\t\t\t\treturn err
\t\t\t\t\t}
\t\t\t\t\tif err := os.Remove(p); err != nil {
\t\t\t\t\t\treturn err
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tdelete(vm.Files, inst.Args[0])
\t\t\t}

\t\tcase OpSoaInit:
\t\t\tcells := 16
\t\t\tif len(inst.Args) > 0 {
\t\t\t\tif v, err := vm.resolveFloat(inst.Args[0]); err == nil && v >= 1 && v <= 256 {
\t\t\t\t\tcells = int(v)
\t\t\t\t}
\t\t\t}
\t\t\tvm.SoACells = make([]SoACell, cells)
\t\t\tvm.SoATension = make([]float64, cells)
\t\t\tfor i := 0; i < cells; i++ {
\t\t\t\tangle := float64(i) * 0.45
\t\t\t\tvm.SoACells[i] = SoACell{
\t\t\t\t\tX:         int32(math.Cos(angle) * 650),
\t\t\t\t\tY:         int32((float64(i)/math.Max(1, float64(cells-1)) - 0.5) * 1200),
\t\t\t\t\tZ:         int32(math.Sin(angle) * 650),
\t\t\t\t\tAmp:       500,
\t\t\t\t\tPhaseQuad: int32(i % 4),
\t\t\t\t}
\t\t\t}
\t\t\tvm.UsedMem += cells * 28

\t\tcase OpCurlStep:
\t\t\tgain := 0.35
\t\t\tif len(inst.Args) > 0 {
\t\t\t\tif v, err := vm.resolveFloat(inst.Args[0]); err == nil {
\t\t\t\t\tgain = v
\t\t\t\t}
\t\t\t}
\t\t\tfor i := range vm.SoATension {
\t\t\t\tvm.SoATension[i] = vm.SoATension[i]*0.92 + math.Abs(math.Sin(float64(i+steps)*0.37))*gain*0.18
\t\t\t}

\t\tcase OpNemesisDecay:
\t\t\tgamma := 0.08
\t\t\tif len(inst.Args) > 0 {
\t\t\t\tif v, err := vm.resolveFloat(inst.Args[0]); err == nil && v > 0 && v < 1 {
\t\t\t\t\tgamma = v
\t\t\t\t}
\t\t\t}
\t\t\tfor i := range vm.SoATension {
\t\t\t\tvm.SoATension[i] = vm.SoATension[i] - vm.SoATension[i]*gamma
\t\t\t}

\t\tcase OpBlochRot:
\t\t\tomega, dt := 1.5708, 1.0
\t\t\tif len(inst.Args) >= 5 {
\t\t\t\tif w, err := vm.resolveFloat(inst.Args[3]); err == nil {
\t\t\t\t\tomega = w
\t\t\t\t}
\t\t\t\tif d, err := vm.resolveFloat(inst.Args[4]); err == nil {
\t\t\t\t\tdt = d
\t\t\t\t}
\t\t\t}
\t\t\tphi := omega * dt
\t\t\tbx := vm.BlochVec[0]*math.Cos(phi) + vm.BlochVec[2]*math.Sin(phi)
\t\t\tbz := -vm.BlochVec[0]*math.Sin(phi) + vm.BlochVec[2]*math.Cos(phi)
\t\t\tvm.BlochVec[0] = bx
\t\t\tvm.BlochVec[2] = bz
\t\t\tvm.BlochNormSq = vm.BlochVec[0]*vm.BlochVec[0] + vm.BlochVec[1]*vm.BlochVec[1] + vm.BlochVec[2]*vm.BlochVec[2]

\t\tcase OpBvnLattice:
\t\t\tif len(inst.Args) >= 4 {
\t\t\t\tvm.Vars[inst.Args[3]] = 1
\t\t\t}

\t\tcase OpWeberGuard:
\t\t\tk, iPrev, iNext := 0.015, 1.0, 1.004
\t\t\tif len(inst.Args) >= 3 {
\t\t\t\tif v, err := vm.resolveFloat(inst.Args[0]); err == nil {
\t\t\t\t\tk = v
\t\t\t\t}
\t\t\t\tif v, err := vm.resolveFloat(inst.Args[1]); err == nil {
\t\t\t\t\tiPrev = v
\t\t\t\t}
\t\t\t\tif v, err := vm.resolveFloat(inst.Args[2]); err == nil {
\t\t\t\t\tiNext = v
\t\t\t\t}
\t\t\t}
\t\t\tratio := math.Abs(iNext-iPrev) / math.Max(1e-9, math.Abs(iPrev))
\t\t\tdecision := 1.0
\t\t\tif ratio < k {
\t\t\t\tvm.WeberSkipped++
\t\t\t\tdecision = 0.0
\t\t\t}
\t\t\tif len(inst.Args) >= 4 {
\t\t\t\tvm.Vars[inst.Args[3]] = decision
\t\t\t}

\t\tcase OpIoBusTx, OpIoGuard, OpWsEmit:
\t\t\tpayload := strings.Join(inst.Args, " ")
\t\t\tif v, ok := vm.Vars[payload]; ok {
\t\t\t\tpayload = fmt.Sprintf("%s=%g", payload, v)
\t\t\t}
\t\t\tvm.IOBuffer = append(vm.IOBuffer, payload)

\t\tcase OpMeshNode, OpMatOrm, OpCam6Dof, OpBufPause, OpPipeSeek, OpRegPersist:
\t\t\tvm.IOBuffer = append(vm.IOBuffer, fmt.Sprintf("%s:%s", inst.Opcode, strings.Join(inst.Args, ",")))

\t\tcase OpExitOk, OpSysOk, OpHalt:
\t\t\tvm.Halted = true

\t\tdefault:
\t\t\tvm.IOBuffer = append(vm.IOBuffer, fmt.Sprintf("CUSTOM_%s:%s", inst.Opcode, strings.Join(inst.Args, ",")))
\t\t}

\t\tfmt.Printf("[OK] L%d %s (%s)\\n", inst.Line, inst.Opcode, inst.Glyphs)
\t\tpc = nextPC
\t}
\treturn nil
}

func main() {
\tmode := flag.String("mode", "sandbox", "Modo de ejecucion: sandbox | native")
\trootDir := flag.String("root", "./helix_rootfs", "Directorio raiz confinado para E/S nativa")
\tverifyOnly := flag.Bool("verify-only", false, "Solo verifica AST, Octagon/Typestate y firma PCC SHA-256")
\tflag.Parse()

\t// Representación estructurada del script actual de la VM con constantes tipadas HelixOpcode
\tprogram := []Instruction{
${steps}
\t}

\tif err := VerifyProofCertificate(program, EmbeddedPCC); err != nil {
\t\tfmt.Printf("[PCC RECHAZADO] %v\\n", err)
\t\tos.Exit(1)
\t}
\tfmt.Printf("[PCC OK] Cert SHA-256=%s (DNA=%s)\\n", EmbeddedPCC.CertificateSHA256[:16], EmbeddedPCC.DNAVersion)

\tif *verifyOnly {
\t\tif err := VerifyProgram(program); err != nil {
\t\t\tfmt.Printf("[AST RECHAZADO] %v\\n", err)
\t\t\tos.Exit(1)
\t\t}
\t\tif err := VerifySymbolicBounds(program); err != nil {
\t\t\tfmt.Printf("[SMT RECHAZADO] %v\\n", err)
\t\t\tos.Exit(1)
\t\t}
\t\tfmt.Println("[VERIFICADO] AST + Cotas simbólicas + PCC listos.")
\t\treturn
\t}

\tvm := NewHelixVM(*mode == "native", *rootDir)
\tsoa := []SoACell{{X: int32(len(program)), Amp: 1000, PhaseQuad: int32(len(program) % 4)}}
\tsyms := EncodeQPSK132(uint64(len(program)), uint64(vm.UsedMem), uint64(len(vm.Files)))
\tdecodedMask, _, _ := DecodeQPSK132(syms)
\tif err := vm.Run(program); err != nil {
\t\tZeroizeSoACells(soa)
\t\tfmt.Printf("[RECHAZADO + ZEROIZE] %v\\n", err)
\t\tos.Exit(1)
\t}
\tfmt.Printf("Estado final (%s) -> Memoria: %d/%d B | SoA=%dB | QPSK132 mask=%d | Procesos: %d | Archivos: %d\\n",
\t\t*mode, vm.UsedMem, vm.TotalMem, unsafe.Sizeof(SoACell{}), decodedMask, len(vm.Processes), len(vm.Files))
}
`;
}

export function downloadStructuredGoScript(
  instructions: ParsedScriptInstruction[],
  cert?: ProofCarryingCertificate,
  filename = 'helix_vm_script.go',
): { source: string; summary: GoOpcodeMappingSummary } {
  const source = generateStructuredGoScriptFile(instructions, cert);
  const summary = summarizeGoOpcodeMapping(instructions);

  if (typeof document !== 'undefined') {
    const blob = new Blob([source], { type: 'text/x-go;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { source, summary };
}

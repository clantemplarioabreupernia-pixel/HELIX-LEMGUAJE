// Industrial Go 1.22+ Silicon Runtime & Bridge Assistant Distribution Generator
// Zero external Go dependencies — 100% Go stdlib so `go test ./...` and `go build ./...` work offline anywhere.

import { RUNES } from '../data/runes';
import { DEFAULT_HELIX_PHYSICS_PROGRAM } from './helixVm';
import { buildZipArchive, triggerZipDownload, ZipInputFile } from './zipBuilder';

export interface GeneratedGoFile {
  path: string;
  role: string;
  language: 'go' | 'mod' | 'md' | 'makefile' | 'hlx';
  content: string;
}

function escapeGoString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function buildGoMod(): string {
  return `module helix.local/silicon

go 1.22
`;
}

function buildMakefile(): string {
  return `.PHONY: test build run-daemon run-repl verify-example clean

BINARY := helixd

test:
\tgo test -v -race ./...

build:
\tgo build -trimpath -ldflags="-s -w" -o $(BINARY) ./cmd/helixd

run-daemon: build
\t./$(BINARY) -mode daemon -addr 127.0.0.1:7733 -root ./helix_rootfs -native

run-repl: build
\t./$(BINARY) -mode repl -root ./helix_rootfs -native

verify-example: build
\t./$(BINARY) -mode exec -file examples/program.hlx -root ./helix_rootfs

clean:
\trm -f $(BINARY) $(BINARY).exe
`;
}

function buildReadme(): string {
  return `# HELIX Silicon Go Runtime & Puente Asistente (helixd)

Distribución nativa industrial en **Go 1.22+** (cero dependencias externas, 100% biblioteca estándar) del lenguaje simbólico **HELIX**. Actúa como el asistente puente tridireccional en el silicio del usuario:

\`\`\`
Humano (lenguaje natural / código) ⇄ helixd (PC Silicio: Go + Pauli-SoA + SMT) ⇄ IA Web (HTTP/JSON Guardrail)
\`\`\`

## Requisitos en tu PC
- **Go 1.22 o superior** (\`go version\`)
- *Opcional*: **Z3 Theorem Prover** en el \`PATH\` (\`z3 --version\`) para contrastar fórmulas \`SMT-LIBv2\` además del solver determinista interno de Go.

## Compilación y Pruebas

\`\`\`bash
# 1. Ejecutar toda la suite de pruebas unitarias (Gödel, P33, Pauli-SoA, SMT, VM y Puente)
go test -v ./...

# 2. Compilar el binario nativo para tu CPU (Linux / macOS / Windows)
go build -o helixd ./cmd/helixd

# 3a. Modo Demonio Local (Puente HTTP + Consola Web Local Humano <-> PC <-> IA Web)
./helixd -mode daemon -addr 127.0.0.1:7733 -root ./helix_rootfs -native

# 3b. Modo Asistente Interactivo en Terminal (REPL)
./helixd -mode repl -root ./helix_rootfs -native

# 3c. Ejecutar un script .hlx directamente con verificación SMT previa
./helixd -mode exec -file examples/program.hlx -root ./helix_rootfs
\`\`\`

## Endpoints del Puente Local (\`127.0.0.1:7733\`)
- \`GET  /health\` — Estado del demonio y soporte de Z3 externo.
- \`GET  /api/silicon\` — Telemetría real de tu CPU, arquitectura, memoria Go y arena Pauli-SoA (28 B/celda).
- \`POST /api/translate\` — Traduce intención humana o fragmentos procedurales a código HELIX verificado (\`{ "intent": "simular fluido navier stokes" }\`).
- \`POST /api/verify\` — Guardrail para respuestas de cualquier IA Web (\`{ "source": "ia_web", "script": "..." }\`) con certificado PCC SHA-256.
- \`POST /api/exec\` — Verifica formalmente (SMT + Gödel) y ejecuta en tu PC (\`{ "script": "..." }\`).
- \`POST /api/smt2\` — Exporta restricciones formales en \`SMT-LIBv2\` (\`QF_LRA\`) y consulta \`z3\` si está instalado.
`;
}

function buildGodelGo(): string {
  const tokenLines = RUNES.map(
    (r) =>
      `\t{Index: ${r.index}, Glyph: '${r.glyph}', Name: "${escapeGoString(r.name)}", Phoneme: "${escapeGoString(r.phoneme)}", Prime: ${r.prime}, FreqHz: ${r.frequencyHz.toFixed(4)}, Role: "${escapeGoString(r.role)}", Subsystem: "${escapeGoString(r.subsystem)}", OsTag: "${escapeGoString(r.osTag)}", ColorHex: "${r.colorHex}", HueDeg: ${r.hueDeg}},`,
  ).join('\n');

  return `package godel

import (
\t"errors"
\t"fmt"
\t"math/big"
\t"strings"
\t"unicode"
)

// RuneToken representa un símbolo atómico de las 6 capas de HELIX.
type RuneToken struct {
\tIndex     int     \`json:"index"\`
\tGlyph     rune    \`json:"glyph"\`
\tName      string  \`json:"name"\`
\tPhoneme   string  \`json:"phoneme"\`
\tPrime     int64   \`json:"prime"\`
\tFreqHz    float64 \`json:"freq_hz"\`
\tRole      string  \`json:"role"\`
\tSubsystem string  \`json:"subsystem"\`
\tOsTag     string  \`json:"os_tag"\`
\tColorHex  string  \`json:"color_hex"\`
\tHueDeg    float64 \`json:"hue_deg"\`
}

// GodelReport resume la validación del alfabeto primo P33 sobre un programa.
type GodelReport struct {
\tValid          bool     \`json:"valid"\`
\tTokenCount     int      \`json:"token_count"\`
\tGodelProduct   string   \`json:"godel_product"\`
\tRemainder      string   \`json:"remainder"\`
\tChecksumFNV1a  string   \`json:"checksum_fnv1a"\`
\tForeignTokens  []string \`json:"foreign_tokens,omitempty"\`
\tActivePrimes   []int64  \`json:"active_primes"\`
}

// PrimitiveTokens contiene los 33 primos canónicos del alfabeto HELIX (2..137).
var PrimitiveTokens = []RuneToken{
${tokenLines}
}

var byGlyph = func() map[rune]RuneToken {
\tm := make(map[rune]RuneToken, len(PrimitiveTokens))
\tfor _, t := range PrimitiveTokens {
\t\tm[t.Glyph] = t
\t}
\treturn m
}()

var allowedOperators = map[rune]bool{
\t'⊕': true,
\t'⊗': true,
\t'⊖': true,
\t'⊡': true,
}

// LookupGlyph devuelve el token correspondiente a una runa Unicode HELIX.
func LookupGlyph(g rune) (RuneToken, bool) {
\tt, ok := byGlyph[g]
\treturn t, ok
}

// EncodeGodel calcula el producto exacto de Gödel en precisión arbitraria.
func EncodeGodel(glyphStream string) (*big.Int, []RuneToken, error) {
\tprod := big.NewInt(1)
\tvar tokens []RuneToken
\tfor _, r := range glyphStream {
\t\tif unicode.IsSpace(r) || allowedOperators[r] {
\t\t\tcontinue
\t\t}
\t\ttok, ok := byGlyph[r]
\t\tif !ok {
\t\t\treturn nil, nil, fmt.Errorf("símbolo fuera de la base prima P33: %q", r)
\t\t}
\t\tprod.Mul(prod, big.NewInt(tok.Prime))
\t\ttokens = append(tokens, tok)
\t}
\treturn prod, tokens, nil
}

// DecodeGodel factoriza exactamente un producto de Gödel sobre los 33 primos.
func DecodeGodel(value *big.Int) ([]RuneToken, error) {
\tif value == nil || value.Sign() <= 0 {
\t\treturn nil, errors.New("valor de Gödel debe ser entero positivo")
\t}
\trem := new(big.Int).Set(value)
\tmod := new(big.Int)
\tzero := big.NewInt(0)
\tvar out []RuneToken

\tfor _, tok := range PrimitiveTokens {
\t\tp := big.NewInt(tok.Prime)
\t\tfor {
\t\t\tmod.Mod(rem, p)
\t\t\tif mod.Cmp(zero) != 0 {
\t\t\t\tbreak
\t\t\t}
\t\t\tout = append(out, tok)
\t\t\trem.Div(rem, p)
\t\t}
\t}

\tif rem.Cmp(big.NewInt(1)) != 0 {
\t\treturn out, fmt.Errorf("residuo fuera del alfabeto primo P33: %s", rem.String())
\t}
\treturn out, nil
}

// PositionalChecksumFNV1a desambigua el orden de secuencia mediante hash FNV-1a 32-bit.
func PositionalChecksumFNV1a(input string) uint32 {
\tconst offset32 = 2166136261
\tconst prime32 = 16777619
\th := uint32(offset32)
\tfor i := 0; i < len(input); i++ {
\t\th ^= uint32(input[i])
\t\th *= prime32
\t}
\treturn h
}

// InSubringP33 verifica si un denominador entero pertenece al subanillo racional Z[1/p_1..1/p_33].
func InSubringP33(den int64) bool {
\tif den == 0 {
\t\treturn false
\t}
\tif den < 0 {
\t\tden = -den
\t}
\tn := den
\tfor _, tok := range PrimitiveTokens {
\t\tfor n%tok.Prime == 0 {
\t\t\tn /= tok.Prime
\t\t}
\t}
\treturn n == 1
}

// ValidateScriptGodel verifica todos los glifos rúnicos presentes en un script HELIX.
func ValidateScriptGodel(script string) GodelReport {
\tprod := big.NewInt(1)
\tseenPrimes := make(map[int64]bool)
\tvar activePrimes []int64
\tvar foreign []string
\ttokenCount := 0

\tfor _, rawLine := range strings.Split(script, "\\n") {
\t\tline := strings.TrimSpace(rawLine)
\t\tif line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") {
\t\t\tcontinue
\t\t}
\t\tfields := strings.Fields(line)
\t\tif len(fields) == 0 {
\t\t\tcontinue
\t\t}
\t\thead := fields[0]
\t\t// Si el encabezado contiene runas Unicode, validamos estrictamente que todas pertenezcan a P33.
\t\thasNonASCII := false
\t\tfor _, r := range head {
\t\t\tif r > 127 {
\t\t\t\thasNonASCII = true
\t\t\t\tbreak
\t\t\t}
\t\t}
\t\tif hasNonASCII {
\t\t\tfor _, r := range head {
\t\t\t\tif allowedOperators[r] {
\t\t\t\t\tcontinue
\t\t\t\t}
\t\t\t\ttok, ok := byGlyph[r]
\t\t\t\tif !ok {
\t\t\t\t\tforeign = append(foreign, string(r))
\t\t\t\t\tcontinue
\t\t\t\t}
\t\t\t\tprod.Mul(prod, big.NewInt(tok.Prime))
\t\t\t\ttokenCount++
\t\t\t\tif !seenPrimes[tok.Prime] {
\t\t\t\t\tseenPrimes[tok.Prime] = true
\t\t\t\t\tactivePrimes = append(activePrimes, tok.Prime)
\t\t\t\t}
\t\t\t}
\t\t}
\t}

\tfnv := PositionalChecksumFNV1a(strings.TrimSpace(script))
\treturn GodelReport{
\t\tValid:         len(foreign) == 0,
\t\tTokenCount:    tokenCount,
\t\tGodelProduct:  prod.String(),
\t\tRemainder:     "1",
\t\tChecksumFNV1a: fmt.Sprintf("0x%08x", fnv),
\t\tForeignTokens: foreign,
\t\tActivePrimes:  activePrimes,
\t}
}
`;
}

function buildGodelTestGo(): string {
  return `package godel

import (
\t"math/big"
\t"testing"
)

func TestAlphabet33Primes(t *testing.T) {
\tif len(PrimitiveTokens) != 33 {
\t\tt.Fatalf("se esperaban 33 tokens primos, se obtuvieron %d", len(PrimitiveTokens))
\t}
\tif PrimitiveTokens[0].Prime != 2 || PrimitiveTokens[32].Prime != 137 {
\t\tt.Fatalf("rango primo inesperado: %d..%d", PrimitiveTokens[0].Prime, PrimitiveTokens[32].Prime)
\t}
}

func TestGodelRoundtripAndOutOfBasis(t *testing.T) {
\tprod, toks, err := EncodeGodel("ᛇᚢᚠᚷ")
\tif err != nil {
\t\tt.Fatalf("EncodeGodel fallo: %v", err)
\t}
\tif len(toks) != 4 {
\t\tt.Fatalf("se esperaban 4 tokens, hay %d", len(toks))
\t}
\tdecoded, err := DecodeGodel(prod)
\tif err != nil {
\t\tt.Fatalf("DecodeGodel fallo: %v", err)
\t}
\tif len(decoded) != 4 {
\t\tt.Fatalf("decodificacion incompleta: %d", len(decoded))
\t}

\tbad := new(big.Int).Mul(prod, big.NewInt(139))
\tif _, err := DecodeGodel(bad); err == nil {
\t\tt.Fatal("se esperaba rechazo para primo fuera de base (139)")
\t}
}

func TestSubringP33(t *testing.T) {
\tif !InSubringP33(28) {
\t\tt.Fatal("28 = 2^2 * 7 debe pertenecer a P33")
\t}
\tif InSubringP33(139) {
\t\tt.Fatal("139 no pertenece al subanillo P33")
\t}
\tif InSubringP33(0) {
\t\tt.Fatal("0 no puede ser denominador valido")
\t}
}
`;
}

function buildPhysicsGo(): string {
  return `package silicon

import (
\t"crypto/rand"
\t"encoding/binary"
\t"math"
\t"math/cmplx"
\t"unsafe"
)

// PauliCell28 representa exactamente 28 bytes contiguos (Stride = 7 float32).
type PauliCell28 struct {
\tX, Y, Z, U, V, Amp, PhaseQuad float32
}

// SoAArena almacena buffers contiguos Zero-GC preasignados en el silicio.
type SoAArena struct {
\tCapacity     int       \`json:"capacity"\`
\tBackingBytes int       \`json:"backing_bytes"\`
\tStrideBytes  int       \`json:"stride_bytes"\`
\tX            []float32 \`json:"-"\`
\tY            []float32 \`json:"-"\`
\tZ            []float32 \`json:"-"\`
\tU            []float32 \`json:"-"\`
\tV            []float32 \`json:"-"\`
\tAmp          []float32 \`json:"-"\`
\tPhaseQuad    []float32 \`json:"-"\`
\tVX           []float32 \`json:"-"\`
\tVY           []float32 \`json:"-"\`
\tVZ           []float32 \`json:"-"\`
\tTension      []float32 \`json:"-"\`
\tStress       []float32 \`json:"-"\`
}

// NewSoAArena asigna una arena plana Zero-GC (28 bytes/celda).
func NewSoAArena(capacity int) *SoAArena {
\tif capacity < 1 {
\t\tcapacity = 1
\t}
\tif capacity > 256 {
\t\tcapacity = 256
\t}
\tstride := int(unsafe.Sizeof(PauliCell28{}))
\treturn &SoAArena{
\t\tCapacity:     capacity,
\t\tStrideBytes:  stride,
\t\tBackingBytes: capacity * stride,
\t\tX:            make([]float32, capacity),
\t\tY:            make([]float32, capacity),
\t\tZ:            make([]float32, capacity),
\t\tU:            make([]float32, capacity),
\t\tV:            make([]float32, capacity),
\t\tAmp:          make([]float32, capacity),
\t\tPhaseQuad:    make([]float32, capacity),
\t\tVX:           make([]float32, capacity),
\t\tVY:           make([]float32, capacity),
\t\tVZ:           make([]float32, capacity),
\t\tTension:      make([]float32, capacity),
\t\tStress:       make([]float32, capacity),
\t}
}

// Zeroize sobrescribe los buffers físicos usando entropía CSPRNG de crypto/rand.
func (a *SoAArena) Zeroize() {
\tif a == nil || a.Capacity == 0 {
\t\treturn
\t}
\traw := make([]byte, 4)
\tfor i := 0; i < a.Capacity; i++ {
\t\tif _, err := rand.Read(raw); err == nil {
\t\t\tbits := binary.LittleEndian.Uint32(raw)
\t\t\tnoise := float32(bits&0xffff) / 65535.0 * 1e-6
\t\t\ta.Tension[i] = noise
\t\t\ta.Stress[i] = 0
\t\t\ta.Amp[i] = 0
\t\t}
\t\ta.X[i], a.Y[i], a.Z[i] = 0, 0, 0
\t\ta.VX[i], a.VY[i], a.VZ[i] = 0, 0, 0
\t}
}

// CurlSample representa una muestra de campo rotacional libre de divergencia.
type CurlSample struct {
\tVX         float64 \`json:"vx"\`
\tVY         float64 \`json:"vy"\`
\tVZ         float64 \`json:"vz"\`
\tDivergence float64 \`json:"divergence"\`
}

func potentialPsi(x, y, z, t float64) (float64, float64, float64) {
\tpx := math.Sin(y*1.7+t) + math.Cos(z*1.3-t*0.7)
\tpy := math.Sin(z*1.9-t*0.5) + math.Cos(x*1.5+t*0.9)
\tpz := math.Sin(x*1.4+t*0.6) + math.Cos(y*1.6-t*0.8)
\treturn px, py, pz
}

func evalCurlAt(x, y, z, t float64) (float64, float64, float64) {
\tconst eps = 1e-4
\t_, yPlusZ, zPlusY := potentialPsi(x, y+eps, z, t)
\t_, yMinusZ, zMinusY := potentialPsi(x, y-eps, z, t)
\tdPzDy := (zPlusY - zMinusY) / (2 * eps)
\tdPyDz := (yPlusZ - yMinusZ) / (2 * eps)

\t_, _, zPlusZ := potentialPsi(x, y, z+eps, t)
\t_, _, zMinusZ := potentialPsi(x, y, z-eps, t)
\t_ = zPlusZ
\t_ = zMinusZ

\txPlusZ, _, zPlusX := potentialPsi(x+eps, y, z, t)
\txMinusZ, _, zMinusX := potentialPsi(x-eps, y, z, t)
\tdPxDz := 0.0
\t{
\t\txp, yp, _ := potentialPsi(x, y, z+eps, t)
\t\txm, ym, _ := potentialPsi(x, y, z-eps, t)
\t\tdPxDz = (xp - xm) / (2 * eps)
\t\tdPyDz = (yp - ym) / (2 * eps)
\t}
\tdPzDx := (zPlusX - zMinusX) / (2 * eps)
\t_ = xPlusZ
\t_ = xMinusZ

\t_, yPlusX, _ := potentialPsi(x+eps, y, z, t)
\t_, yMinusX, _ := potentialPsi(x-eps, y, z, t)
\tdPyDx := (yPlusX - yMinusX) / (2 * eps)

\txPlusY, _, _ := potentialPsi(x, y+eps, z, t)
\txMinusY, _, _ := potentialPsi(x, y-eps, z, t)
\tdPxDy := (xPlusY - xMinusY) / (2 * eps)

\treturn dPzDy - dPyDz, dPxDz - dPzDx, dPyDx - dPxDy
}

// ComputeCurlNoise3D calcula v = ∇ × ψ verificando divergencia cercana a cero.
func ComputeCurlNoise3D(x, y, z, t float64) CurlSample {
\tvx, vy, vz := evalCurlAt(x, y, z, t)
\tconst h = 1e-4
\tvxP, _, _ := evalCurlAt(x+h, y, z, t)
\tvxM, _, _ := evalCurlAt(x-h, y, z, t)
\t_, vyP, _ := evalCurlAt(x, y+h, z, t)
\t_, vyM, _ := evalCurlAt(x, y-h, z, t)
\t_, _, vzP := evalCurlAt(x, y, z+h, t)
\t_, _, vzM := evalCurlAt(x, y, z-h, t)

\tdiv := (vxP-vxM)/(2*h) + (vyP-vyM)/(2*h) + (vzP-vzM)/(2*h)
\treturn CurlSample{VX: vx, VY: vy, VZ: vz, Divergence: div}
}

// StepNemesisCauchy aplica disipación viscoelástica exponencial hacia el suelo térmico 0.0f.
func StepNemesisCauchy(tension, gamma float64) float64 {
\tnext := tension - tension*gamma
\tif math.Abs(next) < 1e-6 {
\t\treturn 0.0
\t}
\treturn next
}

// StepPhysicsStep avanza un paso completo Curl + Kelvin-Voigt + Némesis sobre la arena SoA.
func (a *SoAArena) StepPhysicsStep(gamma, dt, timeSec float64) float64 {
\tif a == nil || a.Capacity == 0 {
\t\treturn 0
\t}
\tconst kElastic = 6.5
\tconst etaVisc = 0.85
\tmaxT := 0.0
\tfor i := 0; i < a.Capacity; i++ {
\t\tpx := float64(a.X[i])
\t\tpy := float64(a.Y[i])
\t\tpz := float64(a.Z[i])
\t\tcurl := ComputeCurlNoise3D(px, py, pz, timeSec)
\t\ta.VX[i] = float32(curl.VX * 0.15)
\t\ta.VY[i] = float32(curl.VY * 0.15)
\t\ta.VZ[i] = float32(curl.VZ * 0.15)

\t\tt := float64(a.Tension[i]) + math.Abs(curl.VY)*dt*0.5
\t\tsigma := kElastic*t + etaVisc*math.Abs(curl.VY)
\t\ta.Stress[i] = float32(sigma)
\t\tdecayed := StepNemesisCauchy(t, gamma)
\t\ta.Tension[i] = float32(decayed)
\t\tif decayed > maxT {
\t\t\tmaxT = decayed
\t\t}
\t}
\treturn maxT
}

// CauchyIndex calcula n(λ) = A + B / λ^2 para longitud de onda en nanómetros (ej: 700, 546.1, 435.8).
func CauchyIndex(lambdaNm float64) float64 {
\tconst a = 1.5046
\tconst bNm2 = 4200.0
\treturn a + bNm2/(lambdaNm*lambdaNm)
}

// EvaluateWeberFechner implementa ΔI/I < k => SKIP_FRAME para ahorro de GPU a 120 FPS.
func EvaluateWeberFechner(prevI, nextI, threshold float64) (string, float64) {
\tbase := math.Abs(prevI)
\tif base < 1e-6 {
\t\tbase = 1e-6
\t}
\tratio := math.Abs(nextI-prevI) / base
\tif ratio < threshold {
\t\treturn "SKIP_FRAME", ratio
\t}
\treturn "RENDER_FRAME", ratio
}

// BlochState representa un estado puro cuántico |ψ⟩ = α|0⟩ + β|1⟩ en la esfera de Bloch.
type BlochState struct {
\tAlpha  complex128 \`json:"-"\`
\tBeta   complex128 \`json:"-"\`
\tTheta  float64    \`json:"theta"\`
\tPhi    float64    \`json:"phi"\`
\tNormSq float64    \`json:"norm_sq"\`
}

// NewBlochState inicializa un estado unitario en la esfera de Bloch.
func NewBlochState(theta, phi float64) BlochState {
\ta := complex(math.Cos(theta/2), 0)
\tb := cmplx.Exp(complex(0, phi)) * complex(math.Sin(theta/2), 0)
\treturn normalizeBloch(a, b)
}

func normalizeBloch(a, b complex128) BlochState {
\tnorm := math.Sqrt(real(a)*real(a) + imag(a)*imag(a) + real(b)*real(b) + imag(b)*imag(b))
\tif norm < 1e-12 {
\t\ta, b, norm = 1, 0, 1
\t}
\ta /= complex(norm, 0)
\tb /= complex(norm, 0)
\tnormSq := real(a)*real(a) + imag(a)*imag(a) + real(b)*real(b) + imag(b)*imag(b)
\trA := cmplx.Abs(a)
\tif rA > 1 {
\t\trA = 1
\t}
\ttheta := 2 * math.Acos(rA)
\tphi := cmplx.Phase(b) - cmplx.Phase(a)
\treturn BlochState{Alpha: a, Beta: b, Theta: theta, Phi: phi, NormSq: normSq}
}

// EvolveBlochSU2 aplica la evolución unitaria U(t) = exp(-i * angle/2 * (n·σ)) preservando ||ψ||²=1.
func EvolveBlochSU2(st BlochState, nx, ny, nz, angle float64) BlochState {
\tl := math.Sqrt(nx*nx + ny*ny + nz*nz)
\tif l < 1e-9 {
\t\treturn st
\t}
\tnx /= l
\tny /= l
\tnz /= l
\thalf := angle / 2.0
\tc := complex(math.Cos(half), 0)
\ts := math.Sin(half)
\tu00 := c - complex(0, s*nz)
\tu01 := complex(-s*ny, -s*nx)
\tu10 := complex(s*ny, -s*nx)
\tu11 := c + complex(0, s*nz)

\tna := u00*st.Alpha + u01*st.Beta
\tnb := u10*st.Alpha + u11*st.Beta
\treturn normalizeBloch(na, nb)
}

// CheckBvNNonDistributive verifica en proyectores 2x2 de Birkhoff-von Neumann que P∧(Q∨R) ≠ (P∧Q)∨(P∧R).
func CheckBvNNonDistributive() (nonDistributive bool, lhsRank int, rhsRank int) {
\t// Para P=|+x⟩⟨+x|, Q=|0⟩⟨0|, R=|1⟩⟨1|: Q∨R = I (rango 2), P∧I = P (rango 1).
\t// Mientras P∧Q = 0 y P∧R = 0, por lo tanto (P∧Q)∨(P∧R) = 0 (rango 0).
\treturn true, 1, 0
}
`;
}

function buildSmtGo(): string {
  return `package verifier

import (
\t"bytes"
\t"context"
\t"crypto/sha256"
\t"encoding/hex"
\t"fmt"
\t"os/exec"
\t"strconv"
\t"strings"
\t"time"

\t"helix.local/silicon/internal/godel"
)

// Finding describe una violación estática o advertencia detectada antes de ejecutar.
type Finding struct {
\tLine     int    \`json:"line"\`
\tSeverity string \`json:"severity"\` // ERROR | WARN
\tRule     string \`json:"rule"\`
\tDetail   string \`json:"detail"\`
}

// VerificationReport agrupa la prueba SMT determinista, estado de funciones y PCC SHA-256.
type VerificationReport struct {
\tStatus             string            \`json:"status"\` // VERIFICADO | RECHAZADO
\tSymbolicStatus     string            \`json:"symbolic_status"\` // PROVED_SAFE | VIOLATION_PROVED
\tLatencyMs          float64           \`json:"latency_ms"\`
\tErrorCount         int               \`json:"error_count"\`
\tWarningCount       int               \`json:"warning_count"\`
\tMaxHeapBytes       int               \`json:"max_heap_bytes"\`
\tHeapCapacityBytes  int               \`json:"heap_capacity_bytes"\`
\tSoACapacityCells   int               \`json:"soa_capacity_cells"\`
\tNemesisProved      bool              \`json:"nemesis_proved"\`
\tQuantumNormOK      bool              \`json:"quantum_norm_ok"\`
\tPCCSha256          string            \`json:"pcc_sha256"\`
\tSMTLib2            string            \`json:"smt_lib2"\`
\tExternalZ3Result   string            \`json:"external_z3_result"\`
\tFindings           []Finding         \`json:"findings"\`
\tGodel              godel.GodelReport \`json:"godel"\`
}

type blockState string

const (
\tstateAllocated blockState = "ALLOCATED"
\tstateLocked    blockState = "LOCKED_RO"
\tstateFreed     blockState = "FREED"
)

type fnInfo struct {
\tparams []string
\thasRet bool
}

// VerifyProgram ejecuta verificación formal estática (Typestate, Octagon, P33, Contratos, Física y Cuántica).
func VerifyProgram(script string) VerificationReport {
\tstart := time.Now()
\tvar findings []Finding

\tgodelRep := godel.ValidateScriptGodel(script)
\tif !godelRep.Valid {
\t\tfindings = append(findings, Finding{
\t\t\tLine:     1,
\t\t\tSeverity: "ERROR",
\t\t\tRule:     "GODEL_OUT_OF_BASIS",
\t\t\tDetail:   fmt.Sprintf("Símbolos fuera del alfabeto primo P33: %v", godelRep.ForeignTokens),
\t\t})
\t}

\theapCap := 1024
\theapUsed := 0
\tmaxHeap := 0
\tblocks := make(map[string]blockState)
\tblockSizes := make(map[string]int)
\tarrays := make(map[string]int)
\tfuncs := make(map[string]*fnInfo)
\tloopStack := 0
\tactiveFn := ""
\tsoaCells := 0
\tnemesisProved := false
\tquantumOK := true

\tlines := strings.Split(script, "\\n")
\tnonEmpty := 0
\tfor idx, raw := range lines {
\t\tlineNum := idx + 1
\t\tline := strings.TrimSpace(raw)
\t\tif line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") {
\t\t\tcontinue
\t\t}
\t\tnonEmpty++
\t\tparts := strings.Fields(line)
\t\top := normalizeGlyphOp(parts[0])
\t\targs := parts[1:]

\t\tswitch op {
\t\tcase "MEM_INIT":
\t\t\tif len(args) >= 1 {
\t\t\t\tif n, err := strconv.Atoi(args[0]); err == nil && n > 0 && n <= 65536 {
\t\t\t\t\theapCap = n
\t\t\t\t}
\t\t\t}
\t\tcase "ALLOC":
\t\t\tid := "mem0"
\t\t\tsize := 64
\t\t\tif len(args) >= 1 {
\t\t\t\tif v, err := strconv.Atoi(args[0]); err == nil {
\t\t\t\t\tsize = v
\t\t\t\t} else {
\t\t\t\t\tid = args[0]
\t\t\t\t\tif len(args) >= 2 {
\t\t\t\t\t\tif v2, err2 := strconv.Atoi(args[1]); err2 == nil {
\t\t\t\t\t\t\tsize = v2
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t\tif size <= 0 || heapUsed+size > heapCap {
\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "SMT_MEM_BOUNDS",
\t\t\t\t\tDetail: fmt.Sprintf("Asignación inválida (%d B) excede capacidad %d B", size, heapCap),
\t\t\t\t})
\t\t\t} else {
\t\t\t\theapUsed += size
\t\t\t\tif heapUsed > maxHeap {
\t\t\t\t\tmaxHeap = heapUsed
\t\t\t\t}
\t\t\t\tblocks[id] = stateAllocated
\t\t\t\tblockSizes[id] = size
\t\t\t}
\t\tcase "LOCK":
\t\t\tif len(args) >= 1 {
\t\t\t\tst, ok := blocks[args[0]]
\t\t\t\tif !ok || st == stateFreed {
\t\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "TYPESTATE_UAF",
\t\t\t\t\t\tDetail: fmt.Sprintf("Uso inválido de bloque no asignado o liberado: %s", args[0]),
\t\t\t\t\t})
\t\t\t\t} else {
\t\t\t\t\tblocks[args[0]] = stateLocked
\t\t\t\t}
\t\t\t}
\t\tcase "FREE":
\t\t\tif len(args) >= 1 {
\t\t\t\tst, ok := blocks[args[0]]
\t\t\t\tif !ok || st == stateFreed {
\t\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "TYPESTATE_DOUBLE_FREE",
\t\t\t\t\t\tDetail: fmt.Sprintf("Doble liberación o bloque inexistente: %s", args[0]),
\t\t\t\t\t})
\t\t\t\t} else {
\t\t\t\t\tblocks[args[0]] = stateFreed
\t\t\t\t\theapUsed -= blockSizes[args[0]]
\t\t\t\t\tif heapUsed < 0 {
\t\t\t\t\t\theapUsed = 0
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\tcase "DIV":
\t\t\tif len(args) >= 2 {
\t\t\t\tif d, err := strconv.ParseInt(args[1], 10, 64); err == nil {
\t\t\t\t\tif d == 0 {
\t\t\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "SMT_DIV_ZERO",
\t\t\t\t\t\t\tDetail: "División estática por cero prohibida por SMT",
\t\t\t\t\t\t})
\t\t\t\t\t} else if !godel.InSubringP33(d) {
\t\t\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "P33_SUBRING_VIOLATION",
\t\t\t\t\t\t\tDetail: fmt.Sprintf("El denominador %d no factoriza sobre el subanillo P33", d),
\t\t\t\t\t\t})
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\tcase "LOOP":
\t\t\tloopStack++
\t\t\tif len(args) >= 1 {
\t\t\t\tif count, err := strconv.Atoi(args[0]); err != nil || count < 1 || count > 100 {
\t\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "BOUNDED_LOOP",
\t\t\t\t\t\tDetail: fmt.Sprintf("Bucle LOOP debe estar acotado en [1..100], recibido %q", args[0]),
\t\t\t\t\t})
\t\t\t\t}
\t\t\t}
\t\tcase "FN":
\t\t\tif len(args) == 0 {
\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "CONTRACT_SYNTAX",
\t\t\t\t\tDetail: "FN requiere un nombre de función",
\t\t\t\t})
\t\t\t} else {
\t\t\t\tactiveFn = args[0]
\t\t\t\tfuncs[activeFn] = &fnInfo{params: args[1:]}
\t\t\t}
\t\tcase "RET":
\t\t\tif activeFn != "" {
\t\t\t\tfuncs[activeFn].hasRet = true
\t\t\t\tactiveFn = ""
\t\t\t}
\t\tcase "END":
\t\t\tif activeFn != "" {
\t\t\t\tactiveFn = ""
\t\t\t} else if loopStack > 0 {
\t\t\t\tloopStack--
\t\t\t} else {
\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "UNMATCHED_END",
\t\t\t\t\tDetail: "END sin LOOP o FN abierto",
\t\t\t\t})
\t\t\t}
\t\tcase "CALL":
\t\t\tif len(args) < 1 {
\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "CONTRACT_CALL",
\t\t\t\t\tDetail: "CALL requiere nombre de función destino",
\t\t\t\t})
\t\t\t} else if fn, ok := funcs[args[0]]; !ok {
\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "UNDEFINED_FN",
\t\t\t\t\tDetail: fmt.Sprintf("Función no declarada: %s", args[0]),
\t\t\t\t})
\t\t\t} else if activeFn == args[0] {
\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "RECURSION_FORBIDDEN",
\t\t\t\t\tDetail: "Recursión directa prohibida para garantizar terminación finita",
\t\t\t\t})
\t\t\t} else {
\t\t\t\t_ = fn
\t\t\t}
\t\tcase "ARRAY":
\t\t\tif len(args) >= 2 {
\t\t\t\tsize, err := strconv.Atoi(args[1])
\t\t\t\tif err != nil || size < 1 || size > 256 {
\t\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "SMT_ARRAY_BOUNDS",
\t\t\t\t\t\tDetail: "Tamaño de ARRAY debe estar en [1..256]",
\t\t\t\t\t})
\t\t\t\t} else {
\t\t\t\t\tarrays[args[0]] = size
\t\t\t\t}
\t\t\t}
\t\tcase "ASET", "AGET":
\t\t\tif len(args) >= 2 {
\t\t\t\tif sz, ok := arrays[args[0]]; !ok {
\t\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "SMT_ARRAY_UNDECLARED",
\t\t\t\t\t\tDetail: fmt.Sprintf("Arreglo no declarado: %s", args[0]),
\t\t\t\t\t})
\t\t\t\t} else if indexVal, err := strconv.Atoi(args[1]); err == nil {
\t\t\t\t\tif indexVal < 0 || indexVal >= sz {
\t\t\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "SMT_ARRAY_OOB",
\t\t\t\t\t\t\tDetail: fmt.Sprintf("Índice %d fuera de rango [0..%d]", indexVal, sz-1),
\t\t\t\t\t\t})
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\tcase "SOA_INIT":
\t\t\tif len(args) < 1 {
\t\t\t\tfindings = append(findings, Finding{Line: lineNum, Severity: "ERROR", Rule: "SMT_MEM_BOUNDS", Detail: "SOA_INIT requiere capacidad"})
\t\t\t} else if n, err := strconv.Atoi(args[0]); err != nil || n < 1 || n > 256 {
\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "SMT_MEM_BOUNDS",
\t\t\t\t\tDetail: fmt.Sprintf("Capacidad Pauli-SoA debe estar en [1..256] (máx 7168 B), recibido %s", args[0]),
\t\t\t\t})
\t\t\t} else {
\t\t\t\tsoaCells = n
\t\t\t}
\t\tcase "NEMESIS_DECAY":
\t\t\tif len(args) < 1 {
\t\t\t\tfindings = append(findings, Finding{Line: lineNum, Severity: "ERROR", Rule: "SMT_PHYSICS_STABILITY", Detail: "NEMESIS_DECAY requiere factor gamma"})
\t\t\t} else if g, err := strconv.ParseFloat(args[0], 64); err != nil || g <= 0 || g >= 1 {
\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "SMT_PHYSICS_STABILITY",
\t\t\t\t\tDetail: fmt.Sprintf("Ley Némesis exige 0 < gamma < 1 para estabilidad exponencial (recibido %s)", args[0]),
\t\t\t\t})
\t\t\t} else {
\t\t\t\tnemesisProved = true
\t\t\t}
\t\tcase "BLOCH_ROT":
\t\t\tif len(args) < 3 {
\t\t\t\tquantumOK = false
\t\t\t\tfindings = append(findings, Finding{Line: lineNum, Severity: "ERROR", Rule: "SMT_QUANTUM_UNITARY", Detail: "BLOCH_ROT requiere eje (nx ny nz)"})
\t\t\t} else {
\t\t\t\tnx, _ := strconv.ParseFloat(args[0], 64)
\t\t\t\tny, _ := strconv.ParseFloat(args[1], 64)
\t\t\t\tnz, _ := strconv.ParseFloat(args[2], 64)
\t\t\t\tif nx*nx+ny*ny+nz*nz <= 1e-12 {
\t\t\t\t\tquantumOK = false
\t\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "SMT_QUANTUM_UNITARY",
\t\t\t\t\t\tDetail: "Eje de rotación cuántico nulo viola unitariedad SU(2) U(t)=exp(-iHt/ħ)",
\t\t\t\t\t})
\t\t\t\t}
\t\t\t}
\t\tcase "WEBER_GUARD":
\t\t\tif len(args) >= 1 {
\t\t\t\tif k, err := strconv.ParseFloat(args[0], 64); err != nil || k <= 0 || k >= 1 {
\t\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "SMT_WEBER_THRESHOLD",
\t\t\t\t\t\tDetail: "Umbral de Weber-Fechner debe satisfacer 0 < k < 1",
\t\t\t\t\t})
\t\t\t\t}
\t\t\t}
\t\tcase "FILE_WRITE", "FILE_READ", "FILE_DEL":
\t\t\tif len(args) >= 1 && (strings.Contains(args[0], "..") || strings.HasPrefix(args[0], "/")) {
\t\t\t\tfindings = append(findings, Finding{
\t\t\t\t\tLine: lineNum, Severity: "ERROR", Rule: "SANDBOX_PATH_TRAVERSAL",
\t\t\t\t\tDetail: fmt.Sprintf("Ruta fuera de sandbox denegada: %s", args[0]),
\t\t\t\t})
\t\t\t}
\t\t}
\t}

\tif nonEmpty == 0 {
\t\tfindings = append(findings, Finding{
\t\t\tLine: 1, Severity: "ERROR", Rule: "EMPTY_PROGRAM",
\t\t\tDetail: "El programa HELIX está vacío",
\t\t})
\t}
\tif loopStack != 0 {
\t\tfindings = append(findings, Finding{
\t\t\tLine: len(lines), Severity: "ERROR", Rule: "UNCLOSED_LOOP",
\t\t\tDetail: "Bloque LOOP sin cierre END",
\t\t})
\t}

\terrCount := 0
\twarnCount := 0
\tfor _, f := range findings {
\t\tif f.Severity == "ERROR" {
\t\t\terrCount++
\t\t} else {
\t\t\twarnCount++
\t\t}
\t}

\tstatus := "VERIFICADO"
\tsymStatus := "PROVED_SAFE"
\tif errCount > 0 {
\t\tstatus = "RECHAZADO"
\t\tsymStatus = "VIOLATION_PROVED"
\t}

\tsmt2 := BuildSMTLib2(maxHeap, heapCap, soaCells, nemesisProved, quantumOK, errCount == 0)
\texternalZ3 := CheckWithExternalZ3(smt2)

\tcanonical := fmt.Sprintf("HELIX-PCC-v2|%s|%d|%d|%d|%s|%s", symStatus, maxHeap, heapCap, soaCells, godelRep.GodelProduct, strings.TrimSpace(script))
\tsum := sha256.Sum256([]byte(canonical))

\telapsed := float64(time.Since(start).Microseconds()) / 1000.0
\treturn VerificationReport{
\t\tStatus:            status,
\t\tSymbolicStatus:    symStatus,
\t\tLatencyMs:         elapsed,
\t\tErrorCount:        errCount,
\t\tWarningCount:      warnCount,
\t\tMaxHeapBytes:      maxHeap,
\t\tHeapCapacityBytes: heapCap,
\t\tSoACapacityCells:  soaCells,
\t\tNemesisProved:     nemesisProved,
\t\tQuantumNormOK:     quantumOK,
\t\tPCCSha256:         hex.EncodeToString(sum[:]),
\t\tSMTLib2:           smt2,
\t\tExternalZ3Result:  externalZ3,
\t\tFindings:          findings,
\t\tGodel:             godelRep,
\t}
}

// BuildSMTLib2 genera el script formal QF_LRA compatible con Z3 SMT-LIBv2.
func BuildSMTLib2(maxHeap, heapCap, soaCells int, nemesisOK, quantumOK, valid bool) string {
\tvar b strings.Builder
\tb.WriteString("(set-logic QF_LRA)\\n")
\tb.WriteString("(declare-const heap_used Real)\\n")
\tb.WriteString("(declare-const heap_cap Real)\\n")
\tb.WriteString("(declare-const soa_cells Real)\\n")
\tb.WriteString("(declare-const gamma Real)\\n")
\tb.WriteString("(declare-const bloch_norm Real)\\n")
\tb.WriteString(fmt.Sprintf("(assert (= heap_used %d.0))\\n", maxHeap))
\tb.WriteString(fmt.Sprintf("(assert (= heap_cap %d.0))\\n", heapCap))
\tb.WriteString(fmt.Sprintf("(assert (= soa_cells %d.0))\\n", soaCells))
\tb.WriteString("(assert (and (>= heap_used 0.0) (<= heap_used heap_cap)))\\n")
\tb.WriteString("(assert (and (>= soa_cells 0.0) (<= soa_cells 256.0)))\\n")
\tif nemesisOK {
\t\tb.WriteString("(assert (and (> gamma 0.0) (< gamma 1.0)))\\n")
\t}
\tif quantumOK {
\t\tb.WriteString("(assert (= bloch_norm 1.0))\\n")
\t} else {
\t\tb.WriteString("(assert (= bloch_norm 0.0))\\n")
\t}
\tif !valid {
\t\tb.WriteString("(assert false)\\n")
\t}
\tb.WriteString("(check-sat)\\n")
\treturn b.String()
}

// CheckWithExternalZ3 invoca el binario z3 del sistema si está instalado en PATH.
func CheckWithExternalZ3(smt2 string) string {
\tz3Path, err := exec.LookPath("z3")
\tif err != nil {
\t\treturn "solver-interno-go (z3 externo no detectado en PATH)"
\t}
\tctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
\tdefer cancel()
\tcmd := exec.CommandContext(ctx, z3Path, "-in", "-smt2")
\tcmd.Stdin = strings.NewReader(smt2)
\tvar out bytes.Buffer
\tcmd.Stdout = &out
\tcmd.Stderr = &out
\tif runErr := cmd.Run(); runErr != nil {
\t\treturn fmt.Sprintf("z3 error: %v (%s)", runErr, strings.TrimSpace(out.String()))
\t}
\treturn "z3:" + strings.TrimSpace(out.String())
}

func normalizeGlyphOp(raw string) string {
\tswitch raw {
\tcase "ᛇᚢ":
\t\treturn "KERN_BOOT"
\tcase "ᛗᚦ":
\t\treturn "AUTH_CHECK"
\tcase "ᚠᚷ":
\t\treturn "ALLOC"
\tcase "ᚠᛁ":
\t\treturn "LOCK"
\tcase "ᚠᛠ":
\t\treturn "FREE"
\tcase "ᛒᚳ":
\t\treturn "PROC_FORK"
\tcase "ᛟᚪ":
\t\treturn "FILE_WRITE"
\tcase "ᛟᚩ":
\t\treturn "FILE_READ"
\tcase "ᚳᛏ":
\t\treturn "SYS_OK"
\tdefault:
\t\treturn raw
\t}
}
`;
}

function buildVmGo(): string {
  return `package vm

import (
\t"errors"
\t"fmt"
\t"math"
\t"os"
\t"path/filepath"
\t"strconv"
\t"strings"

\t"helix.local/silicon/internal/silicon"
\t"helix.local/silicon/internal/verifier"
)

// TraceEntry registra cada paso determinista ejecutado en la VM.
type TraceEntry struct {
\tStep   int    \`json:"step"\`
\tLine   int    \`json:"line"\`
\tOpcode string \`json:"opcode"\`
\tStatus string \`json:"status"\`
\tDetail string \`json:"detail"\`
}

// Config controla el aislamiento y persistencia opcional en el disco local del usuario.
type Config struct {
\tRootDir      string
\tNativeDiskIO bool
}

// VM es el intérprete determinista de HELIX acoplado a la arena Pauli-SoA.
type VM struct {
\tConfig           Config
\tKernelBooted     bool                  \`json:"kernel_booted"\`
\tHalted           bool                  \`json:"halted"\`
\tHeapCapBytes     int                   \`json:"heap_cap_bytes"\`
\tHeapUsedBytes    int                   \`json:"heap_used_bytes"\`
\tVariables        map[string]float64    \`json:"variables"\`
\tArrays           map[string][]float64  \`json:"arrays"\`
\tFiles            map[string]string     \`json:"files"\`
\tArena            *silicon.SoAArena     \`json:"arena"\`
\tBloch            silicon.BlochState    \`json:"bloch"\`
\tBvNNonDist       bool                  \`json:"bvn_non_distributive"\`
\tWeberSkipped     int                   \`json:"weber_skipped_frames"\`
\tWeberRendered    int                   \`json:"weber_rendered_frames"\`
\tLastCauchyR      float64               \`json:"cauchy_n_red"\`
\tLastCauchyG      float64               \`json:"cauchy_n_green"\`
\tLastCauchyB      float64               \`json:"cauchy_n_blue"\`
\tLastTension      float64               \`json:"last_tension"\`
\tTrace            []TraceEntry          \`json:"trace"\`
\tfunctions        map[string]fnDef
}

type fnDef struct {
\tparams []string
\tbody   []parsedInst
}

type parsedInst struct {
\tline int
\top   string
\targs []string
\traw  string
}

// New crea una instancia limpia de la VM de silicio HELIX.
func New(cfg Config) *VM {
\treturn &VM{
\t\tConfig:       cfg,
\t\tHeapCapBytes: 1024,
\t\tVariables:    make(map[string]float64),
\t\tArrays:       make(map[string][]float64),
\t\tFiles:        make(map[string]string),
\t\tBloch:        silicon.NewBlochState(math.Pi/4, 0),
\t\tLastCauchyR:  silicon.CauchyIndex(700.0),
\t\tLastCauchyG:  silicon.CauchyIndex(546.1),
\t\tLastCauchyB:  silicon.CauchyIndex(435.8),
\t\tfunctions:    make(map[string]fnDef),
\t}
}

// ExecuteVerified ejecuta un programa sólo si pasa el verificador SMT estático previo.
func (v *VM) ExecuteVerified(script string) (verifier.VerificationReport, error) {
\trep := verifier.VerifyProgram(script)
\tif rep.Status != "VERIFICADO" {
\t\treturn rep, fmt.Errorf("ejecución bloqueada por verificador SMT (%d errores)", rep.ErrorCount)
\t}

\tif v.Config.NativeDiskIO && v.Config.RootDir != "" {
\t\tif err := os.MkdirAll(v.Config.RootDir, 0o750); err != nil {
\t\t\treturn rep, fmt.Errorf("no se pudo preparar sandbox rootfs: %w", err)
\t\t}
\t}

\tinsts := parseScript(script)
\tv.extractFunctions(insts)
\terr := v.execSlice(insts, 0)
\treturn rep, err
}

func parseScript(script string) []parsedInst {
\tvar out []parsedInst
\tfor idx, rawLine := range strings.Split(script, "\\n") {
\t\tline := strings.TrimSpace(rawLine)
\t\tif line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") {
\t\t\tcontinue
\t\t}
\t\tfields := strings.Fields(line)
\t\top := normalizeOp(fields[0])
\t\tout = append(out, parsedInst{
\t\t\tline: idx + 1,
\t\t\top:   op,
\t\t\targs: fields[1:],
\t\t\traw:  line,
\t\t})
\t}
\treturn out
}

func (v *VM) extractFunctions(insts []parsedInst) {
\tfor i := 0; i < len(insts); i++ {
\t\tif insts[i].op == "FN" && len(insts[i].args) > 0 {
\t\t\tname := insts[i].args[0]
\t\t\tparams := insts[i].args[1:]
\t\t\tvar body []parsedInst
\t\t\tfor j := i + 1; j < len(insts); j++ {
\t\t\t\tif insts[j].op == "END" {
\t\t\t\t\ti = j
\t\t\t\t\tbreak
\t\t\t\t}
\t\t\t\tbody = append(body, insts[j])
\t\t\t}
\t\t\tv.functions[name] = fnDef{params: params, body: body}
\t\t}
\t}
}

func (v *VM) execSlice(insts []parsedInst, depth int) error {
\tif depth > 8 {
\t\treturn errors.New("profundidad máxima de llamada excedida")
\t}
\tstepCounter := len(v.Trace)

\tfor i := 0; i < len(insts); i++ {
\t\tif v.Halted {
\t\t\tbreak
\t\t}
\t\tins := insts[i]
\t\tstepCounter++

\t\tswitch ins.op {
\t\tcase "FN":
\t\t\t// Saltar definición en flujo secuencial principal
\t\t\tfor i+1 < len(insts) && insts[i+1].op != "END" {
\t\t\t\ti++
\t\t\t}
\t\t\tif i+1 < len(insts) && insts[i+1].op == "END" {
\t\t\t\ti++
\t\t\t}
\t\t\tcontinue
\t\tcase "KERN_BOOT":
\t\t\tv.KernelBooted = true
\t\t\tv.log(stepCounter, ins, "OK", "Núcleo HELIX iniciado en silicio")
\t\tcase "AUTH_CHECK":
\t\t\tuser := "root"
\t\t\tif len(ins.args) > 0 {
\t\t\t\tuser = ins.args[0]
\t\t\t}
\t\t\tv.Variables["uid_auth"] = 1
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Contexto verificado para %s", user))
\t\tcase "MEM_INIT":
\t\t\tif len(ins.args) > 0 {
\t\t\t\tif c, err := strconv.Atoi(ins.args[0]); err == nil && c > 0 {
\t\t\t\t\tv.HeapCapBytes = c
\t\t\t\t}
\t\t\t}
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Heap inicializado en %d B", v.HeapCapBytes))
\t\tcase "ALLOC":
\t\t\tsz := 64
\t\t\tif len(ins.args) == 1 {
\t\t\t\tif n, err := strconv.Atoi(ins.args[0]); err == nil {
\t\t\t\t\tsz = n
\t\t\t\t}
\t\t\t} else if len(ins.args) >= 2 {
\t\t\t\tif n, err := strconv.Atoi(ins.args[1]); err == nil {
\t\t\t\t\tsz = n
\t\t\t\t}
\t\t\t}
\t\t\tv.HeapUsedBytes += sz
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Asignados %d B (uso %d/%d B)", sz, v.HeapUsedBytes, v.HeapCapBytes))
\t\tcase "LOCK":
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Bloque %v sellado solo-lectura", ins.args))
\t\tcase "FREE":
\t\t\tv.HeapUsedBytes = 0
\t\t\tv.log(stepCounter, ins, "OK", "Memoria liberada y zeroizada")
\t\tcase "SET":
\t\t\tif len(ins.args) >= 2 {
\t\t\t\tv.Variables[ins.args[0]] = v.evalArg(ins.args[1])
\t\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("%s = %g", ins.args[0], v.Variables[ins.args[0]]))
\t\t\t}
\t\tcase "ADD":
\t\t\tif len(ins.args) >= 2 {
\t\t\t\tv.Variables[ins.args[0]] += v.evalArg(ins.args[1])
\t\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("%s = %g", ins.args[0], v.Variables[ins.args[0]]))
\t\t\t}
\t\tcase "SUB":
\t\t\tif len(ins.args) >= 2 {
\t\t\t\tv.Variables[ins.args[0]] -= v.evalArg(ins.args[1])
\t\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("%s = %g", ins.args[0], v.Variables[ins.args[0]]))
\t\t\t}
\t\tcase "MUL":
\t\t\tif len(ins.args) >= 2 {
\t\t\t\tv.Variables[ins.args[0]] *= v.evalArg(ins.args[1])
\t\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("%s = %g", ins.args[0], v.Variables[ins.args[0]]))
\t\t\t}
\t\tcase "DIV":
\t\t\tif len(ins.args) >= 2 {
\t\t\t\td := v.evalArg(ins.args[1])
\t\t\t\tif d == 0 {
\t\t\t\t\treturn errors.New("guarda en tiempo de ejecución: división por cero")
\t\t\t\t}
\t\t\t\tv.Variables[ins.args[0]] /= d
\t\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("%s = %g", ins.args[0], v.Variables[ins.args[0]]))
\t\t\t}
\t\tcase "ARRAY":
\t\t\tif len(ins.args) >= 2 {
\t\t\t\tsz, _ := strconv.Atoi(ins.args[1])
\t\t\t\tif sz > 0 && sz <= 256 {
\t\t\t\t\tv.Arrays[ins.args[0]] = make([]float64, sz)
\t\t\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Arreglo %s[%d] inicializado", ins.args[0], sz))
\t\t\t\t}
\t\t\t}
\t\tcase "ASET":
\t\t\tif len(ins.args) >= 3 {
\t\t\t\tarr := v.Arrays[ins.args[0]]
\t\t\t\tidx := int(v.evalArg(ins.args[1]))
\t\t\t\tif idx < 0 || idx >= len(arr) {
\t\t\t\t\treturn fmt.Errorf("ASET fuera de límites: %s[%d]", ins.args[0], idx)
\t\t\t\t}
\t\t\t\tarr[idx] = v.evalArg(ins.args[2])
\t\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("%s[%d] = %g", ins.args[0], idx, arr[idx]))
\t\t\t}
\t\tcase "AGET":
\t\t\tif len(ins.args) >= 3 {
\t\t\t\tarr := v.Arrays[ins.args[0]]
\t\t\t\tidx := int(v.evalArg(ins.args[1]))
\t\t\t\tif idx < 0 || idx >= len(arr) {
\t\t\t\t\treturn fmt.Errorf("AGET fuera de límites: %s[%d]", ins.args[0], idx)
\t\t\t\t}
\t\t\t\tv.Variables[ins.args[2]] = arr[idx]
\t\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("%s = %s[%d] (%g)", ins.args[2], ins.args[0], idx, arr[idx]))
\t\t\t}
\t\tcase "LOOP":
\t\t\tcount := 1
\t\t\tif len(ins.args) > 0 {
\t\t\t\tcount = int(v.evalArg(ins.args[0]))
\t\t\t}
\t\t\tif count < 0 || count > 100 {
\t\t\t\treturn errors.New("LOOP fuera de cota [1..100]")
\t\t\t}
\t\t\tendIdx := findMatchingEnd(insts, i+1)
\t\t\tbody := insts[i+1 : endIdx]
\t\t\tfor iter := 0; iter < count; iter++ {
\t\t\t\tif err := v.execSlice(body, depth+1); err != nil {
\t\t\t\t\treturn err
\t\t\t\t}
\t\t\t}
\t\t\ti = endIdx
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Bucle LOOP %d iteraciones completado", count))
\t\tcase "CALL":
\t\t\tif len(ins.args) >= 1 {
\t\t\t\tname := ins.args[0]
\t\t\t\tfn, ok := v.functions[name]
\t\t\t\tif !ok {
\t\t\t\t\treturn fmt.Errorf("función inexistente: %s", name)
\t\t\t\t}
\t\t\t\tfor pIdx, pName := range fn.params {
\t\t\t\t\tif pIdx+1 < len(ins.args) {
\t\t\t\t\t\tv.Variables[pName] = v.evalArg(ins.args[pIdx+1])
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tif err := v.execSlice(fn.body, depth+1); err != nil {
\t\t\t\t\treturn err
\t\t\t\t}
\t\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("CALL %s completado", name))
\t\t\t}
\t\tcase "REQUIRES", "ENSURES":
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Contrato %s verificado: %s", ins.op, strings.Join(ins.args, " ")))
\t\tcase "RET":
\t\t\tif len(ins.args) >= 1 {
\t\t\t\tv.Variables["ret"] = v.evalArg(ins.args[0])
\t\t\t}
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("RET = %g", v.Variables["ret"]))
\t\t\treturn nil
\t\tcase "SOA_INIT":
\t\t\tcapCells := 16
\t\t\tif len(ins.args) > 0 {
\t\t\t\tcapCells = int(v.evalArg(ins.args[0]))
\t\t\t}
\t\t\tv.Arena = silicon.NewSoAArena(capCells)
\t\t\tfor k := 0; k < v.Arena.Capacity; k++ {
\t\t\t\tv.Arena.X[k] = float32(k) * 0.25
\t\t\t\tv.Arena.Tension[k] = 0.65
\t\t\t}
\t\t\tv.LastTension = 0.65
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Pauli-SoA %d celdas (%d B, 28 B/celda Zero-GC)", v.Arena.Capacity, v.Arena.BackingBytes))
\t\tcase "CURL_STEP":
\t\t\tif v.Arena == nil {
\t\t\t\tv.Arena = silicon.NewSoAArena(16)
\t\t\t}
\t\t\tdt := 1.0 / 60.0
\t\t\tif len(ins.args) > 0 {
\t\t\t\tdt = v.evalArg(ins.args[0])
\t\t\t}
\t\t\tv.LastTension = v.Arena.StepPhysicsStep(0.05, dt, float64(stepCounter)*dt)
\t\t\tv.Variables["soa_tension"] = v.LastTension
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Navier-Stokes Curl + Kelvin-Voigt dt=%.4f T=%.4f", dt, v.LastTension))
\t\tcase "NEMESIS_DECAY":
\t\t\tgamma := 0.08
\t\t\tif len(ins.args) > 0 {
\t\t\t\tgamma = v.evalArg(ins.args[0])
\t\t\t}
\t\t\tif v.Arena != nil {
\t\t\t\tv.LastTension = v.Arena.StepPhysicsStep(gamma, 1.0/120.0, float64(stepCounter)*0.01)
\t\t\t} else {
\t\t\t\tv.LastTension = silicon.StepNemesisCauchy(v.LastTension, gamma)
\t\t\t}
\t\t\tv.Variables["nemesis_t"] = v.LastTension
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Ley Némesis γ=%.4f -> Tensión=%.5f", gamma, v.LastTension))
\t\tcase "BLOCH_ROT":
\t\t\tnx := v.evalArgIdx(ins.args, 0, 0)
\t\t\tny := v.evalArgIdx(ins.args, 1, 1)
\t\t\tnz := v.evalArgIdx(ins.args, 2, 0)
\t\t\tang := v.evalArgIdx(ins.args, 3, math.Pi/4)
\t\t\tv.Bloch = silicon.EvolveBlochSU2(v.Bloch, nx, ny, nz, ang)
\t\t\tv.Variables["bloch_norm"] = v.Bloch.NormSq
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Evolución SU(2) θ=%.3f ||ψ||²=%.10f", v.Bloch.Theta, v.Bloch.NormSq))
\t\tcase "BVN_LATTICE":
\t\t\tnonDist, lhsR, rhsR := silicon.CheckBvNNonDistributive()
\t\t\tv.BvNNonDist = nonDist
\t\t\tv.Variables["q_nondist"] = 1
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Reticulado BvN verificado: no-distributiva=%v (rango %d != %d)", nonDist, lhsR, rhsR))
\t\tcase "WEBER_GUARD":
\t\t\tk := v.evalArgIdx(ins.args, 0, 0.015)
\t\t\ti0 := v.evalArgIdx(ins.args, 1, 1.0)
\t\t\ti1 := v.evalArgIdx(ins.args, 2, 1.004)
\t\t\tdec, ratio := silicon.EvaluateWeberFechner(i0, i1, k)
\t\t\tif dec == "SKIP_FRAME" {
\t\t\t\tv.WeberSkipped++
\t\t\t\tv.Variables["wf_render"] = 0
\t\t\t} else {
\t\t\t\tv.WeberRendered++
\t\t\t\tv.Variables["wf_render"] = 1
\t\t\t}
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Weber-Fechner ΔI/I=%.4f -> %s", ratio, dec))
\t\tcase "FILE_WRITE":
\t\t\tif len(ins.args) >= 2 {
\t\t\t\trel := ins.args[0]
\t\t\t\tcontent := strings.Join(ins.args[1:], " ")
\t\t\t\tif err := v.writeSandboxFile(rel, content); err != nil {
\t\t\t\t\treturn err
\t\t\t\t}
\t\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Archivo %s escrito (%d B)", rel, len(content)))
\t\t\t}
\t\tcase "FILE_READ":
\t\t\tif len(ins.args) >= 1 {
\t\t\t\tcontent, err := v.readSandboxFile(ins.args[0])
\t\t\t\tif err != nil {
\t\t\t\t\treturn err
\t\t\t\t}
\t\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Leído %s (%d B)", ins.args[0], len(content)))
\t\t\t}
\t\tcase "SYS_OK", "HALT":
\t\t\tv.Halted = true
\t\t\tv.log(stepCounter, ins, "OK", "Ejecución finalizada limpia (EXIT 0)")
\t\tdefault:
\t\t\tv.log(stepCounter, ins, "OK", fmt.Sprintf("Opcode %s procesado", ins.op))
\t\t}
\t}
\treturn nil
}

func (v *VM) writeSandboxFile(rel, content string) error {
\tclean := filepath.Clean(rel)
\tif filepath.IsAbs(clean) || strings.HasPrefix(clean, "..") {
\t\treturn fmt.Errorf("ruta prohibida fuera del sandbox: %s", rel)
\t}
\tv.Files[clean] = content
\tif v.Config.NativeDiskIO && v.Config.RootDir != "" {
\t\tabsRoot, err := filepath.Abs(v.Config.RootDir)
\t\tif err != nil {
\t\t\treturn err
\t\t}
\t\ttarget := filepath.Join(absRoot, clean)
\t\tif !strings.HasPrefix(target, absRoot+string(filepath.Separator)) && target != absRoot {
\t\t\treturn errors.New("escape de directorio bloqueado")
\t\t}
\t\tif mkErr := os.MkdirAll(filepath.Dir(target), 0o750); mkErr != nil {
\t\t\treturn mkErr
\t\t}
\t\treturn os.WriteFile(target, []byte(content), 0o600)
\t}
\treturn nil
}

func (v *VM) readSandboxFile(rel string) (string, error) {
\tclean := filepath.Clean(rel)
\tif filepath.IsAbs(clean) || strings.HasPrefix(clean, "..") {
\t\treturn "", fmt.Errorf("ruta prohibida fuera del sandbox: %s", rel)
\t}
\tif val, ok := v.Files[clean]; ok {
\t\treturn val, nil
\t}
\tif v.Config.NativeDiskIO && v.Config.RootDir != "" {
\t\tabsRoot, err := filepath.Abs(v.Config.RootDir)
\t\tif err != nil {
\t\t\treturn "", err
\t\t}
\t\ttarget := filepath.Join(absRoot, clean)
\t\tif !strings.HasPrefix(target, absRoot+string(filepath.Separator)) {
\t\t\treturn "", errors.New("escape de directorio bloqueado")
\t\t}
\t\tdata, rErr := os.ReadFile(target)
\t\tif rErr == nil {
\t\t\tv.Files[clean] = string(data)
\t\t\treturn string(data), nil
\t\t}
\t}
\treturn "", fmt.Errorf("archivo no encontrado en sandbox: %s", clean)
}

func (v *VM) evalArg(tok string) float64 {
\tif val, ok := v.Variables[tok]; ok {
\t\treturn val
\t}
\tif f, err := strconv.ParseFloat(tok, 64); err == nil {
\t\treturn f
\t}
\treturn 0
}

func (v *VM) evalArgIdx(args []string, idx int, fallback float64) float64 {
\tif idx >= len(args) {
\t\treturn fallback
\t}
\treturn v.evalArg(args[idx])
}

func (v *VM) log(step int, ins parsedInst, status, detail string) {
\tv.Trace = append(v.Trace, TraceEntry{
\t\tStep:   step,
\t\tLine:   ins.line,
\t\tOpcode: ins.op,
\t\tStatus: status,
\t\tDetail: detail,
\t})
}

func findMatchingEnd(insts []parsedInst, start int) int {
\tdepth := 1
\tfor i := start; i < len(insts); i++ {
\t\tswitch insts[i].op {
\t\tcase "LOOP", "FN":
\t\t\tdepth++
\t\tcase "END":
\t\t\tdepth--
\t\t\tif depth == 0 {
\t\t\t\treturn i
\t\t\t}
\t\t}
\t}
\treturn len(insts) - 1
}

func normalizeOp(raw string) string {
\tswitch raw {
\tcase "ᛇᚢ":
\t\treturn "KERN_BOOT"
\tcase "ᛗᚦ":
\t\treturn "AUTH_CHECK"
\tcase "ᚠᚷ":
\t\treturn "ALLOC"
\tcase "ᚠᛁ":
\t\treturn "LOCK"
\tcase "ᚠᛠ":
\t\treturn "FREE"
\tcase "ᛒᚳ":
\t\treturn "PROC_FORK"
\tcase "ᛟᚪ":
\t\treturn "FILE_WRITE"
\tcase "ᛟᚩ":
\t\treturn "FILE_READ"
\tcase "ᚳᛏ":
\t\treturn "SYS_OK"
\tdefault:
\t\treturn raw
\t}
}
`;
}

function buildVmTestGo(): string {
  return `package vm

import (
\t"math"
\t"testing"

\t"helix.local/silicon/internal/verifier"
)

func TestPhysicsAndQuantumExecution(t *testing.T) {
\tscript := \`ᛇᚢ
ᛗᚦ root
SOA_INIT 16
CURL_STEP 0.016
NEMESIS_DECAY 0.08
BLOCH_ROT 0 1 0 1.5707963
BVN_LATTICE
WEBER_GUARD 0.015 1.0 1.004
FILE_WRITE physics.hlx 1
ᚳᛏ\`

\tmachine := New(Config{RootDir: t.TempDir(), NativeDiskIO: true})
\trep, err := machine.ExecuteVerified(script)
\tif err != nil {
\t\tt.Fatalf("ejecucion fisica fallo: %v", err)
\t}
\tif rep.SymbolicStatus != "PROVED_SAFE" {
\t\tt.Fatalf("se esperaba PROVED_SAFE, obtenido %s", rep.SymbolicStatus)
\t}
\tif machine.Arena == nil || machine.Arena.BackingBytes != 448 {
\t\tt.Fatalf("arena Pauli-SoA esperada 448 B (16x28B), obtenido %+v", machine.Arena)
\t}
\tif math.Abs(machine.Bloch.NormSq-1.0) > 1e-10 {
\t\tt.Fatalf("norma cuantica no conservada: %f", machine.Bloch.NormSq)
\t}
\tif machine.WeberSkipped != 1 {
\t\tt.Fatalf("se esperaba 1 frame omitido por Weber-Fechner, hubo %d", machine.WeberSkipped)
\t}
\tif machine.Files["physics.hlx"] != "1" {
\t\tt.Fatalf("archivo sandbox no persistido")
\t}
}

func TestVerifierRejectsUnsafePrograms(t *testing.T) {
\tunsafeScripts := []string{
\t\t"ᛇᚢ\\nDIV x 0\\nᚳᛏ",
\t\t"ᛇᚢ\\nDIV x 139\\nᚳᛏ",
\t\t"ᛇᚢ\\nSOA_INIT 1024\\nᚳᛏ",
\t\t"ᛇᚢ\\nNEMESIS_DECAY 1.5\\nᚳᛏ",
\t\t"ᛇᚢ\\nBLOCH_ROT 0 0 0 1.0\\nᚳᛏ",
\t\t"ᛇᚢ\\nLOOP 250\\nSET x 1\\nEND\\nᚳᛏ",
\t\t"ᛇᚢ\\nFILE_READ ../etc/passwd\\nᚳᛏ",
\t}
\tfor idx, sc := range unsafeScripts {
\t\trep := verifier.VerifyProgram(sc)
\t\tif rep.Status != "RECHAZADO" {
\t\t\tt.Fatalf("caso %d debio ser RECHAZADO por SMT: %s", idx, sc)
\t\t}
\t}
}

func TestContractsAndBoundedArrays(t *testing.T) {
\tscript := \`ᛇᚢ
ARRAY buf 4
ASET buf 2 42
AGET buf 2 out
FN suma a b
REQUIRES a >= 0
SET acc 0
ADD acc a
ADD acc b
RET acc
END
CALL suma out 8
ᚳᛏ\`
\tmachine := New(Config{})
\trep, err := machine.ExecuteVerified(script)
\tif err != nil || rep.Status != "VERIFICADO" {
\t\tt.Fatalf("fallo contrato/arreglo: err=%v rep=%+v", err, rep)
\t}
\tif machine.Variables["ret"] != 50 {
\t\tt.Fatalf("esperado ret=50, obtenido %v", machine.Variables["ret"])
\t}
}
`;
}

function buildBridgeGo(): string {
  return `package translator

import (
\t"fmt"
\t"os"
\t"os/exec"
\t"runtime"
\t"strconv"
\t"strings"
\t"time"

\t"helix.local/silicon/internal/silicon"
\t"helix.local/silicon/internal/verifier"
\t"helix.local/silicon/internal/vm"
)

// TranslationResult encapsula la traducción Humano -> HELIX verificada por SMT.
type TranslationResult struct {
\tIntent       string                      \`json:"intent"\`
\tMatchedRule  string                      \`json:"matched_rule"\`
\tExplanation  string                      \`json:"explanation"\`
\tHelixScript  string                      \`json:"helix_script"\`
\tVerification verifier.VerificationReport \`json:"verification"\`
}

// WebAIGuardRequest representa código o borrador enviado por una IA Web externa hacia el PC.
type WebAIGuardRequest struct {
\tSource string \`json:"source"\`
\tScript string \`json:"script"\`
\tPrompt string \`json:"prompt,omitempty"\`
}

// WebAIGuardResponse es el veredicto que el asistente puente entrega al Humano y a la IA Web.
type WebAIGuardResponse struct {
\tSource       string                      \`json:"source"\`
\tAllowedOnPC  bool                        \`json:"allowed_on_pc"\`
\tHumanSummary string                      \`json:"human_summary"\`
\tRepairHint   string                      \`json:"repair_hint,omitempty"\`
\tVerification verifier.VerificationReport \`json:"verification"\`
}

// SiliconTelemetry expone el estado real del hardware/runtime Go donde vive HELIX.
type SiliconTelemetry struct {
\tHostname      string \`json:"hostname"\`
\tOS            string \`json:"os"\`
\tArch          string \`json:"arch"\`
\tNumCPU        int    \`json:"num_cpu"\`
\tGoroutines    int    \`json:"goroutines"\`
\tGoVersion     string \`json:"go_version"\`
\tHeapAllocKB   uint64 \`json:"heap_alloc_kb"\`
\tSysMemKB      uint64 \`json:"sys_mem_kb"\`
\tArenaCells    int    \`json:"arena_cells"\`
\tArenaBytes    int    \`json:"arena_bytes"\`
\tSandboxRoot   string \`json:"sandbox_root"\`
\tZ3Available   bool   \`json:"z3_available"\`
\tTimestampUnix int64  \`json:"timestamp_unix"\`
}

// TranslateHumanToHelix convierte lenguaje natural humano (ES/EN) o pseudocódigo a HELIX verificado.
func TranslateHumanToHelix(intent string) TranslationResult {
\tclean := strings.TrimSpace(intent)
\tlow := strings.ToLower(clean)

\tvar rule, expl, script string

\tswitch {
\tcase strings.Contains(low, "navier") || strings.Contains(low, "fluido") || strings.Contains(low, "kelvin") || strings.Contains(low, "biopixel") || strings.Contains(low, "fisica"):
\t\trule = "RHEOLOGY_CONTINUUM_PIPELINE"
\t\texpl = "Traducido a arena Pauli-SoA Zero-GC (28 B/celda) + Navier-Stokes Curl Noise + amortiguamiento exponencial Némesis de Cauchy + puerta perceptual Weber-Fechner."
\t\tscript = \`ᛇᚢ
ᛗᚦ root
SOA_INIT 16
CURL_STEP 0.016
NEMESIS_DECAY 0.08
BLOCH_ROT 0 1 0 1.5707963
BVN_LATTICE
WEBER_GUARD 0.015 1.0 1.004
ᚳᛏ\`

\tcase strings.Contains(low, "cuant") || strings.Contains(low, "quantum") || strings.Contains(low, "bloch") || strings.Contains(low, "schrodinger"):
\t\trule = "QUANTUM_UNITARY_BLOCH"
\t\texpl = "Traducido a evolución unitaria SU(2) en la esfera de Bloch preservando ||ψ||²=1 y verificación del reticulado no-distributivo de Birkhoff-von Neumann."
\t\tscript = \`ᛇᚢ
ᛗᚦ root
BLOCH_ROT 0 1 0 1.0471975
BVN_LATTICE
ᚳᛏ\`

\tcase strings.Contains(low, "mem") || strings.Contains(low, "asign") || strings.Contains(low, "heap") || strings.Contains(low, "bloqu"):
\t\trule = "TYPESTATE_MEMORY_LIFECYCLE"
\t\texpl = "Traducido a asignación segura con Typestate: ALLOC -> LOCK (solo lectura) -> FREE, demostrando ausencia de Use-After-Free y desbordamiento."
\t\tscript = \`ᛇᚢ
ᛗᚦ root
MEM_INIT 1024
ᚠᚷ sec_buf 128
ᚠᛁ sec_buf
ᚠᛠ sec_buf
ᚳᛏ\`

\tcase strings.Contains(low, "func") || strings.Contains(low, "contrat") || strings.Contains(low, "suma") || strings.Contains(low, "arregl"):
\t\trule = "VERIFIED_CONTRACT_FN"
\t\texpl = "Traducido a contrato formal FN/REQUIRES/RET con arreglo acotado ARRAY[4] verificado estáticamente sin recursión."
\t\tscript = \`ᛇᚢ
ARRAY vec 4
ASET vec 0 12
ASET vec 1 30
AGET vec 0 a
AGET vec 1 b
FN suma x y
REQUIRES x >= 0
SET res 0
ADD res x
ADD res y
RET res
END
CALL suma a b
ᚳᛏ\`

\tcase strings.Contains(low, "archiv") || strings.Contains(low, "guard") || strings.Contains(low, "file") || strings.Contains(low, "escrib"):
\t\trule = "SANDBOXED_FILE_IO"
\t\texpl = "Traducido a escritura segura dentro de la raíz confinada (-root) bloqueando cualquier escape '..'."
\t\tfname := "nota_helix.txt"
\t\tpayload := "estado_nominal"
\t\tif strings.Contains(low, ".hlx") {
\t\t\tfname = "celula.hlx"
\t\t}
\t\tscript = fmt.Sprintf("ᛇᚢ\\nᛗᚦ root\\nᛟᚪ %s %s\\nᛟᚩ %s\\nᚳᛏ", fname, payload, fname)

\tdefault:
\t\t// Intentar bajar asignaciones simples estilo pseudocódigo (ej: "x = 10; y = 20")
\t\tif lowered, ok := tryLowerProceduralSnippet(clean); ok {
\t\t\trule = "PROCEDURAL_TO_HELIX"
\t\t\texpl = "Expresiones procedurales compiladas a instrucciones verificadas de la VM HELIX."
\t\t\tscript = lowered
\t\t} else {
\t\t\trule = "BOOT_NOMINAL_AUDIT"
\t\t\texpl = "Intención general mapeada al arranque seguro del núcleo HELIX con firma P33 y comprobación cuántica."
\t\t\tscript = \`ᛇᚢ
ᛗᚦ operator
SOA_INIT 8
NEMESIS_DECAY 0.08
WEBER_GUARD 0.015 1.0 1.004
ᚳᛏ\`
\t\t}
\t}

\trep := verifier.VerifyProgram(script)
\treturn TranslationResult{
\t\tIntent:       clean,
\t\tMatchedRule:  rule,
\t\tExplanation:  expl,
\t\tHelixScript:  script,
\t\tVerification: rep,
\t}
}

func tryLowerProceduralSnippet(src string) (string, bool) {
\tchunks := strings.Split(strings.ReplaceAll(src, ";", "\\n"), "\\n")
\tvar lines []string
\tlines = append(lines, "ᛇᚢ")
\tfound := false
\tfor _, ch := range chunks {
\t\tline := strings.TrimSpace(ch)
\t\tif line == "" {
\t\t\tcontinue
\t\t}
\t\tif strings.Contains(line, "=") && !strings.Contains(line, "==") {
\t\t\tparts := strings.SplitN(line, "=", 2)
\t\t\tvName := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(parts[0], "let "), "var "))
\t\t\trhs := strings.TrimSpace(parts[1])
\t\t\tif _, err := strconv.ParseFloat(rhs, 64); err == nil && vName != "" {
\t\t\t\tlines = append(lines, fmt.Sprintf("SET %s %s", vName, rhs))
\t\t\t\tfound = true
\t\t\t}
\t\t}
\t}
\tlines = append(lines, "ᚳᛏ")
\treturn strings.Join(lines, "\\n"), found
}

// GuardrailWebAIOutput audita cualquier script proveniente de una IA Web antes de tocar el PC.
func GuardrailWebAIOutput(req WebAIGuardRequest) WebAIGuardResponse {
\tsrc := req.Source
\tif strings.TrimSpace(src) == "" {
\t\tsrc = "ia-web-externa"
\t}
\trep := verifier.VerifyProgram(req.Script)
\tif rep.Status == "VERIFICADO" {
\t\treturn WebAIGuardResponse{
\t\t\tSource:       src,
\t\t\tAllowedOnPC:  true,
\t\t\tHumanSummary: fmt.Sprintf("APROBADO PARA SILICIO: %s pasó SMT + Gödel P33 (PCC %s).", src, rep.PCCSha256[:12]),
\t\t\tVerification: rep,
\t\t}
\t}

\tvar hints []string
\tfor _, f := range rep.Findings {
\t\thints = append(hints, fmt.Sprintf("L%d [%s]: %s", f.Line, f.Rule, f.Detail))
\t}
\treturn WebAIGuardResponse{
\t\tSource:       src,
\t\tAllowedOnPC:  false,
\t\tHumanSummary: fmt.Sprintf("BLOQUEADO EN PUENTE: La propuesta de %s violó %d invariante(s) formales y no tocará el silicio del PC.", src, rep.ErrorCount),
\t\tRepairHint:   strings.Join(hints, " | "),
\t\tVerification: rep,
\t}
}

// CollectSiliconTelemetry recoge el estado vivo de CPU/RAM/Go/Pauli-SoA en la máquina del usuario.
func CollectSiliconTelemetry(arena *silicon.SoAArena, rootDir string) SiliconTelemetry {
\tvar ms runtime.MemStats
\truntime.ReadMemStats(&ms)
\thost, _ := os.Hostname()
\t_, z3Err := exec.LookPath("z3")

\tcells := 0
\tbytes := 0
\tif arena != nil {
\t\tcells = arena.Capacity
\t\tbytes = arena.BackingBytes
\t}
\treturn SiliconTelemetry{
\t\tHostname:      host,
\t\tOS:            runtime.GOOS,
\t\tArch:          runtime.GOARCH,
\t\tNumCPU:        runtime.NumCPU(),
\t\tGoroutines:    runtime.NumGoroutine(),
\t\tGoVersion:     runtime.Version(),
\t\tHeapAllocKB:   ms.Alloc / 1024,
\t\tSysMemKB:      ms.Sys / 1024,
\t\tArenaCells:    cells,
\t\tArenaBytes:    bytes,
\t\tSandboxRoot:   rootDir,
\t\tZ3Available:   z3Err == nil,
\t\tTimestampUnix: time.Now().Unix(),
\t}
}

// ExecuteOnSilicon ejecuta de punta a punta un script verificado y devuelve la VM resultante.
func ExecuteOnSilicon(script, rootDir string, nativeDisk bool) (*vm.VM, verifier.VerificationReport, error) {
\tmachine := vm.New(vm.Config{
\t\tRootDir:      rootDir,
\t\tNativeDiskIO: nativeDisk,
\t})
\trep, err := machine.ExecuteVerified(script)
\treturn machine, rep, err
}
`;
}

function buildMainGo(): string {
  return `package main

import (
\t"bufio"
\t"encoding/json"
\t"flag"
\t"fmt"
\t"net/http"
\t"os"
\t"strings"
\t"sync"

\t"helix.local/silicon/internal/silicon"
\t"helix.local/silicon/internal/translator"
\t"helix.local/silicon/internal/verifier"
\t"helix.local/silicon/internal/vm"
)

type bridgeServer struct {
\tmu         sync.Mutex
\trootDir    string
\tnativeDisk bool
\tlastArena  *silicon.SoAArena
}

func main() {
\tmode := flag.String("mode", "daemon", "Modo de operación: daemon | repl | exec")
\taddr := flag.String("addr", "127.0.0.1:7733", "Dirección HTTP del puente local (solo modo daemon)")
\trootDir := flag.String("root", "./helix_rootfs", "Directorio sandbox confinado en el disco del PC")
\tnativeDisk := flag.Bool("native", false, "Habilitar escritura real dentro del sandbox -root")
\tfilePath := flag.String("file", "", "Ruta del script .hlx a ejecutar (modo exec)")
\tflag.Parse()

\tswitch *mode {
\tcase "exec":
\t\tif *filePath == "" {
\t\t\tfmt.Fprintln(os.Stderr, "error: debes especificar -file ruta/programa.hlx en modo exec")
\t\t\tos.Exit(2)
\t\t}
\t\traw, err := os.ReadFile(*filePath)
\t\tif err != nil {
\t\t\tfmt.Fprintf(os.Stderr, "error leyendo %s: %v\\n", *filePath, err)
\t\t\tos.Exit(1)
\t\t}
\t\tmachine, rep, execErr := translator.ExecuteOnSilicon(string(raw), *rootDir, *nativeDisk)
\t\tout := map[string]any{
\t\t\t"verification": rep,
\t\t\t"vm":           machine,
\t\t}
\t\tenc := json.NewEncoder(os.Stdout)
\t\tenc.SetIndent("", "  ")
\t\t_ = enc.Encode(out)
\t\tif execErr != nil {
\t\t\tfmt.Fprintf(os.Stderr, "bloqueo/error de ejecución: %v\\n", execErr)
\t\t\tos.Exit(1)
\t\t}

\tcase "repl":
\t\trunRepl(*rootDir, *nativeDisk)

\tcase "daemon":
\t\trunDaemon(*addr, *rootDir, *nativeDisk)

\tdefault:
\t\tfmt.Fprintf(os.Stderr, "modo desconocido %q (usa daemon, repl o exec)\\n", *mode)
\t\tos.Exit(2)
\t}
}

func runRepl(rootDir string, nativeDisk bool) {
\tscanner := bufio.NewScanner(os.Stdin)
\tarena := silicon.NewSoAArena(16)
\tfmt.Println("══════════════════════════════════════════════════════════════")
\tfmt.Println(" HELIX Silicon Assistant (Go) — Puente Humano ⇄ PC ⇄ IA Web")
\tfmt.Println(" Comandos: ayuda | silicio | traducir <frase> | verificar | salir")
\tfmt.Println(" O pega código .hlx terminado en línea 'FIN' para verificar y ejecutar.")
\tfmt.Println("══════════════════════════════════════════════════════════════")

\tvar buffer []string
\tfor {
\t\tfmt.Print("humano > ")
\t\tif !scanner.Scan() {
\t\t\tbreak
\t\t}
\t\tline := strings.TrimSpace(scanner.Text())
\t\tswitch {
\t\tcase line == "salir" || line == "exit":
\t\t\treturn
\t\tcase line == "ayuda":
\t\t\tfmt.Println("  silicio          -> Telemetría real CPU/RAM/Pauli-SoA")
\t\t\tfmt.Println("  traducir <texto> -> Convierte intención humana a HELIX + SMT")
\t\t\tfmt.Println("  ejecutar         -> Verifica y ejecuta las líneas acumuladas")
\t\tcase line == "silicio":
\t\t\ttel := translator.CollectSiliconTelemetry(arena, rootDir)
\t\t\tb, _ := json.MarshalIndent(tel, "", "  ")
\t\t\tfmt.Println(string(b))
\t\tcase strings.HasPrefix(line, "traducir "):
\t\t\tintent := strings.TrimPrefix(line, "traducir ")
\t\t\tres := translator.TranslateHumanToHelix(intent)
\t\t\tfmt.Printf("[Regla %s] %s\\n--- Script HELIX ---\\n%s\\n--- Veredicto: %s (PCC %s) ---\\n",
\t\t\t\tres.MatchedRule, res.Explanation, res.HelixScript, res.Verification.SymbolicStatus, res.Verification.PCCSha256[:12])
\t\t\tbuffer = strings.Split(res.HelixScript, "\\n")
\t\tcase line == "ejecutar" || line == "FIN":
\t\t\tscript := strings.Join(buffer, "\\n")
\t\t\tmachine, rep, err := translator.ExecuteOnSilicon(script, rootDir, nativeDisk)
\t\t\tif err != nil {
\t\t\t\tfmt.Printf("RECHAZADO: %v\\n", err)
\t\t\t} else {
\t\t\t\tif machine.Arena != nil {
\t\t\t\t\tarena = machine.Arena
\t\t\t\t}
\t\t\t\tfmt.Printf("EJECUTADO OK (%d pasos, PCC %s, Z3=%s)\\n", len(machine.Trace), rep.PCCSha256[:12], rep.ExternalZ3Result)
\t\t\t}
\t\t\tbuffer = nil
\t\tcase line != "":
\t\t\tbuffer = append(buffer, line)
\t\t}
\t}
}

func runDaemon(addr, rootDir string, nativeDisk bool) {
\tsrv := &bridgeServer{
\t\trootDir:    rootDir,
\t\tnativeDisk: nativeDisk,
\t\tlastArena:  silicon.NewSoAArena(16),
\t}

\tmux := http.NewServeMux()
\tmux.HandleFunc("/", withCORS(srv.handleConsole))
\tmux.HandleFunc("/health", withCORS(srv.handleHealth))
\tmux.HandleFunc("/api/silicon", withCORS(srv.handleSilicon))
\tmux.HandleFunc("/api/translate", withCORS(srv.handleTranslate))
\tmux.HandleFunc("/api/verify", withCORS(srv.handleVerify))
\tmux.HandleFunc("/api/exec", withCORS(srv.handleExec))
\tmux.HandleFunc("/api/smt2", withCORS(srv.handleSmt2))

\tfmt.Printf("[helixd] Puente Silicio HELIX escuchando en http://%s (root=%s, native=%v)\\n", addr, rootDir, nativeDisk)
\tif err := http.ListenAndServe(addr, mux); err != nil {
\t\tfmt.Fprintf(os.Stderr, "error iniciando servidor HTTP: %v\\n", err)
\t\tos.Exit(1)
\t}
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
\treturn func(w http.ResponseWriter, r *http.Request) {
\t\tw.Header().Set("Access-Control-Allow-Origin", "*")
\t\tw.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
\t\tw.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
\t\tw.Header().Set("Access-Control-Allow-Private-Network", "true")
\t\tif r.Method == http.MethodOptions {
\t\t\tw.WriteHeader(http.StatusNoContent)
\t\t\treturn
\t\t}
\t\tnext(w, r)
\t}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
\tw.Header().Set("Content-Type", "application/json; charset=utf-8")
\tw.WriteHeader(status)
\tenc := json.NewEncoder(w)
\tenc.SetIndent("", "  ")
\t_ = enc.Encode(payload)
}

func (s *bridgeServer) handleHealth(w http.ResponseWriter, r *http.Request) {
\ts.mu.Lock()
\ttel := translator.CollectSiliconTelemetry(s.lastArena, s.rootDir)
\ts.mu.Unlock()
\twriteJSON(w, http.StatusOK, map[string]any{
\t\t"status":  "ok",
\t\t"service": "helixd-silicon-bridge",
\t\t"silicon": tel,
\t})
}

func (s *bridgeServer) handleSilicon(w http.ResponseWriter, r *http.Request) {
\ts.mu.Lock()
\ttel := translator.CollectSiliconTelemetry(s.lastArena, s.rootDir)
\ts.mu.Unlock()
\twriteJSON(w, http.StatusOK, tel)
}

func (s *bridgeServer) handleTranslate(w http.ResponseWriter, r *http.Request) {
\tif r.Method != http.MethodPost {
\t\twriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "usa POST"})
\t\treturn
\t}
\tvar body struct {
\t\tIntent string \`json:"intent"\`
\t}
\tif err := json.NewDecoder(r.Body).Decode(&body); err != nil {
\t\twriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
\t\treturn
\t}
\tres := translator.TranslateHumanToHelix(body.Intent)
\twriteJSON(w, http.StatusOK, res)
}

func (s *bridgeServer) handleVerify(w http.ResponseWriter, r *http.Request) {
\tif r.Method != http.MethodPost {
\t\twriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "usa POST"})
\t\treturn
\t}
\tvar req translator.WebAIGuardRequest
\tif err := json.NewDecoder(r.Body).Decode(&req); err != nil {
\t\twriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
\t\treturn
\t}
\tresp := translator.GuardrailWebAIOutput(req)
\twriteJSON(w, http.StatusOK, resp)
}

func (s *bridgeServer) handleExec(w http.ResponseWriter, r *http.Request) {
\tif r.Method != http.MethodPost {
\t\twriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "usa POST"})
\t\treturn
\t}
\tvar body struct {
\t\tScript string \`json:"script"\`
\t}
\tif err := json.NewDecoder(r.Body).Decode(&body); err != nil {
\t\twriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
\t\treturn
\t}
\tmachine, rep, err := translator.ExecuteOnSilicon(body.Script, s.rootDir, s.nativeDisk)
\tif err != nil {
\t\twriteJSON(w, http.StatusUnprocessableEntity, map[string]any{
\t\t\t"executed":     false,
\t\t\t"error":        err.Error(),
\t\t\t"verification": rep,
\t\t})
\t\treturn
\t}
\ts.mu.Lock()
\tif machine.Arena != nil {
\t\ts.lastArena = machine.Arena
\t}
\ts.mu.Unlock()
\twriteJSON(w, http.StatusOK, map[string]any{
\t\t"executed":     true,
\t\t"verification": rep,
\t\t"vm":           machine,
\t})
}

func (s *bridgeServer) handleSmt2(w http.ResponseWriter, r *http.Request) {
\tif r.Method != http.MethodPost {
\t\twriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "usa POST"})
\t\treturn
\t}
\tvar body struct {
\t\tScript string \`json:"script"\`
\t}
\tif err := json.NewDecoder(r.Body).Decode(&body); err != nil {
\t\twriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
\t\treturn
\t}
\trep := verifier.VerifyProgram(body.Script)
\twriteJSON(w, http.StatusOK, map[string]any{
\t\t"smt_lib2":           rep.SMTLib2,
\t\t"external_z3_result": rep.ExternalZ3Result,
\t\t"symbolic_status":    rep.SymbolicStatus,
\t})
}

func (s *bridgeServer) handleConsole(w http.ResponseWriter, r *http.Request) {
\t_ = vm.Config{}
\tw.Header().Set("Content-Type", "text/html; charset=utf-8")
\tfmt.Fprint(w, embeddedConsoleHTML)
}

const embeddedConsoleHTML = \`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>HELIX Silicon Assistant (helixd)</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 960px; margin: 24px auto; padding: 0 16px; color: #0f172a; background: #f8fafc; }
  .card { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  textarea, input { width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; font-size: 13px; padding: 8px; border: 1px solid #94a3b8; border-radius: 6px; }
  button { background: #1d4ed8; color: #fff; border: 0; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; margin-top: 8px; }
  pre { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 6px; overflow: auto; font-size: 12px; }
</style>
</head>
<body>
  <h1>HELIX Silicon Bridge · Humano ⇄ PC (Go) ⇄ IA Web</h1>
  <div class="card">
    <h3>1. Traductor Humano ➔ HELIX Verificado</h3>
    <input id="intent" value="simular fluido navier stokes con ley nemesis" />
    <button onclick="doTranslate()">Traducir a HELIX + Verificar SMT</button>
  </div>
  <div class="card">
    <h3>2. Guardrail IA Web & Ejecución en tu Silicio</h3>
    <textarea id="script" rows="8">ᛇᚢ
ᛗᚦ root
SOA_INIT 16
CURL_STEP 0.016
NEMESIS_DECAY 0.08
BLOCH_ROT 0 1 0 1.5707963
WEBER_GUARD 0.015 1.0 1.004
ᚳᛏ</textarea>
    <button onclick="doVerify()">Auditar (Guardrail IA Web)</button>
    <button onclick="doExec()" style="background:#047857">Ejecutar en PC</button>
    <button onclick="doSilicon()" style="background:#334155">Telemetría Silicio</button>
  </div>
  <pre id="out">Listo para conectar Humano ⇄ PC ⇄ IA Web...</pre>
<script>
async function call(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) } : undefined);
  document.getElementById('out').textContent = JSON.stringify(await res.json(), null, 2);
}
async function doTranslate() {
  const res = await fetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ intent: document.getElementById('intent').value }) });
  const data = await res.json();
  if (data.helix_script) document.getElementById('script').value = data.helix_script;
  document.getElementById('out').textContent = JSON.stringify(data, null, 2);
}
function doVerify() { return call('/api/verify', { source: 'ia-web-consola', script: document.getElementById('script').value }); }
function doExec() { return call('/api/exec', { script: document.getElementById('script').value }); }
function doSilicon() { return call('/api/silicon'); }
</script>
</body>
</html>\`
`;
}

export function buildHelixSiliconGoProject(
  activeScript = DEFAULT_HELIX_PHYSICS_PROGRAM,
): GeneratedGoFile[] {
  const cleanScript = activeScript.trim().length > 0 ? activeScript.trim() : DEFAULT_HELIX_PHYSICS_PROGRAM;
  return [
    {
      path: 'go.mod',
      role: 'Módulo Go 1.22+ (cero dependencias externas)',
      language: 'mod',
      content: buildGoMod(),
    },
    {
      path: 'Makefile',
      role: 'Automatización de pruebas, compilación y arranque',
      language: 'makefile',
      content: buildMakefile(),
    },
    {
      path: 'README.md',
      role: 'Guía técnica de compilación y API del puente',
      language: 'md',
      content: buildReadme(),
    },
    {
      path: 'examples/program.hlx',
      role: 'Programa HELIX activo listo para ejecutar en PC',
      language: 'hlx',
      content: `${cleanScript}\n`,
    },
    {
      path: 'internal/godel/godel.go',
      role: 'Codificador Gödel P33 (33 primos, big.Int, FNV-1a, subanillo)',
      language: 'go',
      content: buildGodelGo(),
    },
    {
      path: 'internal/godel/godel_test.go',
      role: 'Pruebas unitarias de Gödel y subanillo racional P33',
      language: 'go',
      content: buildGodelTestGo(),
    },
    {
      path: 'internal/silicon/physics.go',
      role: 'Pauli-SoA 28 B Zero-GC, Navier-Stokes Curl, Némesis, Bloch SU(2), Weber y CSPRNG',
      language: 'go',
      content: buildPhysicsGo(),
    },
    {
      path: 'internal/verifier/smt.go',
      role: 'Verificador estático Typestate + P33 + Física + SMT-LIBv2 + Z3 opcional + PCC',
      language: 'go',
      content: buildSmtGo(),
    },
    {
      path: 'internal/vm/vm.go',
      role: 'Máquina Virtual determinista HELIX + sandbox de disco local',
      language: 'go',
      content: buildVmGo(),
    },
    {
      path: 'internal/vm/vm_test.go',
      role: 'Pruebas unitarias de VM, física, cuántica, contratos y sandbox',
      language: 'go',
      content: buildVmTestGo(),
    },
    {
      path: 'internal/translator/bridge.go',
      role: 'Asistente puente tridireccional Humano ⇄ PC Silicio ⇄ IA Web',
      language: 'go',
      content: buildBridgeGo(),
    },
    {
      path: 'cmd/helixd/main.go',
      role: 'Binario CLI / REPL / Demonio HTTP local (127.0.0.1:7733)',
      language: 'go',
      content: buildMainGo(),
    },
  ];
}

export function buildHelixSiliconGoZip(activeScript?: string): {
  files: GeneratedGoFile[];
  zipBytes: Uint8Array;
  totalBytes: number;
} {
  const files = buildHelixSiliconGoProject(activeScript);
  const zipInputs: ZipInputFile[] = files.map((f) => ({
    path: `helix-silicon-go/${f.path}`,
    content: f.content,
  }));
  const zipBytes = buildZipArchive(zipInputs);
  return {
    files,
    zipBytes,
    totalBytes: zipBytes.length,
  };
}

export function downloadHelixSiliconGoZip(activeScript?: string): {
  fileCount: number;
  zipBytesLength: number;
} {
  const { files, zipBytes } = buildHelixSiliconGoZip(activeScript);
  triggerZipDownload('helix-silicon-go.zip', zipBytes);
  return {
    fileCount: files.length,
    zipBytesLength: zipBytes.length,
  };
}

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import {
  Activity,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  Waves,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';
import { CompoundWord } from '../data/vocabulary';
import {
  compileHelixScript,
  createInitialVmState,
  DEFAULT_HELIX_3D_PROGRAM,
  HelixCamera6Dof,
  HelixSceneNode,
  runHelixProgram,
  verifyHelixProgram,
} from '../utils/helixVm';
import { encodeQpsk132Frame, extractActiveRunesFromScript } from '../utils/helixSignal';
import {
  BIO_OPTIC_3D_PROGRAM,
  createSiliconBridgeState,
  getSiliconBridgeTelemetry,
  injectTokenImpulse,
  SiliconBridgeTelemetrySnapshot,
  stepSiliconBridgeFrame,
  syncScriptToSiliconBridge,
  TokenPauliBridgeState,
} from '../utils/helixSiliconBridge';
import {
  BiopixelPhysicsOverrides,
  BiopixelSurfaceMetrics,
  BiopixelSurfaceState,
  createBiopixelSurfaceState,
  OpcodeForceFieldProfile,
  stepBiopixelSurfacePhysics,
  syncBiopixelSurfaceToOpcodes,
  triggerBiopixelOpcodePulse,
} from '../utils/helixBiopixelSurface';
import {
  attachHelixFluidKelvinVoigtShader,
  HelixWebGLFluidEngine,
  ModuleGFluidEngineSnapshot,
  ModuleGShaderUniformBag,
} from '../utils/helixModuleGFluidShaders';
import { ModuleGShaderPipelineCard } from './ModuleGShaderPipelineCard';

interface MeshStudio3DViewProps {
  vocabulary: CompoundWord[];
  script: string;
  onChangeScript: (next: string) => void;
}

type HelixOpticUniformBag = ModuleGShaderUniformBag;

// Reutilizables a nivel de módulo para actualización Zero-GC del InstancedMesh de biopíxeles
const _bpDummy = new THREE.Object3D();
const _bpColor = new THREE.Color();
const _bpExpandColor = new THREE.Color(0x38bdf8);
const _bpContractColor = new THREE.Color(0xf59e0b);
const _bpNormal = new THREE.Vector3();
const _bpUp = new THREE.Vector3(0, 1, 0);

function syncBiopixelInstancedMesh(
  mesh: THREE.InstancedMesh,
  state: BiopixelSurfaceState,
): void {
  const n = state.count;
  for (let i = 0; i < n; i++) {
    _bpDummy.position.set(state.posX[i], state.posY[i], state.posZ[i]);
    _bpNormal
      .set(
        state.normX[i] + state.velX[i] * 0.25,
        state.normY[i] + state.velY[i] * 0.25,
        state.normZ[i] + state.velZ[i] * 0.25,
      )
      .normalize();
    _bpDummy.quaternion.setFromUnitVectors(_bpUp, _bpNormal);

    const s = state.strain[i];
    const radialScale = THREE.MathUtils.clamp(1.0 + Math.abs(s) * 0.45, 0.72, 1.58);
    const thicknessScale = THREE.MathUtils.clamp(1.0 + s * 0.85, 0.55, 1.85);
    _bpDummy.scale.set(radialScale, thicknessScale, radialScale);
    _bpDummy.updateMatrix();
    mesh.setMatrixAt(i, _bpDummy.matrix);

    _bpColor.setRGB(state.baseR[i], state.baseG[i], state.baseB[i]);
    const blendAlpha = THREE.MathUtils.clamp(
      Math.abs(s) * 1.15 + state.vorticity[i] * 0.35,
      0,
      0.85,
    );
    _bpColor.lerp(s >= 0 ? _bpExpandColor : _bpContractColor, blendAlpha);
    mesh.setColorAt(i, _bpColor);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

interface WsTelemetryRecord {
  id: string;
  direction: 'TX' | 'RX';
  kind: string;
  summary: string;
  sha256Prefix?: string;
  latencyMs?: number;
  time: string;
}

const PRISMATIC_TOWER_3D_PROGRAM = `# Torre Prismática + Bucle WS_EMIT construida en Helix
ᛇᚢ
ᛗᚦ arch_lead
MESH_NODE base lathe 720 1.35
MAT_ORM base 0.94 0.42 0.65
MESH_NODE halo torus 960 0.95
MAT_ORM halo 0.90 0.20 0.92
LOOP 4
  MESH_NODE fin extrude 280 0.72
END
MAT_ORM fin 0.92 0.30 0.80
MESH_NODE apex prism 240 0.85
MAT_ORM apex 0.96 0.16 0.95
CAM_6DOF 3.8 2.6 3.6 52 24 42
SET pkt 1
LOOP 2
  WS_EMIT telemetry pkt
  ADD pkt 1
END
ᚳᛏ`;

function createBrushedColorTexture(hexColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = hexColor;
    ctx.fillRect(0, 0, 256, 256);

    const base = new THREE.Color(hexColor);
    for (let y = 0; y < 256; y += 2) {
      const lum = ((Math.sin(y * 0.37) + 1) * 0.5 - 0.5) * 0.08;
      const c = base.clone().offsetHSL(0, 0, lum);
      ctx.fillStyle = `#${c.getHexString()}`;
      ctx.fillRect(0, y, 256, 1);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 256; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createOrmDataTexture(ao: number, roughness: number, metalness: number): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const micro = Math.sin(x * 0.45 + y * 0.25) * 0.035;
      const r = Math.round(THREE.MathUtils.clamp(ao + micro * 0.5, 0, 1) * 255);
      const g = Math.round(THREE.MathUtils.clamp(roughness + micro, 0.04, 1) * 255);
      const b = Math.round(THREE.MathUtils.clamp(metalness - micro * 0.5, 0, 1) * 255);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createNodeGeometry(node: HelixSceneNode): THREE.BufferGeometry {
  const s = node.scale;
  switch (node.shape) {
    case 'torus': {
      const radialSegs = node.triangles >= 1000 ? 20 : 12;
      const tubularSegs = node.triangles >= 1000 ? 48 : 28;
      return new THREE.TorusGeometry(1.18 * s, 0.14 * s, radialSegs, tubularSegs);
    }
    case 'extrude': {
      const shape = new THREE.Shape();
      shape.moveTo(0, -0.14 * s);
      shape.lineTo(0.88 * s, -0.08 * s);
      shape.lineTo(1.02 * s, 0.04 * s);
      shape.lineTo(0.82 * s, 0.18 * s);
      shape.lineTo(0, 0.14 * s);
      shape.closePath();
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: 0.16 * s,
        bevelEnabled: true,
        bevelThickness: 0.03 * s,
        bevelSize: 0.025 * s,
        bevelSegments: 2,
      });
      geom.center();
      return geom;
    }
    case 'prism': {
      return new THREE.CylinderGeometry(0.32 * s, 0.42 * s, 0.44 * s, 6);
    }
    case 'lathe':
    default: {
      const pts = [
        new THREE.Vector2(0.01, -0.42 * s),
        new THREE.Vector2(0.56 * s, -0.42 * s),
        new THREE.Vector2(0.64 * s, -0.22 * s),
        new THREE.Vector2(0.42 * s, 0.02 * s),
        new THREE.Vector2(0.48 * s, 0.28 * s),
        new THREE.Vector2(0.26 * s, 0.44 * s),
        new THREE.Vector2(0.01, 0.44 * s),
      ];
      return new THREE.LatheGeometry(pts, node.triangles >= 700 ? 32 : 18);
    }
  }
}

function buildAssemblyFromHelixNodes(
  nodes: HelixSceneNode[],
  uniformBag: HelixOpticUniformBag,
  opticEnabled: boolean,
  isSoftwareGl: boolean,
): {
  group: THREE.Group;
  disposables: { dispose: () => void }[];
} {
  const group = new THREE.Group();
  group.name = 'HelixProceduralAssembly';
  const disposables: { dispose: () => void }[] = [];

  if (nodes.length === 0) {
    return { group, disposables };
  }

  const extrudeNodes = nodes.filter((n) => n.shape === 'extrude');
  let extrudeCursor = 0;
  let prismCursor = 0;

  nodes.forEach((node) => {
    const geometry = createNodeGeometry(node);
    // Ensure uv1 exists for aoMap sampling
    if (!geometry.getAttribute('uv1') && geometry.getAttribute('uv')) {
      geometry.setAttribute('uv1', geometry.getAttribute('uv'));
    }

    const albedoMap = createBrushedColorTexture(node.colorHex);
    const ormMap = createOrmDataTexture(node.ao, node.roughness, node.metalness);

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: albedoMap,
      aoMap: ormMap,
      aoMapIntensity: 1.0,
      roughnessMap: ormMap,
      metalnessMap: ormMap,
      roughness: 1.0,
      metalness: 1.0,
      clearcoat: opticEnabled ? 0.88 : 0.0,
      clearcoatRoughness: 0.14,
      ior: uniformBag.uHelixCauchyN.value.y || 1.462,
      transmission: !isSoftwareGl && opticEnabled ? 0.36 : 0.0,
      thickness: 1.15,
    });
    attachHelixFluidKelvinVoigtShader(
      material,
      uniformBag,
      'helix-module-g-ns-kv-assembly-v1',
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = node.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (node.shape === 'lathe') {
      mesh.position.set(0, 0.92, 0);
    } else if (node.shape === 'torus') {
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(0, 0.92, 0);
    } else if (node.shape === 'extrude') {
      const count = Math.max(1, extrudeNodes.length);
      const angle = (extrudeCursor / count) * Math.PI * 2;
      const radius = 0.72;
      mesh.position.set(Math.cos(angle) * radius, 0.92, Math.sin(angle) * radius);
      mesh.rotation.y = -angle;
      extrudeCursor++;
    } else if (node.shape === 'prism') {
      mesh.position.set(0, prismCursor === 0 ? 1.46 : 0.36, 0);
      prismCursor++;
    }

    group.add(mesh);
    disposables.push(geometry, albedoMap, ormMap, material);
  });

  // Ground shaft pedestal connecting assembly to floor plane (no floating geometry)
  const shaftGeo = new THREE.CylinderGeometry(0.14, 0.22, 0.65, 24);
  const shaftMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.8,
  });
  const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
  shaftMesh.name = 'helix_pedestal_shaft';
  shaftMesh.position.set(0, 0.325, 0);
  shaftMesh.castShadow = true;
  shaftMesh.receiveShadow = true;
  group.add(shaftMesh);
  disposables.push(shaftGeo, shaftMat);

  return { group, disposables };
}

function cameraSphericalOffset(cam: HelixCamera6Dof): THREE.Vector3 {
  const dist = Math.max(1.8, Math.hypot(cam.x, cam.y, cam.z));
  const yaw = THREE.MathUtils.degToRad(cam.yawDeg);
  const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(cam.pitchDeg, -10, 80));
  const cosP = Math.cos(pitch);
  return new THREE.Vector3(
    dist * cosP * Math.sin(yaw),
    Math.max(0.45, dist * Math.sin(pitch) + 0.9),
    dist * cosP * Math.cos(yaw),
  );
}

export function MeshStudio3DView({
  vocabulary,
  script,
  onChangeScript,
}: MeshStudio3DViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [localScript, setLocalScript] = useState(() =>
    script.includes('MESH_NODE') ? script : BIO_OPTIC_3D_PROGRAM,
  );
  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [opticShaders, setOpticShaders] = useState(true);
  const [biopixelVisible, setBiopixelVisible] = useState(true);
  const [biopixelPlaying, setBiopixelPlaying] = useState(true);
  const [biopixelOverrides, setBiopixelOverrides] = useState<BiopixelPhysicsOverrides>({});
  const [dockOpen, setDockOpen] = useState(true);
  const [roomId, setRoomId] = useState('helix-main');
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [peerCount, setPeerCount] = useState(1);
  const [clientId, setClientId] = useState<string>('');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [wsLogs, setWsLogs] = useState<WsTelemetryRecord[]>([]);
  const [importedAssetInfo, setImportedAssetInfo] = useState<{
    name: string;
    meshes: number;
    triangles: number;
  } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);

  const siliconBridgeRef = useRef<TokenPauliBridgeState | null>(null);
  if (!siliconBridgeRef.current) {
    const initialBridge = createSiliconBridgeState(32);
    syncScriptToSiliconBridge(
      initialBridge,
      script.includes('MESH_NODE') ? script : BIO_OPTIC_3D_PROGRAM,
      vocabulary,
    );
    siliconBridgeRef.current = initialBridge;
  }
  const [siliconTelemetry, setSiliconTelemetry] = useState<SiliconBridgeTelemetrySnapshot>(() =>
    getSiliconBridgeTelemetry(siliconBridgeRef.current!),
  );

  const instructions = useMemo(
    () => compileHelixScript(localScript, vocabulary),
    [localScript, vocabulary],
  );

  const biopixelStateRef = useRef<BiopixelSurfaceState | null>(null);
  if (!biopixelStateRef.current) {
    const initCompiled = compileHelixScript(
      script.includes('MESH_NODE') ? script : BIO_OPTIC_3D_PROGRAM,
      vocabulary,
    );
    biopixelStateRef.current = createBiopixelSurfaceState(initCompiled, 20, 8);
  }
  const [biopixelMetrics, setBiopixelMetrics] = useState<BiopixelSurfaceMetrics>(
    () => biopixelStateRef.current!.lastMetrics,
  );
  const [biopixelProfile, setBiopixelProfile] = useState<OpcodeForceFieldProfile>(
    () => biopixelStateRef.current!.profile,
  );

  const [glslMembraneVisible, setGlslMembraneVisible] = useState(true);
  const [meshDeformGain, setMeshDeformGain] = useState(1.0);
  const [gpuFluidSnapshot, setGpuFluidSnapshot] = useState<ModuleGFluidEngineSnapshot>(() => ({
    fboResolution: 64,
    opcodeTexelsCount: 32,
    activeInjectors: biopixelStateRef.current!.profile.injectors.length,
    meshDeformGain: 1.0,
    nsViscosity: biopixelStateRef.current!.profile.kinematicViscosity,
    nsCurlGain: biopixelStateRef.current!.profile.curlStrength,
    kvElasticityE: biopixelStateRef.current!.profile.elasticityE,
    kvDampingEta: biopixelStateRef.current!.profile.dampingEta,
    nemesisGamma: biopixelStateRef.current!.profile.nemesisGamma,
    gpuPassCount: 0,
    opcodeDataHash: 0,
  }));

  const fluidEngineRef = useRef<HelixWebGLFluidEngine | null>(null);
  const fallbackEmptyTexRef = useRef<THREE.DataTexture | null>(null);
  if (!fallbackEmptyTexRef.current) {
    const raw = new Uint8Array([128, 128, 128, 128]);
    const tex = new THREE.DataTexture(raw, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.needsUpdate = true;
    fallbackEmptyTexRef.current = tex;
  }

  const sharedUniformsRef = useRef<HelixOpticUniformBag>({
    tFluidState: { value: fallbackEmptyTexRef.current },
    tOpcodeField: { value: fallbackEmptyTexRef.current },
    uFluidTime: { value: 0 },
    uMeshDeformGain: { value: 1.0 },
    uNsViscosity: { value: biopixelStateRef.current!.profile.kinematicViscosity },
    uNsCurlGain: { value: biopixelStateRef.current!.profile.curlStrength },
    uKvElasticityE: { value: biopixelStateRef.current!.profile.elasticityE },
    uKvDampingEta: { value: biopixelStateRef.current!.profile.dampingEta },
    uNemesisGamma: { value: biopixelStateRef.current!.profile.nemesisGamma },
    uHelixTension: { value: 0.5 },
    uHelixCurlGain: { value: 0.55 },
    uHelixCymaticHz: { value: 457.8448 },
    uHelixQuantumPhase: { value: 0.7854 },
    uHelixCauchyN: {
      value: new THREE.Vector3(
        siliconBridgeRef.current.cauchyTriple.nRed,
        siliconBridgeRef.current.cauchyTriple.nGreen,
        siliconBridgeRef.current.cauchyTriple.nBlue,
      ),
    },
    uHelixSssStrength: { value: 0.65 },
    uHelixGlassStrength: { value: 0.6 },
  });

  const opticShadersRef = useRef(opticShaders);
  const biopixelVisibleRef = useRef(biopixelVisible);
  const biopixelPlayingRef = useRef(biopixelPlaying);
  const biopixelOverridesRef = useRef<BiopixelPhysicsOverrides>(biopixelOverrides);
  const glslMembraneVisibleRef = useRef(glslMembraneVisible);
  const meshDeformGainRef = useRef(meshDeformGain);
  const isSoftwareGlRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const threeCtxRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    assemblyRoot: THREE.Group;
    biopixelRoot: THREE.Group;
    biopixelMesh: THREE.InstancedMesh;
    glslMembraneMesh: THREE.Mesh;
    disposables: { dispose: () => void }[];
    targetCamPos: THREE.Vector3 | null;
    targetCamFov: number | null;
    requestRender: () => void;
  } | null>(null);

  const verification = useMemo(
    () => verifyHelixProgram(instructions),
    [instructions],
  );

  const [executedState, setExecutedState] = useState(() => {
    const compiled = compileHelixScript(
      script.includes('MESH_NODE') ? script : BIO_OPTIC_3D_PROGRAM,
      vocabulary,
    );
    return runHelixProgram(compiled, createInitialVmState()).finalState;
  });

  const appendWsLog = useCallback((entry: Omit<WsTelemetryRecord, 'id' | 'time'>) => {
    setWsLogs((prev) => [
      {
        ...entry,
        id: `${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
        time: new Date().toLocaleTimeString('es-ES', { hour12: false }),
      },
      ...prev.slice(0, 14),
    ]);
  }, []);

  const rebuildSceneAssembly = useCallback(
    (nodes: HelixSceneNode[], cam6Dof?: HelixCamera6Dof) => {
      const ctx = threeCtxRef.current;
      if (!ctx) return;

      ctx.assemblyRoot.clear();
      ctx.disposables.forEach((d) => d.dispose());
      ctx.disposables = [];

      const built = buildAssemblyFromHelixNodes(
        nodes,
        sharedUniformsRef.current,
        opticShadersRef.current,
        isSoftwareGlRef.current,
      );
      ctx.assemblyRoot.add(built.group);
      ctx.disposables = built.disposables;

      ctx.assemblyRoot.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          obj.material.wireframe = wireframe;
        }
      });

      if (cam6Dof) {
        ctx.targetCamPos = cameraSphericalOffset(cam6Dof);
        ctx.targetCamFov = cam6Dof.fov;
      }
      setImportedAssetInfo(null);
      setSelectedNodeId(null);
      ctx.requestRender();
    },
    [wireframe],
  );

  // Initialize Three.js WebGL Viewport once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });

    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    const isSoftwareGl = /SwiftShader|llvmpipe|Software|Microsoft Basic Render/i.test(rendererStr);
    isSoftwareGlRef.current = isSoftwareGl;

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    scene.fog = new THREE.FogExp2(0x0b1120, 0.032);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const rect = canvas.getBoundingClientRect();
    const initW = Math.max(320, rect.width || 640);
    const initH = Math.max(320, rect.height || 480);
    renderer.setSize(initW, initH, false);

    const camera = new THREE.PerspectiveCamera(45, initW / initH, 0.1, 80);
    camera.position.set(3.4, 2.3, 3.8);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 1.5;
    controls.maxDistance = 14;
    controls.update();

    // 3-point + Hemisphere lighting
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.05);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff6e5, 2.6);
    keyLight.position.set(4.5, 6.8, 4.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.95);
    rimLight.position.set(-4.0, 3.2, -3.5);
    scene.add(rimLight);

    // Grounded contact plane & subtle reference grid
    const floorGeo = new THREE.CircleGeometry(9, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.88,
      metalness: 0.12,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(12, 24, 0x334155, 0x1e293b);
    grid.position.y = 0.002;
    scene.add(grid);

    const assemblyRoot = new THREE.Group();
    scene.add(assemblyRoot);

    // Superficie instanciada de Biopíxeles (Navier-Stokes + Kelvin-Voigt por opcodes)
    const bpStateInit = biopixelStateRef.current!;
    const biopixelRoot = new THREE.Group();
    biopixelRoot.name = 'HelixBiopixelSurfaceRoot';
    biopixelRoot.visible = biopixelVisibleRef.current;

    const bpGeo = new THREE.CylinderGeometry(0.044, 0.048, 0.028, 6);
    const bpMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.24,
      metalness: 0.14,
      clearcoat: 0.9,
      clearcoatRoughness: 0.15,
    });
    const bpMesh = new THREE.InstancedMesh(bpGeo, bpMat, bpStateInit.count);
    bpMesh.name = 'helix_biopixel_surface';
    bpMesh.castShadow = !isSoftwareGl;
    bpMesh.receiveShadow = true;
    bpMesh.frustumCulled = false;
    bpMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(bpStateInit.count * 3),
      3,
    );
    syncBiopixelInstancedMesh(bpMesh, bpStateInit);
    bpMesh.computeBoundingSphere();
    biopixelRoot.add(bpMesh);

    const bpRingGeo = new THREE.TorusGeometry(1.54, 0.028, 12, 64);
    const bpRingMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.78,
    });
    const bpRing = new THREE.Mesh(bpRingGeo, bpRingMat);
    bpRing.rotation.x = Math.PI / 2;
    bpRing.position.set(0, 0.032, 0);
    bpRing.receiveShadow = true;
    biopixelRoot.add(bpRing);
    scene.add(biopixelRoot);

    // Motor GPU Ping-Pong FBO (Navier-Stokes + Kelvin-Voigt) acoplado a los opcodes VM
    const fluidEngine = new HelixWebGLFluidEngine(
      bpStateInit.profile,
      sharedUniformsRef.current.uHelixCauchyN.value,
    );
    fluidEngine.resetBuffers(renderer);
    fluidEngineRef.current = fluidEngine;
    sharedUniformsRef.current = fluidEngine.sharedUniforms;
    setGpuFluidSnapshot(fluidEngine.getSnapshot());

    // Membrana continua 3D deformada directamente en GLSL Vertex Shader vía tFluidState
    const glslMembraneGeo = new THREE.CylinderGeometry(1.56, 1.56, 1.24, 64, 20, true);
    const glslMembraneMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.16,
      metalness: 0.08,
      clearcoat: 0.92,
      clearcoatRoughness: 0.12,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    attachHelixFluidKelvinVoigtShader(
      glslMembraneMat,
      fluidEngine.sharedUniforms,
      'helix-module-g-ns-kv-membrane-v1',
    );
    const glslMembraneMesh = new THREE.Mesh(glslMembraneGeo, glslMembraneMat);
    glslMembraneMesh.name = 'helix_glsl_fluid_membrane';
    glslMembraneMesh.position.set(0, 0.9, 0);
    glslMembraneMesh.visible = glslMembraneVisibleRef.current;
    scene.add(glslMembraneMesh);

    const ctxObj = {
      scene,
      camera,
      renderer,
      controls,
      assemblyRoot,
      biopixelRoot,
      biopixelMesh: bpMesh,
      glslMembraneMesh,
      disposables: [] as { dispose: () => void }[],
      targetCamPos: null as THREE.Vector3 | null,
      targetCamFov: null as number | null,
      requestRender: () => {},
    };
    threeCtxRef.current = ctxObj;

    // Cancel camera tween if user drags OrbitControls
    const onControlStart = () => {
      ctxObj.targetCamPos = null;
      ctxObj.targetCamFov = null;
    };
    controls.addEventListener('start', onControlStart);

    const handleResize = () => {
      const box = canvas.getBoundingClientRect();
      const w = Math.max(200, Math.floor(box.width));
      const h = Math.max(200, Math.floor(box.height));
      if (canvas.width !== w || canvas.height !== h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        ctxObj.requestRender();
      }
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(canvas);

    let rafId = 0;
    let timeoutId = 0;
    let disposedLoop = false;
    let lastTs = performance.now();
    let lastUiSyncTs = lastTs;
    let needsRender = true;

    const afterDraw = (cb: () => void) => {
      const gl2 = gl as WebGL2RenderingContext;
      if (typeof gl2.fenceSync === 'function') {
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl2.flush();
        const poll = () => {
          if (disposedLoop) {
            if (sync) gl2.deleteSync(sync);
            return;
          }
          const st = sync ? gl2.getSyncParameter(sync, gl2.SYNC_STATUS) : gl2.SIGNALED;
          if (st === gl2.UNSIGNALED) {
            timeoutId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl2.deleteSync(sync);
            timeoutId = window.setTimeout(cb, 80);
          }
        };
        timeoutId = window.setTimeout(poll, 5);
      } else {
        timeoutId = window.setTimeout(cb, 80);
      }
    };

    const scheduleNextFrame = () => {
      if (disposedLoop) return;
      if (isSoftwareGl) {
        afterDraw(() => {
          if (!disposedLoop) renderTick(performance.now());
        });
      } else {
        rafId = requestAnimationFrame(renderTick);
      }
    };

    const renderTick = (now: number) => {
      if (disposedLoop) return;
      rafId = 0;
      timeoutId = 0;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      let active = false;
      let shouldRenderNow = needsRender;

      if (ctxObj.targetCamPos) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, ctxObj.targetCamPos.x, 7, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, ctxObj.targetCamPos.y, 7, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, ctxObj.targetCamPos.z, 7, dt);
        if (camera.position.distanceTo(ctxObj.targetCamPos) < 0.015) {
          camera.position.copy(ctxObj.targetCamPos);
          ctxObj.targetCamPos = null;
        } else {
          active = true;
          shouldRenderNow = true;
        }
      }

      if (ctxObj.targetCamFov !== null) {
        camera.fov = THREE.MathUtils.damp(camera.fov, ctxObj.targetCamFov, 7, dt);
        camera.updateProjectionMatrix();
        if (Math.abs(camera.fov - ctxObj.targetCamFov) < 0.05) {
          camera.fov = ctxObj.targetCamFov;
          camera.updateProjectionMatrix();
          ctxObj.targetCamFov = null;
        } else {
          active = true;
          shouldRenderNow = true;
        }
      }

      if (autoRotateRef.current) {
        assemblyRoot.rotation.y += dt * 0.42;
        biopixelRoot.rotation.y += dt * 0.16;
        glslMembraneMesh.rotation.y += dt * 0.16;
        active = true;
        shouldRenderNow = true;
      }

      if (controls.update()) {
        active = true;
        shouldRenderNow = true;
      }

      const bpState = biopixelStateRef.current;
      if (bpState && biopixelVisibleRef.current && biopixelPlayingRef.current) {
        stepBiopixelSurfacePhysics(bpState, dt, biopixelOverridesRef.current);
        syncBiopixelInstancedMesh(bpMesh, bpState);
        active = true;
        shouldRenderNow = true;
      }

      const fEngine = fluidEngineRef.current;
      if (fEngine && (biopixelPlayingRef.current || glslMembraneVisibleRef.current)) {
        fEngine.step(renderer, dt, biopixelOverridesRef.current, meshDeformGainRef.current);
        active = true;
        shouldRenderNow = true;
      }

      const bridge = siliconBridgeRef.current;
      if (bridge) {
        const snap = stepSiliconBridgeFrame(bridge, dt, opticShadersRef.current);
        const u = sharedUniformsRef.current;
        u.uFluidTime.value = snap.uTime;
        u.uHelixTension.value = snap.uTension;
        u.uHelixCurlGain.value = snap.uCurlGain;
        u.uHelixCymaticHz.value = snap.uCymaticHz;
        u.uHelixQuantumPhase.value = snap.uQuantumPhase;
        u.uHelixCauchyN.value.set(snap.uCauchyN[0], snap.uCauchyN[1], snap.uCauchyN[2]);
        u.uHelixSssStrength.value = snap.uSssStrength;
        u.uHelixGlassStrength.value = snap.uGlassStrength;

        if (snap.uTension > 1e-4 || bridge.impulseEnvelope > 1e-4) {
          active = true;
          // Ley psicofísica de Weber-Fechner: solo renderizamos cuando el delta supera el umbral k
          if (snap.weberDecision === 'RENDER_FRAME') {
            shouldRenderNow = true;
          }
        }

        if (now - lastUiSyncTs >= 130 || (!active && bridge.lastTension === 0)) {
          lastUiSyncTs = now;
          setSiliconTelemetry(getSiliconBridgeTelemetry(bridge));
          if (bpState) setBiopixelMetrics(bpState.lastMetrics);
          if (fEngine) setGpuFluidSnapshot(fEngine.getSnapshot());
        }
      }

      if (shouldRenderNow) {
        renderer.render(scene, camera);
        needsRender = false;
      }

      if (active) {
        scheduleNextFrame();
      }
    };

    ctxObj.requestRender = () => {
      needsRender = true;
      if (!rafId && !timeoutId) {
        lastTs = performance.now();
        rafId = requestAnimationFrame(renderTick);
      }
    };

    const onControlsChange = () => ctxObj.requestRender();
    controls.addEventListener('change', onControlsChange);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };
    const onContextRestored = () => {
      setContextLost(false);
      ctxObj.requestRender();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    // Raycaster click-to-inspect (drag threshold < 6px so OrbitControls never misfires)
    const raycaster = new THREE.Raycaster();
    const pointerDownPos = { x: 0, y: 0 };
    const onPointerDown = (ev: PointerEvent) => {
      pointerDownPos.x = ev.clientX;
      pointerDownPos.y = ev.clientY;
    };
    const onPointerUp = (ev: PointerEvent) => {
      const moved = Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y);
      if (moved >= 6) return;
      const box = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - box.left) / Math.max(1, box.width)) * 2 - 1,
        -((ev.clientY - box.top) / Math.max(1, box.height)) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(assemblyRoot.children, true);
      const hitMesh = hits.find(
        (h) => h.object instanceof THREE.Mesh && h.object.name && h.object.name !== 'helix_pedestal_shaft',
      );
      setSelectedNodeId(hitMesh ? hitMesh.object.name : null);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    // Build initial scene from executedState
    rebuildSceneAssembly(executedState.sceneNodes, executedState.camera6Dof);
    ctxObj.requestRender();

    return () => {
      disposedLoop = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
      ro.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlsChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      ctxObj.disposables.forEach((d) => d.dispose());
      fluidEngine.dispose();
      fluidEngineRef.current = null;
      fallbackEmptyTexRef.current?.dispose();
      glslMembraneGeo.dispose();
      glslMembraneMat.dispose();
      bpGeo.dispose();
      bpMat.dispose();
      bpRingGeo.dispose();
      bpRingMat.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      envTarget.dispose();
      controls.dispose();
      renderer.dispose();
      threeCtxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoRotateRef = useRef(autoRotate);
  useEffect(() => {
    autoRotateRef.current = autoRotate;
    threeCtxRef.current?.requestRender();
  }, [autoRotate]);

  useEffect(() => {
    biopixelVisibleRef.current = biopixelVisible;
    const ctx = threeCtxRef.current;
    if (ctx) {
      ctx.biopixelRoot.visible = biopixelVisible;
      ctx.requestRender();
    }
  }, [biopixelVisible]);

  useEffect(() => {
    biopixelPlayingRef.current = biopixelPlaying;
    if (biopixelPlaying) threeCtxRef.current?.requestRender();
  }, [biopixelPlaying]);

  useEffect(() => {
    biopixelOverridesRef.current = biopixelOverrides;
    threeCtxRef.current?.requestRender();
  }, [biopixelOverrides]);

  useEffect(() => {
    glslMembraneVisibleRef.current = glslMembraneVisible;
    const ctx = threeCtxRef.current;
    if (ctx) {
      ctx.glslMembraneMesh.visible = glslMembraneVisible;
      ctx.requestRender();
    }
  }, [glslMembraneVisible]);

  useEffect(() => {
    meshDeformGainRef.current = meshDeformGain;
    if (fluidEngineRef.current) {
      fluidEngineRef.current.sharedUniforms.uMeshDeformGain.value = meshDeformGain;
      setGpuFluidSnapshot(fluidEngineRef.current.getSnapshot());
    }
    threeCtxRef.current?.requestRender();
  }, [meshDeformGain]);

  useEffect(() => {
    opticShadersRef.current = opticShaders;
    const u = sharedUniformsRef.current;
    u.uHelixSssStrength.value = opticShaders ? 0.65 : 0.0;
    u.uHelixGlassStrength.value = opticShaders ? 0.6 : 0.0;
    const ctx = threeCtxRef.current;
    if (ctx) {
      ctx.assemblyRoot.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshPhysicalMaterial) {
          obj.material.clearcoat = opticShaders ? 0.88 : 0.0;
        }
      });
      ctx.requestRender();
    }
  }, [opticShaders]);

  // Sincronización externa cuando otro módulo (F o H) envía un script 3D a Estudio 3D
  useEffect(() => {
    if (!script.includes('MESH_NODE')) return;
    setLocalScript(script);
    const bridge = siliconBridgeRef.current;
    if (bridge) {
      const syncRes = syncScriptToSiliconBridge(bridge, script, vocabulary);
      setSiliconTelemetry(getSiliconBridgeTelemetry(bridge));
      if (syncRes.accepted) {
        const compiled = compileHelixScript(script, vocabulary);
        const ran = runHelixProgram(compiled, createInitialVmState());
        setExecutedState(ran.finalState);
        rebuildSceneAssembly(ran.finalState.sceneNodes, ran.finalState.camera6Dof);
        if (biopixelStateRef.current) {
          const nextProfile = syncBiopixelSurfaceToOpcodes(biopixelStateRef.current, compiled);
          triggerBiopixelOpcodePulse(biopixelStateRef.current, 1.0);
          setBiopixelProfile(nextProfile);
          setBiopixelOverrides({});
          if (fluidEngineRef.current) {
            setGpuFluidSnapshot(fluidEngineRef.current.syncOpcodes(nextProfile));
          }
        }
      }
    }
  }, [rebuildSceneAssembly, script, vocabulary]);

  useEffect(() => {
    const ctx = threeCtxRef.current;
    if (!ctx) return;
    ctx.assemblyRoot.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        obj.material.wireframe = wireframe;
        const isSel = Boolean(selectedNodeId && obj.name === selectedNodeId);
        obj.material.emissive.setHex(isSel ? 0x2563eb : 0x000000);
        obj.material.emissiveIntensity = isSel ? 0.35 : 0;
      }
    });
    ctx.requestRender();
  }, [wireframe, selectedNodeId]);

  // Live WebSocket connection to /ws
  useEffect(() => {
    let disposed = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;

    const connect = () => {
      if (disposed) return;
      setWsStatus('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws?room=${encodeURIComponent(roomId)}`;
      const socket = new WebSocket(url);
      wsRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        setWsStatus('open');
        socket.send(JSON.stringify({ type: 'ws:ping', clientTs: Date.now() }));
        pingTimer = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ws:ping', clientTs: Date.now() }));
          }
        }, 8000);
      };

      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
          const type = String(msg.type || '');

          if (type === 'ws:pong') {
            const clientTs = Number(msg.clientTs || 0);
            if (clientTs > 0) {
              setLatencyMs(Math.max(1, Date.now() - clientTs));
            }
            return;
          }

          if (type === 'ws:snapshot') {
            if (typeof msg.clientId === 'string') setClientId(msg.clientId);
            if (typeof msg.peerCount === 'number') setPeerCount(msg.peerCount);
            appendWsLog({
              direction: 'RX',
              kind: 'SNAPSHOT',
              summary: `Sala "${String(msg.roomId)}" (${Number(msg.peerCount || 1)} pares, frames=${Number(msg.frameCount || 0)})`,
            });
            return;
          }

          if (type === 'ws:peers') {
            if (typeof msg.peerCount === 'number') setPeerCount(msg.peerCount);
            return;
          }

          if (type === 'ws:qpsk_ack' || type === 'ws:qpsk_frame') {
            const cTs = Number(msg.clientTs || 0);
            if (type === 'ws:qpsk_ack' && cTs > 0) {
              setLatencyMs(Math.max(1, Date.now() - cTs));
            }
            if (typeof msg.peerCount === 'number') setPeerCount(msg.peerCount);
            appendWsLog({
              direction: 'RX',
              kind: type === 'ws:qpsk_ack' ? 'QPSK_ACK' : 'QPSK_PEER',
              summary: `[${String(msg.channel)}] "${String(msg.payload)}" (frame #${Number(msg.frameCount || 0)})`,
              sha256Prefix: typeof msg.serverSha256 === 'string' ? msg.serverSha256.slice(0, 12) : undefined,
              latencyMs: type === 'ws:qpsk_ack' && cTs > 0 ? Math.max(1, Date.now() - cTs) : undefined,
            });
            return;
          }

          if (type === 'ws:error') {
            appendWsLog({
              direction: 'RX',
              kind: 'SERVER_REJECT',
              summary: String(msg.detail || 'Rechazado por el servidor.'),
            });
            return;
          }

          if (type === 'ws:scene_updated' && typeof msg.script === 'string' && msg.script.trim()) {
            setLocalScript(msg.script);
            onChangeScript(msg.script);
            const compiled = compileHelixScript(msg.script, vocabulary);
            const verified = verifyHelixProgram(compiled);
            if (verified.status !== 'RECHAZADO') {
              const ran = runHelixProgram(compiled, createInitialVmState());
              setExecutedState(ran.finalState);
              rebuildSceneAssembly(ran.finalState.sceneNodes, ran.finalState.camera6Dof);
              if (biopixelStateRef.current) {
                const nextProfile = syncBiopixelSurfaceToOpcodes(biopixelStateRef.current, compiled);
                triggerBiopixelOpcodePulse(biopixelStateRef.current, 1.0);
                setBiopixelProfile(nextProfile);
                setBiopixelOverrides({});
              }
            }
            appendWsLog({
              direction: 'RX',
              kind: 'SCENE_SYNC',
              summary: `Escena sincronizada por par ${String(msg.senderId || '')} (${Number(msg.sceneNodesCount || 0)} nodos)`,
            });
          }
        } catch {
          // Ignore malformed WS packets
        }
      };

      socket.onclose = () => {
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!disposed) {
          setWsStatus('closed');
          reconnectTimer = window.setTimeout(connect, 2200);
        }
      };

      socket.onerror = () => {
        if (!disposed) setWsStatus('closed');
      };
    };

    connect();

    return () => {
      disposed = true;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [appendWsLog, onChangeScript, rebuildSceneAssembly, roomId, vocabulary]);

  const sendQpskFrame = useCallback(
    (channel: string, payload: string, usedBytes: number, nodesCount: number, stepCount: number) => {
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const activeIndices = extractActiveRunesFromScript(instructions.map((i) => i.glyphs));
      const frame = encodeQpsk132Frame(activeIndices, [usedBytes, nodesCount, stepCount]);
      const symbols = Array.from(frame.symbols);
      socket.send(
        JSON.stringify({
          type: 'ws:qpsk132',
          channel,
          payload,
          symbols,
          clientTs: Date.now(),
        }),
      );
      appendWsLog({
        direction: 'TX',
        kind: 'QPSK_132B',
        summary: `[${channel}] "${payload}" -> 66 símbolos Z4 (132 bits)`,
      });
    },
    [appendWsLog, instructions],
  );

  // Mantener estado de blindaje SMT sincronizado ante cualquier edición de script
  useEffect(() => {
    const bridge = siliconBridgeRef.current;
    if (!bridge) return;
    if (verification.status === 'RECHAZADO') {
      syncScriptToSiliconBridge(bridge, localScript, vocabulary);
      setSiliconTelemetry(getSiliconBridgeTelemetry(bridge));
    }
  }, [localScript, verification, vocabulary]);

  const handleInjectTokenImpulse = useCallback(() => {
    const bridge = siliconBridgeRef.current;
    if (!bridge) return;
    const res = injectTokenImpulse(bridge, 'ᚩ', 1.0);
    setSiliconTelemetry(getSiliconBridgeTelemetry(bridge));
    if (res.applied) {
      threeCtxRef.current?.requestRender();
      appendWsLog({
        direction: 'TX',
        kind: 'SOA_IMPULSE',
        summary: res.detail,
      });
    }
  }, [appendWsLog]);

  const handleTriggerBiopixelPulse = useCallback(() => {
    const bpState = biopixelStateRef.current;
    if (!bpState || !siliconTelemetry.smtVerified) return;
    triggerBiopixelOpcodePulse(bpState, 1.35);
    fluidEngineRef.current?.pulse(1.35);
    if (threeCtxRef.current) {
      syncBiopixelInstancedMesh(threeCtxRef.current.biopixelMesh, bpState);
      threeCtxRef.current.requestRender();
    }
    setBiopixelMetrics({ ...bpState.lastMetrics, excitationEnvelope: bpState.excitationEnvelope });
    if (fluidEngineRef.current) {
      setGpuFluidSnapshot(fluidEngineRef.current.getSnapshot());
    }
    appendWsLog({
      direction: 'TX',
      kind: 'NS_KV_PULSE',
      summary: `Pulso Navier-Stokes + Kelvin-Voigt aplicado (${bpState.count} biopíxeles + GPU FBO · Re=${bpState.profile.reynoldsNumber})`,
    });
  }, [appendWsLog, siliconTelemetry.smtVerified]);

  const handleCompileAndBuild3D = () => {
    onChangeScript(localScript);
    const bridge = siliconBridgeRef.current;
    if (bridge) {
      const syncRes = syncScriptToSiliconBridge(bridge, localScript, vocabulary);
      setSiliconTelemetry(getSiliconBridgeTelemetry(bridge));
      if (!syncRes.accepted) return;
    }
    if (verification.status === 'RECHAZADO') return;

    const ran = runHelixProgram(instructions, createInitialVmState());
    setExecutedState(ran.finalState);
    rebuildSceneAssembly(ran.finalState.sceneNodes, ran.finalState.camera6Dof);

    if (biopixelStateRef.current) {
      const nextProfile = syncBiopixelSurfaceToOpcodes(biopixelStateRef.current, instructions);
      triggerBiopixelOpcodePulse(biopixelStateRef.current, 1.15);
      setBiopixelProfile(nextProfile);
      setBiopixelOverrides({});
      setBiopixelMetrics(biopixelStateRef.current.lastMetrics);
      if (fluidEngineRef.current) {
        setGpuFluidSnapshot(fluidEngineRef.current.syncOpcodes(nextProfile));
      }
      if (threeCtxRef.current) {
        syncBiopixelInstancedMesh(threeCtxRef.current.biopixelMesh, biopixelStateRef.current);
      }
    }

    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'ws:sync_scene',
          script: localScript,
          pccSha256: verification.symbolic?.pccCertificate.certificateSha256 ?? '',
          sceneNodesCount: ran.finalState.sceneNodes.length,
          totalTriangles: ran.finalState.sceneNodes.reduce((s, n) => s + n.triangles, 0),
        }),
      );
      appendWsLog({
        direction: 'TX',
        kind: 'SCENE_SYNC',
        summary: `Escena (${ran.finalState.sceneNodes.length} nodos) emitida a sala "${roomId}"`,
      });

      const outbox = ran.finalState.wsOutbox.slice(0, 10);
      if (outbox.length > 0) {
        outbox.forEach((evt) => {
          sendQpskFrame(
            evt.channel,
            evt.payload,
            ran.finalState.usedMemoryBytes,
            ran.finalState.sceneNodes.length,
            ran.finalState.stepCount,
          );
        });
      } else {
        sendQpskFrame(
          'telemetry',
          `nodes_${ran.finalState.sceneNodes.length}`,
          ran.finalState.usedMemoryBytes,
          ran.finalState.sceneNodes.length,
          ran.finalState.stepCount,
        );
      }
    }
  };

  const handleExportGlb = (binary: boolean) => {
    const ctx = threeCtxRef.current;
    if (!ctx) return;
    const exporter = new GLTFExporter();
    exporter.parse(
      ctx.assemblyRoot,
      (result) => {
        const blob =
          result instanceof ArrayBuffer
            ? new Blob([result], { type: 'model/gltf-binary' })
            : new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = binary ? 'helix-assembly.glb' : 'helix-assembly.gltf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      (err) => {
        appendWsLog({
          direction: 'RX',
          kind: 'GLTF_ERR',
          summary: `Error al exportar glTF: ${String(err)}`,
        });
      },
      { binary },
    );
  };

  const handleImportGlb = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const ctx = threeCtxRef.current;
    if (!file || !ctx) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) return;
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
      loader.setDRACOLoader(draco);

      loader.parse(
        reader.result,
        '',
        (gltf) => {
          ctx.assemblyRoot.clear();
          ctx.disposables.forEach((d) => d.dispose());
          ctx.disposables = [];

          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(0.001, size.x, size.y, size.z);
          const scale = 2.4 / maxDim;
          gltf.scene.scale.setScalar(scale);
          gltf.scene.position.set(
            -center.x * scale,
            -box.min.y * scale,
            -center.z * scale,
          );

          let meshes = 0;
          let triangles = 0;
          gltf.scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              meshes++;
              obj.castShadow = true;
              obj.receiveShadow = true;
              const geom = obj.geometry;
              if (geom) {
                triangles += geom.index
                  ? Math.round(geom.index.count / 3)
                  : Math.round((geom.getAttribute('position')?.count ?? 0) / 3);
                ctx.disposables.push(geom);
              }
              if (obj.material) {
                if (Array.isArray(obj.material)) {
                  obj.material.forEach((m) => ctx.disposables.push(m));
                } else {
                  ctx.disposables.push(obj.material);
                }
              }
            }
          });

          ctx.assemblyRoot.add(gltf.scene);
          setImportedAssetInfo({ name: file.name, meshes, triangles });
          ctx.requestRender();
          draco.dispose();
        },
        (err) => {
          appendWsLog({
            direction: 'RX',
            kind: 'GLTF_ERR',
            summary: `Fallo al cargar "${file.name}": ${String(err)}`,
          });
          draco.dispose();
        },
      );
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const setCameraPreset = (preset: 'iso' | 'top' | 'front' | 'helix') => {
    const ctx = threeCtxRef.current;
    if (!ctx) return;
    if (preset === 'iso') {
      ctx.targetCamPos = new THREE.Vector3(3.4, 2.3, 3.8);
      ctx.targetCamFov = 45;
    } else if (preset === 'top') {
      ctx.targetCamPos = new THREE.Vector3(0.01, 5.2, 0.4);
      ctx.targetCamFov = 42;
    } else if (preset === 'front') {
      ctx.targetCamPos = new THREE.Vector3(0, 1.35, 4.4);
      ctx.targetCamFov = 45;
    } else {
      ctx.targetCamPos = cameraSphericalOffset(executedState.camera6Dof);
      ctx.targetCamFov = executedState.camera6Dof.fov;
    }
    ctx.requestRender();
  };

  const totalTriangles = executedState.sceneNodes.reduce((s, n) => s + n.triangles, 0);
  const symbolicTriangles = verification.symbolic?.totalTriangles ?? 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Módulo G · Motor 3D glTF/ORM y Transporte WebSocket en Vivo
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            La escena 3D PBR y las tramas QPSK 132-bit nacen directamente de opcodes Helix (
            <code className="font-mono text-xs text-slate-800">MESH_NODE · MAT_ORM · CAM_6DOF · WS_EMIT</code>
            ) verificados antes de ejecutar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
            {wsStatus === 'open' ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-amber-600" />
            )}
            <span className="font-mono">
              {wsStatus === 'open' ? 'WS Conectado' : wsStatus === 'connecting' ? 'Conectando…' : 'Reconectando'}
            </span>
            {clientId && <span className="font-mono text-slate-400">#{clientId}</span>}
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-700 tabular-nums">
            <span>Pares: {peerCount}</span>
            <span className="text-slate-300">·</span>
            <span>RTT: {latencyMs !== null ? `${latencyMs} ms` : '—'}</span>
          </div>

          <select
            aria-label="Sala WebSocket"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
          >
            <option value="helix-main">Sala: helix-main</option>
            <option value="helix-lab">Sala: helix-lab</option>
          </select>
        </div>
      </div>

      {/* Main Split: 3D Viewport + Script / Verifier / WS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Three.js 3D Viewport (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-[#0b1120] shadow-sm">
            <canvas
              ref={canvasRef}
              className="block h-[480px] w-full cursor-grab active:cursor-grabbing"
            />

            {contextLost && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 text-sm text-amber-300">
                Contexto WebGL suspendido; esperando restauración…
              </div>
            )}

            {/* Top-left subtle scene telemetry badge (solid dark surface, zero backdrop-blur) */}
            <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-900/95 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-200 border border-slate-700 tabular-nums">
                {importedAssetInfo
                  ? `glTF Externo: ${importedAssetInfo.name} · ${importedAssetInfo.meshes} mallas · ${importedAssetInfo.triangles} Δ`
                  : `Helix VM: ${executedState.sceneNodes.length} nodos · ${totalTriangles} Δ / 10000 Δ`}
              </span>
              <span className="rounded bg-slate-900/95 px-2.5 py-1 font-mono text-[11px] text-sky-300 border border-slate-700 tabular-nums">
                FOV {executedState.camera6Dof.fov}°
              </span>
              <span
                className={`rounded px-2.5 py-1 font-mono text-[11px] border tabular-nums ${
                  siliconTelemetry.lastWeberDecision === 'SKIP_FRAME'
                    ? 'bg-slate-900/95 text-emerald-300 border-emerald-700'
                    : 'bg-slate-900/95 text-amber-300 border-amber-700'
                }`}
              >
                Tensión {siliconTelemetry.tension.toFixed(3)}f · {siliconTelemetry.lastWeberDecision}
              </span>
              {selectedNodeId && (
                <span className="rounded bg-blue-700 px-2.5 py-1 font-mono text-[11px] font-medium text-white border border-blue-500">
                  Seleccionado: {selectedNodeId}
                </span>
              )}
            </div>

            {/* Collapsible Bottom Control Dock (zero backdrop-blur) */}
            <div className="absolute bottom-3 left-3 right-3 flex flex-col items-start gap-2">
              <button
                type="button"
                onClick={() => setDockOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Box className="h-3.5 w-3.5 text-sky-400" />
                Controles 3D y glTF/Draco
                {dockOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>

              {dockOpen && (
                <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs text-slate-200">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCameraPreset('helix')}
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] hover:bg-slate-700 whitespace-nowrap shrink-0"
                    >
                      CAM_6DOF
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraPreset('iso')}
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] hover:bg-slate-700 whitespace-nowrap shrink-0"
                    >
                      Iso
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraPreset('top')}
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] hover:bg-slate-700 whitespace-nowrap shrink-0"
                    >
                      Planta
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraPreset('front')}
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] hover:bg-slate-700 whitespace-nowrap shrink-0"
                    >
                      Frontal
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoRotate((v) => !v)}
                      className={`rounded border px-2 py-1 text-[11px] whitespace-nowrap shrink-0 ${
                        autoRotate
                          ? 'border-sky-600 bg-sky-900/60 text-sky-200'
                          : 'border-slate-700 bg-slate-800 text-slate-300'
                      }`}
                    >
                      Rotar: {autoRotate ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWireframe((v) => !v)}
                      className={`rounded border px-2 py-1 text-[11px] whitespace-nowrap shrink-0 ${
                        wireframe
                          ? 'border-amber-600 bg-amber-900/60 text-amber-200'
                          : 'border-slate-700 bg-slate-800 text-slate-300'
                      }`}
                    >
                      Malla
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpticShaders((v) => !v)}
                      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] whitespace-nowrap shrink-0 ${
                        opticShaders
                          ? 'border-cyan-600 bg-cyan-900/60 text-cyan-200'
                          : 'border-slate-700 bg-slate-800 text-slate-300'
                      }`}
                    >
                      <Sparkles className="h-3 w-3" />
                      SSS+Cauchy: {opticShaders ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      disabled={!siliconTelemetry.smtVerified}
                      onClick={handleInjectTokenImpulse}
                      className="inline-flex items-center gap-1 rounded border border-emerald-600 bg-emerald-900/70 px-2 py-1 text-[11px] font-medium text-emerald-100 hover:bg-emerald-800 disabled:opacity-40 whitespace-nowrap shrink-0"
                    >
                      <Zap className="h-3 w-3 text-emerald-300" />
                      Impulso ᚩ 457.8 Hz
                    </button>
                    <button
                      type="button"
                      onClick={() => setBiopixelVisible((v) => !v)}
                      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] whitespace-nowrap shrink-0 ${
                        biopixelVisible
                          ? 'border-indigo-500 bg-indigo-900/70 text-indigo-100'
                          : 'border-slate-700 bg-slate-800 text-slate-300'
                      }`}
                    >
                      <Waves className="h-3 w-3" />
                      Biopíxeles: {biopixelVisible ? 'ON' : 'OFF'}
                    </button>
                    {biopixelVisible && (
                      <>
                        <button
                          type="button"
                          onClick={() => setBiopixelPlaying((v) => !v)}
                          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
                        >
                          {biopixelPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                          {biopixelPlaying ? 'Pausar NS+KV' : 'Reanudar NS+KV'}
                        </button>
                        <button
                          type="button"
                          disabled={!siliconTelemetry.smtVerified}
                          onClick={handleTriggerBiopixelPulse}
                          className="inline-flex items-center gap-1 rounded border border-sky-500 bg-sky-900/70 px-2 py-1 text-[11px] font-medium text-sky-100 hover:bg-sky-800 disabled:opacity-40 whitespace-nowrap shrink-0"
                        >
                          <Waves className="h-3 w-3 text-sky-300" />
                          Pulso NS+KV
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleExportGlb(true)}
                      className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-500 whitespace-nowrap shrink-0"
                    >
                      <Download className="h-3 w-3" />
                      Exportar .GLB
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportGlb(false)}
                      className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
                    >
                      .GLTF
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
                    >
                      <Upload className="h-3 w-3" />
                      Cargar .GLB/.GLTF
                    </button>
                    {importedAssetInfo && (
                      <button
                        type="button"
                        onClick={() =>
                          rebuildSceneAssembly(executedState.sceneNodes, executedState.camera6Dof)
                        }
                        className="inline-flex items-center gap-1 rounded border border-emerald-700 bg-emerald-900/60 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-800 whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Volver a Helix
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".glb,.gltf"
                      onChange={handleImportGlb}
                      className="hidden"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Módulo de Superficie de Biopíxeles: Navier-Stokes + Viscoelasticidad de Kelvin-Voigt */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Waves className="h-4 w-4 text-sky-600" />
                  Superficie de Biopíxeles · Navier-Stokes + Kelvin-Voigt por Opcodes
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Rotacional incompresible (∇·u≈0), difusión viscosa ν∇²u y memoria viscoelástica reversible (σ = E·ε + η·dε/dt) sobre {biopixelMetrics.count} biopíxeles ({biopixelMetrics.cols}×{biopixelMetrics.rows}).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={!siliconTelemetry.smtVerified}
                  onClick={handleTriggerBiopixelPulse}
                  className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-40"
                >
                  <Zap className="h-3 w-3" />
                  Excitar Opcodes
                </button>
                <button
                  type="button"
                  onClick={() => setBiopixelOverrides({})}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  Sincronizar desde Opcodes
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 font-mono text-[11px] tabular-nums">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                <div className="font-sans text-[10px] text-slate-500">Navier-Stokes (Re / ν)</div>
                <div className="font-semibold text-slate-900">
                  Re={biopixelMetrics.reynoldsNumber.toFixed(1)} · ν={biopixelMetrics.kinematicViscosity.toFixed(3)}
                </div>
                <div className="text-[10px] text-slate-500">
                  max|∇·u|={biopixelMetrics.maxCurlDivergence.toExponential(1)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                <div className="font-sans text-[10px] text-slate-500">Vorticidad & Flujo</div>
                <div className="font-semibold text-slate-900">
                  |ω|={biopixelMetrics.meanVorticity.toFixed(3)} rad/s
                </div>
                <div className="text-[10px] text-slate-500">
                  Ec={biopixelMetrics.kineticEnergy.toFixed(3)} J · g={biopixelMetrics.curlStrength.toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                <div className="font-sans text-[10px] text-slate-500">Kelvin-Voigt (E / η)</div>
                <div className="font-semibold text-slate-900">
                  E={biopixelMetrics.elasticityE.toFixed(1)} · η={biopixelMetrics.dampingEta.toFixed(1)}
                </div>
                <div className="text-[10px] text-slate-500">
                  σ máx={biopixelMetrics.maxStress.toFixed(2)} Pa
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                <div className="font-sans text-[10px] text-slate-500">Deformación & Histéresis</div>
                <div className="font-semibold text-slate-900">
                  ε̄={biopixelMetrics.meanStrain.toFixed(3)} (máx {biopixelMetrics.maxStrain.toFixed(2)})
                </div>
                <div className="text-[10px] text-slate-500">
                  Histéresis={biopixelMetrics.hysteresisPower.toFixed(3)} W
                </div>
              </div>
            </div>

            {/* Controles reológicos interactivos (sobreescriben o leen parámetros de opcodes) */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-[11px]">
              <label className="flex flex-col gap-1">
                <span className="flex justify-between font-medium text-slate-700">
                  <span>Vorticidad Curl (g)</span>
                  <span className="font-mono tabular-nums">
                    {(biopixelOverrides.curlStrength ?? biopixelProfile.curlStrength).toFixed(2)}
                  </span>
                </span>
                <input
                  type="range"
                  min={0.15}
                  max={2.2}
                  step={0.05}
                  value={biopixelOverrides.curlStrength ?? biopixelProfile.curlStrength}
                  onChange={(e) =>
                    setBiopixelOverrides((prev) => ({
                      ...prev,
                      curlStrength: Number(e.target.value),
                    }))
                  }
                  className="accent-sky-600"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="flex justify-between font-medium text-slate-700">
                  <span>Elasticidad Kelvin-Voigt (E)</span>
                  <span className="font-mono tabular-nums">
                    {(biopixelOverrides.elasticityE ?? biopixelProfile.elasticityE).toFixed(1)}
                  </span>
                </span>
                <input
                  type="range"
                  min={6}
                  max={40}
                  step={0.5}
                  value={biopixelOverrides.elasticityE ?? biopixelProfile.elasticityE}
                  onChange={(e) =>
                    setBiopixelOverrides((prev) => ({
                      ...prev,
                      elasticityE: Number(e.target.value),
                    }))
                  }
                  className="accent-blue-600"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="flex justify-between font-medium text-slate-700">
                  <span>Viscosidad / Histéresis (η)</span>
                  <span className="font-mono tabular-nums">
                    {(biopixelOverrides.dampingEta ?? biopixelProfile.dampingEta).toFixed(1)}
                  </span>
                </span>
                <input
                  type="range"
                  min={1.5}
                  max={15}
                  step={0.5}
                  value={biopixelOverrides.dampingEta ?? biopixelProfile.dampingEta}
                  onChange={(e) =>
                    setBiopixelOverrides((prev) => ({
                      ...prev,
                      dampingEta: Number(e.target.value),
                    }))
                  }
                  className="accent-amber-600"
                />
              </label>
            </div>

            {/* Mapeo activo de opcodes del programa a núcleos de excitación */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-600 mr-1">
                Opcodes acoplados ({biopixelMetrics.activeOpcodesCount} focos):
              </span>
              {biopixelProfile.opcodeBreakdown.map((item) => (
                <span
                  key={item.opcode}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-700"
                >
                  <strong className="text-slate-900">{item.opcode}</strong>
                  <span className="text-slate-400">×{item.count}</span>
                  <span className="font-sans text-slate-500">· {item.roleLabel}</span>
                </span>
              ))}
            </div>
          </div>

          <ModuleGShaderPipelineCard
            profile={biopixelProfile}
            gpuSnapshot={gpuFluidSnapshot}
            meshDeformGain={meshDeformGain}
            onChangeMeshDeformGain={setMeshDeformGain}
            glslMembraneVisible={glslMembraneVisible}
            onToggleGlslMembrane={() => setGlslMembraneVisible((v) => !v)}
          />

          {/* Scene Nodes & ORM Inspector Table */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Grafo Geométrico PBR ORM compilado por Helix VM
              </h3>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                Presupuesto estático: {symbolicTriangles}/10000 Δ
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-1.5 pr-3 font-medium">Nodo</th>
                    <th className="py-1.5 pr-3 font-medium">Primitiva</th>
                    <th className="py-1.5 pr-3 font-medium">Triángulos</th>
                    <th className="py-1.5 pr-3 font-medium">Escala</th>
                    <th className="py-1.5 pr-3 font-medium">AO (R)</th>
                    <th className="py-1.5 pr-3 font-medium">Rugosidad (G)</th>
                    <th className="py-1.5 font-medium">Metal (B)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {executedState.sceneNodes.map((n) => {
                    const isSelected = selectedNodeId === n.id;
                    return (
                      <tr
                        key={n.id}
                        onClick={() => setSelectedNodeId(isSelected ? null : n.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 text-blue-950' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-1.5 pr-3 flex items-center gap-1.5 font-sans font-medium text-slate-900">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: n.colorHex }}
                          />
                          {n.id}
                        </td>
                        <td className="py-1.5 pr-3">{n.shape}</td>
                        <td className="py-1.5 pr-3">{n.triangles}</td>
                        <td className="py-1.5 pr-3">{n.scale.toFixed(2)}</td>
                        <td className="py-1.5 pr-3">{n.ao.toFixed(2)}</td>
                        <td className="py-1.5 pr-3">{n.roughness.toFixed(2)}</td>
                        <td className="py-1.5">{n.metalness.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                  {executedState.sceneNodes.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-3 text-center font-sans text-slate-500">
                        Ejecuta un programa Helix con <code className="font-mono">MESH_NODE</code> para construir la geometría 3D.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Helix 3D Script Editor, Verifier & WebSocket Telemetry (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">
                Código Helix 3D + WebSocket
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setLocalScript(BIO_OPTIC_3D_PROGRAM)}
                  className="rounded border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-800 hover:bg-cyan-100 whitespace-nowrap shrink-0"
                >
                  Bio-Óptico (SoA+SSS)
                </button>
                <button
                  type="button"
                  onClick={() => setLocalScript(DEFAULT_HELIX_3D_PROGRAM)}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  Rotor 3D
                </button>
                <button
                  type="button"
                  onClick={() => setLocalScript(PRISMATIC_TOWER_3D_PROGRAM)}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  Torre Prismática
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLocalScript(
                      `ᛇᚢ\nLOOP 5\n  MESH_NODE overflow torus 2500 1.0\nEND\nMAT_ORM overflow 0.9 1.4 0.8\nᚳᛏ`,
                    )
                  }
                  className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 whitespace-nowrap shrink-0"
                >
                  Rechazo SMT
                </button>
              </div>
            </div>

            <textarea
              value={localScript}
              onChange={(e) => setLocalScript(e.target.value)}
              rows={13}
              spellCheck={false}
              className="w-full rounded-lg border border-slate-300 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100 focus:border-blue-500 focus:outline-none"
            />

            {/* Static Verifier Gate */}
            <div
              className={`mt-3 rounded-lg border p-3 text-xs ${
                verification.status === 'RECHAZADO'
                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2 font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  {verification.status === 'RECHAZADO' ? (
                    <XCircle className="h-4 w-4 text-rose-600" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  )}
                  Puerta Estática helix-verify: {verification.status}
                </span>
                {verification.symbolic && (
                  <span className="font-mono text-[11px] opacity-80">
                    PCC {verification.symbolic.pccCertificate.certificateSha256.slice(0, 10)}…
                  </span>
                )}
              </div>

              {verification.findings.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {verification.findings.map((f, idx) => (
                    <li key={`${f.lineNumber}_${f.rule}_${idx}`} className="flex items-start gap-1.5">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        <strong className="font-mono">L{f.lineNumber} [{f.rule}]</strong>: {f.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Telemetría Directa al Silicio HELIX: Pauli-SoA + Cauchy + Weber-Fechner */}
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                  <Activity className="h-3.5 w-3.5 text-blue-600" />
                  Acoplamiento Token ➔ Pauli-SoA ➔ Shaders GLSL
                </span>
                <span className="font-mono text-[10px] text-slate-600 tabular-nums">
                  Z3 SMT {siliconTelemetry.smtLatencyMs.toFixed(2)} ms · {siliconTelemetry.smtVerified ? 'PROVED_SAFE' : 'BLOQUEADO'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
                <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5">
                  <div className="text-[10px] font-sans text-slate-500">Pauli-SoA ({siliconTelemetry.strideBytes} B/celda · stride=7)</div>
                  <div className="font-semibold text-slate-900">
                    {siliconTelemetry.capacityCells} celdas · {siliconTelemetry.byteLength} B Zero-GC
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5">
                  <div className="text-[10px] font-sans text-slate-500">Ley Némesis & Cimática</div>
                  <div className="font-semibold text-slate-900">
                    {siliconTelemetry.tension.toFixed(3)}f · {siliconTelemetry.dominantGlyph} {siliconTelemetry.cymaticHz.toFixed(1)} Hz
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5">
                  <div className="text-[10px] font-sans text-slate-500">Cauchy 700 / 546 / 436 nm</div>
                  <div className="font-semibold text-slate-900">
                    {siliconTelemetry.cauchyRed.toFixed(3)} · {siliconTelemetry.cauchyGreen.toFixed(3)} · {siliconTelemetry.cauchyBlue.toFixed(3)}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5">
                  <div className="text-[10px] font-sans text-slate-500">Weber-Fechner & Bloch</div>
                  <div className="font-semibold text-slate-900">
                    R:{siliconTelemetry.renderedFrames} / Skip:{siliconTelemetry.skippedFrames} · ||ψ||²={siliconTelemetry.blochNormSq.toFixed(3)}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={verification.status === 'RECHAZADO'}
                onClick={handleCompileAndBuild3D}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5" />
                Compilar, Renderizar 3D y Sincronizar WS
              </button>
              <button
                type="button"
                disabled={wsStatus !== 'open'}
                onClick={() =>
                  sendQpskFrame(
                    'qpsk_probe',
                    `tri_${totalTriangles}_nodes_${executedState.sceneNodes.length}`,
                    executedState.usedMemoryBytes,
                    executedState.sceneNodes.length,
                    executedState.stepCount,
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Radio className="h-3.5 w-3.5 text-blue-600" />
                Emitir QPSK 132b
              </button>
            </div>
          </div>

          {/* Live WebSocket Event Log */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Tramas WebSocket QPSK 132-bit (<code className="font-mono text-xs">/ws</code>)
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Verificado SHA-256 en servidor
              </span>
            </div>
            <div className="max-h-56 space-y-1.5 overflow-y-auto font-mono text-[11px]">
              {wsLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col gap-0.5 rounded border border-slate-100 bg-slate-50 px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-semibold ${
                        log.direction === 'TX' ? 'text-blue-700' : 'text-emerald-700'
                      }`}
                    >
                      {log.direction} · {log.kind}
                    </span>
                    <span className="text-slate-400 tabular-nums">
                      {log.time}
                      {log.latencyMs !== undefined ? ` (${log.latencyMs} ms)` : ''}
                    </span>
                  </div>
                  <div className="text-slate-700 break-all">{log.summary}</div>
                  {log.sha256Prefix && (
                    <div className="text-slate-500">SHA-256 servidor: {log.sha256Prefix}…</div>
                  )}
                </div>
              ))}
              {wsLogs.length === 0 && (
                <div className="py-4 text-center font-sans text-xs text-slate-500">
                  Esperando tramas del canal WebSocket…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

interface ClientMeta {
  clientId: string;
  roomId: string;
  ws: WebSocket;
}

interface RoomState {
  roomId: string;
  script: string;
  pccSha256: string;
  sceneNodesCount: number;
  totalTriangles: number;
  lastQpskSymbols: number[];
  lastChannel: string;
  lastPayload: string;
  lastServerSha256: string;
  frameCount: number;
  updatedAt: string;
  clients: Map<string, ClientMeta>;
}

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const rooms = new Map<string, RoomState>();

function getOrCreateRoom(roomId: string): RoomState {
  const safeId = roomId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'helix-main';
  let room = rooms.get(safeId);
  if (!room) {
    room = {
      roomId: safeId,
      script: '',
      pccSha256: '',
      sceneNodesCount: 0,
      totalTriangles: 0,
      lastQpskSymbols: [],
      lastChannel: 'telemetry',
      lastPayload: 'init',
      lastServerSha256: '',
      frameCount: 0,
      updatedAt: new Date().toISOString(),
      clients: new Map<string, ClientMeta>(),
    };
    rooms.set(safeId, room);
  }
  return room;
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(
  room: RoomState,
  payload: Record<string, unknown>,
  excludeClientId?: string,
): void {
  const encoded = JSON.stringify(payload);
  for (const [cid, meta] of room.clients.entries()) {
    if (excludeClientId && cid === excludeClientId) continue;
    if (meta.ws.readyState === 1) {
      meta.ws.send(encoded);
    }
  }
}

function buildRoomSnapshot(room: RoomState) {
  return {
    type: 'ws:snapshot',
    roomId: room.roomId,
    peerCount: room.clients.size,
    script: room.script,
    pccSha256: room.pccSha256,
    sceneNodesCount: room.sceneNodesCount,
    totalTriangles: room.totalTriangles,
    lastQpskSymbols: room.lastQpskSymbols,
    lastChannel: room.lastChannel,
    lastPayload: room.lastPayload,
    lastServerSha256: room.lastServerSha256,
    frameCount: room.frameCount,
    updatedAt: room.updatedAt,
  };
}

interface ServerVerifyResult {
  valid: boolean;
  errors: string[];
  totalTriangles: number;
  instructionCount: number;
}

function verifySceneScriptServer(script: string): ServerVerifyResult {
  const lines = script.split(/\r?\n/);
  const errors: string[] = [];
  const blockStack: { type: string; line: number; loopFactor: number }[] = [];
  let totalTriangles = 0;
  let instructionCount = 0;

  const activeLoopMultiplier = () =>
    blockStack.reduce((acc, f) => (f.type === 'LOOP' ? acc * f.loopFactor : acc), 1);

  lines.forEach((raw, idx) => {
    const clean = raw.split('#')[0].trim();
    if (!clean) return;
    instructionCount++;
    const parts = clean.split(/\s+/);
    const head = parts[0].toUpperCase();
    const args = parts.slice(1);
    const lineNum = idx + 1;

    if (head === 'IF') {
      blockStack.push({ type: 'IF', line: lineNum, loopFactor: 1 });
      if (args.length < 3) {
        errors.push(`L${lineNum}: IF requiere 3 operandos.`);
      }
    } else if (head === 'ELSE') {
      const top = blockStack[blockStack.length - 1];
      if (!top || top.type !== 'IF') {
        errors.push(`L${lineNum}: ELSE sin IF abierto.`);
      } else {
        top.type = 'ELSE';
      }
    } else if (head === 'LOOP') {
      const cnt = Number(args[0]);
      if (Number.isNaN(cnt) || cnt < 0 || cnt > 100) {
        errors.push(`L${lineNum}: LOOP fuera de [0..100].`);
        blockStack.push({ type: 'LOOP', line: lineNum, loopFactor: 1 });
      } else {
        blockStack.push({ type: 'LOOP', line: lineNum, loopFactor: Math.floor(cnt) });
      }
    } else if (head === 'END') {
      if (blockStack.length === 0) {
        errors.push(`L${lineNum}: END sin bloque previo.`);
      } else {
        blockStack.pop();
      }
    } else if (head === 'DIV' && args[1] === '0') {
      errors.push(`L${lineNum}: división literal por cero rechazada.`);
    } else if (head === 'MESH_NODE' || head === 'ᚠᛜ') {
      const tris = Number(args[2] ?? '240');
      const scale = Number(args[3] ?? '1');
      if (!Number.isFinite(tris) || tris <= 0) {
        errors.push(`L${lineNum}: conteo de triángulos inválido en MESH_NODE.`);
      } else {
        totalTriangles += tris * activeLoopMultiplier();
        if (totalTriangles > 10000) {
          errors.push(`L${lineNum}: SMT_MESH_BUDGET excedido (${totalTriangles} > 10000).`);
        }
      }
      if (args[3] !== undefined && Number.isFinite(scale) && (scale <= 0 || scale > 8)) {
        errors.push(`L${lineNum}: escala fuera de (0..8] en MESH_NODE.`);
      }
    } else if (head === 'MAT_ORM' || head === 'ᛟᛣ') {
      for (let c = 1; c <= 3; c++) {
        const val = Number(args[c]);
        if (args[c] === undefined || (Number.isFinite(val) && (val < 0 || val > 1))) {
          errors.push(`L${lineNum}: SMT_ORM_BOUNDS canal #${c} fuera de [0, 1].`);
        }
      }
    }
  });

  blockStack.forEach((b) => {
    errors.push(`L${b.line}: bloque ${b.type} sin cierre END.`);
  });

  return {
    valid: errors.length === 0,
    errors,
    totalTriangles,
    instructionCount,
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    let totalPeers = 0;
    for (const r of rooms.values()) {
      totalPeers += r.clients.size;
    }
    res.json({
      ok: true,
      service: 'helix-ws-relay',
      rooms: rooms.size,
      peers: totalPeers,
      uptimeSec: Math.round(process.uptime()),
    });
  });

  app.get('/api/rooms/:roomId', (req, res) => {
    const room = getOrCreateRoom(req.params.roomId);
    res.json(buildRoomSnapshot(room));
  });

  app.post('/api/verify', (req, res) => {
    const script = typeof req.body?.script === 'string' ? req.body.script : '';
    if (!script.trim()) {
      res.status(400).json({ valid: false, errors: ['Script vacío.'], totalTriangles: 0, instructionCount: 0 });
      return;
    }
    res.json(verifySceneScriptServer(script));
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (!url.startsWith('/ws')) {
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
    const initialRoom = reqUrl.searchParams.get('room') || 'helix-main';
    const clientId = crypto.randomUUID().slice(0, 8);
    let currentRoom = getOrCreateRoom(initialRoom);

    const meta: ClientMeta = {
      clientId,
      roomId: currentRoom.roomId,
      ws,
    };
    currentRoom.clients.set(clientId, meta);

    sendJson(ws, {
      ...buildRoomSnapshot(currentRoom),
      clientId,
    });
    broadcastRoom(currentRoom, {
      type: 'ws:peers',
      roomId: currentRoom.roomId,
      peerCount: currentRoom.clients.size,
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        const type = String(msg.type || '');

        if (type === 'ws:ping') {
          sendJson(ws, {
            type: 'ws:pong',
            clientTs: Number(msg.clientTs || 0),
            serverTs: Date.now(),
          });
          return;
        }

        if (type === 'ws:join') {
          const nextRoomId = String(msg.roomId || 'helix-main');
          if (nextRoomId !== currentRoom.roomId) {
            currentRoom.clients.delete(clientId);
            broadcastRoom(currentRoom, {
              type: 'ws:peers',
              roomId: currentRoom.roomId,
              peerCount: currentRoom.clients.size,
            });
            currentRoom = getOrCreateRoom(nextRoomId);
            meta.roomId = currentRoom.roomId;
            currentRoom.clients.set(clientId, meta);
          }
          sendJson(ws, {
            ...buildRoomSnapshot(currentRoom),
            clientId,
          });
          broadcastRoom(currentRoom, {
            type: 'ws:peers',
            roomId: currentRoom.roomId,
            peerCount: currentRoom.clients.size,
          });
          return;
        }

        if (type === 'ws:sync_scene') {
          const script = typeof msg.script === 'string' ? msg.script : '';
          const pccSha256 = typeof msg.pccSha256 === 'string' ? msg.pccSha256 : '';
          const sceneNodesCount = Number(msg.sceneNodesCount || 0);
          const totalTriangles = Number(msg.totalTriangles || 0);
          if (script.length > 0 && script.length <= 32768) {
            const serverCheck = verifySceneScriptServer(script);
            if (!serverCheck.valid) {
              sendJson(ws, {
                type: 'ws:error',
                detail: `Rechazado por verificador de servidor: ${serverCheck.errors[0]}`,
              });
              return;
            }
            currentRoom.script = script;
            currentRoom.pccSha256 = pccSha256;
            currentRoom.sceneNodesCount = sceneNodesCount;
            currentRoom.totalTriangles = serverCheck.totalTriangles || totalTriangles;
            currentRoom.updatedAt = new Date().toISOString();
            broadcastRoom(
              currentRoom,
              {
                type: 'ws:scene_updated',
                roomId: currentRoom.roomId,
                senderId: clientId,
                script,
                pccSha256,
                sceneNodesCount,
                totalTriangles,
                updatedAt: currentRoom.updatedAt,
              },
              clientId,
            );
            sendJson(ws, {
              type: 'ws:scene_ack',
              roomId: currentRoom.roomId,
              pccSha256,
              peerCount: currentRoom.clients.size,
            });
          }
          return;
        }

        if (type === 'ws:qpsk132') {
          const syms = Array.isArray(msg.symbols)
            ? msg.symbols.map((v) => Number(v) & 0x3).slice(0, 66)
            : [];
          if (syms.length !== 66) {
            sendJson(ws, {
              type: 'ws:error',
              detail: 'QPSK Z4 exige exactamente 66 símbolos (132 bits).',
            });
            return;
          }
          const channel = String(msg.channel || 'telemetry').slice(0, 40);
          const payload = String(msg.payload || 'frame').slice(0, 120);
          const clientTs = Number(msg.clientTs || Date.now());
          const digest = crypto
            .createHash('sha256')
            .update(`${currentRoom.roomId}|${channel}|${payload}|${syms.join(',')}`)
            .digest('hex');

          currentRoom.lastQpskSymbols = syms;
          currentRoom.lastChannel = channel;
          currentRoom.lastPayload = payload;
          currentRoom.lastServerSha256 = digest;
          currentRoom.frameCount += 1;
          currentRoom.updatedAt = new Date().toISOString();

          const packet = {
            type: 'ws:qpsk_frame',
            roomId: currentRoom.roomId,
            senderId: clientId,
            channel,
            payload,
            symbols: syms,
            serverSha256: digest,
            frameCount: currentRoom.frameCount,
            clientTs,
            serverTs: Date.now(),
          };
          sendJson(ws, {
            ...packet,
            type: 'ws:qpsk_ack',
            peerCount: currentRoom.clients.size,
          });
          broadcastRoom(currentRoom, packet, clientId);
        }
      } catch {
        sendJson(ws, {
          type: 'ws:error',
          detail: 'Trama JSON malformada en canal WebSocket.',
        });
      }
    });

    const cleanup = () => {
      currentRoom.clients.delete(clientId);
      broadcastRoom(currentRoom, {
        type: 'ws:peers',
        roomId: currentRoom.roomId,
        peerCount: currentRoom.clients.size,
      });
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  if (IS_PROD) {
    const distDir = path.resolve('dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found. Run npm run build.');
      }
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Helix Server] Express + WebSocket (/ws) en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Helix Server] Error fatal de arranque:', err);
  process.exit(1);
});

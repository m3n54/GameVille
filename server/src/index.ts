import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ClientToServerEvents, ServerToClientEvents, GameType } from './types';
import {
  createRoom,
  joinRoom,
  toggleReady,
  setGameType,
  canStartGame,
  setRoomState,
  getRoom,
  findByPlayer,
  validateIdentity,
} from './rooms';
import { createInstance } from './games/base';
import {
  GAMES,
  engines,
  stateForClient,
  handlePlayerExit,
  allowEvent,
  startRoomSweeper,
  findGameForSocket,
} from './gameService';

// === CORS (deploy F4) =======================================================
// Comma-separated origin list. Entries of the form `https://*.domain.tld` are
// treated as suffix wildcards — needed because Vercel preview deployments get
// per-PR subdomains that a single pinned origin would reject.
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin: string): boolean {
  return corsOrigins.some((allowed) => {
    if (allowed.startsWith('https://*.')) {
      const suffix = allowed.slice('https://*'.length); // ".vercel.app"
      return origin.endsWith(suffix);
    }
    return allowed === origin;
  });
}

const corsOriginFn = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // Allow non-browser tools (no Origin header) plus anything on the list.
  if (!origin || isOriginAllowed(origin)) return callback(null, true);
  callback(new Error('Not allowed by CORS'));
};

const app = express();
app.use(cors({ origin: corsOriginFn }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: corsOriginFn, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 64 * 1024, // M5: payloads beyond chat-sized input are abuse
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: io.engine.clientsCount });
});

startRoomSweeper();

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  // === ROOM EVENTS ===

  socket.on('room:create', (data, callback) => {
    // FE-F1: respond via ack instead of a fire-and-forget emit + client-side
    // socket.once() — the old pattern accumulated listeners across attempts.
    const ack = callback;
    if (!ack) return;

    if (!allowEvent(`create:${socket.id}`, 5, 60_000)) {
      ack({ ok: false, error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
      return;
    }
    const invalid = validateIdentity(data);
    if (invalid) {
      ack({ ok: false, error: invalid });
      return;
    }

    const room = createRoom(data, socket.id);
    socket.join(room.id);
    ack({ ok: true, room });
    console.log(`[Room] Created: ${room.pin} by ${data.nickname}`);
  });

  socket.on('room:join', (data, callback) => {
    const ack = callback;
    if (!ack) return;

    // M7: rate-limit joins to blunt PIN enumeration.
    if (!allowEvent(`join:${socket.id}`, 10, 60_000)) {
      ack({ ok: false, error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
      return;
    }
    if (typeof data?.pin !== 'string') {
      ack({ ok: false, error: 'Kode ruang tidak valid' });
      return;
    }
    const invalid = validateIdentity(data);
    if (invalid) {
      ack({ ok: false, error: invalid });
      return;
    }

    const room = joinRoom(data.pin, data, socket.id);
    if (!room) {
      ack({ ok: false, error: 'Kode ruang tidak valid atau ruang sudah penuh!' });
      return;
    }
    socket.join(room.id);
    ack({ ok: true, room });
    // Single source of truth for membership: everyone gets the fresh list.
    io.to(room.id).emit('player:update', room.players);
    console.log(`[Room] Joined: ${data.pin} by ${data.nickname}`);
  });

  // Same shared exit path as disconnect — leaving via the button mid-game used
  // to strand a ghost in the engine's turn rotation (H2).
  socket.on('room:leave', () => {
    const room = findByPlayer(socket.id);
    handlePlayerExit(io, socket);
    if (room) socket.leave(room.id);
  });

  // Client asks for room state after navigation or reconnect (same membership).
  // Membership is the source of truth — must work in any room state
  // (waiting/playing/finished), so we look up by member and verify the PIN
  // matches rather than searching by PIN (findByPin only returns 'waiting'
  // rooms, which would break mid-game recovery).
  socket.on('room:sync', (data, callback) => {
    const memberRoom = findByPlayer(socket.id);
    if (!memberRoom || memberRoom.pin !== data.pin) {
      callback({ ok: false, error: 'Kamu bukan anggota ruang ini' });
      return;
    }
    socket.join(memberRoom.id);

    // Mid-game recovery: replay current game state + whose turn it is, so a
    // refreshed tab re-enters the game instead of dead-ending in the lobby.
    let gameSnapshot: unknown = null;
    let turnPlayerId: string | undefined;
    const instance = GAMES.get(memberRoom.id);
    const engine = engines[memberRoom.gameType ?? ''];
    if (instance && engine && (memberRoom.state === 'playing' || memberRoom.state === 'finished')) {
      gameSnapshot = stateForClient(instance.gameType, instance.state, socket.id);
      turnPlayerId = currentTurnPlayerId(instance);
    }
    callback({ ok: true, room: memberRoom, gameState: gameSnapshot, turnPlayerId });
  });

  socket.on('player:ready', (data) => {
    const room = toggleReady(socket.id, data.ready);
    if (room) {
      io.to(room.id).emit('player:update', room.players);
    }
  });

  socket.on('game:start', () => {
    const roomData = findByPlayer(socket.id);
    if (!roomData) return;
    if (roomData.hostId !== socket.id) return;

    // H3: guard the room state — a double-clicked Mulai used to pass
    // canStartGame twice and silently recreate/reset the live game.
    if (roomData.state !== 'waiting') {
      socket.emit('room:error', { message: 'Game sudah dimulai!' });
      return;
    }
    if (!canStartGame(roomData.id)) return;
    if (!roomData.gameType) return;
    const engine = engines[roomData.gameType];
    if (!engine) return;

    const playerOrder = roomData.players.map((p) => p.id);
    const instance = createInstance(engine, roomData.id, playerOrder);

    GAMES.set(roomData.id, instance);
    setRoomState(roomData.id, 'playing');

    // Notify all players
    io.to(roomData.id).emit('game:started', roomData.gameType);
    io.to(roomData.id).emit('game:state', stateForClient(instance.gameType, instance.state));

    // Notify whose turn it is
    const currentPlayerId = instance.playerOrder[instance.currentTurnIndex];
    if (currentPlayerId) {
      io.to(roomData.id).emit('game:action', { type: 'turn', nextPlayerId: currentPlayerId });
    }
  });

  socket.on('game:action', (data) => {
    const instance = findGameForSocket(socket.id);
    if (!instance) return;

    // Single source of truth: engine's state.winner — block actions after game over
    const currentState = instance.state as { winner?: string | null };
    if (currentState.winner) return;

    const engine = engines[instance.gameType];
    if (!engine) return;

    // M2: config actions decide how the whole match plays — host-only.
    const room = getRoom(instance.roomId);
    if (data.type === 'config' && room && room.hostId !== socket.id) {
      socket.emit('room:error', { message: 'Hanya host yang bisa mengatur permainan' });
      return;
    }

    // H4 belt-and-suspenders: an engine throw must not kill the worker or
    // leave the acting client hanging — surface it as a normal error event.
    let result;
    try {
      result = engine.handleAction(instance.state, socket.id, data);
    } catch {
      socket.emit('room:error', { message: 'Aksi gagal diproses' });
      return;
    }
    instance.state = result.newState;

    // Process all events
    for (const event of result.events) {
      switch (event.type) {
        case 'diceResult':
          io.to(instance.roomId).emit('game:state', stateForClient(instance.gameType, instance.state));
          io.to(instance.roomId).emit('game:action', event.data);
          break;
        case 'revealResult':
        case 'flagToggled':
        case 'correctGuess':
        case 'wrongGuess':
        case 'turnChange':
          io.to(instance.roomId).emit('game:state', stateForClient(instance.gameType, instance.state));
          io.to(instance.roomId).emit('game:action',
            event.type === 'turnChange' ? { type: 'turn', ...event.data } : { type: event.type, ...event.data });
          break;
        case 'gameOver':
          broadcastGameOver(io, instance, event.data.winnerId as string);
          break;
        case 'fireResult':
          socket.emit('game:action', { type: 'fireResult', ...event.data });
          io.to(instance.roomId).emit('game:state', stateForClient(instance.gameType, instance.state, socket.id));
          // Everyone else gets their own projection of the same board change
          socket.to(instance.roomId).emit('game:state', stateForClient(instance.gameType, instance.state));
          break;
        case 'gameStart': {
          // Minesweeper config uses firstTurnId; sea battle uses firstTurn
          io.to(instance.roomId).emit('game:state', stateForClient(instance.gameType, instance.state));
          io.to(instance.roomId).emit('game:action', { type: 'gameStart', ...event.data });
          const firstTurn = (event.data.firstTurn ?? event.data.firstTurnId) as string | undefined;
          if (firstTurn) {
            io.to(instance.roomId).emit('game:action', { type: 'turn', nextPlayerId: firstTurn });
          }
          break;
        }
        case 'shipsPlaced':
          io.to(instance.roomId).emit('game:state', stateForClient(instance.gameType, instance.state));
          break;
        case 'error':
          socket.emit('room:error', event.data as { message: string });
          break;
      }
    }
  });

  socket.on('game:select', (data) => {
    const room = setGameType(socket.id, data.gameType);
    if (room) {
      io.to(room.id).emit('room:state', room);
    }
  });

  socket.on('chat:message', (data) => {
    const room = findRoomOfSocket(socket.id);
    if (!room) return;
    // M5: cap untrusted text before it enters memory or gets broadcast.
    const text = typeof data?.text === 'string' ? data.text.slice(0, 500) : '';
    if (!text) return;
    if (!allowEvent(`chat:${socket.id}`, 10, 10_000)) return;
    socket.to(room).emit('chat:received', {
      playerId: socket.id,
      nickname: nicknameOf(room, socket.id),
      text,
    });
  });

  socket.on('reaction:send', (data) => {
    const room = findRoomOfSocket(socket.id);
    if (!room) return;
    const emoji = typeof data?.emoji === 'string' ? data.emoji.slice(0, 8) : '';
    if (!emoji) return;
    socket.to(room).emit('reaction:received', {
      playerId: socket.id,
      nickname: nicknameOf(room, socket.id),
      emoji,
    });
  });

  socket.on('disconnect', () => {
    handlePlayerExit(io, socket);
    console.log(`[-] Player disconnected: ${socket.id}`);
  });
});

// === Helpers ===

// Sea-battle needs per-player projections even within one broadcast tick:
// the shooter sees the hit result immediately, the rest see the plain board.
type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;

function broadcastGameOver(io: IOServer, instance: ReturnType<typeof findGameForSocket> & object, winnerId: string): void {
  if (!instance) return;
  io.to(instance.roomId).emit('game:state', stateForClient(instance.gameType, instance.state));
  const room = getRoom(instance.roomId);
  let winnerName = 'Unknown';
  if (winnerId === 'team') {
    winnerName = 'Tim';
  } else if (winnerId === 'none') {
    winnerName = '-';
  } else {
    winnerName = room?.players.find((p) => p.id === winnerId)?.nickname ?? 'Unknown';
  }
  io.to(instance.roomId).emit('game:over', { winnerId, winnerName });
  setRoomState(instance.roomId, 'finished');
}

function currentTurnPlayerId(instance: NonNullable<ReturnType<typeof findGameForSocket>>): string | undefined {
  const s = instance.state as {
    currentTurn?: number | string;
    players?: { id: string }[];
  };
  // sea-battle stores the current player's id directly in state.currentTurn
  if (typeof s.currentTurn === 'string') return s.currentTurn;
  if (s.players && typeof s.currentTurn === 'number') return s.players[s.currentTurn]?.id;
  return instance.playerOrder[instance.currentTurnIndex];
}

function findRoomOfSocket(socketId: string): string | null {
  const room = findByPlayer(socketId);
  return room?.id ?? null;
}

function nicknameOf(roomId: string, socketId: string): string {
  return getRoom(roomId)?.players.find((p) => p.id === socketId)?.nickname ?? 'Unknown';
}

const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`[GameVille Server] Running on port ${PORT}`);
});

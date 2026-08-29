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
  validatePlayer,
  resetRoomForNewGame,
  reattachPlayer,
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
  clearRateLimitsForSocket,
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
    // SV-H4: remember the nickname on the socket so a later room:sync (after
    // socket.id change due to reconnect) can re-attach to the same player
    // record by name. The value is a client-declared string and only used
    // for matching an existing player in the room — never trusted on its own.
    (socket.data as { nickname?: string }).nickname = data.nickname;
    (socket.data as { exited?: boolean }).exited = false;
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
    const invalid = validatePlayer(data);
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
    // SV-H4: see comment in room:create. nicknames are used only to match an
    // existing player on reconnect — they are never trusted to grant access.
    (socket.data as { nickname?: string }).nickname = data.nickname;
    (socket.data as { exited?: boolean }).exited = false;
    ack({ ok: true, room });
    // Single source of truth for membership: everyone gets the fresh list.
    io.to(room.id).emit('player:update', room.players);
    console.log(`[Room] Joined: ${data.pin} by ${data.nickname}`);
  });

  // Same shared exit path as disconnect — leaving via the button mid-game used
  // to strand a ghost in the engine's turn rotation (H2).
  // SV-H5: ack the client so the UI can stop its loading state immediately
  // instead of waiting for the next room:sync or the next mount to recover.
  // C1: the disconnect handler will fire too; handlePlayerExit's exited flag
  // is what makes that second call safe. socket.leave is idempotent.
  socket.on('room:leave', (callback?: (ack: { ok: boolean }) => void) => {
    const room = findByPlayer(socket.id);
    handlePlayerExit(io, socket);
    if (room) socket.leave(room.id);
    if (callback) callback({ ok: true });
  });

  // Client asks for room state after navigation or reconnect (same membership).
  // Membership is the source of truth — must work in any room state
  // (waiting/playing/finished), so we look up by member and verify the PIN
  // matches rather than searching by PIN (findByPin only returns 'waiting'
  // rooms, which would break mid-game recovery).
  // SV-H4: if findByPlayer misses (the socket id changed on reconnect), fall
  // back to reattaching by nickname on a waiting room. Mid-game reconnect is
  // intentionally NOT supported — engine state references playerOrder which
  // would need rebuilding, and the safer UX is to keep the player in the
  // lobby until the current match ends.
  socket.on('room:sync', (data, callback) => {
    let memberRoom = findByPlayer(socket.id);
    if ((!memberRoom || memberRoom.pin !== data.pin) && data?.pin) {
      const nickname = (socket.data as { nickname?: string }).nickname;
      if (nickname) {
        const reattach = reattachPlayer(socket.id, nickname, data.pin);
        if (reattach) {
          memberRoom = reattach.room;
          // Reset exit flag — a reconnected socket is a brand-new session.
          (socket.data as { exited?: boolean }).exited = false;
          socket.join(memberRoom.id);
          io.to(memberRoom.id).emit('player:update', memberRoom.players);
        }
      }
    }
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
    if (!roomData) {
      socket.emit('room:error', { message: 'Kamu belum bergabung di ruang manapun' });
      return;
    }
    if (roomData.hostId !== socket.id) {
      socket.emit('room:error', { message: 'Hanya host yang bisa memulai game' });
      return;
    }

    // H3: guard the room state — a double-clicked Mulai used to pass
    // canStartGame twice and silently recreate/reset the live game.
    if (roomData.state !== 'waiting') {
      // Allow restart from 'finished' — clear ready flags + drop the old
      // GameInstance so the new start builds fresh state. The host can then
      // click Mulai again to begin the next match in the same room.
      if (roomData.state === 'finished') {
        const reset = resetRoomForNewGame(roomData.id);
        // C5: defensive clear before overwrite. broadcastGameOver already
        // deleted this entry on game-over, but a player may have left before
        // the winner modal showed up, so we clear again before set() below.
        GAMES.delete(roomData.id);
        if (reset) {
          io.to(roomData.id).emit('player:update', reset.players);
          io.to(roomData.id).emit('room:state', reset);
        }
        // Fall through to start the new game below
      } else {
        socket.emit('room:error', { message: 'Game sudah dimulai!' });
        return;
      }
    }
    // SV-H1: previously these all returned silently, leaving the host staring
    // at a dead Mulai button. Each path now sends a specific error so the
    // GameErrorBanner can show what was wrong.
    if (!canStartGame(roomData.id)) {
      socket.emit('room:error', { message: 'Belum bisa mulai: minimal 2 pemain dan semua siap' });
      return;
    }
    if (!roomData.gameType) {
      socket.emit('room:error', { message: 'Pilih permainan dulu' });
      return;
    }
    const engine = engines[roomData.gameType];
    if (!engine) {
      socket.emit('room:error', { message: 'Mesin permainan tidak tersedia' });
      return;
    }

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

    // H2: widen try/catch to cover BOTH engine.handleAction AND the events
    // dispatch loop — a throw in any event branch (e.g. stateForClient on a
    // half-mutated state) must not kill the worker or leave the client hanging.
    let result;
    try {
      result = engine.handleAction(instance.state, socket.id, data);
      instance.state = result.newState;
    } catch (err) {
      socket.emit('room:error', { message: 'Internal game error' });
      console.error('Game action error (engine):', err);
      return;
    }

    // Process all events
    try {
      for (const event of result.events) {
      const isSeaBattle = instance.gameType === 'sea-battle';
      switch (event.type) {
        case 'diceResult':
          // Snakes-Ladders: state is the same for every viewer (no anti-cheat
          // projection needed — players[] + currentTurn is shared). Stick
          // with the io.to(room) broadcast.
          io.to(instance.roomId).emit('game:state', stateForClient(instance.gameType, instance.state));
          io.to(instance.roomId).emit('game:action', event.data);
          break;
        case 'revealResult':
        case 'flagToggled':
        case 'correctGuess':
        case 'wrongGuess':
        case 'turnChange':
          // Sea-battle: per-player projection required (anti-cheat). Other
          // games: shared state, io.to() broadcast is fine.
          if (isSeaBattle) {
            broadcastPerPlayerState(io, instance);
          } else {
            io.to(instance.roomId).emit('game:state', stateForClient(instance.gameType, instance.state));
          }
          io.to(instance.roomId).emit('game:action',
            event.type === 'turnChange' ? { type: 'turn', ...event.data } : { type: event.type, ...event.data });
          break;
        case 'gameOver':
          broadcastGameOver(io, instance, event.data.winnerId as string);
          break;
        case 'fireResult': {
          // C4: per-player projection. Each room member must receive a
          // stateForClient call with their OWN forPlayerId so anti-cheat
          // projection (seaBattleView strips opponent 'S' markers) shows
          // them their own view, not the shooter's. Previously the
          // io.to() broadcast sent the shooter's projection to everyone
          // and the socket.to() fallback used no forPlayerId, which made
          // the non-shooter always see player1's perspective.
          broadcastPerPlayerState(io, instance);
          // The shooter also gets the fireResult event for hit/miss feedback
          socket.emit('game:action', { type: 'fireResult', ...event.data });
          break;
        }
        case 'gameStart': {
          // Minesweeper config uses firstTurnId; sea battle uses firstTurn
          if (isSeaBattle) {
            broadcastPerPlayerState(io, instance);
          } else {
            io.to(instance.roomId).emit('game:state', stateForClient(instance.gameType, instance.state));
          }
          io.to(instance.roomId).emit('game:action', { type: 'gameStart', ...event.data });
          const firstTurn = (event.data.firstTurn ?? event.data.firstTurnId) as string | undefined;
          if (firstTurn) {
            io.to(instance.roomId).emit('game:action', { type: 'turn', nextPlayerId: firstTurn });
          }
          break;
        }
        case 'shipsPlaced':
          // Sea-battle MUST use per-player projection — the shared-state
          // default leaks player1's ship positions as player2's "myShips"
          // and breaks the auto-place button (player2 sees myShips already
          // filled, button stays disabled). For other games this event is
          // never emitted today, but the helper handles either case safely.
          broadcastPerPlayerState(io, instance);
          break;
        case 'error':
          socket.emit('room:error', event.data as { message: string });
          break;
      }
    }
    } catch (err) {
      socket.emit('room:error', { message: 'Internal game error' });
      console.error('Game action error (events):', err);
    }
  });

  socket.on('game:select', (data) => {
    const room = setGameType(socket.id, data.gameType);
    if (room) {
      io.to(room.id).emit('room:state', room);
    } else {
      // SV-H6: setGameType refused (not host, not in waiting state, or game
      // type invalid). Tell the client — the lobby selector is otherwise
      // silently inert on hosts trying to switch mid-game.
      socket.emit('room:error', { message: 'Tidak bisa ganti permainan sekarang' });
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
    // SV-H3: free per-socket rate-limiter entries eagerly rather than waiting
    // for the 60s sweep. A 10k-socket burst would otherwise hold 10k Map
    // entries until the next sweep tick.
    clearRateLimitsForSocket(socket.id);
    console.log(`[-] Player disconnected: ${socket.id}`);
  });
});

// === Helpers ===

// Sea-battle needs per-player projections even within one broadcast tick:
// the shooter sees the hit result immediately, the rest see the plain board.
type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;

// Per-player state broadcast. Sea-Battle projection strips opponent ship
// markers — every receiver MUST get a stateForClient call keyed to THEIR
// OWN forPlayerId. The old `io.to(room).emit(stateForClient(...))` pattern
// silently defaulted to player1's view for everyone, which is a cheat
// (and broke ship placement UX — see plan bug #1: shipsPlaced broadcast
// leaked player1's ship positions as player2's "myShips", disabling the
// "Tempatkan Kapal" button for player2).
function broadcastPerPlayerState(io: IOServer, instance: NonNullable<ReturnType<typeof findGameForSocket>>): void {
  const room = getRoom(instance.roomId);
  if (!room) return;
  for (const player of room.players) {
    const projection = stateForClient(instance.gameType, instance.state, player.id);
    io.to(player.id).emit('game:state', projection);
  }
}

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
  // C5: single source of truth for GameInstance cleanup. Replaces the
  // scattered GAMES.delete() calls in gameService.ts:103, gameService.ts:130,
  // and index.ts:224 — all paths now converge here.
  GAMES.delete(instance.roomId);
}

function currentTurnPlayerId(instance: NonNullable<ReturnType<typeof findGameForSocket>>): string | undefined {
  const s = instance.state as {
    currentTurn?: number | string;
    players?: { id: string }[];
  };
  // H1: always read from engine-owned state.currentTurn. The top-level
  // instance.currentTurnIndex is set once at createInstance and is never
  // updated when engines mutate state.currentTurn (post removePlayer/nextTurn).
  // Fallback to it ONLY as last resort for legacy engines that lack
  // state.currentTurn entirely.
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

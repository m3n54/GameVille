import type { Server, Socket } from 'socket.io';
import { createInstance, validateGameComposition } from './games/base';
import {
  GAMES,
  engines,
  stateForClient,
  processPlayerExit,
  allowEvent,
  findGameForSocket,
  clearRateLimitsForSocket,
  renameEnginePlayerId,
} from './gameService';
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
  findRoomByPin,
  takePendingExitByNickname,
  rebindSocketIndex,
} from './rooms';
import type { ClientToServerEvents, ServerToClientEvents, GameType, Room } from './types';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// === S1: guarded listener registration (audit H1) ============================
// socket.io invokes listeners inside process.nextTick WITHOUT a try/catch —
// one synchronous throw becomes an uncaughtException that kills the process
// and every in-memory room with it. Pre-S1, `data.ready` / `data.gameType` /
// `data.pin` / `callback(...)` on malformed or missing payloads were exactly
// such throws, reachable by any raw client (CORS admits requests without an
// Origin header). Every listener below is registered through this wrapper.
function safeHandler<A extends unknown[]>(
  name: string,
  socket: GameSocket,
  fn: (...args: A) => void,
): (...args: A) => void {
  return (...args: A) => {
    try {
      fn(...args);
    } catch (err) {
      console.error(`[Handler:${name}]`, err);
      socket.emit('room:error', { message: 'Terjadi kesalahan internal' });
    }
  };
}

// Runtime allow-list for game:select. TS unions don't exist on the wire — a raw
// client could otherwise write arbitrary strings into room.gameType (harmless
// today because game:start re-resolves the engine, but hostile garbage in the
// shared Room object is broadcast to every client).
const GAME_TYPES: readonly GameType[] = ['snakes-ladders', 'hangman', 'sea-battle', 'minesweeper'];

export function registerSocketHandlers(io: IO): void {
  io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    // === ROOM EVENTS ===

    socket.on('room:create', safeHandler('room:create', socket, (data, callback) => {
      // FE-F1: respond via ack instead of a fire-and-forget emit + client-side
      // socket.once() — the old pattern accumulated listeners across attempts.
      const ack = callback;
      if (!ack) return;

      if (!data || typeof data !== 'object') {
        ack({ ok: false, error: 'Data tidak valid' });
        return;
      }

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
    }));

    socket.on('room:join', safeHandler('room:join', socket, (data, callback) => {
      const ack = callback;
      if (!ack) return;

      // M7: rate-limit joins to blunt PIN enumeration.
      if (!allowEvent(`join:${socket.id}`, 10, 60_000)) {
        ack({ ok: false, error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
        return;
      }
      // S1: covers data === undefined/null/primitive before field access below.
      if (!data || typeof data !== 'object' || typeof data.pin !== 'string') {
        ack({ ok: false, error: 'Kode ruang tidak valid' });
        return;
      }
      const invalid = validatePlayer(data);
      if (invalid) {
        ack({ ok: false, error: invalid });
        return;
      }

      // M-1: joinRoom now reports WHY it refused (bad PIN/full/in-progress vs.
      // duplicate nickname) — the old `Room | null` forced one generic error
      // for every failure, hiding "Nickname sudah dipakai" from the joiner.
      const result = joinRoom(data.pin, data, socket.id);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }
      const room = result.room;
      socket.join(room.id);
      // SV-H4: see comment in room:create. nicknames are used only to match an
      // existing player on reconnect — they are never trusted to grant access.
      (socket.data as { nickname?: string }).nickname = data.nickname;
      (socket.data as { exited?: boolean }).exited = false;
      ack({ ok: true, room });
      // Single source of truth for membership: everyone gets the fresh list.
      io.to(room.id).emit('player:update', room.players);
      console.log(`[Room] Joined: ${data.pin} by ${data.nickname}`);
    }));

    // Same shared exit path as disconnect — leaving via the button mid-game used
    // to strand a ghost in the engine's turn rotation (H2).
    // SV-H5: ack the client so the UI can stop its loading state immediately
    // instead of waiting for the next room:sync or the next mount to recover.
    // C1: the disconnect handler will fire too — claimExit below is what makes
    // that second call safe (the guard moved here from the now socket-less
    // processPlayerExit). socket.leave is idempotent.
    // R1: an explicit leave is ALWAYS immediate — grace only softens LOST
    // connections, never a deliberate "Keluar".
    socket.on('room:leave', safeHandler('room:leave', socket, (callback?: (ack: { ok: boolean }) => void) => {
      const room = findByPlayer(socket.id);
      if (claimExit(socket)) processPlayerExit(io, socket.id, { immediate: true });
      if (room) socket.leave(room.id);
      if (callback) callback({ ok: true });
    }));

    // Client asks for room state after navigation or reconnect (same membership).
    // Membership is the source of truth — must work in any room state
    // (waiting/playing/finished), so we look up by member and verify the PIN
    // matches rather than searching by PIN (findByPin only returns 'waiting'
    // rooms, which would break mid-game recovery).
    // SV-H4: if findByPlayer misses (the socket id changed on reconnect), fall
    // back to reattaching by nickname on a waiting room.
    // R1 (audit H-3): mid-game reconnect is no longer a dead end — after the
    // waiting-room reattach fails, a seat left by a grace-window disconnect is
    // restored (see restoreMidGameSeat) and falls through to the SAME snapshot
    // ack as any other member (gameState + turnPlayerId).
    socket.on('room:sync', safeHandler('room:sync', socket, (data, callback) => {
      // S1: an omitted ack makes `callback(...)` below throw; refuse — there is
      // nobody to answer. Same for a missing/non-object payload (data.pin).
      if (typeof callback !== 'function') return;
      if (!data || typeof data !== 'object' || typeof data.pin !== 'string') {
        callback({ ok: false, error: 'Kode ruang tidak valid' });
        return;
      }

      // R1: after a page reload BOTH the socket and its socket.data are new, so
      // the identity must come from the payload (client's sessionStorage) when
      // present; socket.data stays the fallback for reconnects on a live socket.
      // A nickname alone never grants access — every rejoin path below still
      // requires a matching member record / pending exit.
      const nickname = (typeof data.nickname === 'string' && data.nickname.length > 0
        ? data.nickname
        : undefined)
        ?? (socket.data as { nickname?: string }).nickname;

      let memberRoom = findByPlayer(socket.id);
      if ((!memberRoom || memberRoom.pin !== data.pin) && data.pin) {
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
      // R1 (audit H-3): mid-game seat restore. Only runs when the membership
      // paths above missed; on success the common ack code below replays the
      // game snapshot + turn exactly like any other mid-game sync.
      if ((!memberRoom || memberRoom.pin !== data.pin) && data.pin && nickname) {
        const restored = restoreMidGameSeat(io, socket, data.pin, nickname);
        if (restored) memberRoom = restored;
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
    }));

    socket.on('player:ready', safeHandler('player:ready', socket, (data) => {
      // S1: `data.ready` on a missing payload used to throw inside the listener
      // (uncaughtException → dead process). Tolerate only well-formed input.
      if (!data || typeof data.ready !== 'boolean') return;
      const room = toggleReady(socket.id, data.ready);
      if (room) {
        io.to(room.id).emit('player:update', room.players);
      }
    }));

    socket.on('game:start', safeHandler('game:start', socket, () => {
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
      // G1 (audit H2): per-game composition contract — Sea Battle with 3-4
      // players used to start, leaving phantom members whose disconnect
      // instantly forfeited the match to player1 (and leaked player2's grid
      // to them). Reject with a player-facing message instead.
      const compositionError = validateGameComposition(roomData.gameType, roomData.players.length);
      if (compositionError) {
        socket.emit('room:error', { message: compositionError });
        return;
      }

      const playerOrder = roomData.players.map((p) => p.id);
      const instance = createInstance(engine, roomData.id, playerOrder);

      GAMES.set(roomData.id, instance);
      setRoomState(roomData.id, 'playing');

      // Notify all players
      io.to(roomData.id).emit('game:started', roomData.gameType);
      // C1-followup (found by the L-4 integration test): the bare
      // stateForClient call has no forPlayerId, and seaBattleView's anti-cheat
      // guard throws for a missing id — safeHandler caught the throw, but the
      // initial game:state never shipped and the first 'turn' emit below was
      // skipped. Sea-battle must project per-player from the very first
      // broadcast; shared-state games keep the room broadcast.
      if (roomData.gameType === 'sea-battle') {
        broadcastPerPlayerState(io, instance);
      } else {
        io.to(roomData.id).emit('game:state', stateForClient(instance.gameType, instance.state));
      }

      // Notify whose turn it is
      const currentPlayerId = instance.playerOrder[instance.currentTurnIndex];
      if (currentPlayerId) {
        io.to(roomData.id).emit('game:action', { type: 'turn', nextPlayerId: currentPlayerId });
      }
    }));

    socket.on('game:action', safeHandler('game:action', socket, (data) => {
      // S1 (audit M-3): game:action used to be the only un-rate-limited gameplay
      // event — a raw client could flood the engine dispatch at wire speed.
      // 30/10s is far above any real turn-based cadence (reveal chains included).
      if (!allowEvent(`act:${socket.id}`, 30, 10_000)) return;
      // S1: `data.type` is read by the M2 check below BEFORE the engine
      // try/catch — a missing payload used to throw outside any guard.
      if (!data || typeof data.type !== 'string') return;

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
            // S2: the wire payload must carry the `type` discriminator — the
            // old bare `event.data` emit meant SnakesLaddersContainer's
            // `action.type === 'diceResult'` branch (hop animation, roll SFX)
            // never ran; pawns silently teleported via the state broadcast.
            io.to(instance.roomId).emit('game:state', stateForClient(instance.gameType, instance.state));
            io.to(instance.roomId).emit('game:action', { type: 'diceResult', ...event.data });
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
            // L-4: the fireResult event itself now goes to the WHOLE room —
            // the old socket.emit left the defender without hit/miss feedback
            // for shots landing on THEIR board. Safe to broadcast: the payload
            // ({playerId,row,col,hit,sunkShip}) leaks no ship positions; the
            // 'H'/'M' mark is already visible in the defender's own enemy-grid
            // projection.
            io.to(instance.roomId).emit('game:action', { type: 'fireResult', ...event.data });
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
    }));

    socket.on('game:select', safeHandler('game:select', socket, (data) => {
      // S1: `data.gameType` on a missing payload used to throw inside the
      // listener; validate object shape + runtime allow-list before writing
      // anything into the shared Room.
      if (!data || typeof data.gameType !== 'string' || !(GAME_TYPES as readonly string[]).includes(data.gameType)) {
        socket.emit('room:error', { message: 'Permainan tidak dikenal' });
        return;
      }
      const room = setGameType(socket.id, data.gameType);
      if (room) {
        io.to(room.id).emit('room:state', room);
      } else {
        // SV-H6: setGameType refused (not host, not in waiting state, or game
        // type invalid). Tell the client — the lobby selector is otherwise
        // silently inert on hosts trying to switch mid-game.
        socket.emit('room:error', { message: 'Tidak bisa ganti permainan sekarang' });
      }
    }));

    socket.on('chat:message', safeHandler('chat:message', socket, (data) => {
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
    }));

    socket.on('reaction:send', safeHandler('reaction:send', socket, (data) => {
      const room = findRoomOfSocket(socket.id);
      if (!room) return;
      // S1 (audit M-2): reactions used to be the one broadcast without a rate
      // limit — a single socket could flood the whole room with emoji.
      if (!allowEvent(`react:${socket.id}`, 10, 10_000)) return;
      const emoji = typeof data?.emoji === 'string' ? data.emoji.slice(0, 8) : '';
      if (!emoji) return;
      socket.to(room).emit('reaction:received', {
        playerId: socket.id,
        nickname: nicknameOf(room, socket.id),
        emoji,
      });
    }));

    socket.on('disconnect', safeHandler('disconnect', socket, () => {
      // C1: claim first — a room:leave for this socket may have already run.
      // R1: NOT immediate — a mid-game disconnect enters the grace window
      // (gameService.processPlayerExit) so a blip/refresh can reclaim the
      // seat; waiting/finished rooms exit immediately as before.
      if (claimExit(socket)) processPlayerExit(io, socket.id);
      // SV-H3: free per-socket rate-limiter entries eagerly rather than waiting
      // for the 60s sweep. A 10k-socket burst would otherwise hold 10k Map
      // entries until the next sweep tick.
      clearRateLimitsForSocket(socket.id);
      console.log(`[-] Player disconnected: ${socket.id}`);
    }));
  });
}

// === Helpers ===

// C1: claim this socket's exit so the later 'disconnect' (or a duplicate
// room:leave) short-circuits instead of re-running the exit path against an
// already-spliced room. Returns true on the first claim only.
function claimExit(socket: GameSocket): boolean {
  const data = socket.data as { exited?: boolean };
  if (data.exited) return false;
  data.exited = true;
  return true;
}

// R1 (audit H-3): restore a seat left by a grace-window disconnect. Returns
// the room on success, null when the caller must fall through to the generic
// "not a member" ack. The pending-exit entry is the ONLY key that can restore
// a seat — it is consumed on take, so the seat of an actively connected player
// can never be hijacked by a second client claiming the same nickname.
// Renaming the id (room record, C2 index, instance.playerOrder, engine state)
// is all that's needed: every engine resolves turns from flat ids, so no
// engine logic changes.
function restoreMidGameSeat(io: IOServer, socket: GameSocket, pin: string, nickname: string): Room | null {
  const room = findRoomByPin(pin);
  if (!room || room.state !== 'playing') return null;
  const player = room.players.find((p) => p.nickname === nickname);
  if (!player) return null;
  const pending = takePendingExitByNickname(room.id, nickname);
  if (!pending) return null;

  const oldId = pending.socketId;
  player.id = socket.id;
  delete player.disconnected;
  // Old socket is gone: re-point the C2 index so findByPlayer(oldId) cannot
  // resurrect the seat (e.g. a late duplicate disconnect packet).
  rebindSocketIndex(oldId, socket.id, room.id);

  const instance = GAMES.get(room.id);
  if (instance) {
    instance.playerOrder = instance.playerOrder.map((id) => (id === oldId ? socket.id : id));
    renameEnginePlayerId(instance.gameType, instance.state, oldId, socket.id);
  }

  // Brand-new session — reset the C1 exit flag and tell the room the player
  // is back (every client clears its "menyambung ulang…" indicator).
  (socket.data as { exited?: boolean }).exited = false;
  io.to(room.id).emit('player:update', room.players);
  console.log(`[Room] Mid-game rejoin: ${nickname} restored in ${room.pin}`);
  return room;
}

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

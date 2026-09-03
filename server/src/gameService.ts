import type { Server } from 'socket.io';
import { GameInstance, BaseGame } from './games/base';
import { SnakesLaddersEngine } from './games/snakes-ladders';
import { HangmanEngine, toHangmanView } from './games/hangman';
import type { HangmanExtendedState } from './games/hangman';
import { SeaBattleEngine, seaBattleView } from './games/sea-battle';
import { MinesweeperEngine, toView } from './games/minesweeper';
import { leaveRoom, setRoomState, getRoom, findByPlayer, listRooms, deleteRoom, markPendingExit, expirePendingExits, clearPendingExit } from './rooms';
import type { ClientToServerEvents, ServerToClientEvents } from './types';

// === Domain layer (L2) ======================================================
// All game-instance lifecycle logic lives here; index.ts stays transport-only.
// Extracted from index.ts so the exit path (disconnect vs room:leave) is ONE
// code path instead of two divergent ones (H1 + H2).

export const GAMES = new Map<string, GameInstance>();

export const engines: Record<string, BaseGame> = {
  'snakes-ladders': new SnakesLaddersEngine(),
  'hangman': new HangmanEngine(),
  'sea-battle': new SeaBattleEngine(),
  'minesweeper': new MinesweeperEngine(),
};

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

// === Anti-cheat projection ==================================================
// Every game:state emit goes through this function:
//   - minesweeper clients never receive the raw grid (hasBomb leaks)
//   - hangman clients never receive the secret word until game over
//   - sea-battle clients only see their own grid plus enemy hit/miss marks
//     (C1 fix — the raw state used to be broadcast verbatim)
export function stateForClient(gameType: string, state: unknown, forPlayerId?: string): unknown {
  if (gameType === 'minesweeper') return toView(state as Parameters<typeof toView>[0]);
  if (gameType === 'hangman') return toHangmanView(state as HangmanExtendedState);
  if (gameType === 'sea-battle') return seaBattleView(state as Parameters<typeof seaBattleView>[0], forPlayerId);
  return state;
}

// === Turn resolution ========================================================
// Snakes/hangman/minesweeper track the turn differently (players array with a
// currentTurn index vs. playerOrder). Centralize that lookup — it was duplicated
// in the disconnect handler and each engine's action flow.
export function computeNextTurnId(instance: GameInstance): string | null {
  const s = instance.state as {
    currentTurn?: number | string;
    players?: { id: string }[];
  };
  // sea-battle stores the current player's id in state.currentTurn (string)
  if (typeof s.currentTurn === 'string') return s.currentTurn;
  if (s.players && typeof s.currentTurn === 'number') {
    return s.players[s.currentTurn]?.id ?? null;
  }
  const order = instance.playerOrder;
  const idx = typeof s.currentTurn === 'number' ? s.currentTurn : 0;
  return order[idx] ?? null;
}

// === Shared player-exit path (H1 + H2 + R1) ==================================
// Used by the socket 'disconnect' handler, the explicit 'room:leave' handler,
// and the R1 grace sweeper (processExpiredExits). Previously only disconnect
// pruned engine state, so leaving via the button mid-game stranded a ghost in
// the turn rotation (H2), and the last-leaver path returned no roomId so the
// GAMES entry leaked forever (H1).
//
// R1 (audit H-3): the function no longer takes the Socket — a grace-expired
// exit must run for a socket id whose Socket object is long gone. The C1
// `socket.data.exited` guard therefore moved up into the socketHandlers
// callers; this function is idempotent per call instead.
//
// Semantics preserved verbatim from the old disconnect handler:
//   - finished room → delete the game snapshot / reset to waiting (C5)
//   - mid-game      → engine.removePlayer (forfeit / solo-continuation per
//                     engine), then either game:over or refreshed state + turn
// NEW (R1): mid-game + NOT immediate + live GAMES entry → grace path: the seat
// stays (no splice, no host reassignment, no index churn) so a refreshed/blipped
// client can reclaim it via room:sync until GRACE_MS passes.
export function processPlayerExit(io: IO, socketId: string, opts: { immediate?: boolean } = {}): void {
  const immediate = opts.immediate === true;

  // R1 grace path — MUST run before leaveRoom: leaveRoom splices the player
  // and reassigns the host, which is exactly what the grace window postpones.
  // Only for genuine disconnects; an explicit room:leave stays immediate.
  // Waiting/finished rooms and game-less rooms fall through to the immediate
  // path exactly as before, so lobby disconnects behave unchanged.
  if (!immediate) {
    const room = findByPlayer(socketId);
    const player = room?.players.find((p) => p.id === socketId);
    if (room && player && room.state === 'playing' && GAMES.has(room.id)) {
      markPendingExit(socketId, room, player);
      io.to(room.id).emit('player:update', room.players);
      return;
    }
  }

  // Fully leaving now — any pending-exit record for this socket is obsolete.
  clearPendingExit(socketId);

  const result = leaveRoom(socketId);

  if (!result.roomId) return;

  const room = getRoom(result.roomId);

  // Membership change → always broadcast the fresh player list (single source
  // of truth; replaces the orphan player:left / conditional player:update).
  io.to(result.roomId).emit('player:update', room?.players ?? []);

  // Room is gone (last leaver) → its game instance must go too (H1).
  if (!room) {
    GAMES.delete(result.roomId);
    return;
  }

  if (result.newHost) {
    console.log(`[Room] ${result.roomId} new host: ${result.newHost.nickname}`);
  }

  const game = GAMES.get(result.roomId);
  if (!game) return;

  if (room.state === 'finished') {
    // C5: GameInstance was already deleted by broadcastGameOver (the single
    // source of truth for GAMES cleanup). The room state is reset here so
    // a player who left the winner modal can rejoin via the F9 rejoin form
    // (rooms.ts:leaveRoom preserves finished rooms when empty). Broadcast
    // the state change so any remaining members see the room re-open
    // rather than staying stuck on the "Game selesai" overlay.
    setRoomState(result.roomId, 'waiting');
    io.to(result.roomId).emit('room:state', room);
    return;
  }

  // Mid-game exit (immediate path; grace expiry lands here too via
  // processExpiredExits): prune the leaver so turns never rotate to a ghost.
  finishImmediateMidGameExit(io, result.roomId, game, socketId);
}

// Tail of the immediate mid-game exit, extracted verbatim from the old
// handlePlayerExit (now processPlayerExit) so BOTH callers (live exit + R1
// grace expiry) replay the exact same engine/forfeit semantics without
// duplication.
function finishImmediateMidGameExit(io: IO, roomId: string, game: GameInstance, leaverId: string): void {
  const room = getRoom(roomId);
  const engine = engines[game.gameType];
  if (!room || !engine) return;
  const outcome = engine.removePlayer(game.state, leaverId);
  game.playerOrder = outcome.playerOrder.length > 0
    ? outcome.playerOrder
    : game.playerOrder.filter((id) => id !== leaverId);

  if (outcome.gameOver) {
    const winnerState = game.state as { winner?: string | null };
    const wId = winnerState.winner ?? 'none';
    const winnerName = wId === 'team' ? 'Tim'
      : wId === 'none' ? '-'
        : room.players.find((p) => p.id === wId)?.nickname ?? 'Unknown';
    io.to(roomId).emit('game:over', { winnerId: wId, winnerName });
    setRoomState(roomId, 'finished');
    GAMES.delete(roomId); // forfeit ends the match — nothing left to keep
  } else {
    io.to(roomId).emit('game:state', stateForClient(game.gameType, game.state));
    const nextId = computeNextTurnId(game);
    if (nextId) {
      io.to(roomId).emit('game:action', { type: 'turn', nextPlayerId: nextId });
    }
  }
}

// R1 (audit H-3): how long a mid-game-disconnected seat stays reclaimable
// before the sweeper forfeits it. 60s covers a page refresh plus a slow
// reconnect; turn starvation during the window is the accepted trade-off
// (turn timeouts are audit item M-5, tracked separately).
export const GRACE_MS = 60_000;

// Pure sweep logic, separated from the interval so tests can drive expiry with
// a synthetic clock (same pattern as sweepRooms). Each expired pending exit
// replays the immediate exit path for the OLD socket id: leaveRoom(oldId)
// splices the still-present record → engine.removePlayer → forfeit/game:over
// or state+turn refresh — exactly what a disconnect did pre-R1.
export function processExpiredExits(io: IO, now: number): void {
  for (const expired of expirePendingExits(now, GRACE_MS)) {
    processPlayerExit(io, expired.socketId, { immediate: true });
  }
}

export function startExitSweeper(io: IO): void {
  setInterval(() => processExpiredExits(io, Date.now()), 10_000).unref();
}

// R1 (audit H-3): rename a player id across every engine state that stores it.
// All engines keep player ids flat in state, so an in-place rename restores a
// seat without touching any engine logic. Per-game shapes (keep in sync if a
// future engine stores ids elsewhere):
//   snakes-ladders → state.players[].id
//   hangman        → state.playerOrder[]
//   sea-battle     → state.player1Id / player2Id / currentTurn (string id)
//   minesweeper    → state.playerOrder[]
export function renameEnginePlayerId(gameType: string, state: unknown, oldId: string, newId: string): void {
  switch (gameType) {
    case 'snakes-ladders': {
      const s = state as { players?: { id: string }[] };
      for (const p of s.players ?? []) {
        if (p.id === oldId) p.id = newId;
      }
      break;
    }
    // hangman + minesweeper share the playerOrder[] shape.
    case 'hangman':
    case 'minesweeper': {
      const s = state as { playerOrder?: string[] };
      if (s.playerOrder) s.playerOrder = s.playerOrder.map((id) => (id === oldId ? newId : id));
      break;
    }
    case 'sea-battle': {
      const s = state as { player1Id?: string; player2Id?: string; currentTurn?: string };
      if (s.player1Id === oldId) s.player1Id = newId;
      if (s.player2Id === oldId) s.player2Id = newId;
      if (s.currentTurn === oldId) s.currentTurn = newId;
      break;
    }
  }
}

// === Rate limiting (M7) =====================================================
// Tiny sliding-window limiter keyed by socket id + event name. In-memory by
// design — the server is single-instance on Render free tier.
const rateBuckets = new Map<string, number[]>();

// SV-H3: explicit per-socket cleanup hook so disconnecting clients free their
// rate-limiter entries immediately rather than waiting for the 60s sweep.
export function clearRateLimitsForSocket(socketId: string): void {
  for (const key of Array.from(rateBuckets.keys())) {
    if (key.endsWith(`:${socketId}`)) rateBuckets.delete(key);
  }
}

export function allowEvent(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (bucket.length >= max) {
    rateBuckets.set(key, bucket); // drop expired entries even when rejecting
    return false;
  }
  bucket.push(now);
  rateBuckets.set(key, bucket);
  return true;
}

// Periodically drop stale buckets so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of rateBuckets) {
    const alive = times.filter((t) => now - t < 60_000);
    if (alive.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, alive);
  }
}, 60_000).unref();

// === Room TTL sweep (L1 + M-4) ==============================================
// Pure sweep logic, separated from the interval so tests can drive it with a
// synthetic clock. L1: 'waiting' rooms whose host idles for hours would
// otherwise live forever. M-4: 'finished' rooms linger too when players sit on
// the winner modal without leaving — same 2h TTL, plus a defensive GAMES
// delete (broadcastGameOver normally removed the instance already).
export function sweepRooms(now: number): void {
  for (const room of listRooms()) {
    // 'playing' rooms are never reaped, no matter how long a match runs.
    if (room.state === 'playing') continue;
    if (now - room.createdAt <= 2 * 60 * 60 * 1000) continue;
    GAMES.delete(room.id);
    deleteRoom(room.id);
    console.log(`[Sweeper] Removed stale ${room.state} room ${room.pin}`);
  }
}

export function startRoomSweeper(): void {
  setInterval(() => sweepRooms(Date.now()), 10 * 60 * 1000).unref();
}

export function findGameForSocket(socketId: string): GameInstance | null {
  for (const [, instance] of GAMES) {
    if (instance.playerOrder.includes(socketId)) return instance;
  }
  return null;
}

export function findRoomOf(socketId: string) {
  return findByPlayer(socketId);
}

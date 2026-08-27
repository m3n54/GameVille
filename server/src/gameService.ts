import type { Server, Socket } from 'socket.io';
import { GameInstance, BaseGame } from './games/base';
import { SnakesLaddersEngine } from './games/snakes-ladders';
import { HangmanEngine, toHangmanView } from './games/hangman';
import type { HangmanExtendedState } from './games/hangman';
import { SeaBattleEngine, seaBattleView } from './games/sea-battle';
import { MinesweeperEngine, toView } from './games/minesweeper';
import { leaveRoom, setRoomState, getRoom, findByPlayer, listRooms, deleteRoom } from './rooms';
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

// === Shared player-exit path (H1 + H2) ======================================
// Used by BOTH the socket 'disconnect' handler and the explicit 'room:leave'
// handler. Previously only disconnect pruned engine state, so leaving via the
// button mid-game stranded a ghost in the turn rotation (H2), and the
// last-leaver path returned no roomId so the GAMES entry leaked forever (H1).
//
// Semantics preserved verbatim from the old disconnect handler:
//   - finished room → delete the game snapshot
//   - mid-game      → engine.removePlayer (forfeit / solo-continuation per engine),
//                     then either game:over or refreshed state + turn event
export function handlePlayerExit(io: IO, socket: Socket): void {
  // C1: socket.io fires both 'room:leave' and 'disconnect' for the same
  // logical exit. Without this guard, the second call hits an empty room
  // (findByPlayer returns undefined on the splice that already ran) and
  // would either no-op or, worse, attempt engine.removePlayer on a game
  // whose GAMES entry was just deleted by the first call. Mark the socket
  // on first invocation; subsequent calls short-circuit.
  if ((socket.data as { exited?: boolean }).exited) return;
  (socket.data as { exited?: boolean }).exited = true;

  const result = leaveRoom(socket.id);

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
    GAMES.delete(result.roomId);
    // Reset to 'waiting' so a player who left the winner modal can rejoin the
    // same PIN via the F9 rejoin form (rooms.ts:leaveRoom preserves finished
    // rooms when empty). Broadcast the state change so any remaining members
    // also see the room re-open rather than staying stuck on the "Game
    // selesai" overlay with no path forward.
    setRoomState(result.roomId, 'waiting');
    io.to(result.roomId).emit('room:state', room);
    return;
  }

  // Mid-game exit: prune the leaver so turns never rotate to a ghost.
  const engine = engines[game.gameType];
  if (!engine) return;
  const outcome = engine.removePlayer(game.state, socket.id);
  game.playerOrder = outcome.playerOrder.length > 0
    ? outcome.playerOrder
    : game.playerOrder.filter((id) => id !== socket.id);

  if (outcome.gameOver) {
    const winnerState = game.state as { winner?: string | null };
    const wId = winnerState.winner ?? 'none';
    const winnerName = wId === 'team' ? 'Tim'
      : wId === 'none' ? '-'
        : room.players.find((p) => p.id === wId)?.nickname ?? 'Unknown';
    io.to(result.roomId).emit('game:over', { winnerId: wId, winnerName });
    setRoomState(result.roomId, 'finished');
    GAMES.delete(result.roomId); // forfeit ends the match — nothing left to keep
  } else {
    io.to(result.roomId).emit('game:state', stateForClient(game.gameType, game.state));
    const nextId = computeNextTurnId(game);
    if (nextId) {
      io.to(result.roomId).emit('game:action', { type: 'turn', nextPlayerId: nextId });
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

// === Room TTL sweep (L1) ====================================================
// Waiting rooms whose host idles for hours would otherwise live forever.
// Sweep every 10 min: delete 'waiting' rooms older than 2h (and their games).
export function startRoomSweeper(): void {
  setInterval(() => {
    const now = Date.now();
    for (const room of listRooms()) {
      if (room.state === 'waiting' && now - room.createdAt > 2 * 60 * 60 * 1000) {
        GAMES.delete(room.id);
        deleteRoom(room.id);
        console.log(`[Sweeper] Removed idle waiting room ${room.pin}`);
      }
    }
  }, 10 * 60 * 1000).unref();
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

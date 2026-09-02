import { v4 as uuidv4 } from 'uuid';
import { Room, Player, GameType } from './types';

const ROOMS = new Map<string, Room>();

// C2: socket→room O(1) index. Replaces the O(N×M) `Array.from(ROOMS.values())
// .find(r => r.players.some(p => p.id === socketId))` scan that ran on every
// event handler (room:leave, room:sync, disconnect, game:start, game:action,
// chat:message, reaction:send). Write in createRoom / joinRoom / leaveRoom;
// clear in leaveRoom. findByPlayer now consults the index first.
const SOCKET_TO_ROOM = new Map<string, string>();

// M5: identity fields arrive from untrusted clients. Validate once at the door
// so oversized/hostile strings never enter ROOMS memory or get broadcast.
// S1: callers may pass any garbage (missing payload on room:create used to
// throw `data.name` inside the handler — uncaughtException pre-safeHandler),
// so a non-object payload is an error STRING, never an exception.
// `name` is host-only (room display name); joiners don't have it — see
// validatePlayer below for the joiner-side check.
export function validateIdentity(data: {
  name?: unknown; nickname?: unknown; color?: unknown; emoji?: unknown;
}): string | null {
  if (!data || typeof data !== 'object') return 'Data tidak valid';
  if (typeof data.name !== 'string' || data.name.trim().length === 0 || data.name.length > 40) {
    return 'Nama ruang harus 1-40 karakter';
  }
  return validatePlayer(data);
}

// Joiner payload — only nickname/color/emoji. No `name`: the room's name is
// already chosen by the host at create time and isn't something a joiner
// contributes. Keeping the two checks separate fixes the JoinRoom -> "Nama
// ruang harus 1-40 karakter" bug, where the joiner had no name field to send.
export function validatePlayer(data: {
  nickname?: unknown; color?: unknown; emoji?: unknown;
}): string | null {
  if (!data || typeof data !== 'object') return 'Data tidak valid';
  if (typeof data.nickname !== 'string' || data.nickname.trim().length === 0 || data.nickname.length > 24) {
    return 'Nickname harus 1-24 karakter';
  }
  if (typeof data.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(data.color)) {
    return 'Warna tidak valid';
  }
  // ≤8 code units covers emoji with surrogate pairs; longer input is abuse.
  if (typeof data.emoji !== 'string' || data.emoji.length === 0 || data.emoji.length > 8) {
    return 'Emoji tidak valid';
  }
  return null;
}

function generatePin(): string {
  let pin: string;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (Array.from(ROOMS.values()).some(r => r.pin === pin && r.state !== 'finished'));
  return pin;
}

export function createRoom(data: { name: string; nickname: string; color: string; emoji: string }, socketId: string): Room {
  const player: Player = {
    id: socketId,
    nickname: data.nickname,
    color: data.color,
    emoji: data.emoji,
    isHost: true,
    isReady: false,
    joinedAt: Date.now(),
  };

  const room: Room = {
    id: uuidv4(),
    pin: generatePin(),
    name: data.name,
    gameType: null,
    hostId: socketId,
    players: [player],
    state: 'waiting',
    createdAt: Date.now(),
  };

  ROOMS.set(room.id, room);
  SOCKET_TO_ROOM.set(socketId, room.id);
  return room;
}

export function joinRoom(pin: string, data: { nickname: string; color: string; emoji: string }, socketId: string): Room | null {
  const room = findByPin(pin);
  if (!room) return null;
  if (room.state !== 'waiting') return null;
  if (room.players.length >= 4) return null;
  // C3: same socket trying to join twice (e.g. user has the room open in
  // two tabs) would otherwise push a second player record under the same id.
  // When one tab disconnects, handlePlayerExit would remove the player that
  // BOTH tabs were rendering, and the surviving tab loses its membership.
  if (room.players.some(p => p.id === socketId)) return room;
  // Defensive: if the index already maps this socket to this room, the
  // membership is in sync; return current state without pushing.
  if (SOCKET_TO_ROOM.get(socketId) === room.id) return room;

  const player: Player = {
    id: socketId,
    nickname: data.nickname,
    color: data.color,
    emoji: data.emoji,
    isHost: false,
    isReady: false,
    joinedAt: Date.now(),
  };

  room.players.push(player);
  SOCKET_TO_ROOM.set(socketId, room.id);
  return room;
}

export function leaveRoom(socketId: string): { roomId?: string; newHost?: Player } {
  const room = findByPlayer(socketId);
  if (!room) return {};

  const index = room.players.findIndex(p => p.id === socketId);
  if (index === -1) return {};

  room.players.splice(index, 1);
  SOCKET_TO_ROOM.delete(socketId);

  // Assign new host if host left
  if (room.hostId === socketId && room.players.length > 0) {
    const nextHost = room.players[0]!;
    nextHost.isHost = true;
    room.hostId = nextHost.id;
    return { roomId: room.id, newHost: nextHost };
  }

  // Clean up empty rooms — EXCEPT 'finished' rooms, which the F9 rejoin flow
  // depends on staying alive. The host who finishes a game can still be in
  // the lobby (winner modal) and may want to play again from the same PIN;
  // auto-deleting a finished room the moment it empties stranded them on a
  // "Kode ruang tidak valid" error after leave → rejoin. Reset to 'waiting'
  // so the next room:join via findByPin (which only matches 'waiting' rooms)
  // admits the same player back into the same room.
  if (room.players.length === 0) {
    if (room.state === 'finished') {
      room.state = 'waiting';
      return { roomId: room.id };
    }
    ROOMS.delete(room.id);
    return { roomId: room.id };
  }

  // H1 fix: still report the roomId so the caller can delete the matching
  // GAMES entry — the old `return {}` made the disconnect handler skip game
  // cleanup entirely, leaking one GameInstance per abandoned game forever.
  return { roomId: room.id };
}

export function toggleReady(socketId: string, ready: boolean): Room | null {
  const room = findByPlayer(socketId);
  if (!room) return null;

  const player = room.players.find(p => p.id === socketId);
  if (player) player.isReady = ready;

  return room;
}

export function setGameType(socketId: string, gameType: GameType): Room | null {
  const room = findByPlayer(socketId);
  if (!room) return null;
  if (room.hostId !== socketId) return null;
  // SV-H6: refuse to switch games mid-match. Without this, the host could
  // flip room.gameType while GAMES still holds the old engine, and the next
  // game:action would resolve engines[room.gameType] to the new engine but
  // findGameForSocket would return the old instance — the new engine would
  // mutate the wrong state, then stateForClient would crash on a type mismatch.
  if (room.state !== 'waiting') return null;

  room.gameType = gameType;
  return room;
}

export function canStartGame(roomId: string): boolean {
  const room = ROOMS.get(roomId);
  if (!room) return false;
  if (!room.gameType) return false;
  if (room.players.length < 2) return false;
  if (room.players.some(p => !p.isReady && !p.isHost)) return false;
  return true;
}

export function setRoomState(roomId: string, state: Room['state']): void {
  const room = ROOMS.get(roomId);
  if (room) room.state = state;
}

// After a finished game, allow the host to start a new one in the same room.
// Clears ready flags (every player confirms again) and removes any finished
// GameInstance so the next `game:start` builds a fresh one. The GAMES Map
// entry must be deleted — otherwise `findGameForSocket` (gameService.ts) still
// points at the old `state.winner` and `game:action` returns early (line 207).
export function resetRoomForNewGame(roomId: string): Room | null {
  const room = ROOMS.get(roomId);
  if (!room) return null;
  for (const p of room.players) p.isReady = false;
  room.state = 'waiting';
  return room;
}

// C5: single source of truth for GameInstance cleanup. Called from EXACTLY
// one place per game-over flow (broadcastGameOver in index.ts) and defensively
// at the start of `game:start` to overwrite any stale entry. Direct calls
// elsewhere risk duplicate deletes and inconsistent state transitions.
export function clearGameInstance(roomId: string, GAMES: Map<string, unknown>): boolean {
  return GAMES.delete(roomId);
}

export function getRoom(roomId: string): Room | undefined {
  return ROOMS.get(roomId);
}

export function findByPin(pin: string): Room | undefined {
  return Array.from(ROOMS.values()).find(r => r.pin === pin && r.state === 'waiting');
}

export function findByPlayer(socketId: string): Room | undefined {
  // C2: O(1) lookup via SOCKET_TO_ROOM. The old linear scan was O(N×M) and
  // ran on every event handler — the bottleneck for any non-trivial room count.
  const roomId = SOCKET_TO_ROOM.get(socketId);
  if (!roomId) return undefined;
  const room = ROOMS.get(roomId);
  if (!room) {
    // Index drift: the room vanished but the entry remained. Defensive cleanup.
    SOCKET_TO_ROOM.delete(socketId);
    return undefined;
  }
  // Final sanity: the player must still be in the room. This protects against
  // any path that mutates room.players without going through leaveRoom.
  if (!room.players.some(p => p.id === socketId)) {
    SOCKET_TO_ROOM.delete(socketId);
    return undefined;
  }
  return room;
}

// SV-H4: re-attach a freshly-reconnected socket to its existing player
// record by nickname. Socket.io assigns a new id on every transport reset, so
// findByPlayer(newId) misses; without this path, a brief network blip locked
// the player out of their own room until reset.
//
// Only valid in 'waiting' rooms — mid-game re-attach would race with the
// active engine (engine state references old player id in playerOrder etc).
// Returns the updated room or null if no matching player was found.
export function reattachPlayer(newSocketId: string, nickname: string, pin: string): { room: Room; player: Player } | null {
  const room = findByPin(pin);
  if (!room) return null;
  if (room.state !== 'waiting') return null;
  const existing = room.players.find(p => p.nickname === nickname);
  if (!existing) return null;
  // If the old id is still in the index (e.g. a stale entry from a prior
  // socket that never had its leave handler run), clear it.
  if (existing.id !== newSocketId) {
    SOCKET_TO_ROOM.delete(existing.id);
    existing.id = newSocketId;
  }
  SOCKET_TO_ROOM.set(newSocketId, room.id);
  return { room, player: existing };
}

export function listRooms(): Room[] {
  return Array.from(ROOMS.values());
}

export function deleteRoom(roomId: string): void {
  ROOMS.delete(roomId);
}

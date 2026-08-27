import { v4 as uuidv4 } from 'uuid';
import { Room, Player, GameType } from './types';

const ROOMS = new Map<string, Room>();

// M5: identity fields arrive from untrusted clients. Validate once at the door
// so oversized/hostile strings never enter ROOMS memory or get broadcast.
// `name` is host-only (room display name); joiners don't have it — see
// validatePlayer below for the joiner-side check.
export function validateIdentity(data: {
  name?: unknown; nickname?: unknown; color?: unknown; emoji?: unknown;
}): string | null {
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
  return room;
}

export function joinRoom(pin: string, data: { nickname: string; color: string; emoji: string }, socketId: string): Room | null {
  const room = findByPin(pin);
  if (!room) return null;
  if (room.state !== 'waiting') return null;
  if (room.players.length >= 4) return null;

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
  return room;
}

export function leaveRoom(socketId: string): { roomId?: string; newHost?: Player } {
  const room = findByPlayer(socketId);
  if (!room) return {};

  const index = room.players.findIndex(p => p.id === socketId);
  if (index === -1) return {};

  room.players.splice(index, 1);

  // Assign new host if host left
  if (room.hostId === socketId && room.players.length > 0) {
    const nextHost = room.players[0]!;
    nextHost.isHost = true;
    room.hostId = nextHost.id;
    return { roomId: room.id, newHost: nextHost };
  }

  // Clean up empty rooms. H1 fix: still report the roomId so the caller can
  // delete the matching GAMES entry — the old `return {}` made the disconnect
  // handler skip game cleanup entirely, leaking one GameInstance per abandoned
  // game forever.
  if (room.players.length === 0) {
    ROOMS.delete(room.id);
    return { roomId: room.id };
  }

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

export function getRoom(roomId: string): Room | undefined {
  return ROOMS.get(roomId);
}

export function findByPin(pin: string): Room | undefined {
  return Array.from(ROOMS.values()).find(r => r.pin === pin && r.state === 'waiting');
}

export function findByPlayer(socketId: string): Room | undefined {
  return Array.from(ROOMS.values()).find(r => r.players.some(p => p.id === socketId));
}

export function listRooms(): Room[] {
  return Array.from(ROOMS.values());
}

export function deleteRoom(roomId: string): void {
  ROOMS.delete(roomId);
}

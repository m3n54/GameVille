import { describe, it, expect, afterEach } from 'vitest';
import { createRoom, joinRoom, setRoomState, getRoom, listRooms, deleteRoom } from '../rooms';
import { sweepRooms } from '../gameService';

// === M-1 / M-4 regression suite (pure domain layer) ==========================
// No socket.io — joinRoom and the room sweeper are plain functions over the
// module-level ROOMS Map, so they can be driven directly with fake socket ids.

function hostData(nickname: string): { name: string; nickname: string; color: string; emoji: string } {
  return { name: 'Ruang Uji', nickname, color: '#FF9BB5', emoji: '🦊' };
}

function joinData(nickname: string): { nickname: string; color: string; emoji: string } {
  return { nickname, color: '#A8D8EA', emoji: '🐢' };
}

afterEach(() => {
  // ROOMS is module-level — wipe everything between tests so PINs and
  // memberships never leak into later cases.
  for (const room of listRooms()) deleteRoom(room.id);
});

describe('joinRoom duplicate-nickname rejection (M-1)', () => {
  it('admits a joiner whose nickname is free', () => {
    const host = createRoom(hostData('host'), 'm1-host');
    const result = joinRoom(host.pin, joinData('guest'), 'm1-guest');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.room.players).toHaveLength(2);
      expect(result.room.players[1]?.nickname).toBe('guest');
    }
  });

  it('rejects a nickname another member already holds, with a specific message', () => {
    const host = createRoom(hostData('host'), 'm1-host');
    const result = joinRoom(host.pin, joinData('host'), 'm1-guest');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Nickname sudah dipakai di ruang ini!');
    }
    // The rejected joiner must not have been added.
    expect(getRoom(host.id)?.players).toHaveLength(1);
  });

  it('same-socket re-join still succeeds before the nickname check (C3)', () => {
    // C3 guard order is load-bearing: a re-join from the SAME socket repeats
    // its own nickname by definition and must keep succeeding.
    const host = createRoom(hostData('host'), 'm1-host');
    const again = joinRoom(host.pin, joinData('host'), 'm1-host');

    expect(again.ok).toBe(true);
    if (again.ok) expect(again.room.players).toHaveLength(1);
  });

  it('rejects the 5th joiner of a full 4-player room with the generic message', () => {
    const host = createRoom(hostData('p1'), 'm1-p1');
    for (const nick of ['p2', 'p3', 'p4']) {
      const result = joinRoom(host.pin, joinData(nick), `m1-${nick}`);
      expect(result.ok).toBe(true);
    }

    const fifth = joinRoom(host.pin, joinData('p5'), 'm1-p5');
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) {
      expect(fifth.error).toBe('Kode ruang tidak valid atau ruang sudah penuh!');
    }
  });
});

describe('sweepRooms TTL (L1 waiting + M-4 finished)', () => {
  it('reaps a finished room older than 2h but keeps a young waiting room', () => {
    const waiting = createRoom(hostData('wait'), 'sw-wait');
    const finished = createRoom(hostData('finish'), 'sw-finish');
    setRoomState(finished.id, 'finished');
    // Test-only direct mutation of the exported Room object: backtrack
    // createdAt past the 2h TTL (the sweep is keyed off createdAt).
    getRoom(finished.id)!.createdAt = Date.now() - 3 * 60 * 60 * 1000;

    sweepRooms(Date.now());

    expect(listRooms().some(r => r.id === finished.id)).toBe(false);
    expect(listRooms().some(r => r.id === waiting.id)).toBe(true);
  });

  it('never touches a playing room, even far past the TTL', () => {
    // Sweeping with a shifted clock (future "now") — an active match must
    // survive no matter how long it runs.
    const playing = createRoom(hostData('play'), 'sw-play');
    setRoomState(playing.id, 'playing');
    getRoom(playing.id)!.createdAt = Date.now() - 3 * 60 * 60 * 1000;

    sweepRooms(Date.now() + 3 * 60 * 60 * 1000);

    expect(listRooms().some(r => r.id === playing.id)).toBe(true);
  });
});

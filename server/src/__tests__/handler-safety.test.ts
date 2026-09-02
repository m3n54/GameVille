import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../socketHandlers';
import { validateIdentity, validatePlayer, deleteRoom, findByPin } from '../rooms';
import type { Room } from '../../../shared/types';

// === S1 (audit H1) regression suite ==========================================
// Pre-S1, a raw client could crash the whole process with ONE malformed packet:
// socket.io runs listeners inside process.nextTick without a try/catch, so a
// TypeError from `data.ready` / `data.gameType` / `data.pin` / a missing ack
// callback became an uncaughtException. These tests boot the real handler layer
// on an ephemeral port and prove the server survives hostile payloads AND still
// answers well-formed ones afterwards (liveness = a later room:create ack).

let httpServer: ReturnType<typeof createServer>;
let io: InstanceType<typeof IOServer>;
let port = 0;
const clients: ClientSocket[] = [];
const createdRooms: Room[] = [];

function connect(): ClientSocket {
  const c = Client(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
  clients.push(c);
  return c;
}

function onceAck<T>(client: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    client.emit(event, payload, (res: T) => resolve(res));
  });
}

async function createRoom(client: ClientSocket, nickname: string): Promise<Room> {
  const ack = await onceAck<{ ok: boolean; room?: Room }>(client, 'room:create', {
    name: `Audit Room ${nickname}`,
    nickname,
    color: '#FF9BB5',
    emoji: '🦊',
  });
  expect(ack.ok).toBe(true);
  const room = ack.room!;
  createdRooms.push(room);
  return room;
}

beforeAll(async () => {
  httpServer = createServer();
  io = new IOServer(httpServer, { cors: { origin: '*' } });
  registerSocketHandlers(io);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  port = (httpServer.address() as { port: number }).port;
});

afterEach(() => {
  // Rooms live in the module-level ROOMS Map — remove what each test created so
  // tests stay independent (findByPin only matches 'waiting' rooms, so leftovers
  // could collide with later tests joining by PIN).
  for (const room of createdRooms.splice(0)) deleteRoom(room.id);
});

afterAll(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  // io.close() also closes the underlying httpServer — closing the httpServer
  // alone never completes while engine sockets stay attached (hook timeout).
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

describe('S1: server survives malformed payloads (audit H1)', () => {
  it('tolerates missing/primitive payloads on every guarded event, then still answers a valid room:create', async () => {
    const c = connect();
    await new Promise<void>((resolve) => c.on('connect', resolve));

    // The exact pre-S1 crashers — each of these used to throw inside the
    // listener and kill the process (uncaughtException):
    c.emit('player:ready', undefined as never);                 // data.ready on undefined
    c.emit('player:ready', 'garbage' as never);                 // primitive payload
    c.emit('game:select', undefined as never);                  // data.gameType on undefined
    c.emit('game:select', 12345 as never);                      // primitive payload
    c.emit('game:action', undefined as never);                  // data.type on undefined (pre-guard: outside engine try/catch)
    c.emit('game:action', 7 as never);                          // primitive payload
    c.emit('room:sync', { pin: '000000' });                     // NO ack callback (pre-S1: callback(...) throws)
    c.emit('room:create', undefined as never);                  // data.name on undefined via validateIdentity
    c.emit('room:join', undefined as never);                    // data.pin on undefined
    c.emit('reaction:send', undefined as never);
    c.emit('chat:message', undefined as never);

    // Let the socket.io server dispatch every malformed packet.
    await new Promise((r) => setTimeout(r, 300));

    // Liveness proof: a well-formed event must still round-trip. If any packet
    // above had crashed the process, this ack never arrives.
    const ack = await onceAck<{ ok: boolean }>(c, 'room:create', {
      name: 'Liveness',
      nickname: 'survivor',
      color: '#FF9BB5',
      emoji: '🦊',
    });
    expect(ack.ok).toBe(true);
  }, 15_000);

  it('acks room:sync with an error (not a crash) for malformed payloads', async () => {
    const c = connect();
    await new Promise<void>((resolve) => c.on('connect', resolve));

    const noPin = await onceAck<{ ok: boolean; error?: string }>(c, 'room:sync', {});
    expect(noPin.ok).toBe(false);
    expect(noPin.error).toBeTruthy();

    const notMember = await onceAck<{ ok: boolean; error?: string }>(c, 'room:sync', { pin: '999999' });
    expect(notMember.ok).toBe(false);
    expect(notMember.error).toBe('Kamu bukan anggota ruang ini');
  }, 15_000);

  it('rejects unknown gameType values with room:error (runtime allow-list)', async () => {
    const c = connect();
    await new Promise<void>((resolve) => c.on('connect', resolve));
    const room = await createRoom(c, 'host-g1');

    const errors: string[] = [];
    c.on('room:error', (e) => errors.push(e.message));
    c.emit('game:select', { gameType: 'not-a-game' });

    await new Promise((r) => setTimeout(r, 300));
    expect(errors).toContain('Permainan tidak dikenal');
    // And the hostile value must NOT have entered the shared Room.
    const synced = await onceAck<{ ok: boolean; room?: Room }>(c, 'room:sync', { pin: room.pin });
    expect(synced.room?.gameType).toBeNull();
  }, 15_000);

  it('rate-limits reaction:send to 10 broadcasts per 10s window (audit M-2)', async () => {
    const host = connect();
    await new Promise<void>((resolve) => host.on('connect', resolve));
    const room = await createRoom(host, 'react-host');

    const joiner = connect();
    const joined = new Promise<{ ok: boolean }>((resolve) =>
      joiner.emit('room:join', { pin: room.pin, nickname: 'react-joiner', color: '#A8D8EA', emoji: '🐢' }, resolve),
    );
    const joinAck = await joined;
    expect(joinAck.ok).toBe(true);

    const received: number[] = [];
    joiner.on('reaction:received', () => received.push(Date.now()));

    // 15 rapid reactions from the host — allowEvent(10/10s) must pass 10, drop 5.
    for (let i = 0; i < 15; i++) host.emit('reaction:send', { emoji: '🎉' });

    await new Promise((r) => setTimeout(r, 400));
    expect(received.length).toBe(10);
  }, 15_000);

  it('refuses to start Sea Battle with 3 players (G1/H2 wiring through game:start)', async () => {
    const host = connect();
    const p2 = connect();
    const p3 = connect();
    for (const c of [host, p2, p3]) await new Promise<void>((resolve) => c.on('connect', resolve));

    const room = await createRoom(host, 'g1-host');
    for (const [c, nick] of [[p2, 'g1-p2'], [p3, 'g1-p3']] as const) {
      const joinAck = await onceAck<{ ok: boolean }>(c, 'room:join', {
        pin: room.pin, nickname: nick, color: '#A8D8EA', emoji: '🐢',
      });
      expect(joinAck.ok).toBe(true);
    }
    for (const c of [host, p2, p3]) c.emit('player:ready', { ready: true });
    host.emit('game:select', { gameType: 'sea-battle' });
    await new Promise((r) => setTimeout(r, 150));

    const errors: string[] = [];
    host.on('room:error', (e) => errors.push(e.message));
    const started: string[] = [];
    p2.on('game:started', (g) => started.push(g));

    host.emit('game:start');
    await new Promise((r) => setTimeout(r, 300));

    expect(errors.some((m) => m.includes('2 pemain'))).toBe(true);
    expect(started).toHaveLength(0); // the match must never begin
    // Room must remain joinable ('waiting') — the host picks another game.
    const synced = await onceAck<{ ok: boolean; room?: Room }>(host, 'room:sync', { pin: room.pin });
    expect(synced.room?.state).toBe('waiting');
  }, 15_000);

  it('rate-limits game:action without affecting normal play (audit M-3)', async () => {
    const host = connect();
    await new Promise<void>((resolve) => host.on('connect', resolve));
    const joiner = connect();
    await new Promise<void>((resolve) => joiner.on('connect', resolve));

    const room = await createRoom(host, 'act-host');
    await onceAck<{ ok: boolean }>(joiner, 'room:join', {
      pin: room.pin, nickname: 'act-joiner', color: '#A8D8EA', emoji: '🐢',
    });
    host.emit('player:ready', { ready: true });
    joiner.emit('player:ready', { ready: true });
    host.emit('game:select', { gameType: 'snakes-ladders' });
    await new Promise((r) => setTimeout(r, 150));
    await onceAck<{ ok: boolean }>(host, 'room:sync', { pin: room.pin });

    // Host starts the game; both clients must receive game:started + first turn.
    const started = new Promise<string>((resolve) => joiner.once('game:started', resolve));
    host.emit('game:start');
    const gameType = await started;
    expect(gameType).toBe('snakes-ladders');

    // A modest burst (20 < the 30/10s budget) must NOT swallow a legitimate
    // action: the host's turn comes first, so roll #1 of the spam executes and
    // the rest are engine-rejected; the joiner's roll must still go through.
    // Filter by playerId — the host's own diceResult may arrive before this
    // listener attaches (roll #1 is legitimate), and must not satisfy the wait.
    for (let i = 0; i < 20; i++) host.emit('game:action', { type: 'roll' });

    const diceForJoiner = new Promise<unknown>((resolve) =>
      joiner.on('game:action', (a) => {
        const evt = a as { type?: string; playerId?: string; value?: number };
        if (evt.type === 'diceResult' && evt.playerId === joiner.id) resolve(a);
      }),
    );
    joiner.emit('game:action', { type: 'roll' });
    const dice = (await diceForJoiner) as { playerId?: string; value?: number };
    expect(dice.playerId).toBe(joiner.id);
    expect(dice.value).toBeGreaterThanOrEqual(1);
    expect(dice.value).toBeLessThanOrEqual(6);
  }, 15_000);
});

describe('S1: door validators tolerate garbage (pure layer)', () => {
  it('validateIdentity / validatePlayer return an error string for undefined/primitive data', () => {
    expect(validateIdentity(undefined as never)).toBe('Data tidak valid');
    expect(validateIdentity(null as never)).toBe('Data tidak valid');
    expect(validateIdentity('nonsense' as never)).toBe('Data tidak valid');
    expect(validatePlayer(undefined as never)).toBe('Data tidak valid');
    expect(validatePlayer(42 as never)).toBe('Data tidak valid');
    // Well-formed input still passes the door.
    expect(validateIdentity({ name: 'Ruang', nickname: 'menza', color: '#FF9BB5', emoji: '🦊' })).toBeNull();
  });

  it('findByPin never returns non-waiting rooms (join lock used by H-3 analysis)', () => {
    expect(findByPin('000000')).toBeUndefined();
  });
});

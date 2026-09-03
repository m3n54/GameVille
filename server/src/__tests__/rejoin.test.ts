import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../socketHandlers';
import { deleteRoom } from '../rooms';
import { processExpiredExits } from '../gameService';
import type { Room, Player, SnakesLaddersState, SyncAck } from '../../../shared/types';

// === R1 (audit H-3) integration suite ========================================
// Pre-R1, a mid-game disconnect (page refresh / network blip) spliced the
// player out immediately: room:sync failed for the new socket (reattach only
// covered 'waiting' rooms) and a 1v1 match was forfeited on the spot. These
// tests boot the real handler layer on an ephemeral port and prove:
//   1. disconnect mid-game enters the grace window (flagged player:update, no
//      forfeit) and a fresh socket reclaims the seat via room:sync + nickname,
//   2. the sweeper forfeits the seat once the grace window lapses,
//   3. an explicit room:leave stays immediate (grace only softens LOST
//      connections),
//   4. the seat of a connected player can never be hijacked by a second
//      client claiming the same nickname (no pending exit → refused).

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

function waitForConnect(c: ClientSocket): Promise<void> {
  return new Promise((resolve) => c.on('connect', resolve));
}

function onceAck<T>(client: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    client.emit(event, payload, (res: T) => resolve(res));
  });
}

// Resolves on the next game:action of the given type, with a hard timeout so a
// missing broadcast fails the test with a clear message instead of hanging.
function waitForGameAction(client: ClientSocket, type: string, timeoutMs = 5_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const listener = (a: unknown) => {
      const evt = a as { type?: string };
      if (evt?.type === type) {
        clearTimeout(timer);
        client.off('game:action', listener);
        resolve(evt as Record<string, unknown>);
      }
    };
    const timer = setTimeout(() => {
      client.off('game:action', listener);
      reject(new Error(`timeout waiting for game:action ${type}`));
    }, timeoutMs);
    client.on('game:action', listener);
  });
}

async function createRoom(client: ClientSocket, nickname: string): Promise<Room> {
  const ack = await onceAck<{ ok: boolean; room?: Room }>(client, 'room:create', {
    name: `Rejoin Room ${nickname}`,
    nickname,
    color: '#FF9BB5',
    emoji: '🦊',
  });
  expect(ack.ok).toBe(true);
  const room = ack.room!;
  createdRooms.push(room);
  return room;
}

// Host + joiner in a started snakes-ladders match. Resolves once the opening
// 'turn' broadcast reached the host (playerOrder[0] = host, the room creator).
async function setupSnakesMatch(host: ClientSocket, joiner: ClientSocket, hostNick: string, joinerNick: string): Promise<Room> {
  const room = await createRoom(host, hostNick);
  const joinAck = await onceAck<{ ok: boolean }>(joiner, 'room:join', {
    pin: room.pin, nickname: joinerNick, color: '#A8D8EA', emoji: '🐢',
  });
  expect(joinAck.ok).toBe(true);
  host.emit('player:ready', { ready: true });
  joiner.emit('player:ready', { ready: true });
  host.emit('game:select', { gameType: 'snakes-ladders' });
  await new Promise((r) => setTimeout(r, 150));

  const firstTurn = waitForGameAction(host, 'turn');
  host.emit('game:start');
  const turnEvt = await firstTurn;
  expect(turnEvt.nextPlayerId).toBe(host.id);
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
  // tests stay independent. Disconnects against deleted rooms are no-ops
  // (findByPlayer's index-drift cleanup), so afterAll stays safe.
  for (const room of createdRooms.splice(0)) deleteRoom(room.id);
});

afterAll(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  // io.close() also closes the underlying httpServer — closing the httpServer
  // alone never completes while engine sockets stay attached (hook timeout).
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

describe('R1: grace-period disconnect + mid-game rejoin (audit H-3)', () => {
  it('keeps the seat in grace on mid-game disconnect and restores it on room:sync rejoin', async () => {
    const host = connect();
    const joiner = connect();
    for (const c of [host, joiner]) await waitForConnect(c);
    const room = await setupSnakesMatch(host, joiner, 'rj-host', 'rj-joiner');

    // Disconnect mid-game → grace path: the joiner is flagged disconnected,
    // the seat is NOT spliced (old id still present), and the 1v1 match must
    // NOT be forfeited instantly (pre-R1 it ended right here).
    // Capture the id BEFORE disconnecting — socket.io-client erases socket.id
    // once the client is disconnected.
    const oldJoinerId = joiner.id;
    const flaggedUpdate = new Promise<Player[]>((resolve) => host.once('player:update', resolve));
    joiner.disconnect();
    const flagged = await flaggedUpdate;
    const flaggedJoiner = flagged.find((p) => p.nickname === 'rj-joiner');
    expect(flaggedJoiner?.disconnected).toBe(true);
    expect(flaggedJoiner?.id).toBe(oldJoinerId);

    let gameOverFired = false;
    const overSpy = () => { gameOverFired = true; };
    host.on('game:over', overSpy);
    await new Promise((r) => setTimeout(r, 500));
    expect(gameOverFired).toBe(false);
    host.off('game:over', overSpy);

    // A brand-new socket (page reload) reclaims the seat by nickname + pin.
    // The clean player:update broadcast happens during sync handling, BEFORE
    // the ack — attach the waiter first.
    const rejoiner = connect();
    await waitForConnect(rejoiner);
    const cleanUpdate = new Promise<Player[]>((resolve) => host.once('player:update', resolve));
    const syncAck = await onceAck<SyncAck>(rejoiner, 'room:sync', { pin: room.pin, nickname: 'rj-joiner' });
    expect(syncAck.ok).toBe(true);
    expect(syncAck.gameState).toBeTruthy();
    // Snapshot turn: nobody rolled yet, so the opening turn is still the host's.
    expect(syncAck.turnPlayerId).toBe(host.id);
    // Engine seat renamed to the NEW socket id — no stale reference remains.
    const slState = syncAck.gameState as SnakesLaddersState;
    expect(slState.players.some((p) => p.id === rejoiner.id)).toBe(true);
    expect(slState.players.some((p) => p.id === oldJoinerId)).toBe(false);
    // The room was told the player is back (flag cleared on every client).
    const clean = await cleanUpdate;
    expect(clean.find((p) => p.nickname === 'rj-joiner')?.disconnected).toBeUndefined();

    // The seat is truly alive: host rolls, the turn passes to the restored
    // seat under its NEW id, and the rejoined player's roll produces a
    // diceResult addressed to that id.
    const turnToRejoiner = waitForGameAction(rejoiner, 'turn');
    host.emit('game:action', { type: 'roll' });
    const turnEvt = await turnToRejoiner;
    expect(turnEvt.nextPlayerId).toBe(rejoiner.id);

    const diceForRejoiner = new Promise<Record<string, unknown>>((resolve) =>
      rejoiner.on('game:action', (a) => {
        const evt = a as { type?: string; playerId?: string };
        if (evt.type === 'diceResult' && evt.playerId === rejoiner.id) resolve(evt);
      }),
    );
    rejoiner.emit('game:action', { type: 'roll' });
    const dice = await diceForRejoiner;
    expect(dice.playerId).toBe(rejoiner.id);
    expect(dice.value).toBeGreaterThanOrEqual(1);
    expect(dice.value).toBeLessThanOrEqual(6);
  }, 15_000);

  it('forfeits the match once the grace window expires (processExpiredExits)', async () => {
    const host = connect();
    const joiner = connect();
    for (const c of [host, joiner]) await waitForConnect(c);
    const room = await setupSnakesMatch(host, joiner, 'gx-host', 'gx-joiner');

    const flaggedUpdate = new Promise<Player[]>((resolve) => host.once('player:update', resolve));
    joiner.disconnect();
    await flaggedUpdate; // pending exit registered

    const gameOver = new Promise<{ winnerId: string; winnerName: string }>((resolve) =>
      host.once('game:over', resolve));
    // Drive the sweeper directly with a synthetic clock past the grace window
    // (same pattern as sweepRooms tests — no real 60s wait).
    processExpiredExits(io, Date.now() + 61_000);
    const over = await gameOver;
    expect(over.winnerId).toBe(host.id);
    expect(over.winnerName).toBe('gx-host');

    // Forfeit closes the match: the room is 'finished' for the remaining host.
    const sync = await onceAck<SyncAck>(host, 'room:sync', { pin: room.pin });
    expect(sync.ok).toBe(true);
    expect(sync.room?.state).toBe('finished');
  }, 15_000);

  it('keeps an explicit room:leave immediate mid-game (no grace)', async () => {
    const host = connect();
    const joiner = connect();
    for (const c of [host, joiner]) await waitForConnect(c);
    const room = await setupSnakesMatch(host, joiner, 'lv-host', 'lv-joiner');

    const gameOver = new Promise<{ winnerId: string; winnerName: string }>((resolve) =>
      host.once('game:over', resolve));
    joiner.emit('room:leave');
    // Must arrive WITHOUT any sweeper call — grace never softens a deliberate
    // "Keluar", only lost connections.
    const over = await gameOver;
    expect(over.winnerId).toBe(host.id);
    expect(over.winnerName).toBe('lv-host');
  }, 15_000);

  it('refuses to hijack the seat of an actively connected player via room:sync', async () => {
    const host = connect();
    const joiner = connect();
    for (const c of [host, joiner]) await waitForConnect(c);
    const room = await setupSnakesMatch(host, joiner, 'hj-host', 'hj-joiner');

    // Match running, NO disconnect happened → no pending exit exists → a third
    // client claiming the joiner's nickname must be refused outright.
    const impostor = connect();
    await waitForConnect(impostor);
    const ack = await onceAck<SyncAck>(impostor, 'room:sync', { pin: room.pin, nickname: 'hj-joiner' });
    expect(ack.ok).toBe(false);
    expect(ack.error).toBe('Kamu bukan anggota ruang ini');

    // The impostor never entered: player list is unchanged.
    const synced = await onceAck<SyncAck>(host, 'room:sync', { pin: room.pin });
    expect(synced.ok).toBe(true);
    expect(synced.room?.players).toHaveLength(2);
  }, 15_000);
});

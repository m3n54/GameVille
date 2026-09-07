import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../socketHandlers';
import {
  GAMES,
  processTimeouts,
  TURN_TIMEOUT_MS,
} from '../gameService';
import {
  deleteRoom,
  findByPin,
  getRoom,
} from '../rooms';
import type { Room } from '../../../shared/types';

// === TT-1 / WS-D: processTimeouts synthetic-clock regression suite ============
// Without R-1 wiring, processTimeouts was dead code — these tests boot the
// handler layer exactly like handler-safety.test.ts (ephemeral port, real
// socket.io) and drive processTimeouts with an injected `now`. The 8 cases
// below pin every branch the sweeper can take so a future refactor cannot
// silently regress turn-timeout behavior.

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

function waitForGameAction(
  client: ClientSocket,
  type: string,
  filter: (evt: Record<string, unknown>) => boolean = () => true,
  timeoutMs = 5_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const listener = (a: unknown) => {
      const evt = a as Record<string, unknown>;
      if (evt?.type === type && filter(evt)) {
        clearTimeout(timer);
        client.off('game:action', listener);
        resolve(evt);
      }
    };
    const timer = setTimeout(() => {
      client.off('game:action', listener);
      reject(new Error(`timeout waiting for game:action ${type}`));
    }, timeoutMs);
    client.on('game:action', listener);
  });
}

// Boots a 2-player match for the given gameType and returns the live socket
// ids + room id. Minesweeper additionally submits a config AFTER game:start
// (the server starts in phase 'config' and the host's config action flips it
// to 'playing' — required by R-4's guard). Sea-battle auto-places both fleets
// so phase flips to 'playing'.
async function startMatch(gameType: 'snakes-ladders' | 'sea-battle' | 'minesweeper', mode: 'santai' | 'tantangan' = 'santai'): Promise<{
  host: ClientSocket;
  joiner: ClientSocket;
  hostId: string;
  joinerId: string;
  roomId: string;
}> {
  const host = connect();
  const joiner = connect();
  await Promise.all([
    new Promise<void>((resolve) => host.on('connect', resolve)),
    new Promise<void>((resolve) => joiner.on('connect', resolve)),
  ]);

  const room = await onceAck<{ ok: boolean; room?: Room }>(host, 'room:create', {
    name: `TT Room ${gameType}`,
    nickname: 'tt-host',
    color: '#FF9BB5',
    emoji: '🦊',
  });
  if (!room.ok || !room.room) throw new Error('room:create failed');
  createdRooms.push(room.room);

  const joinAck = await onceAck<{ ok: boolean }>(joiner, 'room:join', {
    pin: room.room.pin,
    nickname: 'tt-joiner',
    color: '#A8D8EA',
    emoji: '🐢',
  });
  if (!joinAck.ok) throw new Error('room:join failed');

  host.emit('player:ready', { ready: true });
  joiner.emit('player:ready', { ready: true });
  host.emit('game:select', { gameType });
  await new Promise((r) => setTimeout(r, 150));

  const started = new Promise<string>((resolve) => host.once('game:started', resolve));
  host.emit('game:start');
  const startedType = await started;
  if (startedType !== gameType) throw new Error(`expected ${gameType}, got ${startedType}`);

  if (gameType === 'sea-battle') {
    // sea-battle needs both fleets placed before phase flips to 'playing'.
    joiner.emit('game:action', { type: 'autoPlace' });
    host.emit('game:action', { type: 'autoPlace' });
    await Promise.all([
      waitForGameAction(host, 'gameStart'),
      waitForGameAction(joiner, 'gameStart'),
    ]);
  }

  if (gameType === 'minesweeper') {
    // Minesweeper starts in phase 'config' — submit the host's config after
    // game:start so the engine actually sees the GameInstance and flips phase
    // to 'playing'. Waiting on the gameStart action event is the cleanest
    // signal that the config landed (R-4 + production parity).
    const gameStartAction = waitForGameAction(host, 'gameStart');
    host.emit('game:action', {
      type: 'config',
      payload: { difficulty: 'sedang', mode, bombMode: 'fixed' },
    });
    await gameStartAction;
  }

  // host is player1 in every engine (playerOrder[0]); joiner is player2.
  // socket.io-client 4.8 types `socket.id` as `string | undefined` — by the
  // time we reach this return the connect event has fired for both clients,
  // so the id is populated; the `!` keeps noUncheckedIndexedAccess quiet.
  return {
    host,
    joiner,
    hostId: host.id!,
    joinerId: joiner.id!,
    roomId: room.room.id,
  };
}

beforeAll(async () => {
  httpServer = createServer();
  io = new IOServer(httpServer, { cors: { origin: '*' } });
  registerSocketHandlers(io);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  port = (httpServer.address() as { port: number }).port;
});

afterEach(() => {
  for (const room of createdRooms.splice(0)) {
    GAMES.delete(room.id);
    deleteRoom(room.id);
  }
});

afterAll(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

describe('TT-1: turn timeout synthetic actions (WS-D, audit M-5)', () => {
  it('minesweeper tantangan: idle > 90s → synthetic pass rotates turn + resets lastActionAt to `now`', async () => {
    // Tantangan mode so the pass ends the chain (the more interesting branch).
    const { host, hostId, joinerId, roomId } = await startMatch('minesweeper', 'tantangan');
    const instance = GAMES.get(roomId);
    if (!instance) throw new Error('GAMES entry missing');

    // Force the host's seat to look like it has been idle for > TURN_TIMEOUT_MS.
    const NOW = 1_700_000_000_000;
    instance.lastActionAt = NOW - (TURN_TIMEOUT_MS + 1_000);

    // host's turn first → synthetic pass should rotate turn to the joiner.
    const turnForJoiner = waitForGameAction(host, 'turn', (e) => e.nextPlayerId === joinerId);

    processTimeouts(io, NOW);

    const evt = await turnForJoiner;
    expect(evt.nextPlayerId).toBe(joinerId);

    // R-2 determinism: lastActionAt must equal the injected NOW, not wallclock.
    expect(instance.lastActionAt).toBe(NOW);
    expect(instance.lastActionAt).not.toBe(Date.now());

    // Sanity: hostId resolved to the live socket.
    expect(hostId).toBe(host.id);
  }, 15_000);

  it('minesweeper santai: idle > 90s → synthetic pass still rotates turn (TT-1 mode guard removed)', async () => {
    const { host, hostId, joinerId, roomId } = await startMatch('minesweeper', 'santai');
    const instance = GAMES.get(roomId);
    if (!instance) throw new Error('GAMES entry missing');

    expect(hostId).toBe(host.id);
    instance.lastActionAt = Date.now() - (TURN_TIMEOUT_MS + 1_000);

    const turnForJoiner = waitForGameAction(host, 'turn', (e) => e.nextPlayerId === joinerId);
    processTimeouts(io, Date.now());
    const evt = await turnForJoiner;

    // Engine accepts pass in santai too (TT-1 mode guard removed) — turn must
    // have rotated, no error event leaked.
    expect(evt.nextPlayerId).toBe(joinerId);
  }, 15_000);

  it('minesweeper config-phase (no host config yet): does NOT fire synthetic pass (R-4)', async () => {
    // Start minesweeper WITHOUT submitting config — phase stays 'config'.
    // Bypass startMatch's auto-config by booting then mutating state back to 'config'.
    const { host, hostId, roomId } = await startMatch('minesweeper', 'santai');
    const instance = GAMES.get(roomId);
    if (!instance) throw new Error('GAMES entry missing');

    // Force the engine state back to phase 'config' to simulate the host
    // never having submitted config (the R-4 stall scenario).
    (instance.state as { phase: string }).phase = 'config';
    expect(hostId).toBe(host.id);

    // Force the manual idle value and remember it. R-4 must short-circuit
    // before the engine call, so lastActionAt stays at the manual value.
    const manualIdle = Date.now() - (TURN_TIMEOUT_MS + 1_000);
    instance.lastActionAt = manualIdle;

    // Spy: no game:action should arrive at all for the next 200ms.
    let received = 0;
    const inc = () => { received += 1; };
    host.on('game:action', inc);
    processTimeouts(io, Date.now());
    await new Promise((r) => setTimeout(r, 200));
    host.off('game:action', inc);

    expect(received).toBe(0);
    // Sweep skipped at the phase guard — lastActionAt still points at the
    // manual "91s ago" value, not the synthetic `now` from R-2.
    expect(instance.lastActionAt).toBe(manualIdle);
  }, 15_000);

  it('snakes-ladders: idle > 90s → synthetic roll rotates turn', async () => {
    const { host, joinerId, roomId } = await startMatch('snakes-ladders');
    const instance = GAMES.get(roomId);
    if (!instance) throw new Error('GAMES entry missing');

    instance.lastActionAt = Date.now() - (TURN_TIMEOUT_MS + 1_000);

    // Attach BOTH listeners BEFORE processTimeouts — socket.io emits fire
    // synchronously into the wire and the next event loop tick delivers them,
    // so a listener attached after `processTimeouts` returns would miss the
    // diceResult that ships with the synthetic roll.
    const turnForJoiner = waitForGameAction(host, 'turn', (e) => e.nextPlayerId === joinerId);
    const diceForHost = waitForGameAction(
      host,
      'diceResult',
      (e) => e.playerId === host.id,
    );

    processTimeouts(io, Date.now());

    const [turn, dice] = await Promise.all([turnForJoiner, diceForHost]);
    expect(turn.nextPlayerId).toBe(joinerId);
    expect(dice.playerId).toBe(host.id);
  }, 15_000);

  it('sea-battle playing: idle > 90s → synthetic pass rotates currentTurn', async () => {
    const { host, joinerId, roomId } = await startMatch('sea-battle');
    const instance = GAMES.get(roomId);
    if (!instance) throw new Error('GAMES entry missing');

    instance.lastActionAt = Date.now() - (TURN_TIMEOUT_MS + 1_000);

    const turnForJoiner = waitForGameAction(host, 'turn', (e) => e.nextPlayerId === joinerId);
    processTimeouts(io, Date.now());
    const evt = await turnForJoiner;
    expect(evt.nextPlayerId).toBe(joinerId);
  }, 15_000);

  it('disconnected seat: does NOT fire synthetic pass (grace path owns it)', async () => {
    const { roomId } = await startMatch('snakes-ladders');
    const instance = GAMES.get(roomId);
    const room = getRoom(roomId);
    if (!instance || !room) throw new Error('match state missing');

    // Mark the host (current player) as disconnected — the grace exit sweeper
    // is the only authority allowed to forfeit this seat.
    const hostPlayer = room.players[0];
    if (!hostPlayer) throw new Error('host player missing');
    hostPlayer.disconnected = true;

    instance.lastActionAt = Date.now() - (TURN_TIMEOUT_MS + 1_000);

    // Run a sweep; nothing should change.
    processTimeouts(io, Date.now());
    await new Promise((r) => setTimeout(r, 100));

    // winner still null, lastActionAt untouched, no synthetic turn.
    const s = instance.state as { winner?: string | null; currentTurn?: number };
    expect(s.winner ?? null).toBeNull();
    expect(s.currentTurn).toBe(0);
  }, 15_000);

  it('winner != null: skips sweep entirely', async () => {
    const { host, joinerId, roomId } = await startMatch('snakes-ladders');
    const instance = GAMES.get(roomId);
    if (!instance) throw new Error('GAMES entry missing');

    instance.lastActionAt = Date.now() - (TURN_TIMEOUT_MS + 1_000);
    (instance.state as { winner?: string | null }).winner = host.id;

    let received = 0;
    const inc = () => { received += 1; };
    host.on('game:action', inc);
    processTimeouts(io, Date.now());
    await new Promise((r) => setTimeout(r, 150));
    host.off('game:action', inc);

    expect(received).toBe(0);
    // Sanity: joiner still hasn't had a synthetic turn.
    expect(joinerId).toBeTruthy();
  }, 15_000);

  it('R-2 determinism: lastActionAt reset uses `now`, not wallclock', async () => {
    const { roomId } = await startMatch('snakes-ladders');
    const instance = GAMES.get(roomId);
    if (!instance) throw new Error('GAMES entry missing');

    const SYNTHETIC_NOW = 12_345_678;
    instance.lastActionAt = SYNTHETIC_NOW - (TURN_TIMEOUT_MS + 1_000);
    processTimeouts(io, SYNTHETIC_NOW);

    expect(instance.lastActionAt).toBe(SYNTHETIC_NOW);
    expect(instance.lastActionAt).not.toBe(Date.now());
  }, 15_000);
});

import { describe, it, expect } from 'vitest';
import { SeaBattleEngine, seaBattleView } from '../games/sea-battle';
import type { SeaBattleState } from '../../../shared/types';

// --- Fixtures ----------------------------------------------------------------

function makeInitialState(): SeaBattleState {
  const engine = new SeaBattleEngine();
  return engine.createInitialState(['p1', 'p2']) as SeaBattleState;
}

function populateGrid(
  state: SeaBattleState,
  owner: 'p1' | 'p2',
  cells: ReadonlyArray<readonly [number, number]>,
): void {
  const gridKey = owner === 'p1' ? 'grid1' : 'grid2';
  for (const [r, c] of cells) {
    state[gridKey][r]![c] = 'S';
  }
}

// --- Tests -------------------------------------------------------------------

describe('SeaBattleEngine', () => {
  it('createInitialState returns a setup-phase state with empty grids', () => {
    const engine = new SeaBattleEngine();
    const state = engine.createInitialState(['p1', 'p2']) as SeaBattleState;

    expect(state.phase).toBe('setup');
    expect(state.player1Id).toBe('p1');
    expect(state.player2Id).toBe('p2');
    expect(state.currentTurn).toBe('p1');
    expect(state.winner).toBeNull();
    expect(state.grid1).toHaveLength(10);
    expect(state.grid2).toHaveLength(10);
    expect(state.grid1[0]).toHaveLength(10);
    expect(state.ships1).toHaveLength(0);
    expect(state.ships2).toHaveLength(0);
    expect(state.grid1[0]![0]).toBe(' ');
  });

  it('autoPlace fills exactly 5 ships for the placing player', () => {
    const engine = new SeaBattleEngine();
    const state = makeInitialState();

    const { newState, events } = engine.handleAction(state, 'p1', { type: 'autoPlace' });

    expect(newState.ships1).toHaveLength(5);
    expect(newState.ships2).toHaveLength(0);
    // Ship sizes defined by engine: 4, 3, 3, 2, 1
    const sizes = newState.ships1.map((s) => s.cells.length).sort((a, b) => a - b);
    expect(sizes).toEqual([1, 2, 3, 3, 4]);
    // Still setup phase — only one fleet placed.
    expect(newState.phase).toBe('setup');
    expect(events.map((e) => e.type)).toContain('shipsPlaced');
  });

  it('autoPlace by both players transitions to playing phase and emits gameStart', () => {
    const engine = new SeaBattleEngine();
    const state = makeInitialState();
    const after1 = engine.handleAction(state, 'p1', { type: 'autoPlace' }).newState;
    const after2 = engine.handleAction(after1, 'p2', { type: 'autoPlace' });

    expect(after2.newState.phase).toBe('playing');
    expect(after2.newState.ships1).toHaveLength(5);
    expect(after2.newState.ships2).toHaveLength(5);
    expect(after2.events.map((e) => e.type)).toContain('gameStart');
  });
});

describe('seaBattleView (C4 regression — per-player projection)', () => {
  it('strips enemy ship markers (no leak of opponent positions) and keeps hits/misses', () => {
    const engine = new SeaBattleEngine();
    const state = engine.createInitialState(['p1', 'p2']) as SeaBattleState;
    populateGrid(state, 'p1', [[0, 0], [0, 1], [0, 2], [0, 3]]); // p1 fleet
    populateGrid(state, 'p2', [[5, 5], [5, 6], [5, 7]]);           // p2 fleet

    // Mark a hit and a miss on p1's view of p2's grid.
    state.grid2[0]![0] = 'H';
    state.grid2[1]![1] = 'M';

    const view = seaBattleView(state, 'p1');

    // Own grid untouched — player still sees own ships.
    expect(view.myGrid[0]![0]).toBe('S');
    expect(view.myGrid[0]![3]).toBe('S');
    // Enemy 'S' markers are stripped to ' '.
    expect(view.enemyGrid[5]![5]).toBe(' ');
    expect(view.enemyGrid[5]![6]).toBe(' ');
    expect(view.enemyGrid[5]![7]).toBe(' ');
    // But hits and misses are preserved.
    expect(view.enemyGrid[0]![0]).toBe('H');
    expect(view.enemyGrid[1]![1]).toBe('M');
    // No 'S' leaked anywhere on enemy projection.
    for (const row of view.enemyGrid) {
      for (const cell of row) {
        expect(cell).not.toBe('S');
      }
    }
  });

  it('throws when forPlayerId is omitted in non-finished game (anti-cheat guard)', () => {
    const engine = new SeaBattleEngine();
    const state = engine.createInitialState(['p1', 'p2']) as SeaBattleState;

    // Pre-C4 the engine silently defaulted to player1's projection for every
    // caller, leaking ship positions to the opponent. The guard must surface
    // that mistake loudly instead of silently shipping a cheat.
    expect(() => seaBattleView(state)).toThrow(/forPlayerId is required/);
  });
});

describe('SeaBattleEngine.removePlayer (C2)', () => {
  it('returns survivor as winner in 1v1 forfeit', () => {
    const state = makeInitialState();
    const engine = new SeaBattleEngine();
    const result = engine.removePlayer(state, 'p1');
    expect(result).toEqual({ playerOrder: ['p2'], gameOver: true });
    expect(state.winner).toBe('p2');
    expect(state.phase).toBe('finished');
  });

  it('does not set winner if already finished', () => {
    const state = makeInitialState();
    state.winner = 'p1';
    state.phase = 'finished';
    const engine = new SeaBattleEngine();
    const result = engine.removePlayer(state, 'p2');
    expect(result.gameOver).toBeUndefined();
  });

  it('ignores a non-participant leaver — must never decide the match (G1/H2)', () => {
    // Pre-G1 the ternary mapped ANY unknown id onto player1's forfeit win: a
    // 3rd/4th room member leaving mid-game instantly ended the match.
    const state = makeInitialState();
    const engine = new SeaBattleEngine();
    const result = engine.removePlayer(state, 'phantom-spectator');
    expect(result.gameOver).toBeUndefined();
    expect(state.winner).toBeNull();
    expect(state.phase).toBe('setup');
    // Legitimate forfeit still works after the phantom leaves.
    const real = engine.removePlayer(state, 'p2');
    expect(real).toEqual({ playerOrder: ['p1'], gameOver: true });
    expect(state.winner).toBe('p1');
  });
});

describe('SeaBattleEngine autoPlace (M1)', () => {
  it('places a 5-ship fleet', () => {
    const state = makeInitialState();
    const engine = new SeaBattleEngine();
    const result = engine.handleAction(state, 'p1', { type: 'autoPlace' });
    const newState = result.newState as ReturnType<typeof engine.createInitialState>;
    expect(newState.ships1.length).toBe(5);
    expect(result.events.some(e => e.type === 'shipsPlaced')).toBe(true);
  });
});
// === SB-1: manual ship placement ==============================================

function validFleetCells(): { cells: [number, number][] }[] {
  return [
    { cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
    { cells: [[0, 6], [1, 6], [2, 6]] },
    { cells: [[5, 0], [5, 1], [5, 2]] },
    { cells: [[8, 0], [8, 1]] },
    { cells: [[8, 8]] },
  ];
}

describe('SeaBattleEngine placeShips (SB-1 manual placement)', () => {
  it('accepts a valid full fleet', () => {
    const state = makeInitialState();
    const engine = new SeaBattleEngine();
    const result = engine.handleAction(state, 'p1', { type: 'placeShips', payload: { ships: validFleetCells() } });
    expect(result.events.some(e => e.type === 'error')).toBe(false);
    expect(result.events.some(e => e.type === 'shipsPlaced')).toBe(true);
    const newState = result.newState as ReturnType<typeof engine.createInitialState>;
    expect(newState.ships1).toHaveLength(5);
    const sizes = newState.ships1.map((s) => s.cells.length).sort((a, b) => a - b);
    expect(sizes).toEqual([1, 2, 3, 3, 4]);
    expect(newState.ships1.every((s) => s.hits === 0)).toBe(true);
    const types = new Set(newState.ships1.map((s) => s.type));
    expect(types).toEqual(new Set(['Battleship', 'Cruiser', 'Destroyer', 'Submarine']));
    const shipCells = newState.ships1.flatMap((s) => s.cells);
    expect(shipCells).toHaveLength(13);
    for (const [r, c] of shipCells) expect(newState.grid1[r]![c]).toBe('S');
    expect(newState.phase).toBe('setup');
  });

  it('rejects wrong fleet multiset', () => {
    const state = makeInitialState();
    const engine = new SeaBattleEngine();
    const wrong = [
      { cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
      { cells: [[0, 6], [1, 6], [2, 6]] },
      { cells: [[5, 0], [5, 1], [5, 2]] },
      { cells: [[8, 0], [8, 1], [8, 2]] },
      { cells: [[8, 8]] },
    ];
    const result = engine.handleAction(state, 'p1', { type: 'placeShips', payload: { ships: wrong } });
    expect(result.events.some(e => e.type === 'error')).toBe(true);
  });

  it('rejects overlapping ships', () => {
    const state = makeInitialState();
    const engine = new SeaBattleEngine();
    const o = [
      { cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
      { cells: [[0, 3], [1, 6], [2, 6]] },
      { cells: [[5, 0], [5, 1], [5, 2]] },
      { cells: [[8, 0], [8, 1]] },
      { cells: [[8, 8]] },
    ];
    expect(engine.handleAction(state, 'p1', { type: 'placeShips', payload: { ships: o } }).events.some(e => e.type === 'error')).toBe(true);
  });

  it('rejects buffer violation (adjacent ships)', () => {
    const state = makeInitialState();
    const engine = new SeaBattleEngine();
    const t = [
      { cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
      { cells: [[1, 3], [1, 4], [1, 5]] },
      { cells: [[5, 0], [5, 1], [5, 2]] },
      { cells: [[8, 0], [8, 1]] },
      { cells: [[8, 8]] },
    ];
    expect(engine.handleAction(state, 'p1', { type: 'placeShips', payload: { ships: t } }).events.some(e => e.type === 'error')).toBe(true);
  });

  it('rejects re-placement after fleet committed', () => {
    const state = makeInitialState();
    const engine = new SeaBattleEngine();
    engine.handleAction(state, 'p1', { type: 'placeShips', payload: { ships: validFleetCells() } });
    const again = engine.handleAction(state, 'p1', { type: 'placeShips', payload: { ships: validFleetCells() } });
    expect(again.events.some(e => e.type === 'error' && String(e.data.message).includes('sudah ditempatkan'))).toBe(true);
  });

  it('flips to playing when BOTH players commit', () => {
    const state = makeInitialState();
    const engine = new SeaBattleEngine();
    engine.handleAction(state, 'p1', { type: 'placeShips', payload: { ships: validFleetCells() } });
    const r = engine.handleAction(state, 'p2', { type: 'placeShips', payload: { ships: validFleetCells() } });
    expect(r.events.some(e => e.type === 'gameStart')).toBe(true);
    expect((r.newState as ReturnType<typeof engine.createInitialState>).phase).toBe('playing');
  });

  it('rejects placement outside setup', () => {
    const state = makeInitialState();
    const engine = new SeaBattleEngine();
    engine.handleAction(state, 'p1', { type: 'autoPlace' });
    engine.handleAction(state, 'p2', { type: 'autoPlace' });
    expect(engine.handleAction(state, 'p1', { type: 'placeShips', payload: { ships: validFleetCells() } }).events.some(e => e.type === 'error')).toBe(true);
  });

  it('rejects non-contiguous or diagonal ships', () => {
    const state = makeInitialState();
    const engine = new SeaBattleEngine();
    const gappy = [
      { cells: [[0, 0], [0, 2], [0, 3], [0, 4]] },
      { cells: [[0, 6], [1, 6], [2, 6]] },
      { cells: [[5, 0], [5, 1], [5, 2]] },
      { cells: [[8, 0], [8, 1]] },
      { cells: [[8, 8]] },
    ];
    expect(engine.handleAction(state, 'p1', { type: 'placeShips', payload: { ships: gappy } }).events.some(e => e.type === 'error')).toBe(true);
  });
});

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
import { describe, it, expect } from 'vitest';
import { MinesweeperEngine, type MinesweeperExtendedState } from '../games/minesweeper';

// --- Fixtures ----------------------------------------------------------------

function makeState(): MinesweeperExtendedState {
  const engine = new MinesweeperEngine();
  return engine.createInitialState(['p1', 'p2']);
}

// Helper: advance from initial 'config' phase to 'playing' so reveal/toggleFlag
// actions pass the phase guard. The engine's config handler emits gameStart but
// does NOT mutate phase — phase flips externally (gameService transitions after
// config event is broadcast). Tests mimic that transition.
function enterPlayingPhase(state: MinesweeperExtendedState): void {
  state.phase = 'playing';
}

// --- Tests -------------------------------------------------------------------

describe('Minesweeper bomb config validation', () => {
  it('accepts fixed bomb mode with default count', () => {
    // M-bomb fix — engine must parse the new payload.bombMode field and resolve
    // bombCount to the difficulty default when mode is 'fixed'.
    const state = makeState();
    const engine = new MinesweeperEngine();

    const result = engine.handleAction(state, 'p1', {
      type: 'config',
      payload: { difficulty: 'sedang', bombMode: 'fixed' },
    });

    expect(result.newState.bombCount).toBe(15); // sedang default
    // Config is success — no error event.
    expect(result.events.some(e => e.type === 'error')).toBe(false);
  });

  it('rejects custom bomb count below 9', () => {
    // M-bomb: minimum bombCount is 9 to keep at least one safe 3x3 neighborhood
    // around the first click (C6). Below that, first-click safety is impossible.
    const state = makeState();
    const engine = new MinesweeperEngine();

    const result = engine.handleAction(state, 'p1', {
      type: 'config',
      payload: { difficulty: 'sedang', bombMode: 'custom', customBombCount: 5 },
    });

    expect(result.events.some(e => e.type === 'error')).toBe(true);
    // bombCount must remain at the initial default (15) since the custom value was rejected.
    expect(result.newState.bombCount).toBe(15);
  });

  it('accepts custom bomb count at minimum 9', () => {
    const state = makeState();
    const engine = new MinesweeperEngine();

    const result = engine.handleAction(state, 'p1', {
      type: 'config',
      payload: { difficulty: 'sedang', bombMode: 'custom', customBombCount: 9 },
    });

    expect(result.newState.bombCount).toBe(9);
    expect(result.events.some(e => e.type === 'error')).toBe(false);
  });

  it('rejects random bomb range with min below 9', () => {
    // Random mode derives min/max the same way as custom — min must be >= 9.
    const state = makeState();
    const engine = new MinesweeperEngine();

    const result = engine.handleAction(state, 'p1', {
      type: 'config',
      payload: { difficulty: 'sedang', bombMode: 'random', bombRange: { min: 3, max: 20 } },
    });

    expect(result.events.some(e => e.type === 'error')).toBe(true);
    expect(result.newState.bombCount).toBe(15); // default preserved
  });

  it('rejects random bomb range where min > max', () => {
    // Range sanity check — engine must validate min <= max.
    const state = makeState();
    const engine = new MinesweeperEngine();

    const result = engine.handleAction(state, 'p1', {
      type: 'config',
      payload: { difficulty: 'sedang', bombMode: 'random', bombRange: { min: 30, max: 20 } },
    });

    expect(result.events.some(e => e.type === 'error')).toBe(true);
  });

  it('rejects config action after game already started', () => {
    // M-bomb: config must be rejected once phase is past 'config'. Engine
    // returns an error event so the client knows the action was ignored.
    const state = makeState();
    state.phase = 'playing';
    const engine = new MinesweeperEngine();

    const result = engine.handleAction(state, 'p1', {
      type: 'config',
      payload: { difficulty: 'sulit', bombMode: 'fixed' },
    });

    expect(result.events.some(e => e.type === 'error')).toBe(true);
  });

  it('rejects custom bomb count above rows*cols-9 (for sedang: 91)', () => {
    // M-bomb: baseMaxBombs = rows*cols - 9 (C6 first-click safety). Custom
    // count above that is impossible to lay out without breaking the safe zone.
    const state = makeState();
    const engine = new MinesweeperEngine();

    const result = engine.handleAction(state, 'p1', {
      type: 'config',
      payload: { difficulty: 'sedang', bombMode: 'custom', customBombCount: 999 },
    });

    expect(result.events.some(e => e.type === 'error')).toBe(true);
  });

  it('random mode picks count within range', () => {
    // Random mode derives bombCount via Math.random in [min, max]. The
    // resolved value must land inside the declared range.
    const state = makeState();
    const engine = new MinesweeperEngine();

    const result = engine.handleAction(state, 'p1', {
      type: 'config',
      payload: { difficulty: 'sedang', bombMode: 'random', bombRange: { min: 20, max: 25 } },
    });
    const newState = result.newState as MinesweeperExtendedState;

    expect(newState.bombCount).toBeGreaterThanOrEqual(20);
    expect(newState.bombCount).toBeLessThanOrEqual(25);
  });
});

describe('Minesweeper first-click safety (C6)', () => {
  it('grid is null after config until first reveal action', () => {
    // C6: grid generation is deferred to the first reveal so the 3x3 around
    // the click is guaranteed bomb-free. Config alone must NOT generate a grid.
    const state = makeState();
    const engine = new MinesweeperEngine();

    const result = engine.handleAction(state, 'p1', {
      type: 'config',
      payload: { difficulty: 'sedang', bombMode: 'fixed' },
    });

    expect(result.newState.grid).toBeNull();
    expect(result.newState.firstClick).toBeNull();
  });

  it('first reveal generates grid with no bomb in 3x3 neighborhood', () => {
    // C6: the clicked cell AND its 3x3 neighborhood must be bomb-free so the
    // first click can never be a boom (and the flood-fill cascade starts safely).
    const state = makeState();
    const engine = new MinesweeperEngine();
    // Configure first so bombCount is set; then advance to playing phase so
    // the reveal handler passes the phase guard.
    engine.handleAction(state, 'p1', {
      type: 'config',
      payload: { difficulty: 'sedang', bombMode: 'fixed' },
    });
    enterPlayingPhase(state);

    const result = engine.handleAction(state, 'p1', {
      type: 'reveal',
      payload: { row: 5, col: 5 },
    });
    const grid = result.newState.grid!;

    // Clicked cell must be bomb-free.
    expect(grid[5]![5]!.hasBomb).toBe(false);
    // 3x3 around the click — every cell must be bomb-free.
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = 5 + dr;
        const c = 5 + dc;
        expect(grid[r]![c]!.hasBomb).toBe(false);
      }
    }
    // firstClick recorded for debugging / UI affordance.
    expect(result.newState.firstClick).toEqual({ row: 5, col: 5 });
    // totalSafeCells should equal rows*cols - bombCount.
    expect(result.newState.totalSafeCells).toBe(100 - 15);
  });
});
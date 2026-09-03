import { describe, it, expect, vi } from 'vitest';
import { MinesweeperEngine, toView, type MinesweeperExtendedState } from '../games/minesweeper';

// --- Fixtures ----------------------------------------------------------------

function makeState(): MinesweeperExtendedState {
  const engine = new MinesweeperEngine();
  return engine.createInitialState(['p1', 'p2']);
}

// Helper: force the 'playing' phase directly (skipping config). Since S3 the
// engine's own config handler transitions the phase, so config-then-reveal
// tests no longer need this — it remains for tests that exercise reveal from
// a hand-built state without running config first.
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
// --- T1 (audit H4): snapshot-only turn resolution -----------------------------

describe('MinesweeperView projection carries playerOrder (T1/H4)', () => {
  it('toView includes playerOrder on the null-grid (pre-first-reveal) path', () => {
    // Mid-game recovery replays a snapshot with NO events. currentTurn is an
    // index — without playerOrder in the view, no client can resolve whose
    // turn index N is, and every UI deadlocks (isMyTurn false for all).
    const state = makeState(); // grid still null
    expect(state.grid).toBeNull();
    const view = toView(state);
    expect(view.cells).toEqual([]);
    expect(view.playerOrder).toEqual(['p1', 'p2']);
  });

  it('toView includes playerOrder after the grid exists', () => {
    const state = makeState();
    const engine = new MinesweeperEngine();
    engine.handleAction(state, 'p1', { type: 'config', payload: { difficulty: 'sedang' } });
    enterPlayingPhase(state);
    engine.handleAction(state, 'p1', { type: 'reveal', payload: { row: 5, col: 5 } });

    const view = toView(state);
    expect(view.cells.length).toBe(10);
    expect(view.playerOrder).toEqual(['p1', 'p2']);
  });
});

// --- S3: config must transition the phase (playability regression) -----------

describe('Minesweeper config phase transition (S3)', () => {
  it('config sets phase to playing so the FIRST reveal works without manual help', () => {
    // Pre-S3 nothing ever set phase='playing': reveals were rejected with
    // "Atur permainan dulu!" forever and the FE config UI never left the
    // screen — the game was unplayable end-to-end. This is the exact
    // production flow: config (host) → first reveal by the opening player.
    const state = makeState();
    const engine = new MinesweeperEngine();

    const cfg = engine.handleAction(state, 'p1', {
      type: 'config',
      payload: { difficulty: 'sedang', bombMode: 'fixed' },
    });
    expect(cfg.newState.phase).toBe('playing');
    expect(cfg.events.some(e => e.type === 'error')).toBe(false);

    const reveal = engine.handleAction(cfg.newState, 'p1', {
      type: 'reveal',
      payload: { row: 5, col: 5 },
    });
    expect(reveal.events.some(e => e.type === 'error')).toBe(false);
    expect(reveal.events.some(e => e.type === 'revealResult')).toBe(true);
    expect((reveal.newState as MinesweeperExtendedState).grid).not.toBeNull();
  });

  it('double-config after the board started is rejected', () => {
    const state = makeState();
    const engine = new MinesweeperEngine();
    engine.handleAction(state, 'p1', { type: 'config', payload: { difficulty: 'sedang' } });
    const again = engine.handleAction(state, 'p2', { type: 'config', payload: { difficulty: 'mudah' } });
    expect(again.events.some(e => e.type === 'error')).toBe(true);
    expect(state.difficulty).toBe('sedang'); // original board untouched
  });
});

// --- M-6: win-check must follow the REAL board, not the requested bombCount --

describe('Minesweeper degenerate bomb placement (M-6)', () => {
  it('recomputes bombCount/totalSafeCells when sampling cannot place all bombs', () => {
    // random() === 0 makes every sample land on (0,0). That cell is OUTSIDE the
    // 3x3 safe zone of a (5,5) first click, so attempt #1 plants a bomb there —
    // then every remaining attempt retries the same occupied cell and `placed`
    // stalls at 1 even though 15 bombs were requested (sedang). Pre-M-6 the
    // win-check still used the requested 15, making the game unwinnable.
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const state = makeState();
      const engine = new MinesweeperEngine();
      const cfg = engine.handleAction(state, 'p1', {
        type: 'config',
        payload: { difficulty: 'sedang', bombMode: 'fixed' },
      });
      expect(cfg.newState.bombCount).toBe(15); // requested before the reveal

      // First reveal triggers the lazy generateGrid (C6 pattern: config → reveal).
      const result = engine.handleAction(cfg.newState, 'p1', {
        type: 'reveal',
        payload: { row: 5, col: 5 },
      });
      const newState = result.newState as MinesweeperExtendedState;

      expect(newState.bombCount).toBe(1);
      expect(newState.totalSafeCells).toBe(10 * 10 - 1);
      const bombs = newState.grid!.flat().filter(c => c.hasBomb).length;
      expect(bombs).toBe(1);
      expect(result.events.some(e => e.type === 'error')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

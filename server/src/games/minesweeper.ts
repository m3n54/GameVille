import { BaseGame, GameEvent } from './base';
import { GameType, MinesweeperState, MinesweeperView, MinesweeperDifficulty, Cell } from '../types';

const DIFFICULTY_CONFIG: Record<MinesweeperDifficulty, [number, number, number]> = {
  mudah: [8, 8, 10],
  sedang: [10, 10, 15],
  sulit: [12, 12, 25],
  ekstrem: [14, 14, 40],
};

// Extended internal state — grid is NOT generated until the first reveal
// (C6 first-click safety). `grid: null` means "no board yet" (config phase or
// fresh game-start before any reveal).
export type MinesweeperExtendedState = Omit<MinesweeperState, 'grid'> & {
  phase: 'config' | 'playing';
  grid: Cell[][] | null;
  firstClick: { row: number; col: number } | null;
};

export class MinesweeperEngine extends BaseGame {
  gameType: GameType = 'minesweeper';

  createInitialState(playerOrder: string[]): MinesweeperExtendedState {
    return {
      difficulty: 'sedang',
      mode: 'santai',
      rows: 10,
      cols: 10,
      bombCount: 15,
      // C6: first-click safety — grid is generated lazily on the first reveal,
      // with bombs excluded from the 3x3 around the click. Initialized as null
      // so a stale 'config'/'playing' state with no grid is detectable.
      grid: null,
      firstClick: null,
      revealedSafeCount: 0,
      totalSafeCells: 0,
      currentTurn: 0,
      playerOrder,
      chainActive: false,
      winner: null,
      phase: 'config',
    };
  }

  handleAction(
    state: MinesweeperExtendedState,
    playerId: string,
    action: { type: string; payload?: unknown },
  ): { newState: MinesweeperExtendedState; events: GameEvent[] } {
    const events: GameEvent[] = [];

    if (state.winner) return { newState: state, events: [] };

    if (action.type === 'config') {
      if (state.phase !== 'config') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Permainan sudah dimulai!' } }] };
      }
      const payload = (action.payload ?? {}) as {
        difficulty?: string;
        mode?: string;
        bombMode?: 'fixed' | 'random' | 'custom';
        bombRange?: { min: number; max: number };
        customBombCount?: number;
      };
      const difficulty = (
        payload.difficulty && payload.difficulty in DIFFICULTY_CONFIG ? payload.difficulty : 'sedang'
      ) as MinesweeperDifficulty;
      const mode = payload.mode === 'tantangan' ? 'tantangan' : 'santai';
      const [rows, cols, defaultBombCount] = DIFFICULTY_CONFIG[difficulty];

      // baseMaxBombs: 3x3 first-click safety neighborhood (C6).
      const baseMaxBombs = rows * cols - 9;

      const bombMode = payload.bombMode ?? 'fixed';
      let bombCount: number;
      if (bombMode === 'fixed') {
        bombCount = defaultBombCount;
      } else if (bombMode === 'random') {
        const range = payload.bombRange ?? { min: 9, max: baseMaxBombs };
        if (
          typeof range.min !== 'number' || typeof range.max !== 'number' ||
          range.min < 9 || range.max > baseMaxBombs || range.min > range.max
        ) {
          return { newState: state, events: [{ type: 'error', data: { message: 'Range bom tidak valid (min >= 9, max <= ' + baseMaxBombs + ')' } }] };
        }
        bombCount = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
      } else if (bombMode === 'custom') {
        const n = payload.customBombCount;
        if (typeof n !== 'number' || n < 9 || n > baseMaxBombs) {
          return { newState: state, events: [{ type: 'error', data: { message: 'Jumlah bom harus 9-' + baseMaxBombs } }] };
        }
        bombCount = n;
      } else {
        bombCount = defaultBombCount;
      }

      state.difficulty = difficulty;
      state.mode = mode;
      state.rows = rows;
      state.cols = cols;
      state.bombCount = bombCount;
      // C6: defer grid generation to the first reveal so the first click is
      // guaranteed safe (3x3 around the click is bomb-free). phase stays
      // 'config' until that reveal happens.
      // (state.phase remains 'config' here)

      events.push({ type: 'gameStart', data: { firstTurnId: state.playerOrder[0] } });
      return { newState: { ...state }, events };
    }

    if (action.type === 'reveal') {
      // Server-side turn enforcement
      if (state.playerOrder.length > 0 && state.playerOrder[state.currentTurn] !== playerId) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Bukan giliranmu!' } }] };
      }
      if (state.phase !== 'playing') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Atur permainan dulu!' } }] };
      }

      const payload = (action.payload ?? {}) as { row?: unknown; col?: unknown };
      const row = payload.row;
      const col = payload.col;
      // M8: malformed or out-of-bounds input used to return silently — the
      // acting client got no feedback and appeared frozen. Emit an error instead.
      if (typeof row !== 'number' || typeof col !== 'number'
        || row < 0 || row >= state.rows || col < 0 || col >= state.cols) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Koordinat tidak valid!' } }] };
      }

      // C6: lazy grid generation on first reveal — guarantees the first
      // clicked cell (and its 3x3 neighborhood) contains no bomb.
      if (state.grid === null) {
        generateGrid(state, row, col);
        state.firstClick = { row, col };
      }
      // After generateGrid, state.grid is non-null — but TS can't narrow
      // mutation through a function call, so assert explicitly.
      const grid = state.grid!;
      const cell = grid[row]?.[col];
      if (!cell) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Koordinat tidak valid!' } }] };
      }
      // H7: surface a clear error instead of silently dropping the action —
      // the acting client must know why nothing happened.
      if (cell.state === 'revealed') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Cell sudah dibuka' } }] };
      }
      if (cell.state === 'flagged') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Lepas bendera dulu!' } }] };
      }

      const changedCells: { row: number; col: number; state: Cell['state']; adjacent: number; exploded?: boolean }[] = [];

      if (cell.hasBomb) {
        // Boom — reveal every bomb, team loses
        cell.state = 'revealed';
        changedCells.push({ row, col, state: 'revealed', adjacent: cell.adjacent, exploded: true });
        for (let r = 0; r < state.rows; r++) {
          for (let c = 0; c < state.cols; c++) {
            const cb = grid[r]?.[c];
            if (!cb) continue;
            if ((r !== row || c !== col) && cb.hasBomb && cb.state !== 'revealed') {
              cb.state = 'revealed';
              changedCells.push({ row: r, col: c, state: 'revealed', adjacent: cb.adjacent });
            }
          }
        }
        state.winner = 'none';
        events.push({ type: 'revealResult', data: { cells: changedCells, result: 'boom' } });
        events.push({ type: 'gameOver', data: { winnerId: 'none' } });
        return { newState: { ...state }, events };
      }

      // Safe reveal — flood-fill BFS cascade
      revealCascade(state, row, col, changedCells);
      events.push({
        type: 'revealResult',
        data: { cells: changedCells, result: 'safe', revealedSafeCount: state.revealedSafeCount, totalSafeCells: state.totalSafeCells },
      });

      // Win check
      if (state.revealedSafeCount === state.totalSafeCells) {
        state.winner = 'team';
        events.push({ type: 'gameOver', data: { winnerId: 'team' } });
        return { newState: { ...state }, events };
      }

      // Turn logic: santai — every successful action passes turn;
      // tantangan — safe reveal keeps the current player going (chain continues).
      if (state.mode === 'tantangan') {
        state.chainActive = true;
        return { newState: { ...state }, events };
      }
      endTurn(state, events);
      return { newState: { ...state }, events };
    }

    if (action.type === 'toggleFlag') {
      // Server-side turn enforcement
      if (state.playerOrder.length > 0 && state.playerOrder[state.currentTurn] !== playerId) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Bukan giliranmu!' } }] };
      }
      if (state.phase !== 'playing') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Atur permainan dulu!' } }] };
      }

      const payload = (action.payload ?? {}) as { row?: unknown; col?: unknown };
      const row = payload.row;
      const col = payload.col;
      // M8: same malformed-input feedback as reveal
      if (typeof row !== 'number' || typeof col !== 'number'
        || row < 0 || row >= state.rows || col < 0 || col >= state.cols) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Koordinat tidak valid!' } }] };
      }

      // C6: toggleFlag should never generate the grid — only reveal does. If
      // the player hasn't revealed anything yet, the grid is still null.
      if (state.grid === null) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Buka cell dulu sebelum menandai' } }] };
      }

      const cell = state.grid[row]?.[col];
      if (!cell) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Koordinat tidak valid!' } }] };
      }
      // H7: same surfaced error as reveal.
      if (cell.state === 'revealed') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Cell sudah dibuka' } }] };
      }

      cell.state = cell.state === 'flagged' ? 'hidden' : 'flagged';
      events.push({ type: 'flagToggled', data: { row, col, state: cell.state } });

      // Flag always ends the turn (both modes)
      endTurn(state, events);
      return { newState: { ...state }, events };
    }

    if (action.type === 'pass') {
      // M3: pass had no turn enforcement — a non-current player could force-end
      // the current player's tantangan chain. Gate it like reveal/toggleFlag.
      if (state.playerOrder.length > 0 && state.playerOrder[state.currentTurn] !== playerId) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Bukan giliranmu!' } }] };
      }
      if (state.mode !== 'tantangan') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Pass hanya di mode Tantangan' } }] };
      }
      if (state.phase !== 'playing') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Atur permainan dulu!' } }] };
      }

      state.chainActive = false;
      endTurn(state, events);
      return { newState: { ...state }, events };
    }

    return { newState: state, events };
  }

  // Disconnection handling: prune the leaver so turns never rotate to a ghost.
  // Pruning also runs during phase 'config' (M1): room state is already
  // 'playing' while the board awaits its config action, so a disconnect in that
  // window used to leave a ghost in the rotation. With 1 player left the co-op
  // game can still continue solo (win/lose rules unchanged) — no forced game over.
  override removePlayer(
    state: MinesweeperExtendedState,
    playerId: string,
  ): { playerOrder: string[]; gameOver?: boolean } {
    if (state.winner) return { playerOrder: state.playerOrder };
    const idx = state.playerOrder.indexOf(playerId);
    if (idx === -1) return { playerOrder: state.playerOrder };
    const next = [...state.playerOrder];
    next.splice(idx, 1);
    if (next.length === 0) {
      state.playerOrder = next;
      return { playerOrder: next };
    }
    if (state.currentTurn > idx) {
      state.currentTurn = (state.currentTurn - 1 + next.length) % next.length;
    } else if (state.currentTurn >= next.length) {
      state.currentTurn = 0;
    }
    if (next.length === 1) state.chainActive = false;
    state.playerOrder = next;
    return { playerOrder: next };
  }
}

// === Turn logic ===

function endTurn(state: MinesweeperExtendedState, events: GameEvent[]): void {
  if (state.winner) return;
  if (state.playerOrder.length <= 1) return;
  state.chainActive = false;
  state.currentTurn = (state.currentTurn + 1) % state.playerOrder.length;
  events.push({ type: 'turnChange', data: { nextPlayerId: state.playerOrder[state.currentTurn] } });
}

// === Grid generation ===

function generateGrid(state: MinesweeperExtendedState, safeRow: number, safeCol: number): void {
  // C6: first-click safety — the clicked cell and its 3x3 neighborhood must
  // never contain a bomb. We also need at least 1 free cell for the first
  // click itself, so cap bombCount to (rows*cols - 9) and reserve the 3x3.
  if (state.bombCount > state.rows * state.cols - 9) {
    state.bombCount = Math.max(0, state.rows * state.cols - 9);
  }

  // Empty grid
  state.grid = [];
  for (let r = 0; r < state.rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < state.cols; c++) {
      row.push({ hasBomb: false, adjacent: 0, state: 'hidden' });
    }
    state.grid.push(row);
  }

  // Mark the 3x3 safe zone (centered on the first click).
  const safe = new Set<string>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = safeRow + dr;
      const c = safeCol + dc;
      if (r >= 0 && r < state.rows && c >= 0 && c < state.cols) {
        safe.add(`${r},${c}`);
      }
    }
  }

  // Random bomb placement — skip the safe zone.
  let placed = 0;
  let attempts = 0;
  // Bound attempts to prevent infinite loop on degenerate configs.
  const maxAttempts = state.rows * state.cols * 10;
  while (placed < state.bombCount && attempts < maxAttempts) {
    attempts++;
    const r = Math.floor(Math.random() * state.rows);
    const c = Math.floor(Math.random() * state.cols);
    if (safe.has(`${r},${c}`)) continue;
    const cell = state.grid[r]?.[c];
    if (!cell || cell.hasBomb) continue;
    cell.hasBomb = true;
    placed++;
  }

  // Adjacent counts
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = state.grid[r]?.[c];
      if (!cell) continue;
      cell.adjacent = countAdjacent(state, r, c);
    }
  }

  state.totalSafeCells = state.rows * state.cols - state.bombCount;
}

function countAdjacent(state: MinesweeperExtendedState, row: number, col: number): number {
  // countAdjacent is only called from generateGrid (which just built the grid)
  // and from revealCascade (only after the lazy init). Non-null assert is safe.
  const grid = state.grid!;
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      const cell = grid[r]?.[c];
      if (r >= 0 && r < state.rows && c >= 0 && c < state.cols && cell?.hasBomb) {
        count++;
      }
    }
  }
  return count;
}

// === Flood-fill BFS cascade ===

function revealCascade(
  state: MinesweeperExtendedState,
  startRow: number,
  startCol: number,
  changedCells: { row: number; col: number; state: Cell['state']; adjacent: number; exploded?: boolean }[],
): void {
  // Only called after lazy init in handleAction('reveal') — non-null assert OK.
  const grid = state.grid!;
  const queue: [number, number][] = [[startRow, startCol]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const cell = grid[r]?.[c];
    if (!cell) continue;
    if (cell.state === 'revealed' || cell.state === 'flagged' || cell.hasBomb) continue;

    cell.state = 'revealed';
    state.revealedSafeCount++;
    changedCells.push({ row: r, col: c, state: 'revealed', adjacent: cell.adjacent });

    // Zero-cells cascade to neighbors
    if (cell.adjacent === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols && !visited.has(`${nr},${nc}`)) {
            queue.push([nr, nc]);
          }
        }
      }
    }
  }
}

// === Client-facing projection (bombs hidden) ===

export function toView(state: MinesweeperExtendedState): MinesweeperView {
  const gameOver = state.winner != null;
  // C6: grid is null between config and the first reveal — emit a fully-hidden
  // placeholder so the client renders an empty board (no crash on .map).
  if (state.grid === null) {
    return {
      difficulty: state.difficulty,
      mode: state.mode,
      phase: state.phase,
      rows: state.rows,
      cols: state.cols,
      bombCount: state.bombCount,
      cells: [],
      flagsUsed: 0,
      currentTurn: state.currentTurn,
      chainActive: state.chainActive,
      winner: state.winner,
    };
  }
  const cells = state.grid.map(row =>
    row.map(cell => {
      if (cell.state === 'revealed') {
        if (cell.hasBomb) {
          // The clicked bomb gets exploded:true; other revealed bombs render as 💣
          return { state: cell.state, adjacent: cell.adjacent, exploded: true };
        }
        return { state: cell.state, adjacent: cell.adjacent };
      }
      // After a loss, uncover every remaining bomb so the board shows the full
      // picture. adjacent:-1 marks "bomb, not the clicked one" → client renders 💣.
      if (gameOver && cell.hasBomb) {
        return { state: 'revealed' as const, adjacent: -1, exploded: false };
      }
      // Hidden / flagged — do NOT leak hasBomb or real adjacency
      return { state: cell.state, adjacent: 0 };
    }),
  );

  const flagsUsed = state.grid.flat().filter(c => c.state === 'flagged').length;

  return {
    difficulty: state.difficulty,
    mode: state.mode,
    phase: state.phase,
    rows: state.rows,
    cols: state.cols,
    bombCount: state.bombCount,
    cells,
    flagsUsed,
    currentTurn: state.currentTurn,
    chainActive: state.chainActive,
    winner: state.winner,
  };
}

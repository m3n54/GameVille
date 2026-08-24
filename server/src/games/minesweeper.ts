import { BaseGame, GameEvent } from './base';
import { GameType, MinesweeperState, MinesweeperView, MinesweeperDifficulty, Cell } from '../types';

const DIFFICULTY_CONFIG: Record<MinesweeperDifficulty, [number, number, number]> = {
  mudah: [8, 8, 10],
  sedang: [10, 10, 15],
  sulit: [12, 12, 25],
  ekstrem: [14, 14, 40],
};

// Extended internal state — grid is NOT generated until the config action arrives.
export type MinesweeperExtendedState = MinesweeperState & { phase: 'config' | 'playing' };

export class MinesweeperEngine extends BaseGame {
  gameType: GameType = 'minesweeper';

  createInitialState(playerOrder: string[]): MinesweeperExtendedState {
    return {
      difficulty: 'sedang',
      mode: 'santai',
      rows: 10,
      cols: 10,
      bombCount: 15,
      grid: [],
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
      const payload = (action.payload ?? {}) as { difficulty?: string; mode?: string };
      const difficulty = (
        payload.difficulty && payload.difficulty in DIFFICULTY_CONFIG ? payload.difficulty : 'sedang'
      ) as MinesweeperDifficulty;
      const mode = payload.mode === 'tantangan' ? 'tantangan' : 'santai';
      const [rows, cols, bombCount] = DIFFICULTY_CONFIG[difficulty];

      state.difficulty = difficulty;
      state.mode = mode;
      state.rows = rows;
      state.cols = cols;
      state.bombCount = bombCount;
      generateGrid(state);
      state.phase = 'playing';

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

      const cell = state.grid[row]?.[col];
      if (!cell) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Koordinat tidak valid!' } }] };
      }
      if (cell.state === 'revealed') return { newState: state, events: [] }; // silent no-op
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
            if ((r !== row || c !== col) && state.grid[r][c].hasBomb && state.grid[r][c].state !== 'revealed') {
              state.grid[r][c].state = 'revealed';
              changedCells.push({ row: r, col: c, state: 'revealed', adjacent: state.grid[r][c].adjacent });
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

      const cell = state.grid[row]?.[col];
      if (!cell) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Koordinat tidak valid!' } }] };
      }
      if (cell.state === 'revealed') return { newState: state, events: [] }; // silent no-op

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
  removePlayer(
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

function generateGrid(state: MinesweeperExtendedState): void {
  // Empty grid
  state.grid = [];
  for (let r = 0; r < state.rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < state.cols; c++) {
      row.push({ hasBomb: false, adjacent: 0, state: 'hidden' });
    }
    state.grid.push(row);
  }

  // Random bomb placement
  let placed = 0;
  while (placed < state.bombCount) {
    const r = Math.floor(Math.random() * state.rows);
    const c = Math.floor(Math.random() * state.cols);
    if (!state.grid[r][c].hasBomb) {
      state.grid[r][c].hasBomb = true;
      placed++;
    }
  }

  // Adjacent counts
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      state.grid[r][c].adjacent = countAdjacent(state, r, c);
    }
  }

  state.totalSafeCells = state.rows * state.cols - state.bombCount;
}

function countAdjacent(state: MinesweeperExtendedState, row: number, col: number): number {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < state.rows && c >= 0 && c < state.cols && state.grid[r][c].hasBomb) {
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
  const queue: [number, number][] = [[startRow, startCol]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const cell = state.grid[r][c];
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

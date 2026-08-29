import { BaseGame, GameEvent } from './base';
import { GameType, SeaBattlePlayerView } from '../types';

interface Ship {
  type: string;
  cells: [number, number][];
  hits: number;
}

interface SeaBattleState {
  player1Id: string;
  player2Id: string;
  grid1: string[][];
  grid2: string[][];
  ships1: Ship[];
  ships2: Ship[];
  phase: 'setup' | 'playing' | 'finished';
  currentTurn: string;
  winner: string | null;
}

function createEmptyGrid(): string[][] {
  return Array.from({ length: 10 }, () => Array(10).fill(' '));
}

function generateAutoPlacement(): { grid: string[][]; ships: Ship[] } {
  const grid = createEmptyGrid();
  const ships: Ship[] = [];
  const shipSizes = [4, 3, 3, 2, 1];

  for (const size of shipSizes) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 100) {
      const row = Math.floor(Math.random() * 10);
      const col = Math.floor(Math.random() * 10);
      const horizontal = Math.random() > 0.5;

      if (horizontal && col + size > 10) { attempts++; continue; }
      if (!horizontal && row + size > 10) { attempts++; continue; }

      let canPlace = true;
      const cells: [number, number][] = [];
      for (let i = 0; i < size; i++) {
        const r = horizontal ? row : row + i;
        const c = horizontal ? col + i : col;
        if (grid[r]?.[c] !== ' ') { canPlace = false; break; }
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            const ng = grid[nr]?.[nc];
            if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10 && ng && ng !== ' ') {
              canPlace = false;
            }
          }
        }
        cells.push([r, c]);
      }

      if (canPlace) {
        for (const [r, c] of cells) {
          const row = grid[r];
          if (row) row[c] = 'S';
        }
        const shipTypes: Record<number, string> = { 4: 'Battleship', 3: 'Cruiser', 2: 'Destroyer', 1: 'Submarine' };
        ships.push({ type: shipTypes[size] ?? 'Ship', cells, hits: 0 });
        placed = true;
      }
      attempts++;
    }
    // M1: silent skip is dangerous — caller would have a partial fleet and
    // the C1 guard would reject any fire. Throw so the handler can emit an
    // explicit error event for the client.
    if (!placed) {
      throw new Error('Cannot place ship: board too crowded');
    }
  }

  return { grid, ships };
}

export class SeaBattleEngine extends BaseGame {
  gameType: GameType = 'sea-battle';

  createInitialState(playerOrder: string[]): SeaBattleState {
    return {
      player1Id: playerOrder[0] ?? '',
      player2Id: playerOrder[1] ?? '',
      grid1: createEmptyGrid(),
      grid2: createEmptyGrid(),
      ships1: [],
      ships2: [],
      phase: 'setup',
      currentTurn: playerOrder[0] ?? '',
      winner: null,
    };
  }

  handleAction(
    state: SeaBattleState,
    playerId: string,
    action: { type: string; payload?: unknown },
  ): { newState: SeaBattleState; events: GameEvent[] } {
    const events: GameEvent[] = [];

    if (action.type === 'autoPlace') {
      // M1: wrap placement so a crowded-board throw becomes an error event
      // for the client instead of crashing the engine.
      try {
        if (playerId === state.player1Id && state.ships1.length === 0) {
          const { grid, ships } = generateAutoPlacement();
          state.grid1 = grid;
          state.ships1 = ships;
          events.push({ type: 'shipsPlaced', data: { playerId } });
        } else if (playerId === state.player2Id && state.ships2.length === 0) {
          const { grid, ships } = generateAutoPlacement();
          state.grid2 = grid;
          state.ships2 = ships;
          events.push({ type: 'shipsPlaced', data: { playerId } });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Auto-placement failed';
        return { newState: state, events: [{ type: 'error', data: { message } }] };
      }

      if (state.ships1.length > 0 && state.ships2.length > 0) {
        state.phase = 'playing';
        events.push({ type: 'gameStart', data: { firstTurn: state.currentTurn } });
      }

      return { newState: { ...state }, events };
    }

    if (action.type === 'fire') {
      if (state.phase !== 'playing') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Game belum dimulai!' } }] };
      }
      if (playerId !== state.currentTurn) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Bukan giliranmu!' } }] };
      }

      // H4: validate the payload BEFORE indexing — a malformed row/col used to
      // throw TypeError inside handleAction and leave the firing client hanging.
      const payload = (action.payload ?? {}) as { row?: unknown; col?: unknown };
      const row = payload.row;
      const col = payload.col;
      const validCoord = (v: unknown): v is number =>
        typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 10;
      if (!validCoord(row) || !validCoord(col)) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Koordinat tidak valid!' } }] };
      }
      // M2: assert playerId is one of the two registered players BEFORE the
      // ternary — string-keyed indexing with an unknown id would silently
      // return undefined for targetShips and trip the C1 guard anyway, but
      // rejecting up front is clearer.
      if (![state.player1Id, state.player2Id].includes(playerId)) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Invalid player' } }] };
      }
      const targetGrid = playerId === state.player1Id ? 'grid2' : 'grid1';
      const targetShips = playerId === state.player1Id ? 'ships2' : 'ships1';

      // Check if already fired there
      const cellValue = state[targetGrid][row]?.[col];
      if (cellValue !== ' ' && cellValue !== 'S') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Sudah ditembak!' } }] };
      }

      let hit = false;
      let sunkShip: string | null = null;

      if (cellValue === 'S') {
        const row1 = state[targetGrid][row];
        if (row1) row1[col] = 'H';
        hit = true;

        for (const ship of state[targetShips]) {
          if (ship.cells.some(([r, c]) => r === row && c === col)) {
            ship.hits++;
            if (ship.hits === ship.cells.length) {
              sunkShip = ship.type;
            }
            break;
          }
        }
      } else {
        const row1 = state[targetGrid][row];
        if (row1) row1[col] = 'M';
      }

      events.push({
        type: 'fireResult',
        data: { playerId, row, col, hit, sunkShip },
      });

      const targetShipsArr = state[targetShips];
      // C1: guard against empty fleet — Array.every returns true for [], which
      // would give an instant win on the first shot if auto-placement failed.
      if (targetShipsArr.length === 0) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Fleet not ready' } }] };
      }
      const allSunk = targetShipsArr.every(ship => ship.hits >= ship.cells.length);
      if (allSunk) {
        state.winner = playerId;
        state.phase = 'finished';
        events.push({ type: 'gameOver', data: { winnerId: playerId } });
      } else {
        state.currentTurn = playerId === state.player1Id ? state.player2Id : state.player1Id;
        events.push({ type: 'turnChange', data: { nextPlayerId: state.currentTurn } });
      }
    }

    return { newState: { ...state }, events };
  }

  // Disconnection handling: sea battle is strictly 1v1 — the remaining player wins by forfeit.
  override removePlayer(state: SeaBattleState, playerId: string): { playerOrder: string[]; gameOver?: boolean } {
    if (state.winner || state.phase === 'finished') return { playerOrder: [] };
    const other = playerId === state.player1Id ? state.player2Id : state.player1Id;
    if (other) {
      // C2: return survivor's id per engine convention; 1v1 forfeit → survivor wins.
      state.winner = other;
      state.phase = 'finished';
      return { playerOrder: [other], gameOver: true };
    }
    // Defensive: both players left (shouldn't happen in 1v1) — finish cleanly.
    state.phase = 'finished';
    return { playerOrder: [], gameOver: true };
  }
}

// === Client-facing projection (per-player, anti-cheat) ===
//
// The raw SeaBattleState contains BOTH players' ship positions. Broadcasting it
// verbatim let any client read the opponent's grid straight from its own socket
// payloads (C1). This projection gives each caller only:
//   - their own grid + own ships in full
//   - the enemy grid with 'S' markers replaced by ' ' (hits/misses remain)
// After the game finishes the full reveal is safe for everyone.

function stripShips(grid: string[][]): string[][] {
  return grid.map(row => row.map(cell => (cell === 'S' ? ' ' : cell)));
}

function countSunk(ships: Ship[]): number {
  return ships.filter(ship => ship.hits >= ship.cells.length).length;
}

export function seaBattleView(state: SeaBattleState, forPlayerId?: string): SeaBattlePlayerView {
  // Game finished → full reveal is safe; otherwise default to player 1's view.
  const revealAll = state.winner != null;
  const asPlayer1 = revealAll || forPlayerId == null || forPlayerId === state.player1Id;
  const myGrid = asPlayer1 ? state.grid1 : state.grid2;
  const enemyGrid = asPlayer1 ? state.grid2 : state.grid1;
  const myShips = asPlayer1 ? state.ships1 : state.ships2;
  const enemyShips = asPlayer1 ? state.ships2 : state.ships1;

  return {
    player1Id: state.player1Id,
    player2Id: state.player2Id,
    currentTurn: state.currentTurn,
    phase: state.phase,
    winner: state.winner,
    myGrid: myGrid.map(row => [...row]),
    // Reveal remaining enemy ships once the game is over; hide them while playing.
    enemyGrid: revealAll ? enemyGrid.map(row => [...row]) : stripShips(enemyGrid),
    myShips: myShips.map(s => ({ ...s, cells: s.cells.map(c => [...c] as [number, number]) })),
    enemySunkShips: countSunk(enemyShips),
  };
}

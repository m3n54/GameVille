import { BaseGame, GameEvent } from './base';
import { GameType } from '../types';

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
        if (grid[r][c] !== ' ') { canPlace = false; break; }
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10 && grid[nr][nc] !== ' ') {
              canPlace = false;
            }
          }
        }
        cells.push([r, c]);
      }

      if (canPlace) {
        for (const [r, c] of cells) grid[r][c] = 'S';
        const shipTypes: Record<number, string> = { 4: 'Battleship', 3: 'Cruiser', 2: 'Destroyer', 1: 'Submarine' };
        ships.push({ type: shipTypes[size] || 'Ship', cells, hits: 0 });
        placed = true;
      }
      attempts++;
    }
  }

  return { grid, ships };
}

export class SeaBattleEngine extends BaseGame {
  gameType: GameType = 'sea-battle';

  createInitialState(playerOrder: string[]): SeaBattleState {
    return {
      player1Id: playerOrder[0],
      player2Id: playerOrder[1],
      grid1: createEmptyGrid(),
      grid2: createEmptyGrid(),
      ships1: [],
      ships2: [],
      phase: 'setup',
      currentTurn: playerOrder[0],
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

      const { row, col } = action.payload as { row: number; col: number };
      const targetGrid = playerId === state.player1Id ? 'grid2' : 'grid1';
      const targetShips = playerId === state.player1Id ? 'ships2' : 'ships1';

      // Check if already fired there
      const cellValue = state[targetGrid][row][col];
      if (cellValue !== ' ' && cellValue !== 'S') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Sudah ditembak!' } }] };
      }

      let hit = false;
      let sunkShip: string | null = null;

      if (cellValue === 'S') {
        state[targetGrid][row][col] = 'H';
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
        state[targetGrid][row][col] = 'M';
      }

      events.push({
        type: 'fireResult',
        data: { playerId, row, col, hit, sunkShip },
      });

      const allSunk = state[targetShips].every(ship => ship.hits >= ship.cells.length);
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
}

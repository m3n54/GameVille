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

// SB-1: shared ship-type names — auto and manual placement must produce
// identical fleets so the HUD/sink messages never drift between modes.
const SHIP_TYPES: Record<number, string> = { 4: 'Battleship', 3: 'Cruiser', 2: 'Destroyer', 1: 'Submarine' };

// SB-1: shared placement rules for BOTH auto and manual fleets. A cell is
// placeable when it is in-bounds, empty, and (with requireBuffer) no ship
// occupies any of its 8 neighbors — the 1-cell gap auto placement has always
// enforced, kept identical for manual so neither mode gains a packing
// advantage. Checks against the grid it is given, so callers validate a
// whole draft fleet by writing cells onto a scratch grid as they go.
function canPlaceShip(grid: string[][], cells: [number, number][], opts: { requireBuffer: boolean }): boolean {
  for (const [r, c] of cells) {
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r > 9 || c < 0 || c > 9) return false;
    if (grid[r]?.[c] !== ' ') return false;
    if (opts.requireBuffer) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          const ng = grid[nr]?.[nc];
          if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10 && ng && ng !== ' ') return false;
        }
      }
    }
  }
  return true;
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

      const cells: [number, number][] = [];
      for (let i = 0; i < size; i++) {
        cells.push(horizontal ? [row, col + i] : [row + i, col]);
      }

      if (canPlaceShip(grid, cells, { requireBuffer: true })) {
        for (const [r, c] of cells) {
          const row = grid[r];
          if (row) row[c] = 'S';
        }
        ships.push({ type: SHIP_TYPES[size] ?? 'Ship', cells, hits: 0 });
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

// SB-1: shared post-placement transition for BOTH autoPlace and placeShips —
// when both fleets exist the match flips to 'playing' with the stored opening
// turn; otherwise the waiting player gets a turn hint so their UI can prompt
// them. Previously duplicated at the tail of autoPlace only.
function finishPlacement(state: SeaBattleState, events: GameEvent[], playerId: string): void {
  if (state.ships1.length > 0 && state.ships2.length > 0) {
    state.phase = 'playing';
    events.push({ type: 'gameStart', data: { firstTurn: state.currentTurn } });
  } else if (state.phase === 'setup') {
    const waiting = state.player1Id === playerId ? state.player2Id : state.player1Id;
    if (waiting) {
      events.push({ type: 'turnChange', data: { playerId: waiting } });
    }
  }
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
      } else {
        // SB-1: transition logic shared with placeShips (see finishPlacement).
        finishPlacement(state, events, playerId);
      }

      return { newState: { ...state }, events };
    }

    // SB-1: manual placement. The client sends CELL COORDINATES only — the
    // fleet is rebuilt server-side (type from SHIP_TYPES, hits: 0) so a
    // tampered payload can never inject a mis-sized or pre-damaged ship.
    if (action.type === 'placeShips') {
      if (state.phase !== 'setup') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Permainan sudah dimulai!' } }] };
      }
      const isP1 = playerId === state.player1Id;
      const isP2 = playerId === state.player2Id;
      if (!isP1 && !isP2) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Invalid player' } }] };
      }
      const ownShips = isP1 ? state.ships1 : state.ships2;
      if (ownShips.length > 0) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Kapal sudah ditempatkan!' } }] };
      }

      const payload = (action.payload ?? {}) as { ships?: unknown };
      const raw = Array.isArray(payload.ships) ? payload.ships : [];
      if (raw.length !== 5) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Harus tepat 5 kapal!' } }] };
      }

      // Shape pass: each entry must be a straight consecutive horizontal or
      // vertical line of integer cells. Ship type/size derives from cell count.
      const ships: Ship[] = [];
      for (const entry of raw) {
        const cellsRaw = (entry as { cells?: unknown })?.cells;
        if (!Array.isArray(cellsRaw) || cellsRaw.length < 1 || cellsRaw.length > 4) {
          return { newState: state, events: [{ type: 'error', data: { message: 'Format kapal tidak valid!' } }] };
        }
        const cells: [number, number][] = [];
        for (const pair of cellsRaw) {
          if (!Array.isArray(pair) || pair.length !== 2
            || !Number.isInteger(pair[0]) || !Number.isInteger(pair[1])) {
            return { newState: state, events: [{ type: 'error', data: { message: 'Koordinat kapal tidak valid!' } }] };
          }
          cells.push([pair[0] as number, pair[1] as number]);
        }
        const sameRow = cells.every(([r]) => r === cells[0]![0]);
        const sameCol = cells.every(([, c]) => c === cells[0]![1]);
        if (!sameRow && !sameCol) {
          return { newState: state, events: [{ type: 'error', data: { message: 'Kapal harus lurus (horizontal/vertikal)!' } }] };
        }
        const sorted = [...cells].sort((a, b) => (sameRow ? a[1]! - b[1]! : a[0]! - b[0]!));
        for (let i = 1; i < sorted.length; i++) {
          const [pr, pc] = sorted[i - 1]!;
          const [cr, cc] = sorted[i]!;
          const consecutive = sameRow ? (cr === pr && cc === pc + 1) : (cc === pc && cr === pr + 1);
          if (!consecutive) {
            return { newState: state, events: [{ type: 'error', data: { message: 'Sel kapal harus berurutan!' } }] };
          }
        }
        ships.push({ type: SHIP_TYPES[cells.length] ?? 'Ship', cells, hits: 0 });
      }

      // Fleet composition: exact multiset [4,3,3,2,1].
      const sizes = ships.map((s) => s.cells.length).sort((a, b) => a - b);
      if (sizes.join(',') !== '1,2,3,3,4') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Armada harus terdiri dari kapal berukuran 4, 3, 3, 2, dan 1!' } }] };
      }

      // Overlap + buffer against a scratch grid — the player's real grid stays
      // untouched until the WHOLE fleet validates, so a rejected draft leaves
      // no stray 'S' behind.
      const scratch = createEmptyGrid();
      for (const ship of ships) {
        if (!canPlaceShip(scratch, ship.cells, { requireBuffer: true })) {
          return { newState: state, events: [{ type: 'error', data: { message: 'Penempatan tidak valid: kapal tidak boleh menempel atau tumpang tindih!' } }] };
        }
        for (const [r, c] of ship.cells) {
          const row = scratch[r];
          if (row) row[c] = 'S';
        }
      }

      const grid = isP1 ? state.grid1 : state.grid2;
      for (const ship of ships) {
        for (const [r, c] of ship.cells) {
          const row = grid[r];
          if (row) row[c] = 'S';
        }
      }
      if (isP1) state.ships1 = ships; else state.ships2 = ships;
      events.push({ type: 'shipsPlaced', data: { playerId } });
      finishPlacement(state, events, playerId);
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
    // G1 (audit H2): a non-participant (stale instance from a pre-G1 start, or
    // any id that is not one of the two registered players) must NEVER decide
    // the match. The old ternary mapped any unknown id onto player1's forfeit
    // win; ignore the leaver instead.
    if (playerId !== state.player1Id && playerId !== state.player2Id) {
      return { playerOrder: [] };
    }
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
  // Game finished → full reveal is safe for everyone.
  const revealAll = state.winner != null;
  // Anti-cheat: every caller MUST identify which player they are projecting
  // for. The previous default (asPlayer1 = forPlayerId == null) silently
  // leaked player1's ship positions to every receiver — breaking ship
  // placement UX and being a literal cheat. Throw loudly so any future
  // call site that forgets to pass forPlayerId fails visibly instead of
  // shipping a bug.
  if (forPlayerId == null && !revealAll) {
    throw new Error('seaBattleView: forPlayerId is required (anti-cheat projection)');
  }
  const asPlayer1 = revealAll || forPlayerId === state.player1Id;
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
    // Opponent fleet size (0 while they haven't placed, 5 once setup is done).
    // Lets the client know "lawan sudah place" without leaking positions.
    enemyShipsPlaced: enemyShips.length,
  };
}

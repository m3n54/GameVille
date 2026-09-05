import { BaseGame, GameEvent } from './base';
import { GameType, SnakesLaddersState } from '../types';

// LD-1: canonical hand-tuned board — kept as the deterministic fallback and
// as the layout the existing test suite asserts against. Exported so tests
// can pin the board and assert against specific [head, tail] / [bottom, top]
// pairs without having to duplicate the constants.
export const FALLBACK_SNAKES: [number, number][] = [
  [16, 6], [47, 26], [49, 11], [56, 53], [62, 19],
  [64, 60], [87, 24], [93, 73], [95, 75], [98, 78],
];
export const FALLBACK_LADDERS: [number, number][] = [
  [1, 38], [4, 14], [9, 31], [21, 42], [28, 84],
  [36, 44], [51, 67], [71, 91], [80, 98],
];

// LD-1: pick a fresh layout per match so a rematch isn't identical to the
// previous one. Each snake head and ladder foot MUST differ by at least 6
// tiles (max dice) so a single roll never crosses a snake mouth and the
// matching ladder foot in one move. Endpoints are unique and never on 0/99;
// if rejection sampling runs out of room, the deterministic fallback is used.
function randomLayoutPair(): { snakes: [number, number][]; ladders: [number, number][] } {
  for (let attempt = 0; attempt < 300; attempt++) {
    const used = new Set<number>([0, 99]);
    const snakes: [number, number][] = [];
    const ladders: [number, number][] = [];
    let ok = true;

    const fillPair = (head: number, tail: number): boolean => {
      if (head < 1 || head > 98 || tail < 1 || tail > 98) return false;
      if (Math.abs(head - tail) < 6) return false;
      if (used.has(head) || used.has(tail)) return false;
      used.add(head); used.add(tail);
      return true;
    };

    for (let i = 0; i < 10; i++) {
      let placed = false;
      for (let t = 0; t < 80; t++) {
        const head = 12 + Math.floor(Math.random() * 87);
        const tail = 1 + Math.floor(Math.random() * (head - 6));
        if (fillPair(head, tail)) { snakes.push([head, tail]); placed = true; break; }
      }
      if (!placed) { ok = false; break; }
    }
    if (!ok) continue;
    for (let i = 0; i < 9; i++) {
      let placed = false;
      for (let t = 0; t < 80; t++) {
        const bottom = 1 + Math.floor(Math.random() * 70);
        const top = Math.min(98, bottom + 12 + Math.floor(Math.random() * Math.max(1, 86 - bottom)));
        if (fillPair(bottom, top)) { ladders.push([bottom, top]); placed = true; break; }
      }
      if (!placed) { ok = false; break; }
    }
    if (!ok) continue;
    return { snakes, ladders };
  }
  return { snakes: FALLBACK_SNAKES, ladders: FALLBACK_LADDERS };
}

export class SnakesLaddersEngine extends BaseGame {
  gameType: GameType = 'snakes-ladders';

  // Disconnection handling: prune the leaver from the players array so the turn
  // never rotates to a ghost. Last player standing wins by forfeit.
  override removePlayer(state: SnakesLaddersState, playerId: string): { playerOrder: string[]; gameOver?: boolean } {
    if (state.winner) return { playerOrder: state.players.map(p => p.id) };
    const idx = state.players.findIndex(p => p.id === playerId);
    if (idx === -1) return { playerOrder: state.players.map(p => p.id) };
    if (state.players.length <= 2) {
      // 1v1 or last-two: remaining player wins
      state.winner = state.players.find(p => p.id !== playerId)?.id ?? null;
      return { playerOrder: [], gameOver: true };
    }
    state.players.splice(idx, 1);
    if (state.currentTurn > idx) {
      state.currentTurn -= 1;
    } else if (state.currentTurn >= state.players.length) {
      state.currentTurn = 0;
    }
    return { playerOrder: state.players.map(p => p.id) };
  }

  // LD-1: optional layout injection lets tests pin the canonical board
  // (asserts are against specific [head, tail] / [bottom, top] pairs);
  // production matches get a fresh random layout per match so rematches
  // don't repeat the same board.
  createInitialState(playerOrder: string[], layout?: { snakes: [number, number][]; ladders: [number, number][] }): SnakesLaddersState {
    const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3'];
    const chosen = layout ?? randomLayoutPair();
    return {
      players: playerOrder.map((id, i) => ({
        id,
        position: 0,
        color: colors[i % colors.length] ?? '#FF6B6B',
      })),
      currentTurn: 0,
      diceValue: null,
      phase: 'rolling',
      snakes: chosen.snakes,
      ladders: chosen.ladders,
      winner: null,
    };
  }

  handleAction(
    state: SnakesLaddersState,
    playerId: string,
    action: { type: string; payload?: unknown },
  ): { newState: SnakesLaddersState; events: GameEvent[] } {
    const events: GameEvent[] = [];
    const playerIndex = state.players.findIndex(p => p.id === playerId);

    if (playerIndex === -1 || playerIndex !== state.currentTurn) {
      return { newState: state, events: [{ type: 'error', data: { message: 'Bukan giliranmu!' } }] };
    }

    if (action.type === 'roll') {
      const dice = Math.floor(Math.random() * 6) + 1;
      state.diceValue = dice;

      const player = state.players[playerIndex];
      if (!player) return { newState: state, events: [] };
      let newPos = player.position + dice;

      // Bounce back if exceeds 99 (max tile)
      if (newPos > 99) {
        newPos = 99 - (newPos - 99);
      }

      player.position = newPos;
      state.phase = 'moving';

      // Check snakes
      let snakeHit: [number, number] | null = null;
      for (const [head, tail] of state.snakes) {
        if (player.position === head) {
          player.position = tail;
          snakeHit = [head, tail];
          break;
        }
      }

      // Check ladders
      let ladderHit: [number, number] | null = null;
      for (const [bottom, top] of state.ladders) {
        if (player.position === bottom) {
          player.position = top;
          ladderHit = [bottom, top];
          break;
        }
      }

      events.push({
        type: 'diceResult',
        data: {
          playerId,
          value: dice,
          newPosition: player.position,
          snakeHit,
          ladderHit,
        },
      });

      // Check win (0-99 board, win at >= 99)
      if (player.position >= 99) {
        state.winner = playerId;
        state.phase = 'done';
        events.push({ type: 'gameOver', data: { winnerId: playerId } });
      } else {
        // Ready for next player's roll
        state.phase = 'rolling';
        // Next turn
        state.currentTurn = (state.currentTurn + 1) % state.players.length;
        state.diceValue = null;
        const next = state.players[state.currentTurn];
        if (next) {
          events.push({
            type: 'turnChange',
            data: { nextPlayerId: next.id },
          });
        }
      }
    }

    return { newState: { ...state }, events };
  }
}

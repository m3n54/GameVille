import { BaseGame, GameEvent } from './base';
import { GameType, SnakesLaddersState } from '../types';

const SNAKES: [number, number][] = [
  [16, 6], [47, 26], [49, 11], [56, 53], [62, 19],
  [64, 60], [87, 24], [93, 73], [95, 75], [98, 78],
];

const LADDERS: [number, number][] = [
  [1, 38], [4, 14], [9, 31], [21, 42], [28, 84],
  [36, 44], [51, 67], [71, 91], [80, 99],
];

export class SnakesLaddersEngine extends BaseGame {
  gameType: GameType = 'snakes-ladders';

  createInitialState(playerOrder: string[]): SnakesLaddersState {
    const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3'];
    return {
      players: playerOrder.map((id, i) => ({
        id,
        position: 0,
        color: colors[i % colors.length],
      })),
      currentTurn: 0,
      diceValue: null,
      phase: 'rolling',
      snakes: SNAKES,
      ladders: LADDERS,
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
        events.push({
          type: 'turnChange',
          data: { nextPlayerId: state.players[state.currentTurn].id },
        });
      }
    }

    return { newState: { ...state }, events };
  }
}

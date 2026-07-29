import { BaseGame, GameEvent } from './base';
import { GameType, SnakesLaddersState } from '../types';

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
      snakes: [[16, 6], [47, 26], [49, 11], [56, 53], [62, 19], [64, 60], [87, 24], [93, 73], [95, 75], [98, 78]],
      ladders: [[1, 38], [4, 14], [9, 31], [21, 42], [28, 84], [36, 44], [51, 67], [71, 91], [80, 100]],
      winner: null,
    };
  }

  handleAction(state: unknown, _playerId: string, _action: { type: string; payload?: unknown }): { newState: unknown; events: GameEvent[] } {
    // Stub — game logic implemented in Task 7
    return { newState: state, events: [] };
  }
}

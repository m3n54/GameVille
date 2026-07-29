import { GameType } from '../types';

export interface GameInstance {
  roomId: string;
  gameType: GameType;
  state: unknown;
  currentTurnIndex: number;
  playerOrder: string[]; // player IDs in turn order
  winner: string | null;
}

export abstract class BaseGame {
  abstract gameType: GameType;
  abstract createInitialState(playerOrder: string[]): unknown;
  abstract handleAction(state: unknown, playerId: string, action: { type: string; payload?: unknown }): { newState: unknown; events: GameEvent[] };

  createInstance(roomId: string, playerOrder: string[]): GameInstance {
    return {
      roomId,
      gameType: this.gameType,
      state: this.createInitialState(playerOrder),
      currentTurnIndex: 0,
      playerOrder,
      winner: null,
    };
  }

  getCurrentPlayerId(instance: GameInstance): string {
    return instance.playerOrder[instance.currentTurnIndex];
  }

  nextTurn(instance: GameInstance): void {
    instance.currentTurnIndex = (instance.currentTurnIndex + 1) % instance.playerOrder.length;
  }
}

export interface GameEvent {
  type: string;
  data: Record<string, unknown>;
}

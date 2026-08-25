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
    const id = instance.playerOrder[instance.currentTurnIndex];
    // Invariant: turn index is always in-range — engine nextTurn never exceeds
    // length. ! is safe here per gameService.computeNextTurnId semantics.
    return id ?? '';
  }

  nextTurn(instance: GameInstance): void {
    instance.currentTurnIndex = (instance.currentTurnIndex + 1) % instance.playerOrder.length;
  }

  // Remove a disconnected player from the live game. Engines with richer state
  // (players array, turn rotation) override this; default only prunes playerOrder.
  removePlayer(_state: unknown, _playerId: string): { playerOrder: string[]; gameOver?: boolean } {
    return { playerOrder: [], gameOver: false };
  }
}

export interface GameEvent {
  type: string;
  data: Record<string, unknown>;
}

// Standalone factory mirroring BaseGame.createInstance — usable without holding
// an engine subclass reference at the call site.
export function createInstance(engine: BaseGame, roomId: string, playerOrder: string[]): GameInstance {
  return {
    roomId,
    gameType: engine.gameType,
    state: engine.createInitialState(playerOrder),
    currentTurnIndex: 0,
    playerOrder,
    winner: null,
  };
}

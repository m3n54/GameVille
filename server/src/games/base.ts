import { GameType } from '../types';

// === G1: per-game player-composition contract (audit H2) =====================
// Sea Battle is strictly 1v1: createInitialState reads playerOrder[0] and [1]
// only. A 3-4 player room used to start it anyway (canStartGame only checked
// ≥2 players), leaving extra members as phantoms — and SeaBattleEngine.
// removePlayer treated any leaver as "the other player", so a phantom's
// disconnect instantly declared player1 the winner (and projected player2's
// grid as the phantom's "my board"). Enforce the contract at game:start.
export const GAME_PLAYER_REQUIREMENTS: Record<GameType, { min: number; max: number }> = {
  'snakes-ladders': { min: 2, max: 4 },
  'hangman': { min: 2, max: 4 },
  'sea-battle': { min: 2, max: 2 },
  'minesweeper': { min: 2, max: 4 },
};

// Returns null when the composition is legal, else a player-facing error.
export function validateGameComposition(gameType: GameType, playerCount: number): string | null {
  const req = GAME_PLAYER_REQUIREMENTS[gameType];
  if (!req) return 'Mesin permainan tidak tersedia';
  if (playerCount < req.min || playerCount > req.max) {
    if (req.max === 2) return 'Permainan ini hanya untuk 2 pemain';
    return `Jumlah pemain harus ${req.min}-${req.max} untuk permainan ini`;
  }
  return null;
}

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

// M8: discriminated union for engine events. The previous `{ type: string;
// data: Record<string, unknown> }` lost type-safety at every call site —
// engines could emit any string for `type` and any shape for `data`. The
// event switch in index.ts:299-340 was untyped as a result.
//
// We keep the common `data` field for backward compatibility (all 4 engines
// currently emit `{ type, data: {...} }` and the index.ts handler reads
// `event.data` directly). The `type` field is now a string literal union so
// the compiler catches unknown event names at the switch site. The shape
// of `data` is left as `Record<string, unknown>` for flexibility — the
// receiver in index.ts narrows on `type` before destructuring.
export type GameEventType =
  | 'correctGuess'
  | 'wrongGuess'
  | 'fireResult'
  | 'revealResult'
  | 'flagToggled'
  | 'diceResult'
  | 'shipsPlaced'
  | 'turnChange'
  | 'gameOver'
  | 'gameStart'
  | 'error';

export interface GameEvent {
  type: GameEventType;
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

// === Room & Player ===

export type GameType = 'snakes-ladders' | 'hangman' | 'sea-battle' | 'minesweeper';

export interface Player {
  id: string;
  nickname: string;
  color: string;
  emoji: string;
  isHost: boolean;
  isReady: boolean;
  joinedAt: number;
}

export interface Room {
  id: string;
  pin: string;
  name: string;
  gameType: GameType | null;
  hostId: string;
  players: Player[];
  state: 'waiting' | 'playing' | 'finished';
  createdAt: number;
}

// === Socket Events ===

// Ack payload for room:create / room:join — replaces the old
// socket.once('room:created') pattern that leaked listeners on the singleton.
export interface RoomAck {
  ok: boolean;
  room?: Room;
  error?: string;
}

// Ack payload for room:sync — gameState is the projected game snapshot and
// turnPlayerId tells a refreshing client whose turn it is without replaying events.
export interface SyncAck {
  ok: boolean;
  room?: Room;
  error?: string;
  gameState?: unknown;
  turnPlayerId?: string;
}

// Discriminated union for all engine actions. Replaces `{ type: string }` so the
// compiler rejects unknown action types and mismatched payloads.
export type GameAction =
  | { type: 'roll' }
  | { type: 'guess'; payload: { letter: string } }
  | { type: 'fire' | 'reveal' | 'toggleFlag'; payload: { row: number; col: number } }
  | { type: 'autoPlace' }
  | { type: 'pass' }
  | { type: 'config'; payload?: { language?: 'id' | 'en'; difficulty?: MinesweeperDifficulty; mode?: MinesweeperMode } };

export interface ServerToClientEvents {
  'player:update': (players: Player[]) => void;
  'game:started': (gameType: GameType) => void;
  'game:state': (state: unknown) => void;
  'game:action': (action: unknown) => void;
  'game:over': (data: { winnerId: string; winnerName: string }) => void;
  'chat:received': (data: { playerId: string; nickname: string; text: string }) => void;
  'reaction:received': (data: { playerId: string; nickname: string; emoji: string }) => void;
  'room:error': (data: { message: string }) => void;
  'room:state': (room: Room) => void;
}

export interface ClientToServerEvents {
  'room:create': (data: { name: string; nickname: string; color: string; emoji: string }, callback: (ack: RoomAck) => void) => void;
  'room:join': (data: { pin: string; nickname: string; color: string; emoji: string }, callback: (ack: RoomAck) => void) => void;
  'room:leave': () => void;
  'room:sync': (data: { pin: string }, callback: (response: SyncAck) => void) => void;
  'player:ready': (data: { ready: boolean }) => void;
  'game:select': (data: { gameType: GameType }) => void;
  'game:start': () => void;
  'game:action': (data: GameAction) => void;
  'chat:message': (data: { text: string }) => void;
  'reaction:send': (data: { emoji: string }) => void;
}

// === Game States ===

export interface SnakesLaddersState {
  players: { id: string; position: number; color: string }[];
  currentTurn: number;
  diceValue: number | null;
  phase: 'rolling' | 'moving' | 'animating' | 'done';
  snakes: [number, number][];
  ladders: [number, number][];
  winner: string | null;
}

export interface HangmanState {
  category: string;
  language: 'id' | 'en';
  phase: 'config' | 'playing';
  wordLength: number;
  guessedLetters: string[];
  correctLetters: (string | null)[];
  remainingAttempts: number;
  currentTurn: number;
  winner: string | null;
}

export interface Ship {
  type: string;
  cells: [number, number][];
  hits: number;
}

export interface SeaBattleState {
  player1Id: string;
  player2Id: string;
  currentTurn: string;
  phase: 'setup' | 'playing' | 'finished';
  winner: string | null;
  grid1: string[][];
  grid2: string[][];
  ships1: Ship[];
  ships2: Ship[];
}

// Per-player projection of SeaBattleState — the server strips opponent ship
// positions so a client cannot cheat by inspecting its own game:state payload.
// `'S'` (ship) markers are removed from the enemy grid; only `'H'` (hit) and
// `'M'` (miss) remain. Own grid + own ships are sent in full.
export interface SeaBattlePlayerView {
  player1Id: string;
  player2Id: string;
  currentTurn: string;
  phase: 'setup' | 'playing' | 'finished';
  winner: string | null;
  myGrid: string[][];
  enemyGrid: string[][];        // 'S' replaced with ' '
  myShips: Ship[];
  enemySunkShips: number;        // count of fully-sunk enemy ships (for HUD)
}

// === Minesweeper (co-op) ===

export type MinesweeperDifficulty = 'mudah' | 'sedang' | 'sulit' | 'ekstrem';
export type MinesweeperMode = 'santai' | 'tantangan';
export type CellState = 'hidden' | 'revealed' | 'flagged';

export interface Cell {
  hasBomb: boolean;
  adjacent: number;   // computed at init
  state: CellState;
}

export interface MinesweeperState {
  difficulty: MinesweeperDifficulty;
  mode: MinesweeperMode;
  rows: number;
  cols: number;
  bombCount: number;
  // Server-side truth (never sent raw to clients while playing):
  grid: Cell[][];
  revealedSafeCount: number;
  totalSafeCells: number;
  currentTurn: number;        // index into playerOrder
  playerOrder: string[];
  chainActive: boolean;       // tantangan mode: current player keeps playing
  winner: 'team' | 'none' | null;
}

// Client-facing projection (server sends this, bombs hidden):
export interface MinesweeperView {
  difficulty: MinesweeperDifficulty;
  mode: MinesweeperMode;
  phase: 'config' | 'playing';
  rows: number;
  cols: number;
  bombCount: number;
  cells: { state: CellState; adjacent: number; exploded?: boolean }[][];
  flagsUsed: number;
  currentTurn: number;
  chainActive: boolean;
  winner: 'team' | 'none' | null;
}

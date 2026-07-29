// === Room & Player ===

export type GameType = 'snakes-ladders' | 'hangman' | 'sea-battle';

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

export interface ServerToClientEvents {
  'room:created': (room: Room) => void;
  'room:joined': (room: Room) => void;
  'player:entered': (player: Player) => void;
  'player:left': (playerId: string) => void;
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
  'room:create': (data: { name: string; nickname: string; color: string; emoji: string }) => void;
  'room:join': (data: { pin: string; nickname: string; color: string; emoji: string }) => void;
  'room:leave': () => void;
  'player:ready': (data: { ready: boolean }) => void;
  'game:select': (data: { gameType: GameType }) => void;
  'game:start': () => void;
  'game:action': (data: { type: string; payload?: unknown }) => void;
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

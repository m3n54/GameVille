import { BaseGame, GameEvent } from './base';
import { GameType, HangmanState } from '../types';

const WORDS: Record<string, string[]> = {
  'Hewan': ['GAJAH', 'KUCING', 'KELINCI', 'SINGA', 'HARIMAU', 'BURUNG', 'IKAN', 'ULAR', 'KAMBING', 'SAPI'],
  'Buah': ['APEL', 'MANGGA', 'PISANG', 'JERUK', 'ANGGUR', 'SEMANGKA', 'NANAS', 'PEPAYA', 'DURIAN', 'RAMBUTAN'],
  'Negara': ['INDONESIA', 'MALAYSIA', 'JEPANG', 'KOREA', 'INGGRIS', 'PRANCIS', 'MESIR', 'AUSTRALIA', 'BRAZIL', 'THAILAND'],
};

const MAX_ATTEMPTS = 6;

export class HangmanEngine extends BaseGame {
  gameType: GameType = 'hangman';

  // The shared HangmanState type only stores wordLength, but the engine needs
  // the actual word for win checking. We stash the word on the state via an
  // extended shape internally; the public state projection below exposes it
  // so the client can show the answer on game over.
  createInitialState(playerOrder: string[]): HangmanState & { word: string; playerOrder: string[] } {
    const categories = Object.keys(WORDS);
    const category = categories[Math.floor(Math.random() * categories.length)];
    const words = WORDS[category];
    const word = words[Math.floor(Math.random() * words.length)];

    return {
      word,
      playerOrder,
      category,
      wordLength: word.length,
      guessedLetters: [],
      correctLetters: Array(word.length).fill(null),
      remainingAttempts: MAX_ATTEMPTS,
      currentTurn: 0,
      winner: null,
    } as HangmanState & { word: string; playerOrder: string[] };
  }

  handleAction(
    state: HangmanState & { word: string; playerOrder: string[] },
    playerId: string,
    action: { type: string; payload?: unknown },
  ): { newState: HangmanState & { word: string; playerOrder: string[] }; events: GameEvent[] } {
    const events: GameEvent[] = [];

    if (state.winner) return { newState: state, events: [] };

    if (action.type === 'guess') {
      const raw = (action.payload as { letter?: string })?.letter;
      if (!raw) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Tebak 1 huruf!' } }] };
      }
      const letter = raw.toUpperCase();
      if (letter.length !== 1 || !/[A-Z]/.test(letter)) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Tebak 1 huruf!' } }] };
      }
      if (state.guessedLetters.includes(letter)) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Huruf sudah ditebak!' } }] };
      }

      const playerOrderLen = state.playerOrder.length;

      state.guessedLetters.push(letter);

      if (state.word.includes(letter)) {
        // Correct guess — reveal positions
        for (let i = 0; i < state.word.length; i++) {
          if (state.word[i] === letter) {
            state.correctLetters[i] = letter;
          }
        }
        events.push({
          type: 'correctGuess',
          data: { letter, correctLetters: [...state.correctLetters] },
        });

        // Check win: every letter revealed
        if (state.correctLetters.every(l => l !== null)) {
          state.winner = playerId;
          events.push({ type: 'gameOver', data: { winnerId: playerId, word: state.word } });
          return { newState: { ...state }, events };
        }
      } else {
        // Wrong guess
        state.remainingAttempts--;
        events.push({
          type: 'wrongGuess',
          data: { letter, remainingAttempts: state.remainingAttempts },
        });

        if (state.remainingAttempts <= 0) {
          state.winner = 'none';
          events.push({ type: 'gameOver', data: { winnerId: 'none', word: state.word } });
          return { newState: { ...state }, events };
        }
      }

      // Next turn — only if we have at least one other player to rotate to
      if (playerOrderLen > 1) {
        state.currentTurn = (state.currentTurn + 1) % playerOrderLen;
        const nextId = state.playerOrder[state.currentTurn];
        events.push({ type: 'turnChange', data: { nextPlayerId: nextId } });
      }
    }

    return { newState: { ...state }, events };
  }
}

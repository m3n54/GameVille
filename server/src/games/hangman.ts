import { BaseGame, GameEvent } from './base';
import { GameType, HangmanState } from '../types';

// Client-facing projection — the secret word must never reach clients while playing
export type HangmanView = HangmanState & { playerOrder: string[] };

export function toHangmanView(state: HangmanExtendedState): HangmanView {
  if (state.winner) {
    // Game over — reveal the answer
    return state as HangmanView;
  }
  const { word, ...rest } = state;
  void word;
  return rest as HangmanView;
}

const WORDS: Record<'id' | 'en', Record<string, string[]>> = {
  id: {
    'Hewan': ['GAJAH', 'KUCING', 'KELINCI', 'SINGA', 'HARIMAU', 'BURUNG', 'IKAN', 'ULAR', 'KAMBING', 'SAPI'],
    'Buah': ['APEL', 'MANGGA', 'PISANG', 'JERUK', 'ANGGUR', 'SEMANGKA', 'NANAS', 'PEPAYA', 'DURIAN', 'RAMBUTAN'],
    'Negara': ['INDONESIA', 'MALAYSIA', 'JEPANG', 'KOREA', 'INGGRIS', 'PRANCIS', 'MESIR', 'AUSTRALIA', 'BRAZIL', 'THAILAND'],
  },
  en: {
    'Animal': ['ELEPHANT', 'CAT', 'RABBIT', 'LION', 'TIGER', 'BIRD', 'FISH', 'SNAKE', 'GOAT', 'COW'],
    'Fruit': ['APPLE', 'MANGO', 'BANANA', 'ORANGE', 'GRAPE', 'WATERMELON', 'PINEAPPLE', 'PAPAYA', 'DURIAN', 'RAMBUTAN'],
    'Country': ['INDONESIA', 'MALAYSIA', 'JAPAN', 'KOREA', 'ENGLAND', 'FRANCE', 'EGYPT', 'AUSTRALIA', 'BRAZIL', 'THAILAND'],
  },
};

const MAX_ATTEMPTS = 6;

// Config-phase state before the host picks a language
export type HangmanExtendedState = HangmanState & { word: string; playerOrder: string[] };

export class HangmanEngine extends BaseGame {
  gameType: GameType = 'hangman';

  // Config-phase initial state — no word yet; host picks language first.
  createInitialState(playerOrder: string[]): HangmanExtendedState {
    return {
      word: '',
      playerOrder,
      language: 'id',
      phase: 'config',
      category: '',
      wordLength: 0,
      guessedLetters: [],
      correctLetters: [],
      remainingAttempts: MAX_ATTEMPTS,
      currentTurn: 0,
      winner: null,
    };
  }

  handleAction(
    state: HangmanExtendedState,
    playerId: string,
    action: { type: string; payload?: unknown },
  ): { newState: HangmanExtendedState; events: GameEvent[] } {
    const events: GameEvent[] = [];

    if (state.winner) return { newState: state, events: [] };

    if (action.type === 'config') {
      if (state.phase !== 'config') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Permainan sudah dimulai!' } }] };
      }
      const lang = (action.payload as { language?: string })?.language === 'en' ? 'en' : 'id';
      state.language = lang;
      state.phase = 'playing';

      const categories = Object.keys(WORDS[lang]);
      const category = categories[Math.floor(Math.random() * categories.length)] ?? 'Hewan';
      const words = WORDS[lang][category] ?? [];
      const word = words[Math.floor(Math.random() * words.length)] ?? '';
      state.word = word;
      state.category = category;
      state.wordLength = word.length;
      state.correctLetters = Array(word.length).fill(null);

      events.push({ type: 'gameStart', data: {} });
      return { newState: { ...state }, events };
    }

    if (state.phase !== 'playing') {
      return { newState: state, events: [] };
    }

    if (action.type === 'guess') {
      // Server-side turn enforcement
      if (state.playerOrder.length > 0 && state.playerOrder[state.currentTurn] !== playerId) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Bukan giliranmu!' } }] };
      }

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
          state.winner = 'team';
          events.push({ type: 'gameOver', data: { winnerId: 'team', word: state.word, won: true } });
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

  // Disconnection handling: prune the leaver; with 1 player left the co-op game
  // continues solo (turn rotation stops, but guessing stays open).
  // EN-H1: when the leaver is BEFORE the active turn, every subsequent index
  // shifts down by one and we must decrement currentTurn to stay on the same
  // player. The old code only handled the "leaver is at or past the current
  // turn" case, which let the wrong player hijack the turn.
  override removePlayer(
    state: HangmanExtendedState,
    playerId: string,
  ): { playerOrder: string[]; gameOver?: boolean } {
    if (state.winner) return { playerOrder: state.playerOrder };
    const idx = state.playerOrder.indexOf(playerId);
    if (idx === -1) return { playerOrder: state.playerOrder };
    const next = [...state.playerOrder];
    next.splice(idx, 1);
    if (next.length === 0) {
      // No players left; engine will be deleted by the caller.
      state.playerOrder = next;
      return { playerOrder: next, gameOver: true };
    }
    if (state.currentTurn > idx) {
      // Leaver was earlier in the order; everything after shifted down by 1.
      state.currentTurn -= 1;
    } else if (state.currentTurn >= next.length) {
      // Leaver was the active player (or later and we wrapped); wrap to 0.
      state.currentTurn = 0;
    }
    state.playerOrder = next;
    return { playerOrder: next };
  }
}

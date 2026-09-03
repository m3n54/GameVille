import { describe, it, expect } from 'vitest';
import { HangmanEngine, toHangmanView, type HangmanExtendedState } from '../games/hangman';

// --- Fixtures ----------------------------------------------------------------

function makeState(): HangmanExtendedState {
  const engine = new HangmanEngine();
  return engine.createInitialState(['p1', 'p2']);
}

// --- Tests -------------------------------------------------------------------

describe('Hangman win check (M3 apostrophe-safe)', () => {
  it('detects win for word with apostrophe after all letters guessed', () => {
    // The M3 fix: win check must strip non-letters from the word so that
    // punctuation like apostrophes do not block the "all letters guessed"
    // verdict. Word "DON'T" — unique letters are D, O, N, T.
    const state = makeState();
    state.word = "DON'T";
    state.phase = 'playing';
    // D O N ' T — apostrophe sits at index 3, T at index 4.
    state.correctLetters = ['D', 'O', 'N', "'", 'T'];
    // Pre-fill with everything except T — the last unique letter we will guess.
    state.guessedLetters = ['D', 'O', 'N'];
    state.currentTurn = 0; // playerOrder[0] === 'p1' so turn check passes

    const engine = new HangmanEngine();
    const result = engine.handleAction(state, 'p1', { type: 'guess', payload: { letter: 'T' } });
    const newState = result.newState;

    // After T is matched, all unique letters {D,O,N,T} are guessed → win.
    expect(newState.winner).toBe('team');
    // Apostrophe position stays as its literal value (does not block the verdict).
    expect(newState.correctLetters[3]).toBe("'");
    expect(newState.correctLetters[4]).toBe('T');
  });

  it('ignores spaces and punctuation in win check', () => {
    // Word "NEW YORK" — spaces must be stripped before win check so the verdict
    // compares against the letter set {N,E,W,Y,O,R,K}, not the raw positions.
    const state = makeState();
    state.word = 'NEW YORK';
    state.phase = 'playing';
    state.correctLetters = ['N', 'E', 'W', ' ', 'Y', 'O', 'R', 'K'];
    // Pre-fill with all letters except K — the last unique letter we will guess.
    state.guessedLetters = ['N', 'E', 'W', 'Y', 'O', 'R'];
    state.currentTurn = 0; // playerOrder[0] === 'p1' so turn check passes

    // Verify the projection still hides the word while the game is in progress.
    const view = toHangmanView(state);
    expect(view.winner).toBeNull();

    const engine = new HangmanEngine();
    const result = engine.handleAction(state, 'p1', { type: 'guess', payload: { letter: 'K' } });
    const newState = result.newState;

    expect(newState.winner).toBe('team');
  });
});

describe('Hangman removePlayer (C3)', () => {
  it('sets winner to team when 1 survivor from 2 players', () => {
    const state = makeState();
    const engine = new HangmanEngine();

    const result = engine.removePlayer(state, 'p1');

    expect(result).toEqual({ playerOrder: ['p2'], gameOver: true });
    expect(state.winner).toBe('team');
  });

  it('sets winner to none when 0 players left', () => {
    // Need a fresh state — once removePlayer sets winner='team' the guard at
    // the top of removePlayer short-circuits subsequent calls. Start from a
    // 1-player state so the "0 left" branch fires.
    const state: HangmanExtendedState = makeState();
    state.playerOrder = ['p1'];
    const engine = new HangmanEngine();

    const result = engine.removePlayer(state, 'p1');
    expect(result).toEqual({ playerOrder: [], gameOver: true });
    expect(state.winner).toBe('none');
  });
});

// --- L-3: gameStart must carry the opening player ----------------------------

describe('Hangman gameStart carries firstTurnId (L-3)', () => {
  it('config emits gameStart with firstTurnId = playerOrder[0]', () => {
    // The gameStart handler in socketHandlers derives the initial 'turn' event
    // from firstTurn ?? firstTurnId. An empty data object left hangman without
    // any turn announcement — minesweeper already sent firstTurnId.
    const state = makeState(); // playerOrder ['p1', 'p2']
    const engine = new HangmanEngine();
    const result = engine.handleAction(state, 'p1', { type: 'config', payload: { language: 'id' } });

    const gameStart = result.events.find(e => e.type === 'gameStart');
    expect(gameStart).toBeDefined();
    const data = gameStart!.data as { firstTurnId?: string };
    expect(data.firstTurnId).toBe(state.playerOrder[0]);
    expect(data.firstTurnId).toBe('p1');
  });
});

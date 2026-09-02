import { describe, it, expect } from 'vitest';
import { validateGameComposition, GAME_PLAYER_REQUIREMENTS } from '../games/base';

// === G1 (audit H2) regression suite ==========================================
// canStartGame only checked ≥2 players, so a 3-4 player room could start Sea
// Battle: createInitialState reads playerOrder[0]/[1] only, extras became
// phantoms, and a phantom's disconnect instantly forfeited the match to
// player1. The composition contract must gate game:start per game type.

describe('validateGameComposition (G1)', () => {
  it('admits legal compositions for every game', () => {
    expect(validateGameComposition('sea-battle', 2)).toBeNull();
    expect(validateGameComposition('snakes-ladders', 2)).toBeNull();
    expect(validateGameComposition('snakes-ladders', 4)).toBeNull();
    expect(validateGameComposition('hangman', 3)).toBeNull();
    expect(validateGameComposition('minesweeper', 2)).toBeNull();
    expect(validateGameComposition('minesweeper', 4)).toBeNull();
  });

  it('rejects Sea Battle with more than 2 players (the H2 phantom-forfeit scenario)', () => {
    const err = validateGameComposition('sea-battle', 3);
    expect(err).toContain('2 pemain');
    expect(validateGameComposition('sea-battle', 4)).toContain('2 pemain');
  });

  it('rejects under-filled and over-filled rooms for the other games', () => {
    expect(validateGameComposition('snakes-ladders', 5)).toContain('2-4');
    expect(validateGameComposition('hangman', 5)).toContain('2-4');
    expect(validateGameComposition('minesweeper', 5)).toContain('2-4');
  });

  it('keeps every registered gameType covered by the table', () => {
    // If a new game is added to the union without a row here, game:start would
    // fall into the 'Mesin permainan tidak tersedia' branch — fail loudly now.
    const expected = ['snakes-ladders', 'hangman', 'sea-battle', 'minesweeper'];
    expect(Object.keys(GAME_PLAYER_REQUIREMENTS).sort()).toEqual(expected.sort());
  });
});

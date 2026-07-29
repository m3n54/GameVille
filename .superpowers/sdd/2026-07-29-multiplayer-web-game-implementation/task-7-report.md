# Task 7: Ular Tangga — Server Game Logic

**Status:** DONE

## What was done

1. **Replaced stub** in `server/src/games/snakes-ladders.ts` with full `SnakesLaddersEngine`:
   - `createInitialState()` — 100-tile board, 10 snakes, 9 ladders, players at position 0 with distinct colors
   - `handleAction()` for `type: 'roll'` — server-authoritative dice (`Math.random() * 6 + 1`), move, bounce-back at >100, snake/ladder chaining, next turn, win detection at >=100
   - Constants: `SNAKES` and `LADDERS` arrays with exact positions from the brief

2. **Added `game:action` handler** in `server/src/index.ts`:
   - Finds the socket's game room by scanning `GAMES` Map
   - Delegates to `engine.handleAction()`, updates instance state
   - Processes events: `diceResult` (broadcast state + action), `turnChange` (broadcast action), `gameOver` (set winner, emit `game:over`, set room state to finished), `error` (emit to requester)

3. **TypeScript check:** `tsc --noEmit` passes with no errors

## Files changed

- `C:\Menza\Web Game\server\src\games\snakes-ladders.ts` — full game logic (130 insertions)
- `C:\Menza\Web Game\server\src\index.ts` — `game:action` handler added

## Commits

- `e527d5d` — `feat: snakes & ladders server game logic`

## Test summary

Manual code review and `tsc --noEmit` pass. No automated runtime test suite available.

## Concerns

- `game:action` handler uses `as` casts for event data types — safe given source is the engine itself, but not type-checked at compile time

## Review Fixes

### Fix 1: Phase state machine completed
- After computing new position: `state.phase = 'moving'`
- After checking snakes/ladders and before next turn: `state.phase = 'rolling'`
- On win: `state.phase = 'done'`

### Fix 2: Ladder check uses `player.position` not `newPos`
- Previously the ladder loop checked `newPos` (pre-snake position), now checks `player.position` so a snake move doesn't bypass the correct ladder lookup

### Fix 3: Single source of truth for winner
- Entry gate in `game:action` handler reads `(instance.state as { winner }).winner` instead of `instance.winner`
- Removed redundant `instance.winner = event.data.winnerId` assignment from `gameOver` case

**Commit:** `c68a863` — `fix: review issues for snakes & ladders game logic`

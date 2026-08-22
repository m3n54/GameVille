# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GameVille** — multiplayer web game platform (Next.js 14 + Express/Socket.io). Three turn-based games: 🐍 **Ular Tangga** (3D isometric board via R3F), 💀 **Hangman** (co-op word guessing), ⚓ **Sea Battle** (1v1 ship battles). Pastel cute UI, nickname-only identity, private rooms via 6-digit PIN.

## Architecture

```
frontend/  → Next.js 14 App Router (Vercel)
server/    → Express + Socket.io (Render)
shared/    → TypeScript types shared between FE and BE
```

- **Server-authoritative**: All game logic runs server-side. Client only sends actions and renders state.
- **State in memory**: No database for MVP. Room & game state lives in Maps on the server.
- **Realtime**: Socket.io WebSocket for room sync, chat, emoji reactions, game state.
- **Socket lifecycle (critical)**: The socket is an app-lifetime singleton — `useSocket()` must NOT call `disconnectSocket()` on unmount. Disconnecting during page navigation (landing → `/room/[pin]`) makes the server run `leaveRoom`, ejecting the player from the room they just created ("kode ruang tidak valid" bug).
- **Navigation recovery**: `/room/[pin]` calls `room:sync { pin }` on mount — server responds with room state via ack callback if the socket is still a member. Do NOT re-add client-side sessionStorage room persistence; it was tried and removed (produces frozen phantom rooms).
- **Reconnect after tab close**: Player disconnect triggers `leaveRoom` — no automatic state restore (re-join via PIN as new player).

## Commands

```bash
# Server (port 3001)
cd server
npm install
npm run dev      # tsx watch src/index.ts
npm run build    # tsc → dist/
npm start        # node dist/server/src/index.js

# Frontend (port 3000)
cd frontend
npm install
npm run dev      # next dev
npm run build    # next build (output: standalone)

# Health check
curl http://localhost:3001/health
```

## Game Engine Architecture

All three games extend `BaseGame` (`server/src/games/base.ts`) with `createInitialState()` and `handleAction()`. The server's `game:action` handler dispatches engine events to clients (`diceResult`, `turnChange`, `correctGuess`, `wrongGuess`, `gameOver`, `fireResult`, `gameStart`, `shipsPlaced`).

To add a new game:
1. Create `server/src/games/<name>.ts` extending `BaseGame`
2. Add to `engines` registry in `server/src/index.ts`
3. Add event cases to `game:action` switch in same file
4. Create frontend container in `frontend/src/components/games/<name>/`
5. Add `GameType` to `shared/types.ts`

## Key Files

| File | Purpose |
|------|---------|
| `server/src/index.ts` | Socket.io entry, all event handlers, `GAMES` Map, `engines` registry |
| `server/src/rooms.ts` | RoomManager CRUD (create/join/leave/ready/select) |
| `server/src/games/base.ts` | Abstract game engine base class |
| `server/src/games/snakes-ladders.ts` | Ular Tangga — board is 0-99, win at ≥99 |
| `server/src/games/hangman.ts` | Hangman — co-op mode, `'team'` winner on success, `'none'` on loss |
| `server/src/games/sea-battle.ts` | Sea Battle — 1v1, requires `state.phase === 'playing'` guard in `fire` |
| `frontend/src/lib/socket.ts` | Singleton socket client |
| `frontend/src/hooks/useSocket.ts` | `useSocket()` hook — never disconnects on unmount |
| `frontend/src/hooks/useRoom.ts` | `useRoom()` hook — room state + actions + `syncRoom()` |
| `frontend/src/app/room/[pin]/page.tsx` | Room lobby + game container switch |
| `frontend/src/components/games/snakes-ladders/GameBoard3D.tsx` | R3F isometric board — tiles, pawns (hop/glide animation) |
| `frontend/src/components/games/snakes-ladders/boardUtils.ts` | Board geometry — `tileToWorld()` zigzag mapping, `tileColor()` |
| `frontend/src/components/games/snakes-ladders/SnakeModel.tsx` | Segmented 3D snake (Catmull-Rom curve, eyes, tongue) |
| `frontend/src/components/games/snakes-ladders/LadderModel.tsx` | Wooden ladder (2 rails + rungs) |
| `frontend/src/components/games/snakes-ladders/Dice3D.tsx` | Pip-face 3D die with spin→damp landing |
| `shared/types.ts` | All shared types — Room, Player, socket events, game states |

## Design Constraints

- **TypeScript strict mode** on both FE and BE
- **Tailwind CSS only** — no CSS modules, styled-components, or inline styles
- **Color palette** in `tailwind.config.ts`: `primary: #FF9BB5`, `secondary: #A8D8EA`, `accent: #FFD3B6`, `success: #B5EAD7`, `cute: { bg: '#FFF5F7', text: '#4A4A4A' }`
- **Font**: `'Nunito', sans-serif` via `next/font/google`
- **Framer Motion** for animations (spring physics preferred over tween)
- **@react-three/fiber v8** + @react-three/drei (React 18 compat — do NOT upgrade to v9 without also upgrading React)
- **Max 4 players** per room (enforced in `rooms.ts`)
- **Nickname-only identity** — no auth system

## Conventions

- Game state uses `'team'` for cooperative wins (Hangman) and `'none'` for cooperative losses — handle these as special cases in `winnerName` resolution (`server/src/index.ts` game:over handler).
- Snake/Ladder tile indices are 0-99 (not 1-100). Ladder `[80, 99]` not `[80, 100]`. Win at `position >= 99`.
- Bounce-back on overshoot uses `99 - (newPos - 99)`.
- Ladder check must use `player.position` (post-snake) not `newPos` (pre-snake) — bug-fix history in `progress.md`.
- 3D board geometry: ALL tile→world positioning goes through `boardUtils.ts` `tileToWorld()` — board is boustrophedon (odd rows run right-to-left). Never compute tile coordinates inline with `(col - 4.5) * ...` formulas; they ignore zigzag.
- Pawn movement: |Δposition| > 6 means snake/ladder → glide arc animation; ≤ 6 → tile-by-tile hop. Threshold equals max dice value.
- Windows/Git Bash: `taskkill /PID x /F` fails directly in Git Bash — use `echo "taskkill /PID x /F" | cmd`. Stale `next dev` processes holding port 3000 are a recurring issue after crashes; check `netstat -ano | grep :3000` and kill the PID.
- Corrupted `.next` cache after large refactors (`Cannot find module './vendor-chunks/...'`): delete `frontend/.next/` and restart dev server.

## Documentation

- Spec: `docs/superpowers/specs/2026-07-29-multiplayer-web-game-design.md`
- Plan: `docs/superpowers/plans/2026-07-29-multiplayer-web-game-implementation.md`
- SDD ledger: `.superpowers/sdd/2026-07-29-multiplayer-web-game-implementation/progress.md` (track record of every task + fix round)

## Documentation

- Spec: `docs/superpowers/specs/2026-07-29-multiplayer-web-game-design.md`
- Plan: `docs/superpowers/plans/2026-07-29-multiplayer-web-game-implementation.md`
- SDD ledger: `.superpowers/sdd/2026-07-29-multiplayer-web-game-implementation/progress.md` (track record of every task + fix round)

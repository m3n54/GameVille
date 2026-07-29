# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multiplayer web game platform (GameVille) — Next.js 14 frontend + Express/Socket.io backend. Games: Ular Tangga (3D via R3F), Hangman (co-op), Sea Battle (1v1). Pastel cute UI, nickname-only auth, private rooms via 6-digit PIN.

## Architecture

```
frontend/  → Next.js 14 App Router (Vercel)
server/    → Express + Socket.io (Render)
shared/    → TypeScript types shared between FE/BE
```

- **Server-authoritative**: All game logic runs server-side. Client only sends actions and renders state.
- **State in memory**: No database for MVP. Room/game state lives in Maps on the server.
- **Realtime**: Socket.io WebSocket for room sync, chat, emoji reactions, and game state.

## Commands

```bash
# Server
cd server
npm install
npm run dev        # tsx watch src/index.ts (port 3001)
npm run build      # tsc
npm start          # node dist/index.js

# Frontend
cd frontend
npm install
npm run dev        # next dev (port 3000)
npm run build      # next build

# Health check
curl http://localhost:3001/health
```

## Key Files

| File | Purpose |
|------|---------|
| `server/src/index.ts` | Socket.io entry — registers event handlers |
| `server/src/rooms.ts` | RoomManager CRUD |
| `server/src/games/base.ts` | Abstract game engine base class |
| `server/src/games/snakes-ladders.ts` | Ular Tangga game logic |
| `server/src/games/hangman.ts` | Hangman game logic |
| `server/src/games/sea-battle.ts` | Sea Battle game logic |
| `frontend/src/lib/socket.ts` | Socket.io client singleton |
| `frontend/src/hooks/useRoom.ts` | Room state hook |
| `frontend/src/components/games/snakes-ladders/GameBoard3D.tsx` | R3F 3D isometric board |
| `shared/types.ts` | All shared TypeScript types |

## Shared Types

Located in `shared/types.ts` — re-exported by `frontend/src/types/index.ts`:
- `Room`, `Player`, `GameType`
- `ServerToClientEvents`, `ClientToServerEvents` (Socket.io event contracts)
- `SnakesLaddersState`, `HangmanState`, `SeaBattleState`

## Design Constraints

- Tailwind CSS only — no CSS modules/styled-components
- Color palette: `primary: #FF9BB5`, `secondary: #A8D8EA`, `accent: #FFD3B6`
- Font: `'Nunito', sans-serif` via Google Fonts
- Framer Motion for animations (spring physics for bouncy effects)
- @react-three/fiber + @react-three/drei for 3D game boards
- Turn-based games only (no real-time action for MVP)
- Max 4 players per room
- No auth system — nickname + emoji + color identity

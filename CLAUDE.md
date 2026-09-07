# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Vitest for server only (~58 tests in `server/src/__tests__/`). No frontend tests.

```bash
# Install
cd server && npm install
cd frontend && npm install

# Dev (two terminals)
cd server && npm run dev     # tsx watch → :3001
cd frontend && npm run dev   # next dev → :3000

# Build / start (prod)
cd server && npm run build && npm start
cd frontend && npm run build && npm start

# Verify
cd server && npx tsc --noEmit
cd frontend && npx tsc --noEmit
cd frontend && npm run lint
cd server && npm test                  # all
cd server && npm test -- hangman       # one file
cd server && npm test -- -t "bounce"   # one test

# Full stack (server + ngrok)
powershell -File "C:\Menza\start-gameville.ps1"
```

## Architecture

Two workspaces: `frontend/` (Next.js 14 App Router, React 18) + `server/` (Express + Socket.io 4). Shared types in `shared/types.ts` (`GameType`, `ClientToServerEvents`, `ServerToClientEvents`).

**Server (`server/src/`)** is authoritative. Clients send intent (`game:action { type: 'roll' }`); server computes state and broadcasts. NEVER move game logic to the client.
- `index.ts` — Express + Socket.io on :3001, CORS, sweeper wiring, SIGTERM/SIGINT handler.
- `gameService.ts` — single entry point. `GAMES` Map (roomId → instance), `engines` registry, `broadcastPerPlayerState`, `processPlayerExit` (H1+H2 fix), `processTimeouts` (TT-1), `start*`/`stopAllSweepers` (M-1).
- `socketHandlers.ts` — every socket event. `safeHandler` wrapper catches + emits `room:error`.
- `rooms.ts` — membership: `createRoom`, `joinRoom`, `findByPin` (waiting only), `findByPlayer` (mid-game recovery), `validateIdentity` vs `validatePlayer`.
- `games/base.ts` — `GameInstance` contract + `BaseGame` abstract.
- `games/{hangman,minesweeper,sea-battle,snakes-ladders}.ts` — concrete engines.

**Frontend (`frontend/src/`)**:
- `app/page.tsx` — landing. `app/room/[pin]/page.tsx` — calls `room:sync` on mount; F9 grace 1.5s pre-fills JoinRoom.
- `hooks/useRoom.ts` — `joinRoom/leaveRoom/toggleReady/selectGame/startGame/syncRoom`. Reads from `lib/roomStore.ts` (NOT `useState`).
- `lib/socket.ts` — module-level `let socket` singleton. `useSocket()` MUST NOT disconnect.
- `lib/roomStore.ts` — module-scoped singleton via `useSyncExternalStore`.
- `components/lobby/` — CreateRoom, JoinRoom. `components/room/` — Lobby, ChatBox, EmojiReactions, ConnectionStatus, GameErrorBanner.
- `components/games/{hangman,minesweeper,sea-battle,snakes-ladders}/` — `<Name>Container.tsx` subscribes to `game:state` + `game:action`.

**Adding a new game**: folder under `components/games/<name>/`, `<Name>Container.tsx` (subscribes socket events), `server/src/games/<name>.ts` extending `BaseGame`, register in `gameService.ts`.

## Footguns (Don't regress)

| Rule | Why |
|---|---|
| `useSocket()` MUST NOT `disconnectSocket()` on unmount | Socket is app-lifetime singleton; disconnecting on route nav ejects player. |
| `useState` in `useRoom` lost state on nav | Use `roomStore` module-scoped singleton (a61e4b2). |
| `leaveRoom` clears state, does NOT `router.push('/')` | User stays on `/room/[pin]`; F9 grace pre-fills JoinRoom. |
| `room:leave` + `socket disconnect` both route `processPlayerExit` | Engine prunes leaver so turn never rotates to ghost. |
| `findByPlayer` (socket-id), NOT `findByPin` mid-game | `findByPin` matches `'waiting'` only — breaks refresh. |
| Server `resetRoomForNewGame` MUST delete GAMES entry | Old `state.winner` makes `findGameForSocket` return early. |
| No `sessionStorage` room persistence | Tried, removed: frozen phantom rooms. |
| SL `tileToWorld` only via `boardUtils.ts` | Boustrophedon (odd rows reversed). No inline `(col-4.5)*...` math. |
| SL `\|Δposition\| > 6` → glide, `≤ 6` → hop | Threshold = max dice. |
| SL ladder check uses `player.position` (post-snake) | Snake first, then ladder. |
| SL tile indices 0-99, win `>=99`, bounce `99-(newPos-99)` | NOT 1-100. |
| SL `randomLayoutPair` per match: 10 snakes + 9 ladders | `\|head-tail\|>=6`, no 0/99 conflict, head>tail, bottom<top. |
| Sea-battle: `broadcastPerPlayerState` for `game:state` | `seaBattleView(state, forPlayerId)` strips `'S'` from enemy grid. |
| Sea-battle: `fireResult` action broadcasts full room | Payload leaks no ship positions; per-player projection only for state. |
| Co-op winner = `'team'` (win) or `'none'` (loss) | Special-case in `broadcastGameOver`. |
| `validateIdentity` (host, needs name) ≠ `validatePlayer` (joiner) | Joiners send no `name`. |
| `CORS_ORIGIN` supports `https://*.domain.tld` suffix wildcards | Vercel preview subdomains. |

## Server Lifecycle

- **R1 grace**: `processPlayerExit(io, id, {immediate: false})` keeps seat for `GRACE_MS = 60_000`. Client reclaims via `room:sync`. Explicit `room:leave` is immediate.
- **TT-1 turn timeout**: `processTimeouts(io, now)` every 10s. After `TURN_TIMEOUT_MS = 90_000`, server plays synthetic action via engine authoritative path (`'pass'` for hangman/minesweeper/sea-battle, `'roll'` for snakes-ladders). Minesweeper guards `phase !== 'playing'`. Disconnected (grace) seats skipped.
- **M-1 sweeper dispose**: 4 interval handles (`exitSweeperHandle`, `timeoutSweeperHandle`, `roomSweeperHandle`, `rateBucketSweeper`) cleared on `start*()` and on `stopAllSweepers()`. `index.ts` wires SIGTERM/SIGINT → `stopAllSweepers()` + `httpServer.close()` → `process.exit(0)`.
- **Rate limit** (`gameService.ts`): `allowEvent(key, max, windowMs)` for `create/join/act/chat/react`.

## Design Constraints

- TypeScript strict + `noUncheckedIndexedAccess`. Array access = `T | undefined`.
- Tailwind only. No CSS modules, styled-components, inline styles.
- Color palette: `primary #FF9BB5`, `secondary #A8D8EA`, `accent #FFD3B6`, `success #B5EAD7`, `warning #FFDAC1`, `cute { bg #FFF5F7, surface #FFFFFF, text #4A4A4A, muted #9CA3AF }`.
- Font: `Nunito` via `next/font/google`. Framer Motion for animations.
- `@react-three/fiber v8` + drei (React 18 — don't upgrade to v9 without React).
- Max 4 players per room. Nickname-only identity, no auth.

## Deployment

- **FE**: Vercel auto-deploy `main` → `https://game-ville-neon.vercel.app`.
- **BE**: ngrok tunnel from this PC (URL changes on every PC/ngrok restart). Update Vercel env `NEXT_PUBLIC_SERVER_URL` + redeploy when it does. Render's free tier requires payment — tunnel is the active workaround.
- `Dockerfile` targets HF Spaces (PORT 7860), not used. `render.yaml` kept for reference, not deployed.
- `CORS_ORIGIN` on BE: `https://game-ville-neon.vercel.app,https://*.vercel.app`.
- Missing `NEXT_PUBLIC_SERVER_URL` in prod = silent fallback to `localhost:3001` (dead sockets).

## Windows / Git Bash Quirks

- `taskkill /PID x /F` fails in Git Bash — use `echo "taskkill /PID x /F" | cmd`.
- Stale `next dev` on :3000 after crashes: `netstat -ano | grep :3000` + kill.
- DNS: `*.ngrok-free.dev` → `::`/`0.0.0.0` locally. Fix: `ipconfig /flushdns`, use 8.8.8.8, or Cloudflare WARP.
- PowerShell 5.1: no `&&`/`||`. Use `if ($?) { ... }` or `;`.
- Corrupted `.next` cache: delete `frontend/.next/` + restart.
- Launcher `C:\Menza\start-gameville.ps1`: set `$env:CORS_ORIGIN` in parent scope BEFORE `Start-Process` (arg parser splits commas inline).

## Fix-code Legend

`F1-F9` FE bugs · `H1-H4` hangman/engine · `M1-M8` minesweeper+misc · `C1` sea-battle projection · `L1` room TTL · `TT-1` turn timeout · `R1` grace-period · `WS-A/B/C/D/E` overhaul round 3.

## Documentation

- Code review reports: `docs/reviews/`
- Audit reports: `docs/audits/`
- Specs + plans: `docs/superpowers/`
- SDD ledger: `.superpowers/sdd/2026-07-29-multiplayer-web-game-implementation/progress.md`

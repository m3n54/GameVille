# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

No test framework configured. Verification = `tsc --noEmit` + `next build` + manual 2-tab smoke.

```bash
# Install (per workspace)
cd server   && npm install
cd frontend && npm install

# Dev (two terminals)
cd server   && npm run dev   # tsx watch → http://localhost:3001
cd frontend && npm run dev   # next dev   → http://localhost:3000

# Production
cd server   && npm run build && npm start  # compiles to dist/
cd frontend && npm run build && npm start  # next start on :3000

# Type-check (no emit)
cd frontend && npx tsc --noEmit
cd server   && npx tsc --noEmit

# Lint
cd frontend && npm run lint   # next lint (eslint-config-next)

# Full stack local launcher (opens 2 PowerShell windows: server + ngrok)
powershell -File "C:\Menza\start-gameville.ps1"
```

The launcher sets `$env:CORS_ORIGIN` in the parent scope BEFORE `Start-Process` — PowerShell's arg parser splits commas inside child commands if set inline. See **Windows / Git Bash quirks** below.

## Architecture

Two workspaces: **`frontend/`** (Next.js 14 App Router, React 18) and **`server/`** (Express + Socket.io 4). Shared TypeScript types live in **`shared/types.ts`** and are imported by both sides via the `GameType` / `SnakesLaddersState` / `ClientToServerEvents` / `ServerToClientEvents` contracts.

**Backend flow** (`server/src/index.ts`):
1. Express app + Socket.io server on port 3001.
2. `gameService.ts` is the single entry point for socket events. It dispatches by `gameType` to one of the engines in `server/src/games/` (base class in `base.ts`, concrete: `hangman.ts`, `minesweeper.ts`, `sea-battle.ts`, `snakes-ladders.ts`).
3. `rooms.ts` is the source of truth for membership: `createRoom`, `joinRoom`, `findByPin`, `findByPlayer` (socket-id lookup, used for mid-game recovery — never use `findByPin` mid-game; it only matches `'waiting'` rooms).
4. `removePlayer` is called by BOTH `room:leave` and `socket disconnect` (H1+H2 fix). The engine prunes the leaver from `playerOrder` so turns never rotate to a ghost.
5. Server is **authoritative** — clients send intent (`game:action { type: 'roll' }`), server computes state and broadcasts. NEVER move game logic to the client.

**Frontend flow** (`frontend/src/`):
- `app/page.tsx` — landing (create/join form).
- `app/room/[pin]/page.tsx` — room page; calls `room:sync { pin }` on mount. Server replies via ack callback (with `gameState` + `turnPlayerId`) if socket is still a member. F9 grace timer (1.5s) shows the JoinRoom form pre-filled with the URL's PIN if not a member.
- `hooks/useRoom.ts` — exposes `joinRoom`, `leaveRoom`, `toggleReady`, `selectGame`, `startGame`, `syncRoom`. Reads from module-scoped `lib/roomStore.ts` (NOT `useState` — that lost state on landing→room navigation, bug commit a61e4b2).
- `lib/socket.ts` — module-level `let socket` singleton. `useSocket()` must never disconnect.
- `lib/roomStore.ts` — module-scoped singleton, read by `useRoom` via `useSyncExternalStore`. Same pattern as `socket.ts`.
- `components/lobby/` — CreateRoom, JoinRoom (accepts `initialPin` for the F9 paste-URL flow).
- `components/room/` — Lobby (waiting room, ready/start), ChatBox, EmojiReactions, ConnectionStatus, GameErrorBanner.
- `components/games/{hangman,minesweeper,sea-battle,snakes-ladders}/` — one folder per game. Each has a `*Container.tsx` (subscribes to socket events + dispatches actions) and game-specific components.
- `components/ui/` — Button, Card, shared primitives.
- `styles/` — Tailwind global + tokens. Tailwind is the only styling layer (no CSS modules, no inline styles except brief-mandated dynamic values).

**Snakes-ladders specifics** (largest game, has the most footguns):
- `SnakesLaddersContainer.tsx` — single source of truth for SL events; computes `segments` (walk vs sliding) via `paths.ts` and dispatches per-tile SFX via `onTileEnter`.
- `Board2D.tsx` — 2D CSS grid + SVG overlay. **Z-stack contract** (R3+R4): tile grid z=10, SVG overlay z=15 (snakes/ladders/glow), pawns z=20.
- `Dice3D.tsx` + `useDiceRoll.ts` — R3F cube; spin via `useFrame` mutating `groupRef.current.rotation` directly. Number overlay (R6) renders HTML on top.
- `usePawnAnim.ts` — per-hop state machine with `easeInOutCubic` + 80ms inter-hop delay. **No skip** (R6).
- `boardUtils.ts` — boustrophedon-aware `tileCenter` (visual col flipped for odd rows). All tile→world math goes through here; never inline `(col - 4.5) * ...` formulas.

When adding a new game, mirror this structure: a folder under `components/games/<name>/`, a `<Name>Container.tsx` that subscribes to `socket.on('game:state', ...)` and `socket.on('game:action', ...)`, an engine in `server/src/games/<name>.ts` extending `BaseGame`, and a registration in `gameService.ts`'s `handleAction` switch.

## Critical Architectural Rules (footguns)

These were each source of production bugs. Don't regress them.

### Socket lifecycle
The socket is an **app-lifetime singleton** (`frontend/src/lib/socket.ts` — module-level `let socket`). `useSocket()` MUST NOT call `disconnectSocket()` on unmount. Disconnecting during page navigation (landing → `/room/[pin]`) makes the server run `leaveRoom`, ejecting the player from the room they just created.

### Module-scoped state for cross-route survival
`useState` inside `useRoom` was lost on landing → `/room/[pin]` route transition (cause of the double "menza" player bug, commit a61e4b2). Fix: `frontend/src/lib/roomStore.ts` is a **module-scoped singleton** read by `useRoom` via `useSyncExternalStore`. Same pattern as `lib/socket.ts` — apply to any new client state that must survive navigation.

### Room leave = disconnect
`room:leave` and `socket disconnect` both route through `handlePlayerExit` in `gameService.ts` (H1+H2 fix). Engine prunes the leaver from `playerOrder` so turns never rotate to a ghost, then either ends the game (forfeit) or broadcasts the refreshed state.

### `leaveRoom` does NOT navigate
`leaveRoom` in `useRoom.ts` clears local state only. It must NOT call `router.push('/')` — the user stays on `/room/[pin]` and the F9 grace timer (1.5s) shows the JoinRoom form pre-filled with the URL's PIN so they can re-join without re-typing. (Old `router.push('/')` sent users to landing where they'd click "Buat Ruang Baru" and create a separate, second room.)

### Navigation recovery
`/room/[pin]` calls `room:sync { pin }` on mount — server responds with room state via ack callback if the socket is still a member. Server verifies membership by **socket-id lookup** (`findByPlayer`), not PIN search (`findByPin` only matches `'waiting'` rooms and would break mid-game recovery). Server also replays `gameState` + `turnPlayerId` in the same ack so a refreshed tab re-enters the game instead of dead-ending in the lobby.

### `room:start` allowed from `finished`
After a game ends, the room transitions to `state: 'finished'`. The host's `Mulai` button was rejected ("Game sudah dimulai!"). Fix: `resetRoomForNewGame` in `rooms.ts` clears ready flags + drops the old `GAMES` entry so the next `game:start` builds a fresh instance. **The GAMES Map entry must be deleted** — otherwise `findGameForSocket` still points at the old `state.winner` and `game:action` returns early.

### No client-side sessionStorage room persistence
Tried and removed: produced frozen phantom rooms after navigation. Server membership is the only source of truth.

### 3D board geometry
ALL tile→world positioning goes through `boardUtils.ts` `tileToWorld()` — board is boustrophedon (odd rows run right-to-left). Never compute tile coordinates inline with `(col - 4.5) * ...` formulas; they ignore the zigzag.

### Pawn movement threshold
`|Δposition| > 6` means snake/ladder → glide arc animation; `≤ 6` → tile-by-tile hop. Threshold equals max dice value.

### Sea-battle per-player projection
`fireResult` emits the shooter's own projection immediately (`socket.emit`) plus `socket.to(room).emit` for everyone else's projection — both call `stateForClient(..., forPlayerId=socketId)` so the shooter sees their own hit/miss instantly while others see the plain board. Don't broadcast the raw state verbatim.

### Ladder check ordering
For snakes-ladders, ladder check must use `player.position` (post-snake) not `newPos` (pre-snake). Snake applies first, then ladder. Bug-fix history in `progress.md`.

### Ladder tile indices
Tile indices are 0-99 (not 1-100). Ladder `[80, 99]` not `[80, 100]`. Win at `position >= 99`. Bounce-back on overshoot uses `99 - (newPos - 99)`.

### Co-op winner conventions
Game state uses `'team'` for cooperative wins (Hangman success, Minesweeper success) and `'none'` for cooperative losses. Handle these as special cases in `winnerName` resolution (`server/src/index.ts` `broadcastGameOver`).

### Server-side input validation
`validateIdentity` (host: requires name) and `validatePlayer` (joiner: no name) in `rooms.ts` are separate. Keep them separate — joining clients have no `name` field to send.

### CORS wildcard
`CORS_ORIGIN` env var accepts comma-separated origins. Entries of the form `https://*.domain.tld` are suffix wildcards for Vercel preview deployments.

## Local dev launcher

`C:\Menza\start-gameville.ps1` opens two PowerShell windows — server (port 3001) + ngrok tunnel. **Set `$env:CORS_ORIGIN` in the parent scope BEFORE `Start-Process`** — PowerShell's arg parser splits commas in the child command. Tails `set -LiteralPath` (not `cd`) to avoid space-quoting issues in `C:\Menza\Web Game`.

## Deployment Reality

- **Frontend**: Vercel — auto-deploys from `main` branch. URL: `https://game-ville-neon.vercel.app`
- **Backend**: ngrok tunnel from this PC (`https://skilled-exponent-viscous.ngrok-free.dev`) — not Render. Render's free tier requires payment; tunnel is the active workaround. **URL changes on every PC/ngrok restart.** Update Vercel env `NEXT_PUBLIC_SERVER_URL` + redeploy when it does.
- **Dockerfile** at repo root targets Hugging Face Spaces (PORT 7860). Not currently used.
- **render.yaml** has the old Render blueprint. Kept for reference; not deployed.
- **Vercel env var**: `NEXT_PUBLIC_SERVER_URL` is read at build time in `frontend/src/lib/socket.ts`. Missing in production = silent fallback to `localhost:3001` (dead sockets).
- **CORS_ORIGIN** on backend: `https://game-ville-neon.vercel.app,https://*.vercel.app`

## Windows / Git Bash quirks

- `taskkill /PID x /F` fails directly in Git Bash — use `echo "taskkill /PID x /F" | cmd`.
- Stale `next dev` processes holding port 3000 are recurring after crashes. Check `netstat -ano | grep :3000` and kill the PID.
- DNS issue: `*.ngrok-free.dev` resolves to `::` and `0.0.0.0` locally. Fix: `ipconfig /flushdns` then use Google DNS (8.8.8.8) or install Cloudflare WARP. Alternative: toggle Chrome's "Use secure DNS".
- PowerShell 5.1: `&&`/`||` are parse errors. Use `if ($?) { ... }` or `;` chaining.
- Corrupted `.next` cache after large refactors (`Cannot find module './vendor-chunks/...'`): delete `frontend/.next/` and restart dev server.

## Design Constraints

- **TypeScript strict mode** on both FE and BE — including `noUncheckedIndexedAccess`. Array access is `T | undefined`; use `??` fallbacks liberally.
- **Tailwind CSS only** — no CSS modules, styled-components, or inline styles.
- **Color palette** in `frontend/tailwind.config.ts`: `primary: #FF9BB5`, `secondary: #A8D8EA`, `accent: #FFD3B6`, `success: #B5EAD7`, `warning: #FFDAC1`, `cute: { bg: '#FFF5F7', surface: '#FFFFFF', text: '#4A4A4A', muted: '#9CA3AF' }`
- **Font**: `'Nunito', sans-serif` via `next/font/google`
- **Framer Motion** for animations (spring physics preferred over tween)
- **@react-three/fiber v8** + @react-three/drei (React 18 compat — do NOT upgrade to v9 without also upgrading React)
- **Max 4 players** per room (enforced in `rooms.ts:joinRoom`)
- **Nickname-only identity** — no auth system

## Fix-code legend

Commit messages use a code prefix to group related fixes. The current set:

- **F1–F9** — Frontend bugs (e.g. F1: ack-based response, F2: reconnect banner, F9: paste-URL join form)
- **H1–H4** — Hangman / game-engine bugs (H1: GAMES Map leak, H2: ghost player in turn rotation, H3: double-start guard, H4: engine error handling)
- **M1–M8** — Minesweeper + misc (M1/M3/M8: pass/config guards, M2: host-gated config, M5: input caps, M7: rate limit)
- **C1** — Sea-battle: per-player board projection (no more raw-state broadcast)
- **L1** — Room TTL sweeper (waiting rooms older than 2h)

When working on a fix, check the SDD ledger at `.superpowers/sdd/2026-07-29-multiplayer-web-game-implementation/progress.md` for prior history before adding a new code.

## Documentation

- Spec: `docs/superpowers/specs/2026-07-29-multiplayer-web-game-design.md`
- Plan: `docs/superpowers/plans/2026-07-29-multiplayer-web-game-implementation.md`
- SDD ledger: `.superpowers/sdd/2026-07-29-multiplayer-web-game-implementation/progress.md` (track record of every task + fix round, with F/H/M/C/L code prefix per fix)

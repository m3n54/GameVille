# GameVille — Multiplayer Web Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multiplayer web game platform with Ular Tangga, Hangman, and Sea Battle — playable by 2-4 players in private rooms with realtime chat, cute pastel UI, and semi-3D game boards.

**Architecture:** Next.js 14 (App Router) frontend on Vercel, Express + Socket.io backend on Render. Dual-monorepo (`frontend/` + `server/` dirs) with shared TypeScript types. Socket.io for realtime room/game state sync. @react-three/fiber for 3D Ular Tangga board.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Framer Motion, @react-three/fiber + @react-three/drei, Socket.io, Express, React 18

## Global Constraints

- TypeScript strict mode on both frontend and server
- Tailwind CSS for all styling — no CSS modules or styled-components
- All game logic runs server-side (authoritative server)
- State stored in memory (no database for MVP)
- Font: 'Nunito' via Google Fonts
- Color palette: primary #FF9BB5, secondary #A8D8EA, accent #FFD3B6, success #B5EAD7, bg #FFF5F7, text #4A4A4A
- Responsive layout — must work on mobile and desktop
- No authentication (nickname-only identity)

---
## File Structure

### To Create — Frontend (`frontend/`)

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx             ← Root layout (font + providers)
│   │   ├── page.tsx               ← Landing page
│   │   └── room/
│   │       └── [pin]/
│   │           └── page.tsx       ← Room + Game page
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── Card.tsx
│   │   ├── lobby/
│   │   │   ├── CreateRoom.tsx
│   │   │   └── JoinRoom.tsx
│   │   ├── room/
│   │   │   ├── PlayerList.tsx
│   │   │   ├── PlayerCard.tsx
│   │   │   ├── ChatBox.tsx
│   │   │   └── EmojiReactions.tsx
│   │   └── games/
│   │       ├── snakes-ladders/
│   │       │   ├── SnakesLaddersContainer.tsx  ← Main game wrapper
│   │       │   ├── GameBoard3D.tsx              ← R3F 3D board
│   │       │   └── Dice3D.tsx                   ← 3D dice
│   │       ├── hangman/
│   │       │   ├── HangmanContainer.tsx
│   │       │   └── HangmanDrawing.tsx
│   │       └── sea-battle/
│   │           ├── SeaBattleContainer.tsx
│   │           ├── Grid.tsx
│   │           └── ShipPlacement.tsx
│   ├── hooks/
│   │   ├── useSocket.ts
│   │   ├── useRoom.ts
│   │   └── useGame.ts
│   ├── lib/
│   │   └── socket.ts
│   ├── types/
│   │   └── index.ts
│   └── styles/
│       └── globals.css
├── public/
│   └── favicon.ico
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### To Create — Server (`server/`)

```
server/
├── src/
│   ├── index.ts                   ← Entry point
│   ├── rooms.ts                   ← RoomManager
│   ├── games/
│   │   ├── base.ts                ← BaseGame abstract class
│   │   ├── snakes-ladders.ts      ← Game logic
│   │   ├── hangman.ts
│   │   └── sea-battle.ts
│   └── types.ts
├── tsconfig.json
└── package.json
```

### To Create — Shared

```
shared/
└── types.ts
```

---
## Plan Tasks

### Task 1: Project Scaffolding — Initialize Repo & Dependencies

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next.config.js`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/src/styles/globals.css`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/types/index.ts`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/types.ts`
- Create: `shared/types.ts`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Consumes: (nothing — first task)
- Produces: Next.js app scaffold, Express scaffold, shared TypeScript types

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /c/Menza/Web\ Game
npx create-next-app@latest frontend --typescript --tailwind --app --src-dir --no-import-alias --use-npm
```

Answer prompts:
- TypeScript: Yes
- ESLint: Yes
- Tailwind CSS: Yes
- `src/` directory: Yes
- App Router: Yes (default)
- Import alias: No

- [ ] **Step 2: Install frontend dependencies**

```bash
cd /c/Menza/Web\ Game/frontend
npm install socket.io-client @react-three/fiber @react-three/drei three framer-motion
npm install -D @types/three
```

- [ ] **Step 3: Create server directory and package.json**

```bash
mkdir -p /c/Menza/Web\ Game/server/src/games
```

Write `server/package.json`:

```json
{
  "name": "gameville-server",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.4",
    "cors": "^2.8.5",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "@types/express": "^4.17.21",
    "@types/socket.io": "^3.0.2",
    "@types/cors": "^2.8.17",
    "@types/uuid": "^9.0.7",
    "@types/node": "^20.11.0"
  }
}
```

- [ ] **Step 4: Write server tsconfig.json**

`server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: Write shared types**

`shared/types.ts`:

```typescript
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

export interface SeaBattleState {
  player1Id: string;
  player2Id: string;
  currentTurn: string;
  phase: 'setup' | 'playing' | 'finished';
  winner: string | null;
}
```

- [ ] **Step 6: Write frontend types re-exports**

`frontend/src/types/index.ts`:

```typescript
export type {
  GameType, Player, Room,
  ServerToClientEvents, ClientToServerEvents,
  SnakesLaddersState, HangmanState, SeaBattleState,
} from '../../../shared/types';
```

- [ ] **Step 7: Write root layout.tsx**

`frontend/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';

const nunito = Nunito({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'GameVille — Main Bareng Teman!',
  description: 'Platform multiplayer game seru buat main bareng teman',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={nunito.className}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Write Tailwind config**

`frontend/tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: '#FF9BB5',
        secondary: '#A8D8EA',
        accent: '#FFD3B6',
        success: '#B5EAD7',
        warning: '#FFDAC1',
        cute: { bg: '#FFF5F7', surface: '#FFFFFF', text: '#4A4A4A', muted: '#9CA3AF' },
      },
      borderRadius: { cute: '16px', button: '24px' },
      fontFamily: { sans: ['Nunito', 'sans-serif'] },
      boxShadow: { soft: '0 4px 14px rgba(0,0,0,0.08)' },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 9: Write globals.css**

`frontend/src/styles/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #FFF5F7;
  color: #4A4A4A;
  min-height: 100vh;
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 10: Write .gitignore**

```bash
cat > .gitignore << 'EOF'
node_modules/
.next/
dist/
.env
.env.local
*.tsbuildinfo
EOF
```

- [ ] **Step 11: Install server dependencies**

```bash
cd /c/Menza/Web\ Game/server
npm install
```

- [ ] **Step 12: Commit**

```bash
cd /c/Menza/Web\ Game
git init
git add .
git commit -m "feat: initial project scaffold — Next.js + Express + shared types"
```

---

### Task 2: Socket.io Server — Connection & Heartbeat

**Files:**
- Create: `server/src/index.ts`
- Create: `frontend/src/lib/socket.ts`
- Create: `frontend/src/hooks/useSocket.ts`

**Interfaces:**
- Consumes: `shared/types.ts` (interfaces), Task 1 scaffold
- Produces: Running Socket.io server on port 3001, frontend socket client ready

- [ ] **Step 1: Write server entry point**

`server/src/index.ts`:

```typescript
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ClientToServerEvents, ServerToClientEvents } from './types';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: io.engine.clientsCount });
});

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[-] Player disconnected: ${socket.id}`);
  });
});

const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`[GameVille Server] Running on port ${PORT}`);
});
```

- [ ] **Step 2: Write frontend socket client**

`frontend/src/lib/socket.ts`:

```typescript
'use client';

import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}
```

- [ ] **Step 3: Write useSocket hook**

`frontend/src/hooks/useSocket.ts`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';

export function useSocket() {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = connectSocket();

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    setSocket(s);

    return () => {
      disconnectSocket();
    };
  }, []);

  return { socket, connected };
}
```

- [ ] **Step 4: Add NEXT_PUBLIC_SERVER_URL to next.config.js**

`frontend/next.config.js` read and edit to add env:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001',
  },
};

module.exports = nextConfig;
```

- [ ] **Step 5: Test server starts**

```bash
cd /c/Menza/Web\ Game/server
npx tsx src/index.ts &
sleep 2
curl http://localhost:3001/health
# Expected: {"status":"ok","rooms":0}
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: socket.io server + frontend client connection"
```

---

### Task 3: Room Manager — Create, Join, Leave Rooms

**Files:**
- Create: `server/src/rooms.ts`
- Modify: `server/src/index.ts` (add room event handlers)

**Interfaces:**
- Consumes: `shared/types.ts`, Task 2 (socket server running)
- Produces: Room CRUD — create room with PIN, join by PIN, leave, ready toggle, game select

- [ ] **Step 1: Write RoomManager**

`server/src/rooms.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Room, Player, GameType } from './types';

const ROOMS = new Map<string, Room>();

function generatePin(): string {
  // Generate unique 6-digit PIN
  let pin: string;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (Array.from(ROOMS.values()).some(r => r.pin === pin && r.state !== 'finished'));
  return pin;
}

export function createRoom(data: { name: string; nickname: string; color: string; emoji: string }, socketId: string): Room {
  const player: Player = {
    id: socketId,
    nickname: data.nickname,
    color: data.color,
    emoji: data.emoji,
    isHost: true,
    isReady: false,
    joinedAt: Date.now(),
  };

  const room: Room = {
    id: uuidv4(),
    pin: generatePin(),
    name: data.name,
    gameType: null,
    hostId: socketId,
    players: [player],
    state: 'waiting',
    createdAt: Date.now(),
  };

  ROOMS.set(room.id, room);
  return room;
}

export function joinRoom(pin: string, data: { nickname: string; color: string; emoji: string }, socketId: string): Room | null {
  const room = findByPin(pin);
  if (!room) return null;
  if (room.state !== 'waiting') return null;
  if (room.players.length >= 4) return null;

  const player: Player = {
    id: socketId,
    nickname: data.nickname,
    color: data.color,
    emoji: data.emoji,
    isHost: false,
    isReady: false,
    joinedAt: Date.now(),
  };

  room.players.push(player);
  return room;
}

export function leaveRoom(socketId: string): { roomId?: string; newHost?: Player } {
  const room = findByPlayer(socketId);
  if (!room) return {};

  const index = room.players.findIndex(p => p.id === socketId);
  if (index === -1) return {};

  room.players.splice(index, 1);

  // Assign new host if host left
  if (room.hostId === socketId && room.players.length > 0) {
    room.players[0].isHost = true;
    room.hostId = room.players[0].id;
    return { roomId: room.id, newHost: room.players[0] };
  }

  // Clean up empty rooms
  if (room.players.length === 0) {
    ROOMS.delete(room.id);
    return {};
  }

  return { roomId: room.id };
}

export function toggleReady(socketId: string, ready: boolean): Room | null {
  const room = findByPlayer(socketId);
  if (!room) return null;

  const player = room.players.find(p => p.id === socketId);
  if (player) player.isReady = ready;

  return room;
}

export function setGameType(socketId: string, gameType: GameType): Room | null {
  const room = findByPlayer(socketId);
  if (!room) return null;
  if (room.hostId !== socketId) return null;

  room.gameType = gameType;
  return room;
}

export function canStartGame(roomId: string): boolean {
  const room = ROOMS.get(roomId);
  if (!room) return false;
  if (!room.gameType) return false;
  if (room.players.length < 2) return false;
  if (room.players.some(p => !p.isReady && !p.isHost)) return false;
  return true;
}

export function setRoomState(roomId: string, state: Room['state']): void {
  const room = ROOMS.get(roomId);
  if (room) room.state = state;
}

export function getRoom(roomId: string): Room | undefined {
  return ROOMS.get(roomId);
}

export function findByPin(pin: string): Room | undefined {
  return Array.from(ROOMS.values()).find(r => r.pin === pin && r.state === 'waiting');
}

export function findByPlayer(socketId: string): Room | undefined {
  return Array.from(ROOMS.values()).find(r => r.players.some(p => p.id === socketId));
}
```

- [ ] **Step 2: Wire RoomManager to Socket.io server**

Edit `server/src/index.ts` — tambahkan room event handlers (setelah `socket.on('disconnect', ...)`):

```typescript
import { createRoom, joinRoom, leaveRoom, toggleReady, setGameType, canStartGame, setRoomState, getRoom } from './rooms';

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  // === ROOM EVENTS ===

  socket.on('room:create', (data) => {
    const room = createRoom(data, socket.id);
    socket.join(room.id);
    socket.emit('room:created', room);
    console.log(`[Room] Created: ${room.pin} by ${data.nickname}`);
  });

  socket.on('room:join', (data) => {
    const room = joinRoom(data.pin, data, socket.id);
    if (!room) {
      socket.emit('room:error', { message: 'Kode ruang tidak valid atau ruang sudah penuh!' });
      return;
    }
    socket.join(room.id);
    socket.emit('room:joined', room);
    socket.to(room.id).emit('player:entered', room.players[room.players.length - 1]);
    socket.to(room.id).emit('room:state', room);
  });

  socket.on('room:leave', () => {
    const result = leaveRoom(socket.id);
    if (result.roomId) {
      socket.leave(result.roomId);
      socket.to(result.roomId).emit('player:left', socket.id);
      if (result.newHost) {
        socket.to(result.roomId).emit('player:update', getRoom(result.roomId)!.players);
      }
    }
  });

  socket.on('player:ready', (data) => {
    const room = toggleReady(socket.id, data.ready);
    if (room) {
      io.to(room.id).emit('player:update', room.players);
    }
  });

  socket.on('game:select', (data) => {
    const room = setGameType(socket.id, data.gameType);
    if (room) {
      io.to(room.id).emit('room:state', room);
    }
  });

  socket.on('disconnect', () => {
    const result = leaveRoom(socket.id);
    if (result.roomId) {
      socket.to(result.roomId).emit('player:left', socket.id);
      if (result.newHost) {
        socket.to(result.roomId).emit('player:update', getRoom(result.roomId)!.players);
      }
    }
    console.log(`[-] Player disconnected: ${socket.id}`);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: room manager with create/join/leave/game select"
```

---

### Task 4: Landing Page — Create & Join Room UI

**Files:**
- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/Input.tsx`
- Create: `frontend/src/components/ui/Card.tsx`
- Create: `frontend/src/components/lobby/CreateRoom.tsx`
- Create: `frontend/src/components/lobby/JoinRoom.tsx`
- Write: `frontend/src/app/page.tsx` (overwrite default)
- Create: `frontend/src/hooks/useRoom.ts`

**Interfaces:**
- Consumes: Task 2 (socket connection), Task 3 (room events)
- Produces: Landing page with create/join room forms

- [ ] **Step 1: Write Button component**

`frontend/src/components/ui/Button.tsx`:

```tsx
'use client';

import { motion } from 'framer-motion';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

export default function Button({
  children, onClick, variant = 'primary', size = 'md',
  disabled = false, className = '',
}: ButtonProps) {
  const base = 'font-bold rounded-button transition-all duration-200 inline-flex items-center justify-center';
  const variants = {
    primary: 'bg-primary text-white hover:bg-pink-400 active:bg-pink-500',
    secondary: 'bg-secondary text-white hover:bg-blue-300 active:bg-blue-400',
    ghost: 'bg-transparent text-cute-text hover:bg-pink-50',
  };
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer shadow-soft'
      } ${className}`}
    >
      {children}
    </motion.button>
  );
}
```

- [ ] **Step 2: Write Input component**

`frontend/src/components/ui/Input.tsx`:

```tsx
interface InputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  autoFocus?: boolean;
}

export default function Input({
  value, onChange, placeholder, maxLength, className = '', autoFocus,
}: InputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      className={`w-full px-4 py-3 bg-white border-2 border-pink-200 rounded-cute text-cute-text
        placeholder:text-cute-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-pink-200
        transition-all duration-200 ${className}`}
    />
  );
}
```

- [ ] **Step 3: Write useRoom hook**

`frontend/src/hooks/useRoom.ts`:

```tsx
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Socket } from 'socket.io-client';
import type { Room, Player, GameType, ServerToClientEvents, ClientToServerEvents } from '@/types';

interface UseRoomReturn {
  room: Room | null;
  players: Player[];
  createRoom: (name: string, nickname: string, color: string, emoji: string) => void;
  joinRoom: (pin: string, nickname: string, color: string, emoji: string) => void;
  leaveRoom: () => void;
  toggleReady: () => void;
  selectGame: (gameType: GameType) => void;
  startGame: () => void;
}

export function useRoom(socket: Socket<ServerToClientEvents, ClientToServerEvents> | null): UseRoomReturn {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const players = room?.players ?? [];

  const createRoom = useCallback((name: string, nickname: string, color: string, emoji: string) => {
    if (!socket) return;
    socket.emit('room:create', { name, nickname, color, emoji });
    socket.once('room:created', (r: Room) => {
      setRoom(r);
      router.push(`/room/${r.pin}`);
    });
  }, [socket, router]);

  const joinRoom = useCallback((pin: string, nickname: string, color: string, emoji: string) => {
    if (!socket) return;
    socket.emit('room:join', { pin, nickname, color, emoji });
    socket.once('room:joined', (r: Room) => {
      setRoom(r);
      router.push(`/room/${r.pin}`);
    });
    socket.once('room:error', (err) => {
      alert(err.message);
    });
  }, [socket, router]);

  const leaveRoom = useCallback(() => {
    socket?.emit('room:leave');
    setRoom(null);
    router.push('/');
  }, [socket, router]);

  const toggleReady = useCallback(() => {
    if (!room) return;
    const me = players.find(p => p.id === socket?.id);
    socket?.emit('player:ready', { ready: !me?.isReady });
  }, [socket, room, players]);

  const selectGame = useCallback((gameType: GameType) => {
    socket?.emit('game:select', { gameType });
  }, [socket]);

  const startGame = useCallback(() => {
    socket?.emit('game:start');
  }, [socket]);

  return { room, players, createRoom, joinRoom, leaveRoom, toggleReady, selectGame, startGame };
}
```

- [ ] **Step 4: Write CreateRoom component**

`frontend/src/components/lobby/CreateRoom.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface CreateRoomProps {
  onCreate: (name: string, nickname: string, color: string, emoji: string) => void;
}

const COLORS = ['#FF9BB5', '#A8D8EA', '#B5EAD7', '#FFD3B6', '#C3AED6', '#FFB347'];
const EMOJIS = ['🦊', '🐰', '🐼', '🐱', '🦁', '🐸', '🐵', '🐶'];

export default function CreateRoom({ onCreate }: CreateRoomProps) {
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [emoji, setEmoji] = useState(EMOJIS[0]);

  return (
    <div className="space-y-4">
      <Input
        value={nickname}
        onChange={setNickname}
        placeholder="Nama panggilan..."
        maxLength={12}
        autoFocus
      />
      <div>
        <p className="text-sm font-semibold text-cute-text mb-2">Warna</p>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-2 ring-pink-300' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-cute-text mb-2">Avatar</p>
        <div className="flex gap-2 flex-wrap">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`text-2xl w-10 h-10 flex items-center justify-center rounded-full transition-transform ${
                emoji === e ? 'scale-125 bg-pink-100 ring-2 ring-pink-300' : ''
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <Button
        onClick={() => onCreate(nickname || 'Player', color, emoji)}
        disabled={!nickname.trim()}
        className="w-full"
      >
        🎮 Buat Ruang Baru
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Write JoinRoom component**

`frontend/src/components/lobby/JoinRoom.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface JoinRoomProps {
  onJoin: (pin: string, nickname: string, color: string, emoji: string) => void;
}

const COLORS = ['#FF9BB5', '#A8D8EA', '#B5EAD7', '#FFD3B6', '#C3AED6', '#FFB347'];
const EMOJIS = ['🦊', '🐰', '🐼', '🐱', '🦁', '🐸', '🐵', '🐶'];

export default function JoinRoom({ onJoin }: JoinRoomProps) {
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [emoji, setEmoji] = useState(EMOJIS[0]);

  return (
    <div className="space-y-4">
      <Input
        value={pin}
        onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
        placeholder="Kode ruang (6 angka)..."
        maxLength={6}
      />
      <Input
        value={nickname}
        onChange={setNickname}
        placeholder="Nama panggilan..."
        maxLength={12}
      />
      <div>
        <p className="text-sm font-semibold text-cute-text mb-2">Warna</p>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-2 ring-pink-300' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-cute-text mb-2">Avatar</p>
        <div className="flex gap-2 flex-wrap">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`text-2xl w-10 h-10 flex items-center justify-center rounded-full transition-transform ${
                emoji === e ? 'scale-125 bg-pink-100 ring-2 ring-pink-300' : ''
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <Button
        onClick={() => onJoin(pin, nickname || 'Player', color, emoji)}
        disabled={pin.length !== 6 || !nickname.trim()}
        className="w-full"
      >
        🔗 Gabung Ruang
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Write landing page**

`frontend/src/app/page.tsx`:

```tsx
'use client';

import { motion } from 'framer-motion';
import CreateRoom from '@/components/lobby/CreateRoom';
import JoinRoom from '@/components/lobby/JoinRoom';
import Card from '@/components/ui/Card';
import { useSocket } from '@/hooks/useSocket';
import { useRoom } from '@/hooks/useRoom';

export default function HomePage() {
  const { socket } = useSocket();
  const { createRoom, joinRoom } = useRoom(socket);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="text-center mb-10"
      >
        <h1 className="text-5xl md:text-7xl font-bold text-primary mb-2">
          🎮 GameVille
        </h1>
        <p className="text-lg text-cute-muted">Main bareng teman, seru bareng!</p>
      </motion.div>

      <div className="flex flex-col md:flex-row gap-6 w-full max-w-2xl">
        <Card title="🆕 Buat Ruang Baru">
          <CreateRoom onCreate={createRoom} />
        </Card>

        <Card title="🔗 Masuk Ruang">
          <JoinRoom onJoin={joinRoom} />
        </Card>
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Write Card component**

`frontend/src/components/ui/Card.tsx`:

```tsx
'use client';

import { motion } from 'framer-motion';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export default function Card({ title, children, className = '' }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 150, damping: 15 }}
      className={`bg-white rounded-cute shadow-soft p-6 flex-1 ${className}`}
    >
      {title && (
        <h2 className="text-xl font-bold text-cute-text mb-4">{title}</h2>
      )}
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 8: Test build**

```bash
cd /c/Menza/Web\ Game/frontend
npx next build 2>&1 | tail -20
```

Expected: Build success without errors.

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: landing page with create/join room UI"
```

---

### Task 5: Room Lobby Page — Player List, Ready, Chat

**Files:**
- Create: `frontend/src/app/room/[pin]/page.tsx`
- Create: `frontend/src/components/room/PlayerList.tsx`
- Create: `frontend/src/components/room/PlayerCard.tsx`
- Create: `frontend/src/components/room/ChatBox.tsx`
- Create: `frontend/src/components/room/EmojiReactions.tsx`
- Modify: `server/src/index.ts` (add chat + reactions handlers)

**Interfaces:**
- Consumes: Tasks 2–4 (socket, room, UI components)
- Produces: Room page with lobby, chat, emoji reactions, game start flow

- [ ] **Step 1: Write PlayerCard**

`frontend/src/components/room/PlayerCard.tsx`:

```tsx
'use client';

import { motion } from 'framer-motion';
import type { Player } from '@/types';

interface PlayerCardProps {
  player: Player;
  isMe: boolean;
}

export default function PlayerCard({ player, isMe }: PlayerCardProps) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 12 }}
      className={`flex items-center gap-3 p-3 rounded-cute border-2 transition-all ${
        isMe ? 'border-primary bg-pink-50' : 'border-gray-100 bg-white'
      }`}
    >
      <span className="text-3xl">{player.emoji}</span>
      <div className="flex-1">
        <p className="font-bold text-cute-text">
          {player.nickname}
          {isMe && ' (Kamu)'}
          {player.isHost && ' 👑'}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: player.color }}
          />
          <span className={`text-xs font-semibold ${player.isReady ? 'text-green-500' : 'text-cute-muted'}`}>
            {player.isReady ? 'Siap!' : 'Belum siap'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Write PlayerList**

`frontend/src/components/room/PlayerList.tsx`:

```tsx
'use client';

import type { Player } from '@/types';
import PlayerCard from './PlayerCard';

interface PlayerListProps {
  players: Player[];
  myId: string | undefined;
}

export default function PlayerList({ players, myId }: PlayerListProps) {
  return (
    <div className="space-y-2">
      <h3 className="font-bold text-cute-text text-lg">
        Pemain ({players.length}/4)
      </h3>
      {players.map((p) => (
        <PlayerCard key={p.id} player={p} isMe={p.id === myId} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write ChatBox**

`frontend/src/components/room/ChatBox.tsx`:

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import Input from '@/components/ui/Input';
import { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types';

interface ChatBoxProps {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  myNickname: string;
}

interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  timestamp: number;
}

export default function ChatBox({ socket, myNickname }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;
    const handler = (data: { playerId: string; nickname: string; text: string }) => {
      setMessages((prev) => [...prev, { ...data, id: `${data.timestamp}-${Math.random()}`, timestamp: Date.now() }]);
    };
    socket.on('chat:received', handler);
    return () => { socket.off('chat:received', handler); };
  }, [socket]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!input.trim() || !socket) return;
    socket.emit('chat:message', { text: input.trim() });
    setMessages((prev) => [...prev, {
      id: `me-${Date.now()}`,
      playerId: socket.id || '',
      nickname: myNickname,
      text: input.trim(),
      timestamp: Date.now(),
    }]);
    setInput('');
  };

  return (
    <div className="flex flex-col h-64 bg-white rounded-cute shadow-soft">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.playerId === socket?.id ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
              msg.playerId === socket?.id
                ? 'bg-primary text-white rounded-br-md'
                : 'bg-gray-100 text-cute-text rounded-bl-md'
            }`}>
              {msg.playerId !== socket?.id && (
                <p className="text-xs font-bold text-cute-muted mb-1">{msg.nickname}</p>
              )}
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="p-2 border-t border-gray-100 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ketik pesan..."
          maxLength={100}
          className="flex-1 px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          className="px-3 py-2 bg-primary text-white rounded-xl text-sm font-bold disabled:opacity-50"
        >
          Kirim
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write EmojiReactions**

`frontend/src/components/room/EmojiReactions.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

interface EmojiReactionsProps {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
}

const QUICK_EMOJIS = ['😄', '🎉', '🔥', '😂', '😱', '🙌', '💪', '🥳'];

interface FloatingEmoji {
  id: string;
  emoji: string;
  timestamp: number;
}

export default function EmojiReactions({ socket }: EmojiReactionsProps) {
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);

  useEffect(() => {
    if (!socket) return;
    const handler = (data: { nickname: string; emoji: string }) => {
      const id = `${Date.now()}-${Math.random()}`;
      setFloating((prev) => [...prev, { id, emoji: data.emoji, timestamp: Date.now() }]);
      setTimeout(() => setFloating((prev) => prev.filter((e) => e.id !== id)), 3000);
    };
    socket.on('reaction:received', handler);
    return () => { socket.off('reaction:received', handler); };
  }, [socket]);

  const sendReaction = useCallback((emoji: string) => {
    socket?.emit('reaction:send', { emoji });
    const id = `me-${Date.now()}`;
    setFloating((prev) => [...prev, { id, emoji, timestamp: Date.now() }]);
    setTimeout(() => setFloating((prev) => prev.filter((e) => e.id !== id)), 3000);
  }, [socket]);

  return (
    <div className="relative">
      <div className="flex gap-1 flex-wrap">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => sendReaction(emoji)}
            className="text-xl hover:scale-125 transition-transform p-1"
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="absolute bottom-full left-0 flex gap-2 pointer-events-none">
        <AnimatePresence>
          {floating.map((f, i) => (
            <motion.span
              key={f.id}
              initial={{ y: 0, opacity: 1, x: i * 10 }}
              animate={{ y: -60, opacity: 0, x: (i % 3) * 20 - 20 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2 }}
              className="text-2xl"
            >
              {f.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write Room page**

`frontend/src/app/room/[pin]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { useRoom } from '@/hooks/useRoom';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import PlayerList from '@/components/room/PlayerList';
import ChatBox from '@/components/room/ChatBox';
import EmojiReactions from '@/components/room/EmojiReactions';
import SnakesLaddersContainer from '@/components/games/snakes-ladders/SnakesLaddersContainer';
import HangmanContainer from '@/components/games/hangman/HangmanContainer';
import SeaBattleContainer from '@/components/games/sea-battle/SeaBattleContainer';
import type { GameType, SnakesLaddersState, HangmanState, SeaBattleState } from '@/types';

export default function RoomPage() {
  const params = useParams();
  const pin = params.pin as string;
  const router = useRouter();
  const { socket, connected } = useSocket();
  const { room, players, leaveRoom, toggleReady, selectGame, startGame } = useRoom(socket);
  const [gameState, setGameState] = useState<any>(null);
  const [gameActive, setGameActive] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on('room:state', (r) => {
      // Room state updated from server
    });

    socket.on('game:started', (gameType) => {
      setGameActive(true);
    });

    socket.on('game:state', (state) => {
      setGameState(state);
    });

    socket.on('game:over', () => {
      setGameActive(false);
      setGameState(null);
    });

    return () => {
      socket.off('room:state');
      socket.off('game:started');
      socket.off('game:state');
      socket.off('game:over');
    };
  }, [socket]);

  // Room events listeners untuk update dari server
  useEffect(() => {
    if (!socket) return;

    const handlePlayerEntered = () => { /* room state updated via room:state */ };
    const handlePlayerLeft = () => { /* room state updated via room:state */ };

    socket.on('player:entered', handlePlayerEntered);
    socket.on('player:left', handlePlayerLeft);

    return () => {
      socket.off('player:entered', handlePlayerLeft);
      socket.off('player:left', handlePlayerLeft);
    };
  }, [socket]);

  const myId = socket?.id;
  const isHost = players.find(p => p.id === myId)?.isHost ?? false;
  const allReady = players.every(p => p.isReady) && players.length >= 2;

  const myNickname = players.find(p => p.id === myId)?.nickname ?? '';

  // Pastikan socket ready sebelum render
  if (!connected || !room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-cute-muted text-xl">Menghubungkan ke ruang...</p>
      </div>
    );
  }

  // Jika game aktif, render game view
  if (gameActive && room.gameType) {
    const renderGame = () => {
      switch (room.gameType) {
        case 'snakes-ladders':
          return <SnakesLaddersContainer socket={socket!} state={gameState as SnakesLaddersState} />;
        case 'hangman':
          return <HangmanContainer socket={socket!} state={gameState as HangmanState} />;
        case 'sea-battle':
          return <SeaBattleContainer socket={socket!} state={gameState as SeaBattleState} />;
        default:
          return <p>Game tidak dikenal</p>;
      }
    };

    return (
      <div className="min-h-screen p-4 flex flex-col lg:flex-row gap-4">
        <div className="flex-1">{renderGame()}</div>
        <div className="w-full lg:w-80 space-y-4">
          <ChatBox socket={socket!} myNickname={myNickname} />
          <EmojiReactions socket={socket!} />
          <Button variant="ghost" onClick={() => { setGameActive(false); leaveRoom(); }}>
            ← Keluar
          </Button>
        </div>
      </div>
    );
  }

  // Lobby view
  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Room Info + Players */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-cute-text">🎮 {room.name}</h1>
                  <p className="text-cute-muted text-sm mt-1">
                    Kode ruang: <span className="font-mono font-bold text-primary text-lg">{pin}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(window.location.href)}
                      className="ml-2 text-secondary hover:text-blue-400 transition-colors"
                      title="Salin link"
                    >
                      📋
                    </button>
                  </p>
                </div>
              </div>
              <PlayerList players={players} myId={myId} />
            </Card>

            {/* Game Selector */}
            <Card title="🎯 Pilih Game">
              <div className="space-y-3">
                {(['snakes-ladders', 'hangman', 'sea-battle'] as GameType[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => isHost && selectGame(g)}
                    disabled={!isHost}
                    className={`w-full text-left p-3 rounded-cute border-2 transition-all ${
                      room.gameType === g
                        ? 'border-primary bg-pink-50'
                        : 'border-gray-100 hover:border-gray-200'
                    } ${!isHost ? 'opacity-60' : ''}`}
                  >
                    <p className="font-bold text-cute-text">
                      {g === 'snakes-ladders' ? '🐍 Ular Tangga' : g === 'hangman' ? '💀 Hangman' : '⚓ Sea Battle'}
                    </p>
                    <p className="text-sm text-cute-muted">
                      {g === 'snakes-ladders' ? '2-4 pemain · Dadu 3D · Papan isometric' : g === 'hangman' ? '2-4 pemain · Tebak kata bareng-bareng' : '2 pemain · Perang kapal di grid'}
                    </p>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: Controls + Chat */}
          <div className="space-y-4">
            <Card>
              <div className="space-y-3">
                <Button onClick={toggleReady} variant={players.find(p => p.id === myId)?.isReady ? 'secondary' : 'primary'} className="w-full">
                  {players.find(p => p.id === myId)?.isReady ? '✅ Siap!' : '⏳ Saya Siap'}
                </Button>
                {isHost && (
                  <Button
                    onClick={startGame}
                    disabled={!allReady || !room.gameType}
                    className="w-full"
                  >
                    🚀 Mulai Game
                  </Button>
                )}
                {!isHost && (
                  <p className="text-center text-sm text-cute-muted">
                    Host yang memulai game
                  </p>
                )}
                <Button variant="ghost" onClick={leaveRoom} className="w-full">
                  🚪 Keluar Ruang
                </Button>
              </div>
            </Card>

            <ChatBox socket={socket!} myNickname={myNickname} />
            <EmojiReactions socket={socket!} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write game container stubs (minimal)**

Buat file-file berikut sebagai placeholder agar import di room page tidak error:

`frontend/src/components/games/snakes-ladders/SnakesLaddersContainer.tsx`:

```tsx
'use client';

import { Socket } from 'socket.io-client';
import type { SnakesLaddersState, ServerToClientEvents, ClientToServerEvents } from '@/types';

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: SnakesLaddersState | null;
}

export default function SnakesLaddersContainer({ socket, state }: Props) {
  return <div className="text-center p-8 text-cute-muted">🐍 Ular Tangga — Segera hadir!</div>;
}
```

`frontend/src/components/games/hangman/HangmanContainer.tsx`:

```tsx
'use client';

import { Socket } from 'socket.io-client';
import type { HangmanState, ServerToClientEvents, ClientToServerEvents } from '@/types';

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: HangmanState | null;
}

export default function HangmanContainer({ socket, state }: Props) {
  return <div className="text-center p-8 text-cute-muted">💀 Hangman — Segera hadir!</div>;
}
```

`frontend/src/components/games/sea-battle/SeaBattleContainer.tsx`:

```tsx
'use client';

import { Socket } from 'socket.io-client';
import type { SeaBattleState, ServerToClientEvents, ClientToServerEvents } from '@/types';

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: SeaBattleState | null;
}

export default function SeaBattleContainer({ socket, state }: Props) {
  return <div className="text-center p-8 text-cute-muted">⚓ Sea Battle — Segera hadir!</div>;
}
```

- [ ] **Step 7: Add chat + reaction handlers to server**

Edit `server/src/index.ts` — tambahkan handler setelah `game:select`:

```typescript
  socket.on('chat:message', (data) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    socket.to(room.id).emit('chat:received', {
      playerId: socket.id,
      nickname: findPlayerNickname(socket.id),
      text: data.text,
    });
  });

  socket.on('reaction:send', (data) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    socket.to(room.id).emit('reaction:received', {
      playerId: socket.id,
      nickname: findPlayerNickname(socket.id),
      emoji: data.emoji,
    });
  });
```

Tambahkan juga 2 helper function di `server/src/index.ts`:

```typescript
import { findByPlayer } from './rooms';

function findRoomBySocket(socketId: string) {
  const room = findByPlayer(socketId);
  if (!room) return null;
  return { id: room.id };
}

function findPlayerNickname(socketId: string): string {
  const room = findByPlayer(socketId);
  if (!room) return 'Unknown';
  return room.players.find(p => p.id === socketId)?.nickname ?? 'Unknown';
}
```

- [ ] **Step 8: Test build**

```bash
cd /c/Menza/Web\ Game/frontend
npx next build 2>&1 | tail -20
```

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: room lobby with player list, chat, emoji reactions, game selector"
```

---

### Task 6: Game Start Flow — Server Game Engine Base

**Files:**
- Create: `server/src/games/base.ts`
- Modify: `server/src/index.ts` (add game:start handler)

**Interfaces:**
- Consumes: Task 3 (RoomManager), Task 4–5 (room page)
- Produces: Game lifecycle — start game, manage turns, end game

- [ ] **Step 1: Write base game engine**

`server/src/games/base.ts`:

```typescript
import { GameType } from '../types';

export interface GameInstance {
  roomId: string;
  gameType: GameType;
  state: unknown;
  currentTurnIndex: number;
  playerOrder: string[]; // player IDs in turn order
  winner: string | null;
}

export abstract class BaseGame {
  abstract gameType: GameType;
  abstract createInitialState(playerOrder: string[]): unknown;
  abstract handleAction(state: unknown, playerId: string, action: { type: string; payload?: unknown }): { newState: unknown; events: GameEvent[] };

  createInstance(roomId: string, playerOrder: string[]): GameInstance {
    return {
      roomId,
      gameType: this.gameType,
      state: this.createInitialState(playerOrder),
      currentTurnIndex: 0,
      playerOrder,
      winner: null,
    };
  }

  getCurrentPlayerId(instance: GameInstance): string {
    return instance.playerOrder[instance.currentTurnIndex];
  }

  nextTurn(instance: GameInstance): void {
    instance.currentTurnIndex = (instance.currentTurnIndex + 1) % instance.playerOrder.length;
  }
}

export interface GameEvent {
  type: string;
  data: Record<string, unknown>;
}
```

- [ ] **Step 2: Add game start handler to server**

Edit `server/src/index.ts` — tambahkan game manager state dan handler `game:start`:

```typescript
import { BaseGame } from './games/base';
import { SnakesLaddersEngine } from './games/snakes-ladders';

const GAMES = new Map<string, GameInstance>();

interface GameInstance {
  roomId: string;
  gameType: GameType;
  state: unknown;
  currentTurnIndex: number;
  playerOrder: string[];
  winner: string | null;
}

const engines: Record<string, BaseGame> = {
  'snakes-ladders': new SnakesLaddersEngine(),
};

socket.on('game:start', () => {
  const roomData = findByPlayer(socket.id);
  if (!roomData) return;
  if (roomData.hostId !== socket.id) return;
  if (!canStartGame(roomData.id)) return;

  const engine = engines[roomData.gameType!];
  if (!engine) return;

  const playerOrder = roomData.players.map(p => p.id);
  const instance: GameInstance = {
    roomId: roomData.id,
    gameType: roomData.gameType!,
    state: engine.createInitialState(playerOrder),
    currentTurnIndex: 0,
    playerOrder,
    winner: null,
  };

  GAMES.set(roomData.id, instance);
  setRoomState(roomData.id, 'playing');

  // Notify all players
  io.to(roomData.id).emit('game:started', roomData.gameType!);
  io.to(roomData.id).emit('game:state', instance.state);

  // Notify whose turn it is
  const currentPlayerId = instance.playerOrder[instance.currentTurnIndex];
  io.to(roomData.id).emit('game:action', { type: 'turn', playerId: currentPlayerId });
});
```

Tambahkan juga handler disconnect untuk cleanup game:

```typescript
// Dalam handler disconnect, setelah leaveRoom:
const game = GAMES.get(result.roomId || '');
if (game && getRoom(result.roomId!)?.state === 'finished') {
  GAMES.delete(result.roomId!);
}
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: game engine base class and game start flow"
```

---

### Task 7: Ular Tangga — Server Game Logic

**Files:**
- Create: `server/src/games/snakes-ladders.ts`
- Modify: `server/src/index.ts` (add game:action handler for snakes-ladders)

**Interfaces:**
- Consumes: Task 6 (base game engine)
- Produces: Complete Ular Tangga game logic — dice roll, move, snakes, ladders, win

- [ ] **Step 1: Write SnakesLaddersEngine**

`server/src/games/snakes-ladders.ts`:

```typescript
import { BaseGame, GameEvent } from './base';
import { GameType } from '../types';

interface SLState {
  players: { id: string; position: number }[];
  currentTurn: number;
  diceValue: number | null;
  phase: 'rolling' | 'moving' | 'done';
  snakes: [number, number][];
  ladders: [number, number][];
  winner: string | null;
}

const SNAKES: [number, number][] = [
  [16, 6], [47, 26], [49, 11], [56, 53], [62, 19],
  [64, 60], [87, 24], [93, 73], [95, 75], [98, 78],
];

const LADDERS: [number, number][] = [
  [1, 38], [4, 14], [9, 31], [21, 42], [28, 84],
  [36, 44], [51, 67], [71, 91], [80, 100],
];

export class SnakesLaddersEngine extends BaseGame {
  gameType: GameType = 'snakes-ladders';

  createInitialState(playerOrder: string[]): SLState {
    return {
      players: playerOrder.map(id => ({ id, position: 0 })),
      currentTurn: 0,
      diceValue: null,
      phase: 'rolling',
      snakes: SNAKES,
      ladders: LADDERS,
      winner: null,
    };
  }

  handleAction(state: SLState, playerId: string, action: { type: string; payload?: unknown }): { newState: SLState; events: GameEvent[] } {
    const events: GameEvent[] = [];
    const playerIndex = state.players.findIndex(p => p.id === playerId);

    if (playerIndex === -1 || playerIndex !== state.currentTurn) {
      return { newState: state, events: [{ type: 'error', data: { message: 'Bukan giliranmu!' } }] };
    }

    if (action.type === 'roll') {
      const dice = Math.floor(Math.random() * 6) + 1;
      state.diceValue = dice;

      const player = state.players[playerIndex];
      let newPos = player.position + dice;

      // Check if exceeds 100 — bounce back
      if (newPos > 100) {
        newPos = 100 - (newPos - 100);
      }

      player.position = newPos;

      // Check snakes & ladders
      let snakeHit: [number, number] | null = null;
      let ladderHit: [number, number] | null = null;

      for (const [head, tail] of state.snakes) {
        if (newPos === head) {
          player.position = tail;
          snakeHit = [head, tail];
          break;
        }
      }

      for (const [bottom, top] of state.ladders) {
        if (newPos === bottom) {
          player.position = top;
          ladderHit = [bottom, top];
          break;
        }
      }

      events.push({
        type: 'diceResult',
        data: {
          playerId,
          value: dice,
          newPosition: player.position,
          snakeHit,
          ladderHit,
        },
      });

      // Check win
      if (player.position >= 100) {
        state.winner = playerId;
        state.phase = 'done';
        events.push({ type: 'gameOver', data: { winnerId: playerId } });
      } else {
        // Next turn
        state.currentTurn = (state.currentTurn + 1) % state.players.length;
        state.diceValue = null;
        events.push({
          type: 'turnChange',
          data: { nextPlayerId: state.players[state.currentTurn].id },
        });
      }
    }

    return { newState: { ...state }, events };
  }
}
```

- [ ] **Step 2: Wire game:action handler to server**

Edit `server/src/index.ts` — tambahkan setelah handler `game:start`:

```typescript
socket.on('game:action', (data) => {
  // Find the room and game instance for this socket
  let gameRoom: { id: string } | null = null;
  for (const [roomId, instance] of GAMES) {
    if (instance.playerOrder.includes(socket.id)) {
      gameRoom = { id: roomId };
      break;
    }
  }
  if (!gameRoom) return;

  const instance = GAMES.get(gameRoom.id);
  if (!instance || instance.winner) return;

  const engine = engines[instance.gameType];
  if (!engine) return;

  const result = engine.handleAction(instance.state, socket.id, data);
  instance.state = result.newState;

  // Process all events
  for (const event of result.events) {
    switch (event.type) {
      case 'diceResult':
        io.to(gameRoom.id).emit('game:state', instance.state);
        io.to(gameRoom.id).emit('game:action', event.data);
        break;
      case 'turnChange':
        io.to(gameRoom.id).emit('game:action', event.data);
        break;
      case 'gameOver':
        instance.winner = event.data.winnerId as string;
        const winner = instance.playerOrder.find(p => p === event.data.winnerId);
        const winnerName = getRoom(gameRoom.id)?.players.find(p => p.id === winner)?.nickname ?? 'Unknown';
        io.to(gameRoom.id).emit('game:over', { winnerId: event.data.winnerId as string, winnerName });
        setRoomState(gameRoom.id, 'finished');
        break;
      case 'error':
        socket.emit('room:error', event.data as { message: string });
        break;
    }
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: snakes & ladders server game logic"
```

---

### Task 8: Ular Tangga — 3D Board, Dice, and Gameplay UI

**Files:**
- Write: `frontend/src/components/games/snakes-ladders/SnakesLaddersContainer.tsx` (overwrite stub)
- Create: `frontend/src/components/games/snakes-ladders/GameBoard3D.tsx`
- Create: `frontend/src/components/games/snakes-ladders/Dice3D.tsx`

**Interfaces:**
- Consumes: Task 7 (server logic), `SnakesLaddersState` type
- Produces: Full interactive 3D Ular Tangga game with Three.js

- [ ] **Step 1: Write Dice3D component**

`frontend/src/components/games/snakes-ladders/Dice3D.tsx`:

```tsx
'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'framer-motion';

const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.3, -0.3], [0.3, 0.3]],
  3: [[-0.3, -0.3], [0, 0], [0.3, 0.3]],
  4: [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]],
  5: [[-0.3, -0.3], [0.3, -0.3], [0, 0], [-0.3, 0.3], [0.3, 0.3]],
  6: [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0], [0.3, 0], [-0.3, 0.3], [0.3, 0.3]],
};

function DiceFace({ value }: { value: number }) {
  const dots = DOT_POSITIONS[value] || [];
  return (
    <mesh>
      <planeGeometry args={[0.8, 0.8]} />
      <meshStandardMaterial color="white" />
      {dots.map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.01]}>
          <circleGeometry args={[0.08, 16]} />
          <meshStandardMaterial color="#4A4A4A" />
        </mesh>
      ))}
    </mesh>
  );
}

function DiceModel({ value, rolling }: { value: number; rolling: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (rolling && groupRef.current) {
      groupRef.current.rotation.x += delta * 5;
      groupRef.current.rotation.y += delta * 7;
      groupRef.current.rotation.z += delta * 3;
    }
  });

  // Map value to cube face rotation
  const rotations: Record<number, [number, number, number]> = {
    1: [0, 0, 0],
    2: [0, Math.PI / 2, 0],
    3: [-Math.PI / 2, 0, 0],
    4: [Math.PI / 2, 0, 0],
    5: [0, -Math.PI / 2, 0],
    6: [Math.PI, 0, 0],
  };

  const targetRotation = rolling ? [0, 0, 0] : rotations[value] || [0, 0, 0];

  return (
    <group ref={groupRef} rotation={targetRotation as [number, number, number]}>
      {/* Cube body */}
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#FF9BB5" transparent opacity={0.3} />
        <Edges>
          <lineBasicMaterial color="#FF9BB5" />
        </Edges>
      </mesh>
    </group>
  );
}

function Edges({ children }: { children: React.ReactNode }) {
  return (
    <lineSegments>
      <edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
      {children}
    </lineSegments>
  );
}

interface Dice3DProps {
  value: number | null;
  rolling: boolean;
  onRoll: () => void;
  disabled: boolean;
}

export default function Dice3D({ value, rolling, onRoll, disabled }: Dice3DProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-24 h-24">
        <Canvas camera={{ position: [0, 0, 3], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[5, 5, 5]} />
          <DiceModel value={value || 1} rolling={rolling} />
        </Canvas>
      </div>
      <motion.button
        whileHover={!disabled ? { scale: 1.1 } : {}}
        whileTap={!disabled ? { scale: 0.9 } : {}}
        onClick={onRoll}
        disabled={disabled}
        className={`px-6 py-3 bg-primary text-white font-bold rounded-button shadow-soft
          transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-pink-400'}`}
      >
        {rolling ? '🎲 Melempar...' : '🎲 Lempar Dadu!'}
      </motion.button>
    </div>
  );
}
```

> Note: Untuk Dice3D, kita pakai implementasi yang lebih sederhana (tanpa dot per face) untuk menghemat kompleksitas rendering. Animasi spin dadu via useFrame.

- [ ] **Step 2: Write GameBoard3D**

`frontend/src/components/games/snakes-ladders/GameBoard3D.tsx`:

```tsx
'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

interface PlayerState {
  id: string;
  position: number;
  color: string;
}

interface GameBoard3DProps {
  players: PlayerState[];
  snakes: [number, number][];
  ladders: [number, number][];
  currentTurn: number;
}

const TILE_COLORS = ['#FFD3B6', '#FF9BB5', '#A8D8EA', '#B5EAD7', '#FFDAC1'];
const GRID_SIZE = 10;
const TILE_SIZE = 0.9;
const GAP = 0.05;

function BoardTile({ index, color }: { index: number; color: string }) {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const x = (col - 4.5) * (TILE_SIZE + GAP);
  const z = (row - 4.5) * (TILE_SIZE + GAP);

  return (
    <mesh position={[x, 0, z]} receiveShadow>
      <boxGeometry args={[TILE_SIZE, 0.1, TILE_SIZE]} />
      <meshStandardMaterial color={color} />
      <Html position={[0, 0.2, 0]} center>
        <span className="text-[8px] font-bold text-gray-500 select-none">{index + 1}</span>
      </Html>
    </mesh>
  );
}

function PlayerPiece({ position, color }: { position: number; color: string }) {
  const row = Math.floor(position / GRID_SIZE);
  const col = position % GRID_SIZE;
  const x = (col - 4.5) * (TILE_SIZE + GAP);
  const z = (row - 4.5) * (TILE_SIZE + GAP);

  return (
    <group position={[x, 0.3, z]}>
      <mesh>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 0.08, 12]} />
        <meshStandardMaterial color="#4A4A4A" />
      </mesh>
    </group>
  );
}

function SnakeModel({ head, tail }: { head: number; tail: number }) {
  const headRow = Math.floor(head / GRID_SIZE);
  const headCol = head % GRID_SIZE;
  const tailRow = Math.floor(tail / GRID_SIZE);
  const tailCol = tail % GRID_SIZE;

  const hx = (headCol - 4.5) * (TILE_SIZE + GAP);
  const hz = (headRow - 4.5) * (TILE_SIZE + GAP);
  const tx = (tailCol - 4.5) * (TILE_SIZE + GAP);
  const tz = (tailRow - 4.5) * (TILE_SIZE + GAP);

  const midX = (hx + tx) / 2;
  const midZ = (hz + tz) / 2;
  const length = Math.sqrt((hx - tx) ** 2 + (hz - tz) ** 2);
  const angle = Math.atan2(hz - tz, hx - tx);

  return (
    <mesh position={[midX, 0.05, midZ]} rotation={[0, -angle, 0]}>
      <cylinderGeometry args={[0.06, 0.12, length, 6]} />
      <meshStandardMaterial color="#E74C3C" transparent opacity={0.6} />
    </mesh>
  );
}

function LadderModel({ bottom, top }: { bottom: number; top: number }) {
  const botRow = Math.floor(bottom / GRID_SIZE);
  const botCol = bottom % GRID_SIZE;
  const topRow = Math.floor(top / GRID_SIZE);
  const topCol = top % GRID_SIZE;

  const bx = (botCol - 4.5) * (TILE_SIZE + GAP);
  const bz = (botRow - 4.5) * (TILE_SIZE + GAP);
  const tx = (topCol - 4.5) * (TILE_SIZE + GAP);
  const tz = (topRow - 4.5) * (TILE_SIZE + GAP);

  const midX = (bx + tx) / 2;
  const midZ = (bz + tz) / 2;
  const length = Math.sqrt((bx - tx) ** 2 + (bz - tz) ** 2);
  const angle = Math.atan2(bz - tz, bx - tx);

  return (
    <mesh position={[midX, 0.05, midZ]} rotation={[0, -angle, 0]}>
      <boxGeometry args={[0.08, 0.08, length]} />
      <meshStandardMaterial color="#2ECC71" transparent opacity={0.7} />
    </mesh>
  );
}

function TurnIndicator({ currentTurn, playerIds, playerColors }: { currentTurn: number; playerIds: string[]; playerColors: string[] }) {
  const player = playerIds[currentTurn];
  const color = playerColors[currentTurn] || '#FF9BB5';

  return (
    <Html position={[0, 3, 0]} center>
      <div className="bg-white px-4 py-2 rounded-cute shadow-soft border-2 border-primary text-center">
        <p className="text-sm font-bold" style={{ color }}>Giliran pemain #{currentTurn + 1}</p>
      </div>
    </Html>
  );
}

export default function GameBoard3D({ players, snakes, ladders, currentTurn }: GameBoard3DProps) {
  return (
    <div className="w-full h-[500px] md:h-[600px] bg-gradient-to-b from-blue-50 to-pink-50 rounded-cute overflow-hidden">
      <Canvas camera={{ position: [8, 8, 8], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.5}
          target={[0, 0, 0]}
        />

        {/* Board */}
        {Array.from({ length: 100 }, (_, i) => (
          <BoardTile key={i} index={i} color={TILE_COLORS[Math.floor(i / 10) % TILE_COLORS.length]} />
        ))}

        {/* Snakes */}
        {snakes.map(([head, tail], i) => (
          <SnakeModel key={`s-${i}`} head={head} tail={tail} />
        ))}

        {/* Ladders */}
        {ladders.map(([bottom, top], i) => (
          <LadderModel key={`l-${i}`} bottom={bottom} top={top} />
        ))}

        {/* Player pieces */}
        {players.map((p) => (
          <PlayerPiece key={p.id} position={p.position} color={p.color} />
        ))}

        {/* Turn indicator */}
        <TurnIndicator
          currentTurn={currentTurn}
          playerIds={players.map(p => p.id)}
          playerColors={players.map(p => p.color)}
        />
      </Canvas>
    </div>
  );
}
```

- [ ] **Step 3: Write SnakesLaddersContainer (full interactive)**

`frontend/src/components/games/snakes-ladders/SnakesLaddersContainer.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import GameBoard3D from './GameBoard3D';
import Dice3D from './Dice3D';
import type { SnakesLaddersState, ServerToClientEvents, ClientToServerEvents } from '@/types';

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: SnakesLaddersState | null;
}

export default function SnakesLaddersContainer({ socket, state: initial }: Props) {
  const [gameState, setGameState] = useState<SnakesLaddersState | null>(initial);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState('');
  const myId = socket.id;

  useEffect(() => {
    if (!socket) return;

    const handleState = (state: unknown) => {
      setGameState(state as SnakesLaddersState);
      setRolling(false);
    };

    const handleAction = (data: unknown) => {
      const action = data as { type: string; message?: string };
      if (action.type === 'turn') {
        if (action.playerId === myId) {
          setMessage('Giliranmu! Lempar dadu! 🎲');
        } else {
          setMessage('Menunggu giliran pemain lain...');
        }
      }
    };

    socket.on('game:state', handleState);
    socket.on('game:action', handleAction);

    return () => {
      socket.off('game:state', handleState);
      socket.off('game:action', handleAction);
    };
  }, [socket, myId]);

  const rollDice = useCallback(() => {
    if (rolling) return;
    setRolling(true);
    setMessage('Melempar dadu...');
    socket.emit('game:action', { type: 'roll' });
  }, [socket, rolling]);

  const isMyTurn = gameState ? gameState.players[gameState.currentTurn]?.id === myId : false;
  const isGameOver = gameState?.winner != null;

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-cute-muted text-xl">Memuat papan...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score board */}
      <div className="flex justify-center gap-4 flex-wrap">
        {gameState.players.map((p, i) => (
          <div
            key={p.id}
            className={`px-4 py-2 rounded-cute border-2 transition-all ${
              i === gameState.currentTurn ? 'border-primary bg-pink-50 shadow-soft scale-105' : 'border-gray-100 bg-white'
            }`}
            style={{ borderColor: i === gameState.currentTurn ? p.color : undefined }}
          >
            <p className="font-bold text-sm" style={{ color: p.color }}>
              {p.id === myId ? 'Kamu' : `Pemain ${i + 1}`}
            </p>
            <p className="text-xs text-cute-muted">Tile: {p.position}</p>
          </div>
        ))}
      </div>

      {/* Message */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center text-lg font-bold text-cute-text bg-white py-2 px-4 rounded-cute shadow-soft"
          >
            {isGameOver ? `🎉 ${gameState.winner === myId ? 'Kamu Menang!' : 'Game Selesai!'}` : message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3D Board */}
      <GameBoard3D
        players={gameState.players.map(p => ({
          id: p.id,
          position: p.position,
          color: p.color,
        }))}
        snakes={gameState.snakes}
        ladders={gameState.ladders}
        currentTurn={gameState.currentTurn}
      />

      {/* Dice */}
      <div className="flex justify-center">
        <Dice3D
          value={gameState.diceValue}
          rolling={rolling}
          onRoll={rollDice}
          disabled={!isMyTurn || rolling || isGameOver}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Test build**

```bash
cd /c/Menza/Web\ Game/frontend
npx next build 2>&1 | tail -30
```

Expected: Build sukses. R3F bisa memakan waktu build lebih lama — normal.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: snakes & ladders 3D board with dice and gameplay UI"
```

---

### Task 9: Hangman — Co-op Word Guessing Game

**Files:**
- Create: `server/src/games/hangman.ts`
- Write: `frontend/src/components/games/hangman/HangmanContainer.tsx` (overwrite stub)
- Create: `frontend/src/components/games/hangman/HangmanDrawing.tsx`
- Modify: `server/src/index.ts` (register hangman engine)

**Interfaces:**
- Consumes: Task 6 (base game engine)
- Produces: Hangman cooperative game — all players guess letters together

- [ ] **Step 1: Write HangmanEngine**

`server/src/games/hangman.ts`:

```typescript
import { BaseGame, GameEvent } from './base';
import { GameType } from '../types';

interface HangmanState {
  word: string;
  category: string;
  guessedLetters: string[];
  correctLetters: (string | null)[];
  remainingAttempts: number;
  currentTurn: number;
  playerOrder: string[];
  winner: string | null;
}

const WORDS: Record<string, string[]> = {
  'Hewan': ['GAJAH', 'KUCING', 'KELINCI', 'SINGA', 'HARIMAU', 'BURUNG', 'IKAN', 'ULAR', 'KAMBING', 'SAPI'],
  'Buah': ['APEL', 'MANGGA', 'PISANG', 'JERUK', 'ANGGUR', 'SEMANGKA', 'NANAS', 'PEPAYA', 'DURIAN', 'RAMBUTAN'],
  'Negara': ['INDONESIA', 'MALAYSIA', 'JEPANG', 'KOREA', 'INGGRIS', 'PRANCIS', 'MESIR', 'AUSTRALIA', 'BRAZIL', 'THAILAND'],
};

const MAX_ATTEMPTS = 6;

export class HangmanEngine extends BaseGame {
  gameType: GameType = 'hangman';

  createInitialState(playerOrder: string[]): HangmanState {
    const categories = Object.keys(WORDS);
    const category = categories[Math.floor(Math.random() * categories.length)];
    const words = WORDS[category];
    const word = words[Math.floor(Math.random() * words.length)];

    return {
      word,
      category,
      guessedLetters: [],
      correctLetters: Array(word.length).fill(null),
      remainingAttempts: MAX_ATTEMPTS,
      currentTurn: 0,
      playerOrder,
      winner: null,
    };
  }

  handleAction(state: HangmanState, playerId: string, action: { type: string; payload?: unknown }): { newState: HangmanState; events: GameEvent[] } {
    const events: GameEvent[] = [];

    if (state.winner) return { newState: state, events: [] };

    if (action.type === 'guess') {
      const letter = (action.payload as { letter: string }).letter.toUpperCase();
      if (!letter || letter.length !== 1) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Tebak 1 huruf!' } }] };
      }
      if (state.guessedLetters.includes(letter)) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Huruf sudah ditebak!' } }] };
      }

      state.guessedLetters.push(letter);

      if (state.word.includes(letter)) {
        // Correct guess — reveal positions
        for (let i = 0; i < state.word.length; i++) {
          if (state.word[i] === letter) {
            state.correctLetters[i] = letter;
          }
        }
        events.push({ type: 'correctGuess', data: { letter, correctLetters: [...state.correctLetters] } });

        // Check win
        if (state.correctLetters.every(l => l !== null)) {
          state.winner = playerId;
          events.push({ type: 'gameOver', data: { winnerId: playerId } });
          return { newState: { ...state }, events };
        }
      } else {
        // Wrong guess
        state.remainingAttempts--;
        events.push({ type: 'wrongGuess', data: { letter, remainingAttempts: state.remainingAttempts } });

        if (state.remainingAttempts <= 0) {
          state.winner = 'none'; // all lose
          events.push({ type: 'gameOver', data: { winnerId: 'none', word: state.word } });
          return { newState: { ...state }, events };
        }
      }

      // Next turn
      state.currentTurn = (state.currentTurn + 1) % state.playerOrder.length;
      events.push({ type: 'turnChange', data: { nextPlayerId: state.playerOrder[state.currentTurn] } });
    }

    return { newState: { ...state }, events };
  }
}
```

- [ ] **Step 2: Register engine in server**

Edit `server/src/index.ts` — tambahkan di array engines:

```typescript
import { HangmanEngine } from './games/hangman';

const engines: Record<string, BaseGame> = {
  'snakes-ladders': new SnakesLaddersEngine(),
  'hangman': new HangmanEngine(),
};
```

- [ ] **Step 3: Write HangmanDrawing**

`frontend/src/components/games/hangman/HangmanDrawing.tsx`:

```tsx
'use client';

interface HangmanDrawingProps {
  attemptsLeft: number;
  maxAttempts: number;
}

const STAGES = 6;

export default function HangmanDrawing({ attemptsLeft, maxAttempts }: HangmanDrawingProps) {
  const wrongCount = maxAttempts - attemptsLeft;

  return (
    <svg viewBox="0 0 200 250" className="w-48 h-60">
      {/* Base */}
      <line x1="20" y1="230" x2="180" y2="230" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />
      <line x1="60" y1="230" x2="60" y2="20" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />
      <line x1="55" y1="20" x2="140" y2="20" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />
      <line x1="140" y1="20" x2="140" y2="50" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />

      {/* Head */}
      {wrongCount >= 1 && <circle cx="140" cy="70" r="20" fill="none" stroke="#4A4A4A" strokeWidth="4" />}

      {/* Body */}
      {wrongCount >= 2 && <line x1="140" y1="90" x2="140" y2="150" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />}

      {/* Left arm */}
      {wrongCount >= 3 && <line x1="140" y1="105" x2="110" y2="130" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />}

      {/* Right arm */}
      {wrongCount >= 4 && <line x1="140" y1="105" x2="170" y2="130" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />}

      {/* Left leg */}
      {wrongCount >= 5 && <line x1="140" y1="150" x2="110" y2="190" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />}

      {/* Right leg */}
      {wrongCount >= 6 && <line x1="140" y1="150" x2="170" y2="190" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />}
    </svg>
  );
}
```

- [ ] **Step 4: Write HangmanContainer**

`frontend/src/components/games/hangman/HangmanContainer.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import HangmanDrawing from './HangmanDrawing';
import type { HangmanState, ServerToClientEvents, ClientToServerEvents } from '@/types';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: HangmanState | null;
}

export default function HangmanContainer({ socket, state: initial }: Props) {
  const [gameState, setGameState] = useState<HangmanState | null>(initial);
  const [message, setMessage] = useState('');
  const [guessedLetters, setGuessedLetters] = useState<string[]>([]);
  const myId = socket.id;

  useEffect(() => {
    if (!socket) return;

    const handleState = (state: unknown) => {
      const s = state as HangmanState;
      setGameState(s);
      setGuessedLetters(s.guessedLetters || []);
    };

    socket.on('game:state', handleState);

    return () => { socket.off('game:state', handleState); };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleAction = (data: unknown) => {
      const action = data as { type: string; nextPlayerId?: string; message?: string };
      if (action.type === 'turn') {
        if (action.nextPlayerId === myId) {
          setMessage('Giliranmu! Tebak satu huruf 🔤');
        } else {
          setMessage('Giliran pemain lain...');
        }
      }
    };

    socket.on('game:action', handleAction);
    return () => { socket.off('game:action', handleAction); };
  }, [socket, myId]);

  const guessLetter = useCallback((letter: string) => {
    if (!gameState) return;
    if (guessedLetters.includes(letter)) return;

    socket.emit('game:action', { type: 'guess', payload: { letter } });
  }, [socket, gameState, guessedLetters]);

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-cute-muted text-xl">Memuat game...</p>
      </div>
    );
  }

  const isMyTurn = gameState.playerOrder[gameState.currentTurn] === myId;
  const isOver = gameState.winner != null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Message */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-lg font-bold text-cute-text"
        >
          {isOver
            ? gameState.winner === 'none'
              ? `😵 Game Over! Kata: ${gameState.word}`
              : '🎉 Selamat! Kata berhasil ditebak!'
            : message}
        </motion.div>
      </AnimatePresence>

      {/* Category */}
      <div className="text-center">
        <span className="bg-secondary text-white px-4 py-1 rounded-full text-sm font-bold">
          {gameState.category}
        </span>
      </div>

      {/* Drawing + Word */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-8">
        <HangmanDrawing
          attemptsLeft={gameState.remainingAttempts}
          maxAttempts={6}
        />

        <div>
          {/* Word display */}
          <div className="flex gap-2 flex-wrap justify-center mb-4">
            {gameState.correctLetters.map((letter, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-10 h-12 border-b-4 border-primary flex items-center justify-center"
              >
                <span className="text-2xl font-bold text-cute-text">
                  {letter || ''}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Attempts info */}
          <p className="text-center text-cute-muted text-sm">
            Sisa percobaan: {gameState.remainingAttempts} / 6
          </p>
        </div>
      </div>

      {/* Keyboard */}
      <div className="flex flex-wrap justify-center gap-1.5 max-w-md mx-auto">
        {ALPHABET.map((letter) => {
          const guessed = guessedLetters.includes(letter);
          return (
            <motion.button
              key={letter}
              whileHover={!guessed && isMyTurn && !isOver ? { scale: 1.15 } : {}}
              whileTap={!guessed && isMyTurn && !isOver ? { scale: 0.9 } : {}}
              onClick={() => guessLetter(letter)}
              disabled={guessed || !isMyTurn || isOver}
              className={`w-9 h-9 rounded-lg font-bold text-sm transition-all ${
                guessed
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  : isMyTurn && !isOver
                    ? 'bg-white border-2 border-primary text-cute-text hover:bg-primary hover:text-white shadow-soft cursor-pointer'
                    : 'bg-gray-50 text-gray-300 cursor-not-allowed'
              }`}
            >
              {letter}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: hangman co-op game with drawing and letter keyboard"
```

---

### Task 10: Sea Battle — 2 Player Ship Battle Game

**Files:**
- Create: `server/src/games/sea-battle.ts`
- Write: `frontend/src/components/games/sea-battle/SeaBattleContainer.tsx` (overwrite stub)
- Create: `frontend/src/components/games/sea-battle/Grid.tsx`
- Create: `frontend/src/components/games/sea-battle/ShipPlacement.tsx`
- Modify: `server/src/index.ts` (register engine)

**Interfaces:**
- Consumes: Task 6 (base game engine)
- Produces: Sea battle 1v1 with grid, ship placement, firing

- [ ] **Step 1: Write SeaBattleEngine**

`server/src/games/sea-battle.ts`:

```typescript
import { BaseGame, GameEvent } from './base';
import { GameType } from '../types';

interface Ship {
  type: string;
  cells: [number, number][]; // [row, col]
  hits: number;
}

interface SeaBattleState {
  player1Id: string;
  player2Id: string;
  // Each player's grid: 10x10, ' ': empty, 'S': ship, 'H': hit, 'M': miss
  grid1: string[][];
  grid2: string[][];
  ships1: Ship[];
  ships2: Ship[];
  phase: 'setup' | 'playing' | 'finished';
  currentTurn: string; // player id
  winner: string | null;
}

function createEmptyGrid(): string[][] {
  return Array.from({ length: 10 }, () => Array(10).fill(' '));
}

function generateAutoPlacement(): { grid: string[][]; ships: Ship[] } {
  const grid = createEmptyGrid();
  const ships: Ship[] = [];
  const shipSizes = [4, 3, 3, 2, 1]; // Battleship, Cruiser, Cruiser, Destroyer, Submarine

  for (const size of shipSizes) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 100) {
      const row = Math.floor(Math.random() * 10);
      const col = Math.floor(Math.random() * 10);
      const horizontal = Math.random() > 0.5;

      if (horizontal && col + size > 10) continue;
      if (!horizontal && row + size > 10) continue;

      let canPlace = true;
      const cells: [number, number][] = [];
      for (let i = 0; i < size; i++) {
        const r = horizontal ? row : row + i;
        const c = horizontal ? col + i : col;
        if (grid[r][c] !== ' ') { canPlace = false; break; }
        // Check adjacent cells
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10 && grid[nr][nc] !== ' ') {
              canPlace = false;
            }
          }
        }
        cells.push([r, c]);
      }

      if (canPlace) {
        for (const [r, c] of cells) grid[r][c] = 'S';
        const shipTypes: Record<number, string> = { 4: 'Battleship', 3: 'Cruiser', 2: 'Destroyer', 1: 'Submarine' };
        ships.push({ type: shipTypes[size] || 'Ship', cells, hits: 0 });
        placed = true;
      }
      attempts++;
    }
  }

  return { grid, ships };
}

export class SeaBattleEngine extends BaseGame {
  gameType: GameType = 'sea-battle';

  createInitialState(playerOrder: string[]): SeaBattleState {
    return {
      player1Id: playerOrder[0],
      player2Id: playerOrder[1],
      grid1: createEmptyGrid(),
      grid2: createEmptyGrid(),
      ships1: [],
      ships2: [],
      phase: 'setup',
      currentTurn: playerOrder[0],
      winner: null,
    };
  }

  handleAction(state: SeaBattleState, playerId: string, action: { type: string; payload?: unknown }): { newState: SeaBattleState; events: GameEvent[] } {
    const events: GameEvent[] = [];

    if (action.type === 'autoPlace') {
      if (playerId === state.player1Id && state.ships1.length === 0) {
        const { grid, ships } = generateAutoPlacement();
        state.grid1 = grid;
        state.ships1 = ships;
        events.push({ type: 'shipsPlaced', data: { playerId } });
      } else if (playerId === state.player2Id && state.ships2.length === 0) {
        const { grid, ships } = generateAutoPlacement();
        state.grid2 = grid;
        state.ships2 = ships;
        events.push({ type: 'shipsPlaced', data: { playerId } });
      }

      // Check if both placed
      if (state.ships1.length > 0 && state.ships2.length > 0) {
        state.phase = 'playing';
        events.push({ type: 'gameStart', data: { firstTurn: state.currentTurn } });
      }

      return { newState: { ...state }, events };
    }

    if (action.type === 'fire') {
      if (playerId !== state.currentTurn) {
        return { newState: state, events: [{ type: 'error', data: { message: 'Bukan giliranmu!' } }] };
      }

      const { row, col } = action.payload as { row: number; col: number };
      const targetGrid = playerId === state.player1Id ? 'grid2' : 'grid1';
      const targetShips = playerId === state.player1Id ? 'ships2' : 'ships1';

      // Check if already fired there
      if (state[targetGrid][row][col] !== ' ' && state[targetGrid][row][col] !== 'S') {
        return { newState: state, events: [{ type: 'error', data: { message: 'Sudah ditembak!' } }] };
      }

      let hit = false;
      let sunkShip: string | null = null;

      if (state[targetGrid][row][col] === 'S') {
        // Hit!
        state[targetGrid][row][col] = 'H';
        hit = true;

        // Check if ship sunk
        for (const ship of state[targetShips]) {
          if (ship.cells.some(([r, c]) => r === row && c === col)) {
            ship.hits++;
            if (ship.hits === ship.cells.length) {
              sunkShip = ship.type;
            }
            break;
          }
        }
      } else {
        state[targetGrid][row][col] = 'M';
      }

      events.push({
        type: 'fireResult',
        data: {
          playerId,
          row,
          col,
          hit,
          sunkShip,
        },
      });

      // Check win: all ships sunk
      const allSunk = state[targetShips].every(ship => ship.hits >= ship.cells.length);
      if (allSunk) {
        state.winner = playerId;
        state.phase = 'finished';
        events.push({ type: 'gameOver', data: { winnerId: playerId } });
      } else {
        // Switch turn
        state.currentTurn = playerId === state.player1Id ? state.player2Id : state.player1Id;
        events.push({ type: 'turnChange', data: { nextPlayerId: state.currentTurn } });
      }
    }

    return { newState: { ...state }, events };
  }
}
```

- [ ] **Step 2: Register SeaBattleEngine**

Edit `server/src/index.ts` — tambahkan:

```typescript
import { SeaBattleEngine } from './games/sea-battle';

const engines: Record<string, BaseGame> = {
  'snakes-ladders': new SnakesLaddersEngine(),
  'hangman': new HangmanEngine(),
  'sea-battle': new SeaBattleEngine(),
};
```

- [ ] **Step 3: Write Grid component**

`frontend/src/components/games/sea-battle/Grid.tsx`:

```tsx
'use client';

interface GridProps {
  grid: string[][];
  isOwn: boolean;
  showShips: boolean;
  onCellClick?: (row: number, col: number) => void;
  lastShot?: { row: number; col: number } | null;
  disabled?: boolean;
}

export default function Grid({ grid, isOwn, showShips, onCellClick, lastShot, disabled }: GridProps) {
  const cellColor = (val: string, r: number, c: number) => {
    if (val === 'S' && showShips) return 'bg-accent';
    if (val === 'H') return 'bg-red-400';
    if (val === 'M') return 'bg-gray-200';
    if (lastShot?.row === r && lastShot?.col === c) return 'ring-2 ring-primary';
    return 'bg-white hover:bg-pink-50';
  };

  const cellIcon = (val: string) => {
    if (val === 'H') return '🔥';
    if (val === 'M') return '💨';
    if (val === 'S' && showShips) return '🛳️';
    return '';
  };

  return (
    <div className="inline-block border-2 border-gray-200 rounded-cute overflow-hidden">
      {/* Column headers */}
      <div className="flex">
        <div className="w-8 h-8 flex items-center justify-center text-xs font-bold text-cute-muted" />
        {'ABCDEFGHIJ'.split('').map((l, i) => (
          <div key={i} className="w-8 h-8 flex items-center justify-center text-xs font-bold text-cute-muted">
            {l}
          </div>
        ))}
      </div>
      {grid.map((row, r) => (
        <div key={r} className="flex">
          <div className="w-8 h-8 flex items-center justify-center text-xs font-bold text-cute-muted">
            {r + 1}
          </div>
          {row.map((cell, c) => (
            <button
              key={c}
              onClick={() => onCellClick?.(r, c)}
              disabled={disabled || cell === 'H' || cell === 'M'}
              className={`w-8 h-8 border border-gray-100 flex items-center justify-center text-xs transition-all
                ${cellColor(cell, r, c)}
                ${disabled || !onCellClick ? '' : 'cursor-pointer hover:scale-110'}
                ${!disabled && onCellClick ? 'hover:shadow-soft' : ''}
              `}
            >
              {cellIcon(cell)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write SeaBattleContainer**

`frontend/src/components/games/sea-battle/SeaBattleContainer.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import Grid from './Grid';
import Button from '@/components/ui/Button';
import type { SeaBattleState, ServerToClientEvents, ClientToServerEvents } from '@/types';

interface OwnView {
  grid: string[][];
  hits: number;
}

interface EnemyView {
  grid: string[][];  // only 'H', 'M', or ' ' visible
}

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: SeaBattleState | null;
}

export default function SeaBattleContainer({ socket, state: initial }: Props) {
  const [gameState, setGameState] = useState<SeaBattleState | null>(initial);
  const [myGrid, setMyGrid] = useState<string[][]>([]);
  const [enemyGrid, setEnemyGrid] = useState<string[][]>([]);
  const [message, setMessage] = useState('');
  const [lastShot, setLastShot] = useState<{ row: number; col: number } | null>(null);
  const myId = socket.id;

  useEffect(() => {
    if (!socket) return;

    const handleState = (state: unknown) => {
      const s = state as SeaBattleState;
      setGameState(s);

      if (myId === s.player1Id) {
        setMyGrid(s.grid1);
        setEnemyGrid(getEnemyView(s.grid2));
      } else {
        setMyGrid(s.grid2);
        setEnemyGrid(getEnemyView(s.grid1));
      }
    };

    socket.on('game:state', handleState);

    return () => { socket.off('game:state', handleState); };
  }, [socket, myId]);

  useEffect(() => {
    if (!socket) return;

    const handleAction = (data: unknown) => {
      const action = data as { type: string; nextPlayerId?: string; playerId?: string; row?: number; col?: number; hit?: boolean };
      if (action.type === 'fireResult') {
        setLastShot({ row: action.row!, col: action.col! });
        setMessage(action.hit ? '🔥 Tembakan kena!' : '💨 Meleset!');
        setTimeout(() => setLastShot(null), 1500);
      }
      if (action.type === 'turn') {
        if (action.nextPlayerId === myId) {
          setMessage('Giliranmu! Pilih target 🎯');
        } else {
          setMessage('Menunggu giliran...');
        }
      }
      if (action.type === 'gameStart') {
        setMessage('Game dimulai! Giliran pertama!');
      }
    };

    socket.on('game:action', handleAction);
    return () => { socket.off('game:action', handleAction); };
  }, [socket, myId]);

  const autoPlace = useCallback(() => {
    socket.emit('game:action', { type: 'autoPlace' });
    setMessage('Menempatkan kapal...');
  }, [socket]);

  const fire = useCallback((row: number, col: number) => {
    if (!gameState || gameState.phase !== 'playing') return;
    if (enemyGrid[row][col] !== ' ') return; // already fired
    socket.emit('game:action', { type: 'fire', payload: { row, col } });
  }, [socket, gameState, enemyGrid]);

  if (!gameState) {
    return <div className="text-center p-8 text-cute-muted">Memuat game...</div>;
  }

  const isMyTurn = gameState.currentTurn === myId;
  const isSetup = gameState.phase === 'setup';
  const myShipsPlaced = myId === gameState.player1Id ? gameState.ships1.length > 0 : gameState.ships2.length > 0;
  const isOver = gameState.phase === 'finished';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-lg font-bold"
        >
          {isOver
            ? gameState.winner === myId
              ? '🎉 Kamu Menang! Semua kapal lawan tenggelam!'
              : '😵 Kamu Kalah...'
            : message}
        </motion.div>
      </AnimatePresence>

      {isSetup && (
        <div className="text-center">
          <Button onClick={autoPlace} disabled={myShipsPlaced}>
            {myShipsPlaced ? '✅ Kapal sudah ditempatkan' : '🚢 Tempatkan Kapal (Auto)'}
          </Button>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-8 justify-center">
        <div className="text-center">
          <h3 className="font-bold text-cute-text mb-2">⭐ Papanmu</h3>
          <Grid grid={myGrid} isOwn={true} showShips={true} disabled={true} />
          <p className="text-xs text-cute-muted mt-1">
            Kapal: {myId === gameState.player1Id ? countShips(gameState.ships1) : countShips(gameState.ships2)}
          </p>
        </div>

        <div className="text-center">
          <h3 className="font-bold text-cute-text mb-2">🎯 Lawan</h3>
          <Grid
            grid={enemyGrid}
            isOwn={false}
            showShips={false}
            onCellClick={isMyTurn && !isSetup ? fire : undefined}
            lastShot={lastShot}
            disabled={!isMyTurn || isSetup || isOver}
          />
          <p className="text-xs text-cute-muted mt-1">
            {isMyTurn && !isSetup && 'Klik grid untuk menembak!'}
          </p>
        </div>
      </div>
    </div>
  );
}

function getEnemyView(grid: string[][]): string[][] {
  return grid.map(row => row.map(cell => {
    if (cell === 'H') return 'H';
    if (cell === 'M') return 'M';
    return ' ';
  }));
}

function countShips(ships: { type: string }[]): string {
  return ships.map(s => s.type).join(', ') || 'Belum ada';
}
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: sea battle game with grid and auto ship placement"
```

---

### Task 11: Polish — Game End, Reset, Back to Lobby

**Files:**
- Modify: `frontend/src/app/room/[pin]/page.tsx` (add game over UI, restart flow)
- Modify: `server/src/index.ts` (add game cleanup on disconnect, handle game reset)

**Interfaces:**
- Consumes: Tasks 5 (room page) and 6 (game start)
- Produces: Complete game lifecycle — end game, play again, back to lobby

- [ ] **Step 1: Add game over modal to room page**

Edit `frontend/src/app/room/[pin]/page.tsx` — tambahkan state untuk game over dan modal:

Tambahkan state baru setelah `const [gameActive, setGameActive] = useState(false);`:

```typescript
const [gameWinner, setGameWinner] = useState<{ id: string; name: string } | null>(null);
```

Update handler `game:over`:

```typescript
socket.on('game:over', (data) => {
  setGameWinner(data);
  setGameActive(true); // tetap di game view
});
```

Tambahkan di dalam render (sebelum closing div):

```tsx
{gameWinner && (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="bg-white p-8 rounded-cute shadow-soft text-center max-w-sm mx-4"
    >
      <p className="text-5xl mb-4">{gameWinner.id === myId ? '🎉' : '🙌'}</p>
      <h2 className="text-2xl font-bold text-cute-text mb-2">
        {gameWinner.id === myId ? 'Kamu Menang!' : `${gameWinner.name} Menang!`}
      </h2>
      <p className="text-cute-muted mb-6">Game selesai!</p>
      <div className="space-y-3">
        <Button onClick={() => { setGameWinner(null); setGameActive(false); }} className="w-full">
          🔄 Kembali ke Lobby
        </Button>
        <Button variant="ghost" onClick={leaveRoom} className="w-full">
          🚪 Keluar Ruang
        </Button>
      </div>
    </motion.div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat: game over modal with play again option"
```

---

### Task 12: Deploy — Vercel + Render Configuration

**Files:**
- Create: `server/Dockerfile` (untuk Render)
- Create: `render.yaml` (opsional, Render blueprints)
- Modify: `frontend/next.config.js` (output standalone)
- Modify: `server/src/index.ts` (read CORS from env)

**Interfaces:**
- Consumes: All previous tasks
- Produces: Deployed game on Vercel + Render

- [ ] **Step 1: Write server Dockerfile for Render**

`server/Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Write render.yaml**

`render.yaml`:

```yaml
services:
  - type: web
    name: gameville-server
    env: node
    buildCommand: cd server && npm install && npm run build
    startCommand: cd server && npm start
    envVars:
      - key: PORT
        value: 3001
      - key: CORS_ORIGIN
        value: https://gameville.vercel.app
    healthCheckPath: /health
```

- [ ] **Step 3: Update next.config.js for Vercel**

`frontend/next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001',
  },
};

module.exports = nextConfig;
```

- [ ] **Step 4: Ensure CORS_ORIGIN env variable for production**

`server/src/index.ts` sudah handle `process.env.CORS_ORIGIN` — pastikan formatnya benar:

```typescript
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: corsOrigin.split(',').map(s => s.trim()) }));
io.setOrigins(corsOrigin.split(',').map(s => s.trim()));
```

- [ ] **Step 5: Create README**

`README.md`:

```markdown
# 🎮 GameVille

Platform multiplayer web game buat main bareng teman!

## Games
- 🐍 **Ular Tangga** — 2-4 pemain, papan 3D isometric
- 💀 **Hangman** — 2-4 pemain, tebak kata bareng
- ⚓ **Sea Battle** — 2 pemain, perang kapal

## Tech Stack
- **Frontend:** Next.js 14, TypeScript, Tailwind, Three.js (R3F), Socket.io
- **Backend:** Express, Socket.io, TypeScript
- **Hosting:** Vercel (FE) + Render (BE)

## Local Development
```bash
# Server
cd server
npm install
npm run dev

# Frontend (terminal baru)
cd frontend
npm install
npm run dev
```

Buka http://localhost:3000
```

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: deployment config — Vercel + Render + Docker + README"
```

---

## Self-Review Checklist

- [ ] Semua bagian spec tercakup: user flow (create room, join, lobby, chat, reaksi, 3 game), arsitektur, data schema, socket events, tema visual
- [ ] Tidak ada placeholder/TODO dalam kode
- [ ] Type signatures konsisten antar task (`GameType`, `Room`, `Player`, dll)
- [ ] Server authoritative: game logic di server, client hanya kirim action
- [ ] CORS dan env variables sudah dikonfigurasi untuk production
- [ ] Semua game punya error state handling (loading, bukan giliran, invalid action)

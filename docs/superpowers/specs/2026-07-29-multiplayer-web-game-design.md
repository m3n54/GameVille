# GameVille — Multiplayer Web Game Platform

**Tanggal:** 2026-07-29
**Versi:** 1.0
**Status:** Draft

---

## 1. Ringkasan

Platform multiplayer web game realtime berbasis browser untuk 2–4 pemain dengan estetika visual cute, colorful, dan semi-3D (isometric). Pemain dapat membuat ruang bermain private, mengundang teman via kode 6 digit, dan memainkan game-game papan/game sederhana secara bergiliran.

---

## 2. Tech Stack

| Lapisan | Teknologi | Alasan |
|---------|-----------|--------|
| Frontend | Next.js 14 (App Router) | Server rendering, zero-config Vercel deploy |
| Styling | Tailwind CSS + custom pastel theme | Cepat, kustomisasi tinggi |
| Animasi | Framer Motion | Spring physics untuk efek bouncy |
| 3D Rendering | @react-three/fiber + @react-three/drei | Three.js wrapper React-friendly |
| Realtime | Socket.io-client (WebSocket) | Mature, fallback polling, turn-based cukup |
| Backend | Node.js + Express + Socket.io | Ringan, muat di free hosting |
| Bahasa | TypeScript (FE + BE) | Type safety, shared types |
| Hosting FE | Vercel (Free Hobby) | 100GB bandwidth, auto-deploy dari GitHub |
| Hosting BE | Render Free (alternatif: Koyeb/Fly.io) | 512MB RAM, cukup untuk turn-based game |
| Version Control | GitHub | Gratis, integrasi Vercel |

---

## 3. Arsitektur Sistem

```
┌─────────────────────────────────────────────┐
│              Vercel (Free)                   │
│  ┌───────────────────────────────────────┐  │
│  │  Next.js App (frontend/)              │  │
│  │                                       │  │
│  │  / → Landing Page + Buat/Join Room    │  │
│  │  /room/[pin] → Room Lobby + Game View │  │
│  │                                       │  │
│  │  Pages: Server Components (SEO)       │  │
│  │  Game Lobby: Client Component         │  │
│  │  Game View: Client + @react-three/fiber│  │
│  └──────────────────┬────────────────────┘  │
└─────────────────────┬───────────────────────┘
                      │ HTTP (initial load)
                      │ WebSocket (Socket.io)
                      ▼
┌─────────────────────────────────────────────┐
│        Render / Koyeb (Free)                │
│  ┌───────────────────────────────────────┐  │
│  │  Express + Socket.io Server (server/) │  │
│  │                                       │  │
│  │  ┌─────────────┐  ┌───────────────┐  │  │
│  │  │ RoomManager  │  │ GameEngine    │  │  │
│  │  │ - create     │  │ - snakesLadders│  │
│  │  │ - join/leave │  │ - hangman     │  │
│  │  │ - state mgmt │  │ - seaBattle   │  │
│  │  └─────────────┘  └───────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Prinsip Arsitektur:**
- **Authoritative Server:** Semua logika game dijalankan di server (random number, validasi giliran, aturan game). Client hanya menampilkan state dan mengirim aksi.
- **Stateless Frontend:** Frontend hanya render dari state yang dikirim server. Tidak ada logika game di client.
- **No Database (MVP):** Room & game state di memory server. Cukup untuk private room.

---

## 4. Struktur Folder

```
web-game/
├── frontend/                    ← Next.js app
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx       ← Root layout + providers
│   │   │   ├── page.tsx         ← Landing page (Buat/Join room)
│   │   │   └── room/
│   │   │       └── [pin]/
│   │   │           └── page.tsx ← Room lobby + game
│   │   │       └── [pin]/
│   │   │           └── page.tsx ← Room lobby + game
│   │   ├── components/
│   │   │   ├── ui/              ← Button, Input, Modal, Card
│   │   │   ├── lobby/           ← CreateRoom, JoinRoom
│   │   │   ├── room/            ← PlayerList, Chat, EmojiReactions
│   │   │   └── games/
│   │   │       ├── snakes-ladders/
│   │   │       │   ├── GameBoard3D.tsx
│   │   │       │   ├── Dice3D.tsx
│   │   │       │   ├── Piece3D.tsx
│   │   │       │   └── SnakesLaddersScene.tsx
│   │   │       ├── hangman/
│   │   │       │   └── HangmanGame.tsx
│   │   │       └── sea-battle/
│   │   │           └── SeaBattleGame.tsx
│   │   ├── hooks/
│   │   │   ├── useSocket.ts
│   │   │   ├── useRoom.ts
│   │   │   └── useGame.ts
│   │   ├── lib/
│   │   │   └── socket.ts
│   │   └── styles/
│   │       └── globals.css
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── server/                      ← Express + Socket.io
│   ├── src/
│   │   ├── index.ts             ← Entry point
│   │   ├── rooms.ts             ← RoomManager class
│   │   ├── games/
│   │   │   ├── base.ts          ← BaseGame abstract class
│   │   │   ├── snakes-ladders.ts
│   │   │   ├── hangman.ts
│   │   │   └── sea-battle.ts
│   │   └── types.ts
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                      ← Shared types
│   └── types.ts
│
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-07-29-multiplayer-web-game-design.md
├── .gitignore
└── README.md
```

---

## 5. Skema Data

### 5.1 Room & Player

```typescript
interface Room {
  id: string;                    // UUID
  pin: string;                   // 6-digit: "384729"
  name: string;                  // "Malam Seru Bareng"
  gameType: GameType | null;
  hostId: string;
  players: Player[];
  state: 'waiting' | 'playing' | 'finished';
  createdAt: number;
}

interface Player {
  id: string;                    // socket.id
  nickname: string;
  color: string;                 // "#FFB5C2"
  emoji: string;                 // "🦊"
  isHost: boolean;
  isReady: boolean;
  joinedAt: number;
}

type GameType = 'snakes-ladders' | 'hangman' | 'sea-battle';
```

### 5.2 Game State — Ular Tangga

```typescript
interface SnakesLaddersState {
  board: { tileCount: number };          // 100 tiles
  players: {
    id: string;
    position: number;                     // 0–99
    color: string;
  }[];
  currentTurn: number;                    // index pemain
  diceValue: number | null;
  phase: 'rolling' | 'moving' | 'animating' | 'done';
  snakes: [number, number][];            // [[head, tail], ...]
  ladders: [number, number][];           // [[bottom, top], ...]
  winner: string | null;
}
```

### 5.3 Game State — Hangman

```typescript
interface HangmanState {
  category: string;                       // "Hewan"
  wordLength: number;
  guessedLetters: string[];               // huruf yang sudah ditebak
  correctLetters: (string | null)[];      // posisi benar: ["a", null, "d", ...]
  remainingAttempts: number;              // max 6
  currentTurn: number;
  winner: string | null;
}
```

### 5.4 Game State — Sea Battle

```typescript
interface SeaBattleState {
  player1Id: string;
  player2Id: string;
  // Masing-masing lihat grid sendiri (yang dikirim server terbatas)
  currentTurn: string;                    // player id
  phase: 'setup' | 'playing' | 'finished';
  // Ships & grid disimpan di server, hanya view yang dikirim
  winner: string | null;
}
// Catatan: grid lawan disembunyikan — hanya tampil "hit" atau "miss"
```

---

## 6. Socket.io Events

### 6.1 Room Events

| Event | Arah | Payload | Deskripsi |
|-------|------|---------|-----------|
| `room:create` | C→S | `{ name, nickname, color, emoji }` | Buat room |
| `room:created` | S→C | `{ room }` | Return room + pin |
| `room:join` | C→S | `{ pin, nickname, color, emoji }` | Join via PIN |
| `room:joined` | S→C | `{ room }` | Ke player yg join |
| `player:entered` | S→C | `{ player }` | Broadcast ke room |
| `room:leave` | C→S | `{}` | Keluar room |
| `player:left` | S→C | `{ playerId }` | Broadcast |
| `player:ready` | C→S | `{ ready: boolean }` | Toggle ready |
| `player:update` | S→C | `{ players }` | Broadcast state |
| `game:select` | C→S | `{ gameType }` | Host pilih game |
| `game:start` | C→S | `{}` | Host mulai game |
| `room:error` | S→C | `{ message }` | Error |

### 6.2 Game Events — Ular Tangga

| Event | Arah | Payload | Deskripsi |
|-------|------|---------|-----------|
| `game:state` | S→C | `{ players, currentTurn, diceValue, phase, ... }` | Full state |
| `game:action` | C→S | `{ type: 'roll' }` | Lempar dadu |
| `game:diceResult` | S→C | `{ playerId, value, newPosition, snakeHit?, ladderHit? }` | Hasil dadu |
| `game:turnChange` | S→C | `{ nextPlayerId }` | Ganti giliran |
| `game:over` | S→C | `{ winnerId, winnerName }` | Game selesai |

### 6.3 Chat & Reaksi

| Event | Arah | Payload | Deskripsi |
|-------|------|---------|-----------|
| `chat:message` | C→S | `{ text }` | Kirim chat |
| `chat:received` | S→C | `{ playerId, nickname, text }` | Chat masuk |
| `reaction:send` | C→S | `{ emoji }` | Kirim reaksi |
| `reaction:received` | S→C | `{ playerId, nickname, emoji, timestamp }` | Reaksi floating |

---

## 7. Tema Visual & UI

### 7.1 Warna

```css
--color-primary: #FF9BB5;    /* Pink pastel */
--color-secondary: #A8D8EA;  /* Biru pastel */
--color-accent: #FFD3B6;     /* Peach */
--color-success: #B5EAD7;    /* Hijau mint */
--color-warning: #FFDAC1;    /* Kuning pastel */
--color-bg: #FFF5F7;         /* Putih pink */
--color-surface: #FFFFFF;    /* Putih */
--color-text: #4A4A4A;       /* Abu gelap hangat */
--color-text-muted: #9CA3AF;
```

### 7.2 Font & Border

- **Font**: `'Nunito', sans-serif` — rounded, playful
- **Border-radius**: 16px (card), 24px (button), 12px (input)
- **Shadow**: `0 4px 14px rgba(0,0,0,0.08)` soft shadow

### 7.3 Animasi (Framer Motion)

- Tombol: bouncy spring `{ type: 'spring', stiffness: 300, damping: 10 }`
- Modal / Panel: slide up + fade
- Player join: pop-in scale
- Emoji reaksi: float up + fade out
- Dadu 3D: rotate animation
- Pion bergerak: lerp/interpolasi posisi di tile

### 7.4 Alur Halaman

```
Landing Page
├── Hero section dengan ilustrasi game
├── Tombol "Buat Ruang Baru" → generate PIN + masuk lobby
├── Input "Masuk Kode Ruang" + tombol "Gabung" → validasi PIN → lobby
│
Room Lobby (/room/[pin])
├── Header: Room PIN + tombol copy (bagikan ke teman)
├── Player Cards: avatar emoji, nickname, color, status ready
├── Game Selector dropdown (host only)
├── Start Game button (host only, semua harus ready)
├── Sidebar Chat
│
Game View (dalam room yang sama)
├── Ular Tangga → 3D board (R3F) + dadu 3D + pion
├── Hangman → UI 2D interaktif + keyboard huruf
├── Sea Battle → Grid 2D + kapal
├── Chat tetap tersedia di samping
└── Back to Lobby button
```

---

## 8. Game Logic Detail

### 8.1 Ular Tangga

- Papan 10×10, tile 0–99
- Ular & tangga tetap (hardcoded, bisa variasi per game)
- Pemain lempar dadu → server generate → pion maju
- Jika posisi = kepala ular → turun ke ekor
- Jika posisi = kaki tangga → naik ke atas
- Giliran otomatis berganti setelah animasi selesai
- Menang jika posisi ≥ 99 (tepat atau lebih)

### 8.2 Hangman

- **Mode: Cooperative** — semua pemain bersama-sama nebak kata. Setiap giliran, satu pemain bisa menebak satu huruf. Jika benar, huruf terbuka. Jika salah, nyawa berkurang. Semua pemain menang bersama atau kalah bersama.
- MVP: cooperative mode (pemain bergiliran, urutan sesuai giliran di room)
- Kata dari list yang sudah ditentukan per kategori
- 6 kesalahan maksimal

### 8.3 Sea Battle

- 2 pemain (1v1)
- Grid 10×10 masing-masing
- Setup: 5 kapal (1×4, 2×3, 1×2, 1×1) — auto-place atau manual
- Giliran saling tembak koordinat
- Hit/Miss feedback (hanya untuk grid sendiri)
- Kapal tenggelam jika semua tile terkena
- Pemenang: player yang menghancurkan semua kapal lawan

---

## 9. Hosting & Deployment

### 9.1 Frontend (Vercel)

- Repository GitHub → connect ke Vercel
- Setiap push ke `main` auto-deploy
- Environment variable: `NEXT_PUBLIC_SERVER_URL` (alamat backend)
- Framework preset: Next.js (otomatis terdeteksi)

### 9.2 Backend (Render)

- Web Service dari GitHub repo
- Build command: `cd server && npm install && npm run build`
- Start command: `cd server && npm start`
- Environment variable: `PORT`, `CORS_ORIGIN` (Vercel URL)
- **Anti-idle**: UptimeRobot.com (free) ping tiap 10 menit

### 9.3 Alternatif Backend

| Platform | Free Tier | Spin-down? | Catatan |
|----------|-----------|------------|---------|
| Render | 512MB RAM | ✅ 15 menit | Paling mudah setup |
| Koyeb | 1GB RAM | ❌ | Tanpa spin-down |
| Fly.io | $5 kredit/bln | ❌ | Perlu kartu kredit |
| Railway | $5 kredit/bln | ❌ | Perlu kartu kredit |

Rekomendasi: **Render** + UptimeRobot untuk MVP. Migrasi ke **Koyeb** jika idle spin-down jadi masalah.

---

## 10. Roadmap Build

| Fase | Komponen | Estimasi |
|------|----------|----------|
| **Fase 1** | Setup project (Next.js + Express + TypeScript + Socket.io koneksi) | 1 session |
| **Fase 2** | Landing page + Create/Join Room + Player identity | 1 session |
| **Fase 3** | Room lobby + Player list + Ready system + Chat | 1 session |
| **Fase 4** | Ular Tangga: 3D board + server logic + gameplay loop | 2–3 sessions |
| **Fase 5** | Hangman: UI + server logic | 1 session |
| **Fase 6** | Sea Battle: grid + ship placement + firing logic | 2 sessions |
| **Fase 7** | Emoji reactions + Polish animasi + responsive | 1 session |
| **Fase 8** | Deploy Vercel + Render + testing | 1 session |

---

## 11. Catatan Tambahan

- **Anti-cheat**: Karena server authoritative, semua random & validasi di server. Client tidak bisa curang.
- **Reconnection**: Socket.io handle reconnect otomatis. Player reconnect → masuk room lagi dengan state intact.
- **Scalability**: State di memory → terbatas satu instance. Jika perlu scale, bisa pakai Redis adapter untuk Socket.io (horizontal scaling).
- **Mobile**: Next.js responsive. Game 3D Ular Tangga mungkin perlu viewport khusus di mobile (kamera di-zoom-out).

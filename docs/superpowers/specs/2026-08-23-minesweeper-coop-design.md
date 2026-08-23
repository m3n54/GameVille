# Minesweeper Co-op — Design Spec

**Tanggal:** 2026-08-23
**Versi:** 1.0
**Status:** Approved (user)

---

## 1. Ringkasan

Game ke-4 GameVille: **Minesweeper kooperatif 2 pemain**. Dua pemain berbagi satu papan, bergiliran membuka kotak aman atau memasang bendera untuk menandai dugaan bom. Kena bom = kalah bersama; membuka semua kotak aman = menang bersama.

## 2. Aturan Main

### 2.1 Kesulitan (host pilih saat game start — via `game:select` payload)

| Mode | Grid | Bom |
|------|------|-----|
| Mudah | 8×8 | 10 |
| Sedang | 10×10 | 15 |
| Sulit | 12×12 | 25 |
| Ekstrem | 14×14 | 40 |

### 2.2 Mode Giliran (host pilih bersama kesulitan)

| Mode | Aturan |
|------|--------|
| `santai` | Giliran ketat: 1 aksi per giliran (reveal ATAU toggle flag), lalu pindah ke pemain lain |
| `tantangan` | Pemain terus bermain selama aksinya benar (reveal kotak aman). Memasang/menghapus flag ATAU mengalihkan giliran secara manual (`pass`) mengakhiri rangkaian dan memindahkan giliran |

### 2.3 Mekanik Inti

- Bom diposisikan acak server-side saat `createInitialState` — TIDAK di tile pertama yang dibuka (first-click safety TIDAK dijamin di MVP; risiko kena di langkah pertama adalah bagian dari permainan co-op bergiliran)
- **Reveal**: kotak berisi angka tetangga → tampil angka; kotak kosong (0 bom tetangga) → **flood-fill cascade** reveal semua kotak kosong + ring kotak berangka yang menyertainya
- **Flag bebas**: toggle pada/lepas di kotak tertutup kapan saja dalam giliranmu; flag tidak memengaruhi menang/kalah
- **Kalah**: reveal kotak berbom → `winner = 'none'` (tim kalah), semua bom terungkap
- **Menang**: jumlah kotak aman terbuka == total kotak − total bom → `winner = 'team'`
- Reveal pada kotak sudah terbuka / ber-flag → error event, giliran tidak berpindah

## 3. Skema Data

```typescript
// shared/types.ts additions
export type GameType = 'snakes-ladders' | 'hangman' | 'sea-battle' | 'minesweeper';

export interface MinesweeperState {
  difficulty: 'mudah' | 'sedang' | 'sulit' | 'ekstrem';
  mode: 'santai' | 'tantangan';
  rows: number;
  cols: number;
  bombCount: number;
  // Server-side truth (never sent raw to clients while playing):
  grid: Cell[][];
  revealedSafeCount: number;
  totalSafeCells: number;
  currentTurn: number;        // index into playerOrder
  playerOrder: string[];
  chainActive: boolean;       // tantangan mode: current player keeps playing
  winner: 'team' | 'none' | null;
}

// Client-facing projection (server sends this, bombs hidden):
export interface MinesweeperView {
  difficulty: MinesweeperState['difficulty'];
  mode: MinesweeperState['mode'];
  rows: number;
  cols: number;
  bombCount: number;
  cells: { state: 'hidden' | 'revealed' | 'flagged'; adjacent: number; exploded?: boolean }[][];
  flagsUsed: number;
  currentTurn: number;
  chainActive: boolean;
  winner: MinesweeperState['winner'];
}

interface Cell {
  hasBomb: boolean;
  adjacent: number;   // computed at init
  state: 'hidden' | 'revealed' | 'flagged';
}
```

## 4. Socket Events (pola `game:action` yang ada)

| Event | Arah | Payload | Catatan |
|-------|------|---------|---------|
| `game:action {type:'reveal', payload:{row,col}}` | C→S | koordinat | Validasi giliran + state sel |
| `game:action {type:'toggleFlag', payload:{row,col}}` | C→S | koordinat | Hanya sel hidden/flagged |
| `game:action {type:'pass'}` | C→S | — | Hanya mode tantangan; akhiri rangkaian |
| `revealResult` | S→C (via game:action) | `{ cells: [{row,col,state,adjacent,exploded}], result:'safe'\|'boom' }` | List semua sel yang berubah termasuk cascade |
| `turnChange` | S→C (via game:action) | `{nextPlayerId}` | Santai: setiap aksi valid; Tantangan: flag/pass/boom saja |

## 5. Implementasi

### Server
1. `shared/types.ts` — types di atas + `MinesweeperConfig` (difficulty→grid/bom map)
2. `server/src/games/minesweeper.ts` — `MinesweeperEngine extends BaseGame`:
   - `createInitialState(playerOrder)` — config dari constructor param? TIDAK: engine dibuat sekali di registry. Config dikirim lewat action pertama `{type:'config', payload:{difficulty, mode}}` oleh host sebelum reveal apa pun (state.phase implisit: grid ter-generate saat config diterima)
   - Flood-fill BFS untuk cascade
   - Proyeksi view (bombs hidden) dihitung di handler emit, bukan di engine
   - Turn logic per mode (santai/tantangan)
3. `server/src/index.ts` — register `'minesweeper': new MinesweeperEngine()`, tambah case `revealResult` di switch (emit `game:state` dengan VIEW bukan raw state + `game:action`)

**Catatan penting anti-cheat:** case `minesweeper` di `game:start`/emit harus mengirim proyeksi `MinesweeperView`, bukan raw `MinesweeperState`. Helper `toView(state)` di file engine.

### Frontend
4. `frontend/src/components/games/minesweeper/MinesweeperContainer.tsx` — wrapper: scoreboard (flags, turn, mode badge), message, grid render, win/lose inline banner (modal global room page sudah menangani overlay)
5. `frontend/src/components/games/minesweeper/MinesweeperGrid.tsx` — grid CSS (Tailwind), tombol per sel:
   - klik kiri = reveal (disabled jika bukan giliran/sel flagged)
   - klik kanan (contextmenu) = toggle flag
   - angka pastel warna per nilai (1 biru #A8D8EA, 2 hijau #B5EAD7, 3 peach #FFD3B6, 4 ungu muda #C3AED6, ≥5 pink #FF9BB5)
   - sel boom merah 💥, flag 🚩, sel tertutup abu-pink lembut
6. `frontend/src/app/room/[pin]/page.tsx` — import container, tambah case switch, tambah tombol selector "💣 Minesweeper" dengan deskripsi "2 pemain · Co-op · Hindari bom bareng"

## 6. Error Handling

| Kasus | Respon |
|-------|--------|
| Aksi bukan giliranmu | error event "Bukan giliranmu!" (pola hangman) |
| Reveal sel flagged | error "Lepas bendera dulu!" |
| Reveal sel terbuka | silent no-op |
| `pass` di mode santai | error "Pass hanya di mode Tantangan" |
| Aksi setelah game over | guard winner existing (pola umum) |

## 7. Testing (manual, konsisten MVP lainnya)

1. Buat room 2 pemain → pilih Minesweeper + Sedang + Santai → start
2. Reveal aman → angka/cascade tampil, giliran pindah
3. Toggle flag → ikon muncul, giliran pindah (santai)
4. Reveal bom → semua bom terungkap, modal "Tim Kalah"
5. Mode tantangan → reveal benar beruntun, flag memindahkan giliran, pass bekerja
6. Refresh mid-game (playing) → `room:sync` mengembalikan view tanpa bocor bom

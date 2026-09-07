# Code Review Report — 2026-09-07

## Ringkasan Eksekutif

**Scope**: Verifikasi read-only komprehensif terhadap dokumentasi AI yang
ada (`.freebuff/`, `.zcode/plans/`, `.superpowers/sdd/`, `docs/audits/`,
`docs/superpowers/`) vs kondisi kode aktual di `main` branch.

**Metode**: 3 agen paralel — (1) inventaris markdown, (2) peta struktur
kode, (3) verifikasi side-by-side audit↔kode.

**Hasil**:

| Kategori | Temuan |
|---|---|
| Bug klaim "MISSING" dari `docs/audits/2026-09-07-post-overhaul-audit.md` | 4/4 **terverifikasi FIXED** (H-1, H-2, H-3, M-2) |
| Bug klaim "POTENSI/PARTIAL" (M-1) | 1/1 **open** — fix dilingkup plan ini |
| Bug klaim DONE (C1, L-1, L-2) | 3/3 **terverifikasi FIXED** |
| Bug aktif baru | 1 (D5: docs drift di `CLAUDE.md:99`) |
| Footguns CLAUDE.md (D1–D7) | 6/7 konsisten, 1 stale (D5 = bug di atas) |
| TODO/FIXME/HACK markers | 0 di production code |
| `: any` types | 0 di production code |
| Empty catch blocks | 0 |

**Tindakan**: 2 fix terapan (D5 docs + M-1 sweeper cleanup), 1 laporan
ini sebagai dokumentasi permanen.

---

## 1. Inventaris Dokumentasi AI

Total ~70 file markdown dari 5 sumber:

| Lokasi | Jumlah | Topik dominan |
|---|---|---|
| `docs/audits/` | 2 | Audit logika game + verifikasi pasca-overhaul |
| `docs/superpowers/plans/` | 3 | Implementation plan + test framework + overhaul |
| `docs/superpowers/specs/` | 3 | Design spec awal + minesweeper + test framework |
| `.zcode/plans/` | 1 | Plan agent audit verifikasi |
| `.superpowers/sdd/` | ~60 | Task reports per fase (initial, minesweeper, test-framework, SL 2D redesign, audit-fixes) |

**Audit reports kunci**:

- **`docs/audits/2026-09-02-game-logic-state-audit.md`** — 4H/7M/5L, input
  untuk overhaul + SDD. Bug HIGH: H-1 payload crash, H-2 sea-battle 3-4 player,
  H-3 refresh = forfeit, H-4 minesweeper deadlock.
- **`docs/audits/2026-09-07-post-overhaul-audit.md`** — verifikasi pasca
  overhaul (3 workstream landed, WS-D staged). Bug HIGH baru: H-1 WS-D wiring,
  H-2 wallclock determinism, H-3 minesweeper modal UX.

---

## 2. Verifikasi Audit H/M

| ID | Klaim audit | File:line kode | Status verifikasi |
|---|---|---|---|
| **H-1** | `startTimeoutSweeper(io)` MISSING di `index.ts:48-52` | `server/src/index.ts:7` (import), `:56` (call) | ✅ FIXED — di commit `ecc05c3` (TT-1 reapply) |
| **H-2** | `lastActionAt = Date.now()` wallclock bocor | `server/src/gameService.ts:326` | ✅ FIXED — pakai param `now`, komentar deterministik |
| **H-3** | Minesweeper modal tidak auto-close saat `isMyTurn` flip | `frontend/src/components/games/minesweeper/MinesweeperContainer.tsx:133-139` | ✅ FIXED — useEffect `[isMyTurn]` → `setTapCell(null)` |
| **M-1** | 4 `setInterval` tanpa dispose, stacking di `tsx watch` | `server/src/gameService.ts:218-225, 385-395, 424, 443-450` | ⚠️ **OPEN — fix pada plan ini** |
| **M-2** | `processTimeouts` tanpa guard `phase === 'config'` | `server/src/gameService.ts:292-295` | ✅ FIXED — minesweeper phase guard |

**Ringkasan**: 4/5 klaim MISSING/POTENSI terverifikasi fixed di kode
aktual. M-1 tetap open karena dev-only (`.unref()` sudah cukup untuk
prod).

---

## 3. Verifikasi Klaim DONE

| ID | Klaim | File:line | Status |
|---|---|---|---|
| **C1** | Per-player projection sea-battle (`seaBattleView` strip `'S'` dari enemy) | `server/src/games/sea-battle.ts:384-425` | ✅ Throws jika `forPlayerId == null && !revealAll` (anti-cheat); stripShips line 384-386; per-player projection intact |
| **L-1** | Rolling lock fail-safe via `room:error` | `frontend/src/components/games/snakes-ladders/SnakesLaddersContainer.tsx:172-182` | ✅ useEffect subscribe `room:error` → `setRolling(false)` |
| **L-2** | Dice animasi lock untuk player lain roll | `frontend/src/components/games/snakes-ladders/SnakesLaddersContainer.tsx:121-129, 285` | ✅ `animating=true` pada setiap `diceResult`; disabled=`!isMyTurn \|\| rolling \|\| animating \|\| isGameOver` |
| **L-4** | `fireResult` broadcast ke seluruh room (anti-leak ship positions) | `server/src/socketHandlers.ts:411` | ✅ `io.to(instance.roomId).emit('game:action', { type: 'fireResult', ... })` |

---

## 4. Bug Aktif

### 4.1 D5 — `CLAUDE.md` Sea-battle docs drift (medium)

**Lokasi**: `CLAUDE.md:98-99` (pre-fix)

**Klaim stale**:
> `fireResult` emits the shooter's own projection immediately (`socket.emit`)
> plus `socket.to(room).emit` for everyone else's projection — both call
> `stateForClient(..., forPlayerId=socketId)` so the shooter sees their own
> hit/miss instantly while others see the plain board.

**Kode aktual** (`server/src/socketHandlers.ts:404-413`):

1. `fireResult` action event broadcast ke **seluruh room** via `io.to(room).emit`
   — bukan `socket.emit` + `socket.to(room).emit` terpisah. Payload tidak leak
   posisi kapal (cuma `{row, col, result}`), jadi broadcast aman.
2. Per-player projection hanya untuk `game:state` event — via
   `broadcastPerPlayerState(io, instance)` di line 404.

**Risiko**: Developer masa depan salah implementasi karena docs misleading.

**Fix terapan**: CLAUDE.md:98 diupdate dengan dua path broadcast yang
jelas + referensi file:line.

### 4.2 M-1 — Module-scope `setInterval` tanpa dispose (medium, dev-only)

**Lokasi**: `server/src/gameService.ts` — 4 sweeper tanpa dispose:

- `startExitSweeper` line 218-225
- `startTimeoutSweeper` line 385-395
- Rate-bucket cleanup line 424
- `startRoomSweeper` line 443-450

**Masalah**: `.unref()` hanya menahan Node exit — tidak clear interval.
Di `tsx watch` hot-reload, setiap restart nambah interval baru tanpa clear
yang lama. Setelah 10 restart, ada 40 interval yang berjalan paralel.

**Fix terapan** (commit plan ini):

1. Module-level handles: `exitSweeperHandle`, `timeoutSweeperHandle`,
   `roomSweeperHandle` + `rateBucketSweeper`.
2. Setiap `start*()` clear prior handle sebelum create baru — anti stacking.
3. `stopAllSweepers()` exported — idempotent dispose semua sweeper.
4. `server/src/index.ts` wire `process.on('SIGTERM', handleShutdown)` dan
   `process.on('SIGINT', handleShutdown)` — graceful shutdown clear
   sweepers sebelum exit.

**Verifikasi**: `cd server && npx tsc --noEmit` — pass bersih.

---

## 5. Verifikasi Footgun CLAUDE.md

| ID | Klaim | Verifikasi | Status |
|---|---|---|---|
| **D1** | `useSocket()` jangan disconnect di unmount | `frontend/src/hooks/useSocket.ts:42-46` | ✅ Comment line 41-42, cleanup hanya `socket.off` |
| **D2** | `roomStore` module-scoped singleton | `frontend/src/lib/roomStore.ts:20-26` | ✅ `let state` module-level, comment rationale a61e4b2 |
| **D3** | `tileCenter` boustrophedon-aware | `frontend/src/components/games/snakes-ladders/boardUtils.ts:49-52` | ✅ Panggil `tileToVisualPos` (flip col odd rows) |
| **D4** | Pawn threshold `\|Δposition\| > 6` | `frontend/src/components/games/snakes-ladders/usePawnAnim.ts:109` | ✅ `delta > 6 ? 'sliding' : 'walking'` |
| **D5** | `fireResult` per-player projection | Lihat §4.1 | ⚠️ **STALE — fix pada plan ini** |
| **D6** | Ladder check pakai `player.position` post-snake | `server/src/games/snakes-ladders.ts:135-153` | ✅ Snake (line 136-143) → ladder (line 146-153) |
| **D7** | Tile indices 0-99, `[80, 99]` (bukan `[80, 100]`) | `server/src/games/snakes-ladders.ts:14, 128-130, 167` | ✅ `FALLBACK_LADDERS` line 14: `[80, 98]`; win check `>= 99`; bounce-back `99 - (newPos - 99)` |

---

## 6. Cross-Cutting Issues

### Bug dari audit yang masih open (di luar scope plan)

- **M-4** — `finished`-room TTL sweep (audit 2026-09-02). Status di SDD:
  **DEFERRED** (perlu product decision). Kode sweepRooms line 432-441 saat
  ini hanya handle `state === 'playing'` early-return; `finished` rooms
  sebenarnya sudah masuk scope (line 429-431 comment menyebut "M-4:
  'finished' rooms linger too when players sit on the winner modal").
  Mungkin sebenarnya sudah ter-handle — verifikasi butuh pembacan kode
  lebih dalam.

- **M-6** — Minesweeper `totalSafeCells` mismatch jika `generateGrid` stall.
  Belum diverifikasi — `generateGrid` punya retry `maxAttempts = state.rows *
  state.cols * 10`, tapi tidak ada fallback jika retry habis.

### Good signal

- ✅ **Tidak ada TODO/FIXME/HACK** di `server/src` maupun `frontend/src`.
- ✅ **Tidak ada `: any`** di production code.
- ✅ **Tidak ada empty catch** block.
- ✅ **TypeScript strict mode** dipertahankan (no `any`, no implicit).
- ✅ **Error handling konsisten** — `safeHandler` wrapper di
  `server/src/socketHandlers.ts:42-55` membungkus semua listener.
- ✅ **Rate limiting** ada untuk `create`/`join`/`act`/`chat`/`react`
  (`gameService.ts:404-414`).

---

## 7. Rekomendasi

### Immediate (sudah dieksekusi plan ini)

1. ✅ Update `CLAUDE.md:98` untuk akurasi L-4 fix — dua path broadcast
   terpisah untuk `fireResult` (action event) vs `game:state` (state projection).
2. ✅ Tambah `stopAllSweepers()` + SIGTERM/SIGINT cleanup di `server/src/index.ts`
   agar sweeper tidak stacking di `tsx watch` hot-reload.
3. ✅ Laporan ini di `docs/reviews/` sebagai referensi permanen.

### Follow-up (luar scope)

1. **Verifikasi M-4 final** — cek apakah `sweepRooms` line 432-441 benar
   sweep `finished` rooms atau hanya `waiting`. Comment klaim sudah termasuk.
2. **M-6 minesweeper fallback** — tambah throw/log jika `generateGrid` retry
   habis, agar `totalSafeCells` mismatch tidak silent.
3. **Stale docs audit** — buat check otomatis: grep `socket.emit.*roomId`
   patterns di docs/ vs codebase agar docs drift seperti D5 terdeteksi dini.
5. **FE tests** — 0 frontend tests. Vitest setup untuk komponen kritis
   (MinesweeperContainer modal, usePawnAnim) akan menangkap regresi
   yang tidak tertangkap server tests.

---

## Lampiran: Komit Terkait

| Komit | Subject |
|---|---|
| `ecc05c3` | fix(ws-d): wire timeout sweeper + modal auto-close + phase guard (audit reapply TT-1) |
| `47647f4` | docs(audit): post-overhaul verification report |
| `7c6d83b` | feat: overhaul round 3 — manual ships, 2D dice + animation + lock + random board |
| `4e51757` | plan(gameplay): 2026-09-03 overhaul |
| `8be9dc7` | feat(srv): R1 grace-period disconnect + mid-game rejoin |
| `96f5079` | fix(fe): L-1 rolling lock fail-safe + L-5 stable myId |
| `fcda14d` | fix(srv): audit Medium/Low batch — M-1/M-4/M-6/L-3/L-4 + C1-followup |

---

## Lampiran: Referensi File Code

| File | Untuk verifikasi |
|---|---|
| `server/src/index.ts` | CORS, sweeper wiring, SIGTERM handler (lines 7, 48-56, 68-76) |
| `server/src/gameService.ts` | Sweeper lifecycle, processTimeouts, broadcastPerPlayerState |
| `server/src/socketHandlers.ts` | `fireResult` broadcast (line ~411), `safeHandler` (line 42-55) |
| `server/src/games/sea-battle.ts` | `seaBattleView` per-player projection (line 384-425) |
| `server/src/games/snakes-ladders.ts` | Snake→ladder order, bounce-back, tile indices |
| `server/src/games/base.ts` | GameInstance contract, GAME_PLAYER_REQUIREMENTS |
| `frontend/src/components/games/minesweeper/MinesweeperContainer.tsx` | Modal auto-close (line 133-139) |
| `frontend/src/components/games/snakes-ladders/SnakesLaddersContainer.tsx` | Rolling lock, animating gate |
| `frontend/src/lib/socket.ts`, `frontend/src/lib/roomStore.ts` | Module-scoped singletons |
| `frontend/src/hooks/useSocket.ts` | Jangan disconnect di unmount (line 41-46) |
| `shared/types.ts` | Full type/dis union, GameAction, ServerToClientEvents |
| `CLAUDE.md` | Footguns, socket lifecycle, room leave = disconnect |
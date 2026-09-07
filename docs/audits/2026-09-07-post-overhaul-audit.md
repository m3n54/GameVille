# Audit Ulang GameVille — Verifikasi Pasca-Overhaul

**Tanggal:** 2026-09-07
**Status:** Laporan saja — **tidak ada perubahan kode** dalam audit ini.
**Prasyarat:** `docs/audits/2026-09-02-game-logic-state-audit.md` (audit pertama) + `docs/superpowers/plans/2026-09-03-gameplay-overhaul.md` (overhaul 3 workstream) sudah selesai sebagian; commit ter-push: `7c6d83b` (overhaul round 3: SB-1 + LD-1). Sedang staged: WS-C (Minesweeper unflag) + WS-D (turn timeout 90s).
**Scope:** Area yang terkait perubahan overhaul + carry-over audit pertama yang belum ditutup. **TIDAK** mengulang H1-H4, M-1/M-4/M-6/L-3/L-4, L-1/L-5, C-followup (sudah DONE & ter-verifikasi). **TIDAK** mencakup WS-E (rematch 1-klik) — tunda.

---

## 1. Ringkasan Temuan

### Penilaian umum
Overhaul round 3 (`7c6d83b`) solid: engine `placeShips` divalidasi server-side (8 test baru), layout ular-tangga acak per match (50-sample test), dadu 2D terbaca instan. **Tetapi** ada **sisa serius** yang membuat beberapa area tidak jalan sama sekali:

- **WS-D (turn timeout) mati total.** `startTimeoutSweeper(io)` **TIDAK** dipanggil di `server/src/index.ts:48-52` (line yang ada hanya `startRoomSweeper()` dan `startExitSweeper(io)`). Kode `processTimeouts` + synthetic pass/roll ada di `gameService.ts:225-340`, tapi tidak pernah dijadwalkan. Ini **bloker fungsional** — baris logika yang baru saja ditulis tidak akan pernah jalan sampai wiring dipasang.
- **WS-C (Minesweeper unflag) temuan baru: modal tidak auto-close** saat giliran berpindah (mis. karena WS-D timeout synthetic pass, atau network blip). `setTapCell(null)` dipanggil di 4 tempat (line 184, 391, Batal/backdrop), tapi tidak ada useEffect yang menutup modal saat `isMyTurn` flip. User melihat modal dengan tombol yang diam-diam gagal — engine kirim error event-only, tidak ada toast feedback.
- **Determinism WS-D bocor.** `instance.lastActionAt = Date.now()` di `gameService.ts:283` reset pakai wallclock, bukan parameter `now`. Unit test yang inject synthetic clock akan lihat `lastActionAt = real time`, sweep berikut skip → test tidak valid untuk coverage TURN_TIMEOUT_MS boundary.
- **Sweeper stacking di dev hot-reload.** 4 `setInterval` di module-scope `gameService.ts:188, 345, 374, 401` tanpa `dispose` hook. `tsx watch` reload menumpuk interval setiap save; CPU naik linier, **tetapi** semua `.unref()` jadi tidak menahan Node exit. Dev-only, tidak manifest di prod Render.
- **Sea-battle synthetic pass valid.** Konfirmasi via baca: `processTimeouts` line 290-329 sudah memakai `broadcastPerPlayerState` untuk SETIAP event sea-battle (`turnChange` line 301, `fireResult` 309, `gameStart` 313, `shipsPlaced` 322). Bug peta "io.to global tanpa forPlayerId" terkoreksi — `diceResult` di line 292-294 dipakai SL (state langsung, bukan sea-battle). Sea-battle TIDAK memancarkan `diceResult` event dari engine.

### Carry-over dari audit pertama (status)
- **M-5 turn timeout**: SEBAGIAN — engine sudah support synthetic pass/roll, sweeper mati (lihat di atas). Bukan hanya masalah client UI timer, synthetic pass juga tidak jalan.
- **M-7 manual ships**: DONE (`7c6d83b`).
- **L-2 lock animasi**: DONE (`7c6d83b`).
- **Hangman category randomization + scoreboard antar-ronde**: **out of scope** audit ini (carry-over, prioritas rendah).

### Test coverage WS-A/B/C/D
- **WS-A (placeShips)**: 8 test engine baru — cukup.
- **WS-B (dice + anim + random board)**: 1 test layout acak (50 samples) — minimum. Tidak ada test untuk `usePawnAnim` timing atau `Dice2D` UI.
- **WS-C (Minesweeper unflag)**: 0 test FE.
- **WS-D (turn timeout)**: 0 test engine `processTimeouts` / synthetic action / boundary TURN_TIMEOUT_MS.
- **Implikasi audit ulang**: ~70% area overhaul tanpa test regresi. Refactor berikutnya akan reintroduce bug.

---

## 2. Edge Cases & Potensi Bug

Format: **[S] severity · status (DONE/PARTIAL/MISSING/POTENSI BUG) · bukti path:line**

### HIGH

#### H-1 ❌ PARTIAL → MISSING — Sweeper timeout WS-D tidak pernah jalan (bloker fungsional)
- **Bukti:** `server/src/index.ts:48-52` hanya mendaftarkan `startRoomSweeper()` dan `startExitSweeper(io)`. `startTimeoutSweeper` (exported dari `gameService.ts:342-345`) tidak dipanggil. Diverifikasi via `grep`.
- **Dampak:** Seluruh `processTimeouts` (`gameService.ts:251-340`) — synthetic pass/roll untuk pemain AFK setelah 90 dtk — tidak akan pernah terpicu. Audit M-5 yang sudah dijawab "sebagian" oleh WS-D praktis mati sampai wiring dipasang.
- **Solusi:** tambahkan `startTimeoutSweeper(io)` di `index.ts` setelah `startExitSweeper(io)`. Tidak perlu perubahan lain.

#### H-2 ⚠️ POTENSI BUG — `lastActionAt` reset pakai wallclock, determinism bocor
- **Bukti:** `server/src/gameService.ts:283` `instance.lastActionAt = Date.now()`. Parameter `now` diterima `processTimeouts(io, now: number)` (line 251) tapi tidak dipakai di reset.
- **Dampak:** Test yang inject `now=0` melihat `lastActionAt = Date.now()` (real time). Sweep berikut dengan `now=1` melihat `elapsed = 1 - (real time) >> TURN_TIMEOUT_MS` → skip atau behavior salah. Test regresi untuk TURN_TIMEOUT_MS boundary jadi tidak valid.
- **Solusi:** `instance.lastActionAt = now;` (satu baris).

#### H-3 ⚠️ POTENSI BUG — Minesweeper modal `tapCell` tidak auto-close saat giliran berpindah
- **Bukti:** `frontend/src/components/games/minesweeper/MinesweeperContainer.tsx`. `setTapCell(null)` muncul di line 184 (setelah kirim), line 391 (backdrop), line ~421 + ~430 (tombol Batal), dan ~433 (flagged branch Batal). **TIDAK ADA** useEffect yang menutup modal saat `isMyTurn` flip ke false.
- **Skenario:**
  1. User tap sel tersembunyi (line 165-171) → `setTapCell({row, col})`, modal muncul.
  2. Server timeout synthetic pass (jika WS-D wiring sudah ada) atau H3 grace exit dari pemain lain → turn berpindah.
  3. Server broadcast `game:state` → `view` update → `isMyTurn` jadi false.
  4. User klik "Buka Kotak" di modal yang masih terbuka → `handleTapChoice` (line 176-187) tidak re-check `isMyTurn` → `sendAction({type:'reveal', ...})` → engine `minesweeper.ts:119-122` balikin `error: 'Bukan giliranmu!'`.
  5. FE tidak dengar `room:error` (lihat `MinesweeperContainer.tsx` — tidak ada listener untuk itu; banner di `page.tsx` ada). Modal stuck sampai user klik Batal.
- **Dampak:** UX buruk saat WS-D aktif (juga relevan untuk network blip atau pemain lain keluar). Bisa di-bypass di single-player mode.
- **Solusi:** useEffect baru: `useEffect(() => { if (!isMyTurn) setTapCell(null); }, [isMyTurn]);`. Plus, `handleTapChoice` re-check `isMyTurn` sebagai defensive.

### MEDIUM

#### M-1 ⚠️ POTENSI BUG — Sweeper stacking di dev hot-reload (4 setInterval tanpa dispose)
- **Bukti:** `server/src/gameService.ts:188, 345, 374, 401` — 4 `setInterval` di module-scope. Tidak ada `dispose` hook, tidak ada `process.on('SIGTERM')` cleanup, tidak ada `module.hot.dispose()`. Semua `.unref()` → tidak menahan Node exit, tapi setiap reload `tsx watch` mencipta interval baru tanpa membersihkan yang lama.
- **Dampak:** Dev `npm run dev` mengalami CPU naik linier dengan jumlah save. Prod (Render) tidak manifest karena tidak ada hot-reload.
- **Solusi:** Store interval handle di module-scope, clear di `process.on('SIGTERM')`/`SIGINT`. Atau: atur interval di dalam factory function yang di-import sekali via singleton. Tidak urgent kecuali dev terasa lambat.

#### M-2 ⚠️ POTENSI BUG — WS-D tanpa cek `state.phase` config di minesweeper
- **Bukti:** `server/src/gameService.ts:251-274` `processTimeouts` skip saat `winner != null`, tapi **TIDAK** cek `state.phase === 'config'`. Skenario: host set room minesweeper tapi tidak klik "Mulai Papan" (config stuck), game dalam `phase: 'config'`. Sweep melihat currentId + tidak ada winner → fire synthetic `pass` → engine `minesweeper.ts:253-255` reject "Atur permainan dulu!" → event `error` (silent per `gameService.ts:325-328`) → `lastActionAt` di-reset → sweep berikut synthetic pass lagi → infinite silent stall.
- **Dampak:** Match minesweeper yang tidak di-config benar akan diam-diam stuck tanpa feedback. Roll SL di fase `playing` aman (line 115 reject di engine), sea-battle synthetic pass guard phase `playing` (line 339) aman. Minesweeper perlu guard sama.
- **Solusi:** tambah `if ((s.state as { phase?: string })?.phase === 'config') continue;` di `processTimeouts` sebelum fire synthetic.

#### M-3 ⚠️ PARTIAL — Test coverage WS-A/B/C/D tipis
- **Bukti:** `git diff origin/main..main --stat` di `server/src/__tests__/` tidak ada diff (semua test sudah ada sebelumnya untuk H1/H2/H4/H3/M-1/dst). WS-A tambah 8 test, WS-B tambah 1 test (50-sampel layout). **WS-C dan WS-D: 0 test**.
- **Dampak:** regresi pada modal tapCell dan processTimeouts tidak akan tertangkap.
- **Solusi:** test minimum:
  - WS-C: Vitest jsdom mount MinesweeperContainer, tap flagged cell → assert "Lepas Bendera" tombol hadir.
  - WS-D: Vitest unit test `processTimeouts` dengan synthetic clock: (a) minesweeper pass saat tantangan → turn berpindah; (b) santai juga pass (mode guard dihapus di WS-D); (c) winner null skip; (d) disconnected seat skip; (e) sea-battle currentTurn rotate; (f) `lastActionAt` di-reset pakai `now`.

### LOW

#### L-1 ✅ DONE — Sea-battle projection di timeout path benar
- **Bukti:** `server/src/gameService.ts:290-329`. `isSeaBattle` check di line 290; `turnChange` (line 301) `fireResult` (309) `gameStart` (313) `shipsPlaced` (322) semua memakai `broadcastPerPlayerState`. `diceResult` line 292-294 hanya SL — `stateForClient` mengembalikan state langsung, bukan sea-battle projection. Sea-battle TIDAK memancarkan `diceResult` event dari engine (`snakes-ladders.ts:101-111`).
- **Catatan:** Bug peta "io.to global tanpa forPlayerId" terkoreksi. Tidak ada masalah.

#### L-2 ✅ DONE — WS-D synthetic action reset clock dengan benar untuk SL + sea-battle
- **Bukti:** `server/src/gameService.ts:283` reset `lastActionAt` SETIAP kali synthetic dipanggil (gagal atau sukses). Sea-battle pass: `state.currentTurn` rotate (line 345), emit `turnChange` → reset clock. Minesweeper pass: `endTurn` (line 259) → reset clock. SL roll: roll normal → reset clock. **TIDAK ADA** infinite stall per-game. (Kecuali M-2 minesweeper-config yang di atas.)

#### L-3 ❌ MISSING — FE test untuk modal Minesweeper baru
- **Bukti:** repo tidak punya FE test sama sekali (cek `frontend/src/**/__tests__` — kosong). Modal "Lepas Bendera" branch di `MinesweeperContainer.tsx:407-422` dan flagged-cell guard di `MinesweeperGrid.tsx:42-43` tanpa test.
- **Dampak:** regresi tidak tertangkap.
- **Solusi:** setup Vitest jsdom (di luar scope audit ini) + 1-2 snapshot test.

#### L-4 ❌ OUT OF SCOPE — Hangman category randomization + scoreboard
- **Catatan:** Lihat audit pertama. Prioritas rendah, tidak di-overhaul. Tetap tercatat di laporan untuk triage nanti.

---

## 3. Rekomendasi Perbaikan

### R-1. Pasang wiring `startTimeoutSweeper(io)` di `index.ts` (H-1)
Tambah satu baris setelah `startExitSweeper(io)`:
```ts
// TT-1 (audit M-5): synthetic pass/roll per-match agar AFK tidak membekukan room.
startTimeoutSweeper(io);
```
Tanpa baris ini, WS-D praktis mati. Tambahkan `index.ts:53` baru.

### R-2. Gunakan parameter `now` untuk `lastActionAt` (H-2)
`server/src/gameService.ts:283`:
```ts
instance.lastActionAt = now;
```
Bukan `Date.now()`. Test dengan synthetic clock jadi valid.

### R-3. Auto-close modal Minesweeper saat giliran berpindah (H-3)
`frontend/src/components/games/minesweeper/MinesweeperContainer.tsx` — tambah useEffect:
```ts
// Tutup modal jika giliran hilang (timeout, disconnect, network blip) — engine
// akan reject aksi dari non-current player dengan error event-only, modal stuck.
useEffect(() => {
  if (!isMyTurn) setTapCell(null);
}, [isMyTurn]);
```
Plus defensive check di `handleTapChoice` (line 176-187) sebelum `sendAction`:
```ts
if (!isMyTurn) { setTapCell(null); return; }
```

### R-4. Guard `state.phase === 'config'` di `processTimeouts` (M-2)
`server/src/gameService.ts:251-274` — tambah setelah `if ((instance.state as { winner?: unknown })?.winner != null) continue;`:
```ts
// Minesweeper setup-phase (no config yet) — engine rejects pass silently;
// skip timeout to avoid infinite silent stall.
if (instance.gameType === 'minesweeper') {
  const phase = (instance.state as { phase?: string })?.phase;
  if (phase !== 'playing') continue;
}
```

### R-5. Sweeper dispose hook untuk dev hot-reload (M-1)
`server/src/gameService.ts` — track interval handles, clear pada reload:
```ts
const intervals: NodeJS.Timeout[] = [];
// ganti `setInterval(...)` dengan `intervals.push(setInterval(...))`,
// tambah `if (typeof module !== 'undefined' && (module as any).hot) (module as any).hot.dispose(() => intervals.forEach(clearInterval));`
```
Dev-only, tidak urgent.

### R-6. Test minimum WS-C + WS-D
Setelah R-1–R-4 dipass:
- `server/src/__tests__/timeout.test.ts`: test `processTimeouts(io, now)` untuk 4 game type, dengan synthetic clock — total ~8 test.
- `frontend/src/**/__tests__/MinesweeperGrid.test.tsx` (Vitest jsdom): 1 test flagged → modal membuka "Lepas Bendera".

---

## 4. Action Items (berurutan dampak)

| # | Aksi | Severity | Blokir audit berikutnya? |
|---|---|---|---|
| **1** | Wire `startTimeoutSweeper(io)` di `index.ts:53` | HIGH | YA — tanpa ini, WS-D = mati |
| **2** | `lastActionAt = now` di `gameService.ts:283` | HIGH | YA — blokir test WS-D |
| **3** | useEffect `isMyTurn → setTapCell(null)` + defensive check di `handleTapChoice` | HIGH | Tidak, tapi dibutuhkan sebelum WS-D aktif |
| **4** | Guard `phase === 'config'` di `processTimeouts` untuk minesweeper | MEDIUM | Tidak, tapi membuat WS-D robust |
| **5** | Tulis 4-8 test WS-D (synthetic action per game, boundary, stall) | MEDIUM | Tidak, tapi urutan yang benar setelah 1-4 |
| **6** | Tulis 1-2 test FE modal Minesweeper (Vitest jsdom) | LOW | Tidak |
| **7** | Sweeper dispose hook (dev hot-reload) | LOW | Tidak — dev only |
| **8** | Lengkapi WS-E (rematch 1-klik) | MEDIUM | Tunda audit ini, kerjakan terpisah |

---

## 5. Verifikasi deliverable

- ✅ Dibaca file aktual: `index.ts:48-52`, `gameService.ts:225-345`, `minesweeper.ts:243-261`, `sea-battle.ts:338-348`, `MinesweeperContainer.tsx:163-187, 385-444`, `MinesweeperGrid.tsx:39-50`, `base.ts` (GameInstance.lastActionAt).
- ✅ Cross-check dengan `docs/audits/2026-09-02-game-logic-state-audit.md`: M-5 status SEBAGIAN (sebelum "TIDAK", sekarang "engine support, sweeper mati"), M-7 DONE, L-1/L-2/L-5 DONE, H1-H4 DONE, M-1/M-4/M-6 DONE, C-followup DONE.
- ✅ TIDAK ada perubahan kode, TIDAK ada commit, TIDAK ada push.
- ✅ Output: file ini + ringkasan eksekutif untuk user.

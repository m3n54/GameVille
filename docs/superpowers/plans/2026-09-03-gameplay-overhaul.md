# Gameplay Overhaul Plan — GameVille

**Tanggal:** 2026-09-03
**Status:** Approved (user) — eksekusi berjalan
**Prasyarat:** audit round 1 & 2 selesai (lihat `docs/audits/2026-09-02-game-logic-state-audit.md` + ledger `.superpowers/sdd/2026-09-02-audit-fixes/progress.md`); 58/58 test hijau di `main` (`8be9dc7`).
**Tujuan dokumen:** source of truth yang portabel — akun/provider AI mana pun yang membaca repo ini bisa melanjutkan eksekusi tanpa konteks percakapan.

---

## 1. Latar & temuan eksplorasi (dengan bukti path:line)

### Sea Battle — penempatan manual tidak pernah ada (audit M-7)
- Spec menjanjikan "auto-place atau manual" (`docs/superpowers/specs/2026-07-29-multiplayer-web-game-design.md` §8.3); engine hanya punya `autoPlace` (`server/src/games/sea-battle.ts:107-143`).
- Titik integrasi:
  - Varian aksi baru di union `GameAction` (`shared/types.ts:52-68`).
  - Branch engine sejajar `autoPlace`; aturan penempatan auto = adjacency buffer 1 sel termasuk diagonal (`sea-battle.ts:48-57`), fleet `[4,3,3,2,1]` (`:29`), shipTypes map `:66`.
  - `socketHandlers.ts` case `shipsPlaced` (±`:428-437`) saat ini HANYA broadcast state per-player — **handler FE `shipsPlaced` di `SeaBattleContainer.tsx:101-112` adalah dead code**; perlu emit `game:action { type:'shipsPlaced', playerId }` ditambahkan.
  - FE setup phase block: `SeaBattleContainer.tsx:180-197` (tombol autoPlace saja); papan sendiri dirender pasif `:204` — `Grid.tsx` reusable via props `onCellClick`/`showShips` (hardcoded 10×10, cocok dengan server).

### Ular Tangga — dadu 3D sulit dibaca + animasi terlalu cepat
- `Dice3D.tsx`: overlay angka ADA tapi hanya saat `phase === 'landed'` (`Dice3D.tsx:197-206`) = setelah `SPIN_MS` 1700 + `SETTLE_MS` 250 (`useDiceRoll.ts:9-10`); wajah kubus pip kecil + cahaya lemah membuat 2/3/5 ambigu; selama spin kubus menampilkan wajah acak (`:188`).
- Komponen sangat terisolasi: hanya dipakai `SnakesLaddersContainer.tsx:7,268-273` (props `value/rolling/onRoll/disabled`) + ekspor `index.ts:3`; tombol "Lempar Dadu" ada DI DALAM Dice3D (`:208-220`); `useDiceRoll` hanya dipakai Dice3D.
- SFX dipicu dari CONTAINER (`SnakesLaddersContainer.tsx:39-42` via CustomEvent `gameville:sfx`) — penggantian dadu tidak menyentuh SFX.
- Konstanta animasi pion SEMUA di `usePawnAnim.ts:10-13`: `HOP_MS_PER_TILE` 600 · `HOP_DELAY_MS` 80 · `SLIDE_MS_PER_TILE` 400 · `SLIDE_MAX_MS` 4000. **`SLIDE_MAX_MS` dipakai timer glow di container (`:10,118`) — wajib dinaikkan bersama slide.** Transisi CSS slide 0.5s hardcode di `Board2D.tsx:77-80` (hanya relevan jika slide dipercepat — kita memperlambat, aman). Easing `easeInOutCubic` duplikat lokal `usePawnAnim.ts:18-21` vs `easing.ts:2-3`.

### Minesweeper — modal tap-to-choose SUDAH ADA (user belum sempat test)
- Klik kiri pada sel hidden → selalu route ke modal (⛏️ Buka / 🚩 Bendera / Batal) via `onCellTap` (`MinesweeperGrid.tsx:39-48` → `MinesweeperContainer.tsx:165-174,384-426`); klik kanan langsung toggle flag (`MinesweeperGrid.tsx:50-60`).
- **Celah nyata:** guard `cell.state !== 'hidden'` (`MinesweeperGrid.tsx:42`) membuat sel BERBENDERA tidak bisa dibuka modalnya → di iOS Safari (tanpa contextmenu) bendera tidak bisa dilepas. Hint statis "Klik kiri buka · Klik kanan bendera" (`MinesweeperContainer.tsx:428-430`) menyesatkan di mobile.

---

## 2. Keputusan user (final)

| Topik | Keputusan |
|---|---|
| Interaksi kapal manual | **Tray + klik papan** (pilih kapal → klik sel → rotasi H/V → Konfirmasi) |
| Dadu pengganti 3D | **Kartu wajah + angka besar** (pip besar, goyang saat kocok, hasil tampil segera) |
| Minesweeper | **Pertahankan modal + perbaiki celah unflag** |
| Scope tambahan | **Turn timeout anti-AFK + Rematch 1-klik + Papan ular-tangga acak** |

### Default yang diterapkan (diajukan, tidak dibantah)
1. Jarak antar kapal manual = ikut aturan auto (buffer 1 sel termasuk diagonal).
2. Tombol "Tempatkan Kapal (Auto)" tetap ada sebagai pintasan.
3. "Atur Ulang" penempatan sendiri diizinkan selama fase setup.
4. `placeShips` dikirim **atomik** setelah 5 kapal + tombol Konfirmasi (bukan per-kapal).
5. Angka dadu tampil **segera** saat server mengumumkan hasil (tidak menunggu animasi).
6. Tombol lempar dadu tetap menyatu di komponen dadu.
7. `Dice3D.tsx` dihapus (dependensi three/R3F dibiarkan di package.json — pembersihan opsional di luar scope).
8. Kecepatan animasi baru: hop 600→**850ms**, delay 80→**140ms**, slide 400→**650ms/tile**, `SLIDE_MAX_MS` 4000→**6500ms**.
9. Giliran dikunci sampai animasi pion selesai (audit L-2).
10. Hangman tidak disentuh.
11. Semua logika engine baru wajib punya test Vitest; 58 test existing wajib tetap hijau.
12. Verifikasi per ronde: `tsc --noEmit` + `npm test` (server), `tsc` + `next build` (FE).

---

## 3. Workstreams

### Workstream A — Sea Battle: penempatan kapal manual (kode fix: SB-*)
**Server:**
- `shared/types.ts`: varian `{ type: 'placeShips'; payload: { ships: { cells: [number, number][] }[] } }` — client hanya kirim koordinat; `type`/`hits` dibangun server-side (input tidak dipercaya).
- `sea-battle.ts`:
  - Ekstrak helper `canPlaceShip(cells, grid, { requireBuffer })` dari loop `generateAutoPlacement` agar kedua jalur share aturan.
  - Branch `placeShips`: guard `phase === 'setup'` + pemain valid + fleet sendiri masih kosong (anti re-place); validasi: tepat 5 kapal, multiset ukuran `[4,3,3,2,1]`, tiap kapal kontigu horizontal/vertikal, koordinat integer 0..9, tanpa overlap, tanpa pelanggaran buffer.
  - Sukses → tulis `gridN`/`shipsN` (type dari shipTypes map, hits: 0), emit `shipsPlaced { playerId }`; faktorkan transisi `playing`/`turnChange` (sekarang duplikat di `:127-140`) jadi helper bersama autoPlace.
- `socketHandlers.ts` case `shipsPlaced`: tambah `io.to(roomId).emit('game:action', { type: 'shipsPlaced', ...event.data })` — menghidupkan handler FE yang dead code.
**Frontend (`SeaBattleContainer.tsx` + reuse `Grid.tsx`):**
- Fase setup: tray sisa kapal ( Battleship 4 · Cruiser 3 · Cruiser 3 · Destroyer 2 · Submarine 1 ), toggle rotasi H/V, grid sendiri interaktif saat setup (klik = letakkan kapal terpilih sesuai orientasi; klik kapal draft = ambil kembali), tombol "Atur Ulang", "🎲 Acak" (autoPlace, tetap), "✅ Konfirmasi" aktif saat 5 kapal → emit `placeShips` atomik.
- Preview lokal: grid draft state FE; setelah emit, tunggu state server (source of truth).
**Test Vitest (baru/lengkap di `sea-battle.test.ts`):** fleet valid diterima; multiset salah ditolak; overlap ditolak; pelanggaran buffer ditolak; re-place ditolak; dua pemain placeShips → `phase 'playing'` + `gameStart` event.

### Workstream B — Ular Tangga: dadu 2D + animasi + papan acak (kode fix: LD-*)
- **`Dice2D.tsx` baru** (folder snakes-ladders): kontrak prop identik Dice3D (`value: number|null; rolling: boolean; onRoll: () => void; disabled: boolean`) + tombol lempar menyatu. Visual: kartu wajah dadu datar, pip besar, Tailwind, framer-motion spring untuk goyang; saat `rolling` → goyang + gulir digit acak cepat; saat hasil server tiba (`rolling` false / `value` set) → angka besar tampil SEGERA + flash konfirmasi. Hapus `Dice3D.tsx` + ekspor `index.ts`; `useDiceRoll` dihapus bila tak dipakai lagi (dicek: hanya Dice3D yang memakainya).
- **`usePawnAnim.ts`**: 600→850, 80→140, 400→650, `SLIDE_MAX_MS` 4000→6500 (glow timer container otomatis mengikuti karena mengimpor konstanta).
- **Lock giliran saat animasi (L-2)**: container menandai `animating` saat segments dibuat, dilepas setelah `SLIDE_MAX_MS`; dadu `disabled` selama `animating`.
- **Papan acak**: `snakes-ladders.ts` — konstanta SNAKES/LADDERS diganti `generateBoardLayout()` dalam `createInitialState`: 10 ular + 9 tangga; validitas: endpoint unik (tidak ada tile jadi kepala ular DAN kaki tangga, tidak berantai dari tile yang sama), tidak menyentuh tile 0/99, kepala ular > ekornya, kaki tangga < puncaknya. FE Board2D/paths sudah layout-agnostic (menerima arrays dari state).
**Test Vitest:** N-sampel (mis. 200) layout selalu valid — jumlah benar, tanpa konflik endpoint, arah benar, 0/99 bersih; board tetap finishable (ada jalur; minimal: menang di 99 masih mungkin — cukup assert struktur).

### Workstream C — Minesweeper: perbaiki unflag mobile (kode fix: MS-*)
- `MinesweeperGrid.tsx`: longgarkan guard klik-kiri — sel berbendera BOLEH membuka modal saat `onCellTap` tersedia (guard `state !== 'hidden'` → izinkan `'flagged'` juga untuk jalur modal).
- `MinesweeperContainer.tsx`: `onCellTap` menerima sel flagged; modal kontekstual — sel berbendera menampilkan tombol "🚩 Lepas Bendera" sebagai pilihan (toggleFlag); teks bantuan diganti: "Klik kiri: pilih aksi · Klik kanan: bendera".

### Workstream D — Turn timeout anti-AFK 90 dtk (kode fix: TT-*, audit M-5)
- `GameInstance.lastActionAt: number` — di-set saat `game:start` dan di-update tiap `game:action` sukses (di `socketHandlers` setelah engine.handleAction tanpa error-event pertama... implementasi: update setelah result.events tidak berisi error pertama yang menandakan penolakan; sederhananya: update jika ada event selain 'error').
- Sweeper 10 dtk (pola `startExitSweeper`): game aktif (winner null) + `now - lastActionAt > 90_000` → server mainkan aksi netral untuk pemain current:
  - snakes-ladders → auto-roll (panggil `engine.handleAction(state, currentId, { type:'roll' })` + proses events seperti handler normal).
  - minesweeper → auto-`pass`; SEKALIGUS: aksi `pass` kini diterima di KEDUA mode (mode santai = buang giliran; longgarkan guard `state.mode !== 'tantangan'`).
  - sea-battle → aksi engine baru `pass` internal (server-synthetic, TANPA tombol FE): giliran berpindah tanpa menembak, guard phase playing.
  - hangman → co-op, tidak ada aksi netral wajar — skip (dokumentasikan).
- Faktorkan event-processing loop `game:action` jadi helper yang bisa dipanggil sweeper (hindari duplikasi switch besar).
- Interaksi H3: grace 60 dtk < timeout 90 dtk — forfeit pemain hilang selalu mendahului timeout.
- Test Vitest (jam sintetis / panggil langsung fungsi sweep): idle > 90 dtk → tepat satu aksi netral (roll/pass) + giliran berpindah; aksi normal me-reset `lastActionAt`; game over menghentikan timeout.

### Workstream E — Rematch 1-klik (kode fix: RM-*)
- Event `game:rematch` (C→S, host-only, room state `finished`): server = `resetRoomForNewGame` + set semua `isReady = true` + jalankan jalur `game:start` existing (validasi komposisi G1 tetap!) dengan `gameType` yang sama. Refactor kecil: ekstrak inti `game:start` jadi fungsi agar rematch tidak duplikasi.
- FE layar pemenang (`page.tsx` modal `gameWinner`): tombol primer "🔁 Main Lagi" (host only), non-host melihat "Menunggu host memulai ulang…"; semua masuk otomatis via event `game:started` existing. Tombol "Kembali ke Lobby" tetap ada.
- Test integrasi: match selesai → host `game:rematch` → semua client menerima `game:started` gameType sama + state baru; non-host rematch ditolak.

---

## 4. Urutan eksekusi & verifikasi

1. **Langkah 0:** dokumen ini di-commit + push.
2. **Ronde 1 — 2 agent paralel (file disjoint):** Agent 1 = Workstream A (sea-battle server+FE); Agent 2 = Workstream B (folder snakes-ladders + engine SL). Tanpa commit; orchestrator review diff + verifikasi.
3. **Ronde 2 — 1 agent (setelah ronde 1 commit):** Workstream C + D + E (menyentuh `shared/types.ts`, `gameService.ts`, `socketHandlers.ts` — harus sequential terhadap ronde 1).
4. Verifikasi tiap ronde: `cd server && npx tsc --noEmit && npm test` (58 existing + baru, semua hijau) dan `cd frontend && npx tsc --noEmit && npm run build`.
5. Commit per workstream dengan prefix kode fix (SB-*, LD-*, MS-*, TT-*, RM-*); update legenda fix di `CLAUDE.md` + ledger `.superpowers/sdd/2026-09-03-gameplay-overhaul/progress.md`; push.
6. Smoke manual (dev server hot-reload): checklist di laporan akhir — tray kapal & konfirmasi, dadu 2D terbaca jelas, animasi lebih pelan, modal bendera di sel flagged, idle 90 dtk auto-skip (pakai 2 tab), tombol Main Lagi.

## 5. Out of scope (eksplisit)
Hangman changes · pembersihan dependensi three/R3F dari package.json · turn timeout untuk hangman · papan skor antar ronde · e2e Playwright baru (kandidat follow-up).

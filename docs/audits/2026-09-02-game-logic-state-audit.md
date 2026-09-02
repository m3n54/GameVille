# Audit Logika Game & State Management — GameVille

**Tanggal:** 2026-09-02
**Scope:** Server engine (4 game), infrastruktur room/socket, frontend state & containers
**Metode:** Cross-check dokumentasi (specs, plans, ledger SDD) terhadap kode aktual, baris per baris
**Status laporan:** Evaluasi saja — tidak ada perubahan kode. Action items siap dieksekusi setelah review.
**Konteks test:** Branch `test-framework` (27 test Vitest lulus, 3-PR plan di `docs/superpowers/plans/2026-09-02-test-framework-and-e2e.md`) dijadikan dasar penambahan test untuk tiap temuan.

---

## 1. Ringkasan Temuan

### Kondisi umum: **sehat untuk MVP, dengan 4 cacat ber-potensi-patah (High) yang semuanya berada di jalur "keadaan darurat" (disconnect, payload malformed, recovery), bukan di jalur happy path.**

Fondasi arsitektur sudah benar dan konsisten dengan spec:

- **Server authoritative** dijalankan sungguh-sungguh — semua engine memvalidasi giliran di sisi server (`snakes-ladders.ts:62`, `hangman.ts:92`, `sea-battle.ts:149`, `minesweeper.ts:113/200/242`), dan anti-cheat projection (`stateForClient`, `gameService.ts:33-38`) mencegah kebocoran bom/kata/kapal lawan lewat payload socket.
- **State machine room** `waiting → playing → finished → (waiting)` sudah di-guard dari double-start (H3), ganti game mid-match (SV-H6), dan restart dari `finished` (`resetRoomForNewGame`).
- **Tidak ada infinite loop di sisi server.** Semua loop berisiko sudah dibatasi: flood-fill BFS Minesweeper memakai `visited` set (`minesweeper.ts:389-417`), penempatan bom acak punya `maxAttempts` (`minesweeper.ts:336`), auto-place kapal punya `attempts < 100` (`sea-battle.ts:34`), dan rotasi giliran selalu modulo panjang array.
- **Deadlock server-side tidak ditemukan.** Satu-satunya deadlock yang ada justru **di client (UI Minesweeper setelah recovery — temuan H-4)**.
- Riwayat fix (F/H/M/C/L di `CLAUDE.md` + ledger SDD) menunjukkan proses perbaikan yang disiplin; audit ini sengaja **tidak melaporkan ulang** bug yang sudah ter-fix.

Namun audit menemukan **4 temuan High** yang saling berkait dengan satu tema: *server mengasumsikan semua event berasal dari client-nya sendiri dan semua koneksi stabil*. Asumsi ini dipatahkan oleh (a) client raw/malicious, (b) refresh halaman, dan (c) room beranggota 3-4 orang yang memilih game 2-pemain.

### Penilaian UX alur gameplay (area #4)

| Aspek | Penilaian |
|---|---|
| Landing → buat/join → lobby → ready → start → game → modal pemenang → main lagi | **Intuitif.** Alur linear, tombol host-only di-disable untuk non-host, error tampil di banner terpusat (`GameErrorBanner`), bukan `alert()`. |
| Feedback dalam game | **Baik.** Dadu 3D + animasi pion per-hop + SFX per-tile (Ular Tangga), toast reveal/boom (Minesweeper), indikator giliran strict (FE-F3 mencegah "Giliranmu!" palsu sebelum event pertama). |
| Recovery & gangguan koneksi | **Titik terlemah.** Banner "menyambung ulang..." menjanjikan pemulihan, padahal reconnect mid-game **selalu** berakhir keluar dari room (H-3), dan pemain Minesweeper yang kebagian recovery bisa terkunci dari giliran sendiri (H-4). Ini kontradiksi antara janji UI dan perilaku server. |
| Mobile | Minesweeper sudah punya tap-modal reveal/flag; Ular Tangga & Hangman aman. Sea Battle murni klik — cukup. |

**Kesimpulan UX:** happy path menyenangkan dan dapat dipertahankan; yang perlu dikerjakan adalah *kejujuran state gangguan* — jangan tampilkan "menyambung ulang" jika server akan menendang pemain, dan jangan biarkan pemain menghadapi layar mati tanpa penjelasan.

---

## 2. Daftar Edge Cases & Potensi Bug

Format: **[S] severity · status tindani: ✅ ditangani / ⚠️ sebagian / ❌ tidak ditangani**

### HIGH

#### H-1 ❌ Satu payload malformed dari client bisa menjatuhkan seluruh proses server (remote crash)
- **Skenario:** Client raw (bukan browser — CORS mengizinkan request tanpa header `Origin`, `index.ts:51-55`) mengirim `player:ready` tanpa payload, atau `game:select`/`room:sync`/`room:create` tanpa payload, atau `room:sync` tanpa ack callback.
- **Bukti:** Handler mengakses properti tanpa guard: `data.ready` (`index.ts:198-199`), `data.gameType` (`index.ts:380`), `data.pin` + `callback(...)` tanpa null-check (`index.ts:164-196`), `data.name` via `validateIdentity` (`rooms.ts:20`). Socket.io 4.8.3 menjalankan listener di dalam `process.nextTick` **tanpa try/catch** (`node_modules/socket.io/dist/socket.js:689-700`) → TypeError menjadi `uncaughtException` → **proses Node mati, semua room hilang** (state in-memory).
- **Kenapa lolos:** Guard `try/catch` hanya membungkus `engine.handleAction` (`index.ts:294-301`); akses `data.type` pada guard M2 (`index.ts:285`) justru **di luar** try block. Handler room tidak pernah mendapat perlakuan M5/H4.
- **Dampak:** DoS satu-paket; satu actor bisa menendang semua room aktif kapan saja.
- **Solusi:** (1) Bungkus semua handler dengan wrapper `safeHandler(fn)` yang try/catch + log + `room:error`; (2) guard `if (!data || typeof data !== 'object') return;` di awal tiap handler; (3) null-check `callback` di `room:sync` seperti yang sudah dilakukan `room:create`/`room:join`.

#### H-2 ❌ Sea Battle bisa dimulai di ruang 3-4 pemain; disconnect pemain non-partisipan = kemenangan paksa player 1 + kebocoran papan
- **Skenario:** Room 3 pemain memilih Sea Battle (UI tidak melarang; `canStartGame` di `rooms.ts:175-182` hanya cek ≥2 pemain, tanpa validasi jumlah per game). `SeaBattleEngine.createInitialState` mengambil `playerOrder[0]` dan `[1]` saja (`sea-battle.ts:86-98`) — pemain ke-3 menjadi hantu.
- **Bug A (match berakhir mendadak):** Saat pemain ke-3 disconnect/leave, `handlePlayerExit` memanggil `removePlayer(state, p3)`. Logika `other = playerId === player1Id ? player2Id : player1Id` (`sea-battle.ts:229`) membuat p3 "diposisikan sebagai player2" → `state.winner = player1Id` + `gameOver: true` → **seluruh match berakhir, player 1 dinyatakan menang**, hanya karena seorang penonton keluar. Hal yang sama terjadi kalau p3 cuma kena network blip.
- **Bug B (info leak + UX kacau):** P3 menerima proyeksi `seaBattleView(state, p3)` dengan `asPlayer1 = false` (`sea-battle.ts:271-275`) → **p3 melihat grid player 2 sebagai "Papanmu"** termasuk posisi kapalnya.
- **Dampak:** Match rusak permanen; kebocoran informasi; sangat membingungkan.
- **Solusi:** (1) Validasi jumlah pemain per game type di `game:start` — sea-battle mewajibkan tepat 2 pemain (tolak dengan pesan spesifik, atau otomatis tandai pemain ke-3+ sebagai spectator yang tidak masuk `playerOrder` dan diabaikan `removePlayer`); (2) `SeaBattleEngine.removePlayer` harus no-op jika `playerId` bukan `player1Id`/`player2Id`; (3) `seaBattleView` melempar error untuk `forPlayerId` di luar kedua pemain.

#### H-3 ❌ Refresh halaman / network blip mid-game = keluar permanen (+ forfeit di game 1v1)
- **Skenario 1 (refresh):** Page reload membuat socket baru. `room:sync` gagal (`findByPlayer` tidak kenal id baru), dan `reattachPlayer` sengaja hanya untuk room `'waiting'` (`index.ts:159-170`, `rooms.ts:246-260`). Sementara itu disconnect socket lama memicu `handlePlayerExit` → `removePlayer`. Hasil: di Ular Tangga 2-pemain dan Sea Battle, **match langsung selesai dengan menang lawan** (`snakes-ladders.ts:23-27`, `sea-battle.ts:227-235`); di game co-op, match lanjut tanpa pemain yang refresh — dan ia **tidak bisa bergabung kembali** sampai match selesai (join ditolak karena `findByPin` hanya match room `'waiting'`, `rooms.ts:214-216`).
- **Skenario 2 (blip 10 detik):** Perilaku identik — socket.io memberi sid baru setiap koneksi ulang, jadi "menyambung ulang..." pada `ConnectionStatus` adalah janji yang tidak pernah ditepati mid-game.
- **Kontradiksi spec:** Spec §11 menjanjikan *"Player reconnect → masuk room lagi dengan state intact"* (`docs/superpowers/specs/2026-07-29-multiplayer-web-game-design.md:394`). Kode memilih trade-off kebalikan (komentar `index.ts:159-163`) tanpa memperbarui spec.
- **Dampak:** Satu jempol kuiseng = match 1v1 tamat; pengalaman paling merusak di seluruh platform karena terjadi pada aksi paling umum (refresh/berpindah aplikasi di mobile).
- **Solusi (bertingkat, dari termurah):**
  1. **Grace period disconnect** (mis. 45-60 dtk): `handlePlayerExit` mid-game menandai pemain `staleSince` alih-alih langsung `removePlayer`; sweeper 10-detik menjalankan forfeit hanya jika lewat grace. Reconnect dalam grace → seat dipulihkan (id pemain di-update seperti `reattachPlayer`, tapi untuk room `'playing'` — engine state hanya perlu id di `playerOrder`/`players` di-rename).
  2. **Full mid-game rejoin:** `room:sync` menerima re-attach by nickname untuk room `'playing'`, memetakan ulang id di `playerOrder` + `state.players`, lalu membalas snapshot (jalur replay `gameState` + `turnPlayerId` sudah ada di `index.ts:185-195`).

#### H-4 ❌ Deadlock UI Minesweeper setelah recovery mid-game — tidak ada yang bisa jalan
- **Skenario:** SPA-recovery mid-game (navigasi ulang ke `/room/[pin]` dengan socket yang sama, atau reconnect path FE-F2 yang berhasil sync) → server membalas snapshot `MinesweeperView` saja, **tanpa event `turn`** (`index.ts:187-195`).
- **Bukti:** `useGameTurn` mulai dari `null` (`useGameTurn.ts:18`) dan hanya ter-update dari event `turn`/`gameStart`. `MinesweeperView` **tidak memuat `playerOrder`** (`shared/types.ts:196-208`), jadi client bahkan tidak bisa menurunkan "siapa index `currentTurn`" secara mandiri. Hasil: `isMyTurn === false` untuk SEMUA pemain → seluruh grid disabled (`MinesweeperGrid.tsx:37`) → tidak ada aksi yang bisa dikirim → tidak akan ada `turnChange` berikutnya → **deadlock permanen sampai semua orang refresh** (yang malah memicu H-3).
- **Smoking gun:** Halaman room memancarkan `window.dispatchEvent(new CustomEvent('gameville:turn', ...))` (`page.tsx:75,136`) persis untuk kasus ini — tapi **tidak ada satu pun listener** untuk event itu di seluruh frontend (hasil grep). Sinyal recovery hilang di tengah jalan.
- **Kenapa 3 game lain selamat:** Ular Tangga membaca `state.currentTurn` langsung dari snapshot (`SnakesLaddersContainer.tsx:152-154`), Sea Battle membaca `view.currentTurn` (string id, `SeaBattleContainer.tsx:138`), Hangman punya backstop `playerOrder[currentTurn]` (`HangmanContainer.tsx:190-194`). Minesweeper satu-satunya yang bergantung penuh pada event stream.
- **Dampak:** Match co-op mati total; korban merasa "game hang".
- **Solusi (pilih satu, dua pertama lebih bersih):**
  1. Tambahkan `playerOrder: string[]` ke `MinesweeperView` (id socket bukan rahasia — sudah tampil di daftar pemain) dan turunkan turn dari `view.playerOrder[view.currentTurn]` seperti backstop Hangman.
  2. Saat `room:sync` mengembalikan `gameState` + `turnPlayerId` mid-game, server emit event `game:action {type:'turn'}` yang sebenarnya ke socket yang sync (bukan CustomEvent lokal).
  3. (Tambahan) Hapus atau implementasikan listener `gameville:turn` — dead code saat ini.

### MEDIUM

#### M-1 ⚠️ Duplikat nickname diizinkan → resolusi `myId` bisa salah orang
- `joinRoom` tidak menolak nickname yang sama (`rooms.ts:81-108`), padahal frontend menentukan "aku yang mana" **dengan match nickname** (`useRoom.ts:63-72` — `find(p => p.nickname === identity.nickname)` mengambil entri pertama), dan `reattachPlayer` juga match by nickname (`rooms.ts:250`).
- **Dampak:** Dua pemain "menza" di satu room → highlight giliran & enable/disable tombol bisa jatuh ke pemain yang salah; reattach bisa menempel ke rekaman pemain lain (campur aduk identitas dalam room). Ini adalah kekerabat dari bug "double menza" lama yang sudah pernah terjadi (commit a61e4b2).
- **Solusi:** Tolak join dengan nickname yang sudah ada di room (pesan: "Nickname sudah dipakai di ruang ini"). Murah dan memotong seluruh kelas bug ini.

#### M-2 ❌ `reaction:send` tanpa rate limit → spam broadcast
- Chat dibatasi 10/10 dtk (`index.ts:397`) tapi reaksi tidak (`index.ts:405-415`) — satu socket bisa membanjiri seluruh room dengan emoji secepat apapun. `player:ready` dan `game:select` juga tanpa limit (dampak kecil karena idempotent, tapi ikutkan dalam wrapper rate limit yang sama).
- **Solusi:** `allowEvent(`react:${socket.id}`, 10, 10_000)` — satu baris, pola M7 sudah ada.

#### M-3 ❌ `game:action` tanpa rate limit
- Semua engine menolak aksi di luar giliran, tapi penolakan tetap memakan `findGameForSocket` (linear scan atas `GAMES`, `gameService.ts:191-196`) + dispatch engine. Raw client bisa membanjiri ribuan aksi/dtk.
- **Solusi:** `allowEvent(`act:${socket.id}`, 30, 10_000)` di awal handler `game:action` — cukup longgar untuk gameplay normal (termasuk spam-klik tidak sengaja), ketat untuk abuse.

#### M-4 ⚠️ Room `'finished'` dan `'playing'` tidak pernah di-sweep → memory leak lambat
- TTL sweeper hanya menyentuh `'waiting'` (`gameService.ts:178-189`). Room `'finished'` sengaja dipertahankan untuk alur re-join F9 (`rooms.ts:135-141`), tapi jika tidak ada yang pernah main lagi di PIN itu, ia hidup selamanya. `'playing'` yang ditinggalkan semua orang terhapus via jalur last-leaver, tapi `'playing'` berisi anggota idle selamanya tetap hidup.
- **Solusi:** Sweep `'finished'` lebih tua dari 2 jam (beri jeda aman untuk re-join), dan pertimbangkan TTL untuk `'playing'` tanpa aktivitas aksi (mis. 6 jam).

#### M-5 ❌ Tanpa turn timeout — satu pemain AFK membekukan match selamanya
- Tidak ada timer giliran di server maupun UI countdown. Pemain yang meninggalkan tab terbuka dan pergi memblokir seluruh room tanpa batas waktu (socket tetap connected, jadi H-3 juga tidak terpicu).
- **Solusi:** Server-side per-turn deadline (mis. 60 dtk untuk Minesweeper/Sea Battle, 30 dtk Ular Tangga): lewat waktu → auto-`pass` (Minesweeper tantangan), auto-skip giliran (Ular Tangga), atau auto-fire random (Sea Battle). Minimal versi MVP: tampilkan indikator "menunggu X..." + tombol vote-skip; versi penuh: timer server agar tidak bisa dimanipulasi client.

#### M-6 ❌ Minesweeper degenerate: penempatan bom yang gagal sebagian menghasilkan game yang tidak bisa dimenangkan
- `generateGrid` membatasi percobaan dengan `maxAttempts = rows*cols*10` (`minesweeper.ts:336`) tapi **tidak mengoreksi `bombCount`** jika attempts habis sebelum semua bom tertempat; `totalSafeCells = rows*cols - bombCount` memakai jumlah yang diminta, bukan yang benar-benar ditempatkan (`minesweeper.ts:356`). Kondisi menang `revealedSafeCount === totalSafeCells` (`minesweeper.ts:182`) menjadi tak tercapai.
- **Probabilitas rendah** (butuh bombCount mendekati kapasitas, mis. kustom 180+ bom di papan 14×14), tapi konsekuensinya match co-op tidak bisa dimenangkan tanpa alasan yang terlihat pemain.
- **Solusi:** Setelah loop penempatan: `state.bombCount = placed; state.totalSafeCells = state.rows * state.cols - placed;` (dua baris).

#### M-7 ⚠️ Spec drift: penempatan kapal manual (Sea Battle) dijanjikan spec, tidak diimplementasi
- Spec §8.3: *"Setup: 5 kapal (…) — auto-place atau manual"* (`2026-07-29-multiplayer-web-game-design.md:338`). Realita: satu-satunya aksi setup adalah `autoPlace` (`sea-battle.ts:107-143`), dan union `GameAction` tidak punya aksi place manual (`shared/types.ts:48-64`); UI pun hanya menawarkan tombol Auto (`SeaBattleContainer.tsx:176-178`).
- **Dampak:** Bukan bug runtime, tapi aturan main yang dijanjikan tidak ada; pemain tidak bisa memilih formasi (bagian dari daya tarik genre battleship).
- **Solusi:** Putuskan: (a) implement `placeShips` (validasi: tepat 5 kapal, ukuran tepat, tanpa tumpang tindih termasuk buffer 1 sel agar konsisten dengan auto-place) atau (b) update spec + label UI dari "auto-place atau manual" menjadi auto-only. (Sebaliknya untuk Minesweeper: spec §2.3 bilang "first-click safety TIDAK dijamin" tapi kode C6 **menjamin-nya** — perbarui dokumen agar mencerminkan kode yang lebih baik.)

### LOW

#### L-1 ⚠️ Optimistic `rolling` lock Ular Tangga tidak dilepas saat server error
- `rollDice` men-set `setRolling(true)` (`SnakesLaddersContainer.tsx:141-146`); lock dilepas hanya saat `game:state` berikutnya (`:68-71`). Jika aksi roll memicu `room:error` (mis. engine throw), dadu pemain itu tetap terkunci sampai broadcast dari pemain lain datang. Aksi lain (reveal/fire/guess) tidak memakai lock optimistik sehingga imun.
- **Solusi:** Container mendengarkan `room:error` dan `setRolling(false)`, atau ubah roll ke pola ack.

#### L-2 ⚠️ Tidak ada gating server untuk animasi — pemain berikutnya bisa roll saat animasi pion masih berjalan
- Server langsung memajukan `currentTurn` saat roll (`snakes-ladders.ts:122`); animasi hop murni client-side (`SLIDE_MAX_MS` 4 dtk). Pemain kedua yang cepat me-roll menghasilkan `diceResult` baru **di tengah** animasi pemain pertama — segment animation dua pemain berjalan bersamaan, pesan giliran saling menggantikan. Server tetap konsisten (state benar); ini murni kualitas visual.
- **Solusi (opsional):** `usePawnAnim` menunda enable dadu sampai segmen selesai (client-side queue), atau terima sebagai fitur "fast play" dan dokumentasikan.

#### L-3 ⚠️ Hangman `gameStart` tanpa `firstTurnId`
- `hangman.ts:82` memancarkan `gameStart` dengan data `{}` — bandingkan Minesweeper yang mengirim `firstTurnId` (`minesweeper.ts:107`). Tidak ada event `turn` pertama; diselamatkan oleh backstop di container (`HangmanContainer.tsx:190-194`). Konsistensi kecil: kirim `firstTurnId: playerOrder[0]` seperti Minesweeper dan (opsional) hapus backstop.

#### L-4 ⚠️ Feedback tembakan hanya sampai penembak
- `fireResult` hanya di-emit ke shooter (`index.ts:342-344`); lawan menerima perubahan grid lewat state, tapi tidak menerima pesan "kena/meleset" untuk tembakan yang mengenai dirinya, dan tidak melihat animasi `lastShot`. 
- **Solusi:** Broadcast `fireResult` ke seluruh room (payload sudah aman — tidak membuka posisi kapal), biarkan tiap client menentukan tampilannya.

#### L-5 ⚠️ Catatan skala & kebersihan (tidak mendesak untuk skala saat ini)
- `findByPin` & `generatePin` masih O(N) scan (`rooms.ts:46-52,214-216`) — konsisten MVP, jadi catatan saja jika suatu saat ribuan room.
- Wildcard CORS berbasis `endsWith(".vercel.app")` (`index.ts:41-49`) berarti siapa pun dengan deployment Vercel sendiri bisa membuat koneksi WS. Tanpa sistem auth, dampaknya minim, tapi patut dicatat jika nanti ada fitur privat.
- Container-game membaca `myId = socket.id` saat render (`SnakesLaddersContainer.tsx:58`, `HangmanContainer.tsx:35`, `SeaBattleContainer.tsx:24`) — bisa stale setelah reconnect; `useRoom.myId` (nickname-matched) lebih tahan. Satukan sumber `myId` saat menyentuh H-3.

### Matriks skenario edge case (ringkasan status)

| # | Skenario | Status |
|---|---|---|
| 1 | Aksi di luar giliran (server) | ✅ Ditolak semua engine + error event |
| 2 | Aksi di luar giliran (UI) | ✅ Tombol disabled, strict equality (FE-F3) |
| 3 | Klik ganda mulai game | ✅ H3 guard + reset 'finished' |
| 4 | Klik ganda reveal/fire/roll | ✅ Server reject idempotent (optimistic lock SL lihat L-1) |
| 5 | Manipulasi state via payload socket | ✅ Projection C1/C4 + server authoritative |
| 6 | Payload malformed / client raw | ❌ **H-1: bisa crash server** |
| 7 | Refresh / blip mid-game | ❌ **H-3: keluar permanen + forfeit** |
| 8 | Recovery SPA mid-game | ⚠️ SL/Hangman/SeaBattle ✅, Minesweeper ❌ **H-4 deadlock** |
| 9 | Disconnect mid-game | ⚠️ Engine-wise rapi (forfeit/solo per engine), tapi tanpa grace period (bagian H-3) |
| 10 | Room 3-4 pemain + Sea Battle | ❌ **H-2** |
| 11 | Duplikat nickname | ❌ M-1 |
| 12 | Spam chat | ✅ M7; Spam reaksi ❌ M-2; Spam aksi ❌ M-3 |
| 13 | Room idle | ⚠️ 'waiting' ✅ L1; 'finished'/'playing' ❌ M-4 |
| 14 | AFK pemain dengan giliran | ❌ M-5 |
| 15 | Loop/deadlock server | ✅ Semua loop bounded; tidak ditemukan |
| 16 | Win/lose coverage aturan | ✅ (SL bounce-back + urutan ular→tangga benar; Hangman apostrophe-safe M3; SeaBattle C1 empty-fleet; Minesweeper boom/clean) — minus M-6 |
| 17 | Ganti game mid-match / restart 'finished' | ✅ SV-H6 + resetRoomForNewGame |
| 18 | Input caps (nickname/emoji/chat/payload) | ✅ M5 + `maxHttpBufferSize` 64KB |
| 19 | Restart server | ⚠️ Diterima sebagai batasan desain (in-memory, terdokumentasi di DEPLOYMENT.md) |

---

## 3. Rekomendasi Perbaikan Logika

### R-1. Satukan "pintu masuk event" yang dipertahankan (menutup H-1 + M-2 + M-3 sekaligus)
Buat satu helper di `server/src/index.ts`:

```ts
const safeHandler = (name: string, fn: (socket: Socket, data: any, ack?: unknown) => void) =>
  (socket: Socket) => (data: any, ack?: unknown) => {
    try {
      if (data !== undefined && data !== null && typeof data !== 'object') return; // payload harus object
      fn(socket, data, ack);
    } catch (err) {
      console.error(`[Handler:${name}]`, err);
      socket.emit('room:error', { message: 'Terjadi kesalahan internal' });
    }
  };
```

lalu registrasikan semua event lewat ini, tambahkan `if (typeof ack !== 'function') return;` untuk event ber-ack (`room:create/join/sync`), dan `allowEvent` untuk `game:action` (30/10 dtk), `reaction:send` (10/10 dtk), `player:ready` (10/10 dtk). Efek: seluruh kelas crash-by-payload hilang dengan satu pola, tanpa menyentuh engine.

### R-2. Validasi komposisi pemain per game di `game:start` (menutup H-2)
Tambahkan tabel kontrak di `base.ts` atau `gameService.ts`:

```ts
const GAME_PLAYER_REQUIREMENTS: Record<GameType, { min: number; max: number }> = {
  'snakes-ladders': { min: 2, max: 4 },
  'hangman':        { min: 2, max: 4 },
  'sea-battle':     { min: 2, max: 2 },
  'minesweeper':    { min: 2, max: 4 }, // spec bilang 2 — putuskan: enforce 2 atau izinkan co-op lebih
};
```

`game:start` menolak (pesan spesifik: "Sea Battle hanya untuk 2 pemain") sebelum `createInstance`. Sebagai pertahanan-in-depth: `SeaBattleEngine.removePlayer` no-op untuk id di luar `{player1Id, player2Id}`; `seaBattleView` throw untuk spectator id. (Opsional lanjutan: dukung spectator resmi agar ruang 3-4 orang tetap bisa main 1v1 sambil menonton — tapi itu feature baru, bukan bagian fix.)

### R-3. Grace-period disconnect + rejoin mid-game (menutup H-3, fondasi untuk mencegah H-4)
Rancangan minimum yang tidak membongkar engine:

1. `handlePlayerExit` mid-game: jangan langsung `engine.removePlayer`. Tandai `room.pendingExits[socketId] = Date.now()` dan broadcast `player:update` dengan flag `disconnected: true` agar UI menampilkan "menunggu kembali..." (tipe `Player` dapat field opsional).
2. Sweeper baru (interval 10 dtk): pemain dengan usia pending > GRACE (mis. 60 dtk) → jalankan jalur `removePlayer` yang ada sekarang (forfeit/solo per engine) dan hapus dari room.
3. Jalur kembali: di `room:sync`, jika room `'playing'` dan ada pending exit yang cocok **nickname** (atau token kecil yang disimpan `sessionStorage` saat join — bukan state room, hanya token identitas), maka: hapus dari pending, update `player.id` lama → id baru di `room.players`, `instance.playerOrder`, dan `state.players/playerOrder` milik engine (semua engine menyimpan id pemain secara flat di state — SL `players[].id`, Hangman `playerOrder`, SeaBattle `player1Id/player2Id/currentTurn`, Minesweeper `playerOrder`) → broadcast state + turn event. Sekali id di-rename di semua tempat ini, tidak ada logika engine yang perlu berubah.
4. Update spec §11 agar janji reconnect sesuai perilaku baru.

Catatan kejujuran UI: selama grace berjalan, tampilkan banner "Koneksi terputus — 60 dtk untuk kembali (giliranmu aman)"; setelah forfeit, tampilkan "kamu keluar dari game".

### R-4. Sumber kebenaran giliran di snapshot, bukan di event stream (menutup H-4 permanen)
Prinsip: **snapshot `game:state` harus cukup untuk menentukan giliran tanpa perlu riwayat event.** Implementasi konkret:
- Tambahkan `playerOrder: string[]` pada `MinesweeperView` (id socket bukan informasi rahasia) — `toView` sudah memegang state yang punya `playerOrder`.
- Container Minesweeper menurunkan `isMyTurn` dari `view.playerOrder[view.currentTurn] === myId` (pola yang sudah terbukti di backstop Hangman), dengan `useGameTurn` tetap sebagai sumber realtime di antara snapshot.
- Hapus dua `dispatchEvent('gameville:turn')` di `page.tsx:75,136` (dead code) atau — jika ingin tetap event-driven — jadikan server mengirim `game:action {type:'turn'}` ke socket yang baru sync. Pilih satu mekanisme, jangan keduanya.
- Tes regresi: sync mid-game → tanpa event tambahan apa pun, UI tiap game harus menampilkan giliran yang benar.

### R-5. Kebenaran kontrafaktual kecil yang murah
- Minesweeper `generateGrid`: koreksi `bombCount`/`totalSafeCells` dari jumlah yang benar-benar ditempatkan (M-6, dua baris).
- `setGameType`: whitelist nilai terhadap union `GameType` sebelum menulis ke room (bagian dari R-1).
- Nickname unik per room di `joinRoom` (M-1) — satu `some()` check + pesan error Indonesia yang sudah jadi pola.
- Ular Tangga container: release `rolling` saat `room:error` (L-1).
- Hangman: kirim `firstTurnId` di `gameStart` (L-3) agar konsisten dengan Minesweeper.
- Broadcast `fireResult` ke room (L-4).

### R-6. Hygiene dokumentasi (agar audit berikutnya tidak menemukan drift lagi)
- Spec §8.3 Sea Battle: "auto-place atau manual" → sesuaikan dengan keputusan M-7.
- Spec §2.3 Minesweeper: "first-click safety TIDAK dijamin" → ganti "dijamin via C6 (grid lazy generation, 3×3 aman)".
- Spec §11 reconnect: ganti janji sesuai hasil R-3.
- `CLAUDE.md` fix legend: tambahkan kode fix baru (usulan: **S1** socket-handler safety, **G1** game-composition guard, **R1** rejoin/grace, **T1** turn-from-snapshot) agar riwayat fix tetap terlacak seperti F/H/M/C/L.

---

## 4. Daftar Prioritas Tindakan (Action Items)

Urutan disusun atas **dampak × probabilitas × biaya**. Item test mengasumsikan branch `test-framework` di-merge dulu (PR1 Vitest sudah berisi fondasi per-engine) sehingga test baru menumpang struktur `server/src/__tests__/` dan Playwright fixtures yang sudah ada.

### HIGH (kerjakan berurutan, semuanya sebelum feature baru apapun)

| # | Aksi | Menutup | Test yang menyertai (pola 3-PR) |
|---|---|---|---|
| H1 | Terapkan `safeHandler` + null-check ack + validasi payload object di semua handler room/game; rate limit `game:action` & `reaction:send` | H-1, M-2, M-3 | **Vitest:** unit test handler dengan socket.io-client ke server tiruan — kirim `player:ready`/`game:select`/`room:sync`/`room:create`/`game:action` tanpa payload & `room:sync` tanpa ack → asersi server tetap hidup + `room:error`. **Playwright (PR2):** smoke "malformed client tidak mengganggu dua tab normal". |
| H2 | Guard komposisi pemain per game di `game:start` (+ removePlayer/seaBattleView defensive) | H-2 | **Vitest:** `sea-battle.test.ts` — removePlayer dengan id ketiga TIDAK mengubah `winner`; seaBattleView untuk id ketiga throw; (baru) `game-start` validation table. **Playwright:** e2e 3-pemain memilih Sea Battle → tombol Mulai memunculkan error spesifik. |
| H3 | Grace-period disconnect + rejoin mid-game via `room:sync` (R-3 step 1-3), mulai dari co-op games lalu 1v1 | H-3 | **Vitest:** simulasi disconnect → reconnect dalam grace → seat kembali; lewat grace → forfeit sesuai engine. **Playwright:** e2e 2-tab — reload halaman mid-game → pemain kembali ke seatnya; (regresi) setelah grace, lawan menang. |
| H4 | `MinesweeperView.playerOrder` + derive `isMyTurn` dari snapshot + hapus dead-event `gameville:turn` | H-4 | **Vitest:** `toView` menyertakan `playerOrder`. **Playwright:** e2e — navigasi ulang ke `/room/[pin]` mid-game Minesweeper → indikator "Giliranmu!" tampil untuk pemain yang benar tanpa event tambahan → reveal sukses. |

### MEDIUM (setelah HIGH stabil; tiap item kecil dan mandiri)

| # | Aksi | Menutup | Test |
|---|---|---|---|
| M1 | Tolak nickname duplikat di `joinRoom` | M-1 | **Vitest:** join kedua dengan nickname sama → null + pesan. **Playwright:** 2-tab dengan nickname sama → tab kedua melihat error inline. |
| M2 | Turn timeout MVP: deadline per giliran di server (auto-pass/skip) + indikator UI | M-5 | **Vitest:** engine menerima injected clock/timeout → giliran ter-skip. **Playwright (opsional):** e2e dengan timeout diperpendek via env. |
| M3 | Sweep room `'finished'` >2 jam (+ pertimbangkan `'playing'` idle) | M-4 | **Vitest:** unit sweeper dengan `createdAt` palsu. |
| M4 | Koreksi `bombCount`/`totalSafeCells` pasca penempatan | M-6 | **Vitest:** patch `Math.random` agar penempatan gagal → asersi `totalSafeCells` = sel aman riil & game masih bisa dimenangkan. |
| M5 | Keputusan + implementasi atau penghapusan manual ship placement (M-7); update spec Minesweeper C6 & §11 | M-7 | Jika implement: **Vitest** validasi formasi manual (5 kapal, ukuran, tanpa overlap); jika tidak: hanya perubahan docs/UI label. |

### LOW (polish; kerjakan sambil luang)

| # | Aksi | Menutup |
|---|---|---|
| L1 | Release `rolling` saat `room:error` di SnakesLaddersContainer | L-1 |
| L2 | Kirim `firstTurnId` di Hangman `gameStart`; sederhanakan backstop container | L-3 |
| L3 | Broadcast `fireResult` ke seluruh room (feedback kena/meleset untuk kedua pihak) | L-4 |
| L4 | Satukan sumber `myId` container ke `useRoom.myId` | L-5 |
| L5 | (Opsional) client-side queue animasi Ular Tangga agar roll berikutnya menunggu animasi | L-2 |
| L6 | Catat O(N) `findByPin`/`generatePin` & CORS wildcard sebagai "known trade-offs" di CLAUDE.md | L-5 |

### Urutan eksekusi yang disarankan (satu kalimat)
**Merge `test-framework` → H1 (satu PR kecil, dampak terbesar) → H2 + H4 (dua PR kecil, banyak test) → H3 (PR fitur sedang, butuh desain rejoin) → M1-M5 → L1-L6.**

---

## Lampiran: Bukti utama per temuan

| Temuan | Bukti kode |
|---|---|
| H-1 | `server/src/index.ts:164-196,198-204,272-285,379-389`; `server/src/rooms.ts:17-24`; `server/node_modules/socket.io/dist/socket.js:689-700` (`dispatch` → `process.nextTick` → `emitUntyped` tanpa try/catch); CORS tanpa-Origin diizinkan `index.ts:51-55` |
| H-2 | `server/src/rooms.ts:175-182` (canStartGame); `server/src/games/sea-battle.ts:86-98,227-239,271-275` |
| H-3 | `server/src/index.ts:159-170`; `server/src/rooms.ts:214-216,246-260`; `server/src/games/snakes-ladders.ts:19-35`; `sea-battle.ts:227-239`; spec §11 baris 394 |
| H-4 | `frontend/src/hooks/useGameTurn.ts:18-44`; `shared/types.ts:196-208` (MinesweeperView tanpa playerOrder); `frontend/src/app/room/[pin]/page.tsx:75,136` (event tanpa listener — grep `gameville:turn` hanya 2 dispatch, 0 listener); kontras: `HangmanContainer.tsx:190-194`, `SnakesLaddersContainer.tsx:151-154`, `SeaBattleContainer.tsx:138` |
| M-1 | `server/src/rooms.ts:81-108,246-260`; `frontend/src/hooks/useRoom.ts:63-72` |
| M-2/M-3 | `server/src/index.ts:391-415` (chat berlimit, reaksi tidak); `index.ts:272-377` (aksi tanpa limit) |
| M-4 | `server/src/gameService.ts:178-189`; `server/src/rooms.ts:135-141` |
| M-6 | `server/src/games/minesweeper.ts:332-356,182` |
| M-7 | Spec `2026-07-29-...md:338` vs `sea-battle.ts:107-143` + `shared/types.ts:48-64` |
| L-1 | `frontend/src/components/games/snakes-ladders/SnakesLaddersContainer.tsx:68-71,141-146` |

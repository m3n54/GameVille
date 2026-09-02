# Test Framework + E2E Smoke for GameVille

**Tanggal**: 2026-09-02
**Tipe**: Architectural — new test infrastructure subsystem
**Trigger**: Rekomendasi dari audit post-mortem; CLAUDE.md tegas "no test framework configured, verification = tsc + next build + 2-tab smoke" sebagai celah
**Status**: Draft — menunggu user review

---

## Context

GameVille memiliki 4 engine multiplayer (Ular Tangga, Hangman, Sea Battle, Minesweeper) yang baru saja melalui audit besar dengan 16 commit refactor + bug fix. Verifikasi saat ini 100% manual via 2-tab smoke test. Tidak ada regression net.

**Celah terbesar**: bug C4 sea-battle per-player projection (player2 lihat player1's ships sebagai `myShips`) baru ditemukan via **manual playtest setelah deploy**. Tanpa test otomatis, regresi C4-equivalent bisa lewat tanpa terdeteksi.

**Tujuan spec ini**:
1. Unit-test engine projection + validation (regression net untuk bugs yang baru di-fix)
2. E2E 2-tab smoke test untuk happy path (room flow) + sea-battle ship placement parity
3. CI integration agar regression ter-catch sebelum merge

**Non-tujuan**:
- Snapshot testing (flake)
- Visual regression
- Animation testing
- Load testing
- Mobile-specific browser testing (Playwright desktop Chromium cukup untuk MVP)

---

## Decisions (Approved)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Vitest** untuk unit tests | Zero-config TS, native `tsconfig` integration, 10x Jest speed, `vi.fn()` API |
| 2 | **Playwright** untuk e2e 2-tab | Real socket.io, real browser, 2 browser contexts = 2 tabs |
| 3 | **GitHub Actions** untuk CI | Repo sudah di GitHub (`m3n54/GameVille`) |
| 4 | **3 PR bertahap** | PR1=Vitest+unit, PR2=Playwright e2e+parity, PR3=CI workflow |
| 5 | **No coverage threshold** | YAGNI; coverage tidak boleh jadi gate yang gagal-kan PR legit |
| 6 | **No mutation testing** | Overkill untuk 4 engine |

---

## Architecture

### Test Layers

```
┌─────────────────────────────────────────────────┐
│  Layer 3: E2E (Playwright)                       │
│  - 2 browser contexts, real socket.io            │
│  - 4 smoke tests: room flow × 4 game types        │
│  - Sea-battle ship placement parity (regression)  │
├─────────────────────────────────────────────────┤
│  Layer 2: Engine Integration (Vitest, same runner) │
│  - Engine handleAction() with constructed state    │
│  - Project: sea-battle C4 regression               │
│  - Hangman apostrophe win check                     │
│  - Minesweeper bomb validation (3 modes)            │
├─────────────────────────────────────────────────┤
│  Layer 1: Unit (Vitest, pure functions)            │
│  - stateForClient / projection helpers             │
│  - DIFFICULTY_CONFIG lookups                        │
│  - Win-condition predicates                        │
└─────────────────────────────────────────────────┘
```

### Repository Layout (additions only)

```
GameVille/
├── server/
│   ├── src/
│   │   └── games/
│   │       ├── __tests__/                    # NEW: Vitest unit tests
│   │       │   ├── sea-battle.test.ts
│   │       │   ├── hangman.test.ts
│   │       │   ├── minesweeper.test.ts
│   │       │   └── snakes-ladders.test.ts
│   │   ├── vitest.config.ts                  # NEW
│   │   └── package.json                      # MOD: add scripts
│
├── frontend/
│   ├── tests/                                # NEW: Playwright e2e
│   │   ├── fixtures/
│   │   │   └── room.ts                       # 2-context helper
│   │   ├── room-flow.spec.ts                 # room create/join/start
│   │   ├── sea-battle.spec.ts                # ship placement parity
│   │   ├── snakes-ladders.spec.ts
│   │   ├── hangman.spec.ts
│   │   └── minesweeper.spec.ts
│   ├── playwright.config.ts                  # NEW
│   └── package.json                          # MOD: add scripts
│
├── .github/
│   └── workflows/
│       └── ci.yml                            # NEW
│
└── package.json                              # NEW: root workspace glue (optional)
```

### Vitest Configuration (server)

`server/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,                // explicit imports for clarity
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',             // matches V8 runtime
      reporter: ['text', 'html'],
      exclude: ['**/__tests__/**', '**/*.test.ts'],
    },
  },
});
```

### Playwright Configuration (frontend)

`frontend/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run dev',
      cwd: '..',                  // start server first
      port: 3001,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

**Catatan**: Playwright `webServer` blocks sampai port ready. `reuseExistingServer: true` di dev (manual) agar tidak bentrok.

---

## Test Spec Per Layer

### Layer 1: Vitest Unit (server/src/games/__tests__/)

**`sea-battle.test.ts`** (~8 tests) — regresi utama C4:
- `stateForClient` returns `myGrid` for `forPlayerId === player1Id`
- `stateForClient` returns `enemyGrid` (no `'S'`) for `forPlayerId === player2Id`
- `stateForClient` throws when `forPlayerId == null && !revealAll`
- `autoPlace` throws on crowded board (no silent skip)
- `removePlayer` returns survivor when 1 left
- `enemyShipsPlaced` count matches ship count
- `seaBattleView` for `revealAll: true` includes all ships

**`hangman.test.ts`** (~5 tests) — regresi M3:
- Win check apostrophe-safe: "DON'T" → all letters guessed on D,O,N,T
- Win check ignores spaces/punctuation
- `removePlayer` with 1 survivor sets `winner: 'team'`
- `removePlayer` with 0 left sets `winner: 'none'`
- `correctGuess` event fires for matching letter

**`minesweeper.test.ts`** (~8 tests) — regresi C6 + new bomb config:
- First click safety: no bomb in clicked cell + 3x3 neighborhood
- `bombCount` validation: rejects `N < 9`
- `bombCount` validation: rejects `N > rows*cols - 9`
- `bombMode: 'random'` respects `bombRange.min` and `.max`
- `bombMode: 'custom'` accepts valid `customBombCount`
- `bombMode: 'random'` rejects `min > max`
- `revealSafe` increments `revealedSafeCount`
- `chainActive: true` keeps `currentTurn` after valid move

**`snakes-ladders.test.ts`** (~4 tests):
- Snake applies before ladder
- Bounce-back on overshoot: `position > 99` returns `99 - (newPos - 99)`
- Win at `position >= 99`
- `playerOrder` rotation skips removed players (H2)

### Layer 2: Engine Integration (Vitest, same runner as Layer 1)

Engine `handleAction()` called with constructed state. Validates full flow:
- `sea-battle` `fire` event updates `grid2` for `player1Id` target
- `hangman` `guess` updates `correctLetters` + `remainingAttempts`
- `minesweeper` `reveal` triggers lazy grid generation if `grid === null`

### Layer 3: Playwright E2E (frontend/tests/)

**`room-flow.spec.ts`** — smoke test generic:
- Tab A: open `localhost:3000`, create room with nickname "host"
- Capture PIN
- Tab B: open `localhost:3000`, join with PIN + nickname "joiner"
- Tab A: select game, click "Mulai"
- Both tabs see "playing" state

**`sea-battle.spec.ts`** — C4 regression:
- Setup: 2 players, both in setup phase
- Tab A: click "Tempatkan Kapal" → `myShips.length > 0`
- Tab B: click "Tempatkan Kapal" → `myShips.length > 0`
- Assert: Tab A `enemyShipsPlaced === 1` (Tab B's ship) dan vice versa
- Assert: Tab A `myGrid[i][j] !== 'S'` for cells where Tab B placed (anti-cheat)
- Game start: Tab A fire on Tab B's ship → `myShips.length` on Tab B decreases

**`snakes-ladders.spec.ts`**, **`hangman.spec.ts`**, **`minesweeper.spec.ts`**: smoke for first action.

---

## GitHub Actions Workflow

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  server:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: cd server && npm ci
      - run: cd server && npx tsc --noEmit
      - run: cd server && npm test

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: cd frontend && npm ci
      - run: cd frontend && npx tsc --noEmit
      - run: cd frontend && npm run build
      - run: cd frontend && npx playwright install --with-deps chromium
      - run: cd frontend && npm run test:e2e
```

**Cache strategy**: `actions/setup-node` with `cache: 'npm'` cache `~/.npm`. Playwright browsers cached via `actions/cache@v4` keyed on Playwright version.

**Concurrency**: `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` — older runs di-cancel saat push baru.

---

## PR Breakdown

### PR1: Vitest + Unit Tests
**Files**: ~7 new
- `server/vitest.config.ts`
- `server/src/games/__tests__/sea-battle.test.ts` (~8 tests)
- `server/src/games/__tests__/hangman.test.ts` (~5 tests)
- `server/src/games/__tests__/minesweeper.test.ts` (~8 tests)
- `server/src/games/__tests__/snakes-ladders.test.ts` (~4 tests)
- `server/package.json` (add `test` script)
- `.gitignore` (add `coverage/`)

**Acceptance**:
- `cd server && npm test` → all green
- `cd server && npx tsc --noEmit` → clean
- `cd server && npm run build` → unchanged (no source change)
- ≥25 tests passing

**Value delivered**: regression net untuk bugs C1-C7, M1-M3, H1-H8 yang baru di-fix.

### PR2: Playwright E2E + Sea-battle Parity
**Files**: ~7 new
- `frontend/playwright.config.ts`
- `frontend/tests/fixtures/room.ts` (2-context helper)
- `frontend/tests/room-flow.spec.ts`
- `frontend/tests/sea-battle.spec.ts` (C4 regression)
- `frontend/tests/snakes-ladders.spec.ts`
- `frontend/tests/hangman.spec.ts`
- `frontend/tests/minesweeper.spec.ts`
- `frontend/package.json` (add `test:e2e` script)
- `.gitignore` (add `playwright-report/`, `test-results/`)

**Acceptance**:
- `cd frontend && npx playwright install chromium` → 1x setup
- `cd frontend && npm run test:e2e` → all 5 spec green
- 1 dev server start (FE) + 1 (BE) saat `npm run dev`
- Sea-battle spec: assert both tabs see `enemyShipsPlaced: 1` after 1 player places

**Value delivered**: end-to-end regression net, terutama untuk bugs UI-flow (F1-F9).

### PR3: CI Workflow
**Files**: 1 new
- `.github/workflows/ci.yml`
- README badge update (optional)

**Acceptance**:
- Push PR ke `main` → GitHub Actions trigger
- 3 jobs: server (tsc+test), frontend (tsc+build+e2e)
- Cache hit pada 2nd run

**Value delivered**: PR tidak bisa merge tanpa test pass.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Playwright e2e flake dari socket timing | `expect().toHaveText()` dengan `timeout: 5000`; retry di CI 2x |
| `npm run dev` startup lambat | `webServer` config punya `timeout: 60_000` |
| 2 browser contexts bentrok dengan state | `tests/fixtures/room.ts` generate unique nickname + room per test |
| Vitest tidak support dynamic import di `tsx` | Backend sudah `tsx` — verified by `npm run dev` jalan |
| Test bloat → CI lambat | Cache npm + Playwright; test total target <2 min |
| E2E tests fail saat ngrok tunnel down | Test hanya butuh localhost:3001 (no external) |

---

## Out of Scope (eksplisit)

- ❌ Frontend unit tests (React Testing Library) — engine sudah 90% logic
- ❌ Backend integration tests untuk Socket.io events (covered by Playwright e2e)
- ❌ Load testing (k6) — MVP
- ❌ Mobile browser testing — Playwright desktop cukup
- ❌ Snapshot testing UI — flake
- ❌ Mutation testing (Stryker) — overkill
- ❌ Coverage threshold gate — YAGNI

---

## Verification (post-implementation)

Per PR:
1. `cd server && npx tsc --noEmit && npm test` → all green
2. `cd frontend && npx tsc --noEmit && npm run build && npm run test:e2e` → all green
3. Manual smoke: 2-tab buat room + play 1 game sampai selesai
4. PR3: push ke branch → GitHub Actions hijau

---

## Commit Strategy (per PR)

PR1: ~3-4 commits
- `chore(server): add vitest config + test script`
- `test(srv): sea-battle projection + fleet guard tests`
- `test(srv): hangman win + removePlayer survivor tests`
- `test(srv): minesweeper first-click + bomb validation tests`

PR2: ~3-4 commits
- `chore(fe): add playwright config + test:e2e script`
- `test(fe): room flow 2-tab smoke`
- `test(fe): sea-battle ship placement parity (C4 regression)`
- `test(fe): SL/hangman/minesweeper first-action smoke`

PR3: 1 commit
- `ci: add GitHub Actions workflow with vitest + playwright`

---

---

## Future (not in this spec)

- Backend integration tests for Socket.io (without browser)
- Frontend React Testing Library untuk component logic
- `vercel env pull` di CI untuk e2e (kalau perlu test against prod)
- Self-hosted GitHub Actions runner (kalau e2e >5 min)

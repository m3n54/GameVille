'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import Grid from './Grid';
import Button from '@/components/ui/Button';
import type { SeaBattlePlayerView, ServerToClientEvents, ClientToServerEvents } from '@/types';

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: SeaBattlePlayerView | null;
  // L-5: stable self id from useRoom (match-by-nickname) — survives websocket
  // reconnects, unlike socket.id which changes on every reconnect.
  myId?: string | null;
}

// SB-1: the player's fleet specification — the server rebuilds type/hits
// from the cell layout, so IDs here only index the tray.
const FLEET: { id: string; size: number; label: string }[] = [
  { id: 'b4', size: 4, label: 'Kapal Perang' },
  { id: 'c1', size: 3, label: 'Penjelajah' },
  { id: 'c2', size: 3, label: 'Penjelajah' },
  { id: 'd2', size: 2, label: 'Perusak' },
  { id: 's1', size: 1, label: 'Kapal Selam' },
];

interface DraftShip {
  fleetId: string;
  size: number;
  cells: [number, number][];
}

// C1: the server now sends each player their OWN projection (myGrid/enemyGrid/
// myShips/enemySunkShips). The old client received both raw grids and stripped
// enemy ships locally — pointless once the payload itself was the leak.
export default function SeaBattleContainer({ socket, state: initial, myId: myIdProp }: Props) {
  const [gameState, setGameState] = useState<SeaBattlePlayerView | null>(initial);
  const [message, setMessage] = useState('');
  const [lastShot, setLastShot] = useState<{ row: number; col: number } | null>(null);
  // SB-1: draft ships live locally until Konfirmasi sends a single placeShips
  // action. The engine only accepts a complete valid fleet from an empty slot.
  const [draftShips, setDraftShips] = useState<DraftShip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'H' | 'V'>('H');
  const [setupHint, setSetupHint] = useState('');
  // H6: tracked timers so unmount clears them (no setState-on-unmount warnings).
  const timersRef = useRef<Set<number>>(new Set());
  // L-5: prefer the stable prop; the socket.id fallback keeps the container
  // usable standalone (only valid until the first reconnect swaps the id).
  // socket.id is `string | undefined` in socket.io-client 4.8 — normalize to
  // null so identity keeps a single `string | null` shape across containers.
  const myId = myIdProp ?? socket.id ?? null;

  // H6: clear all pending timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  // Sync per-player view
  useEffect(() => {
    if (!socket) return;

    const handleState = (state: unknown) => {
      setGameState(state as SeaBattlePlayerView);
    };

    socket.on('game:state', handleState);
    return () => { socket.off('game:state', handleState); };
  }, [socket]);

  const myShipsPlaced = (gameState?.myShips ?? []).length > 0;

  // SB-1: once the server confirms a fleet (auto or manual), the draft is
  // obsolete — clearing even when Acak committed the fleet.
  useEffect(() => {
    if (myShipsPlaced) {
      setDraftShips([]);
      setSelectedId(null);
      setSetupHint('');
    }
  }, [myShipsPlaced]);

  // React to game events
  useEffect(() => {
    if (!socket) return;

    const handleAction = (data: unknown) => {
      const action = data as {
        type: string;
        playerId?: string;
        nextPlayerId?: string;
        row?: number;
        col?: number;
        hit?: boolean;
        sunkShip?: string | null;
      };

      if (action.type === 'fireResult') {
        setLastShot({ row: action.row!, col: action.col! });
        if (action.sunkShip) {
          setMessage(`🔥 Kapal ${action.sunkShip} tenggelam!`);
        } else if (action.hit) {
          setMessage('🔥 Tembakan kena!');
        } else {
          setMessage('💨 Meleset!');
        }
        const id = window.setTimeout(() => {
          setLastShot(null);
          timersRef.current.delete(id);
        }, 1500);
        timersRef.current.add(id);
      }

      if (action.type === 'turn') {
        if (action.nextPlayerId === myId) {
          setMessage('Giliranmu! Pilih target 🎯');
        } else {
          setMessage('Menunggu giliran lawan...');
        }
      }

      if (action.type === 'gameStart') {
        setMessage('Game dimulai! Giliran pertama! 🚀');
      }

      // Setup-phase prompt: tells the waiting player their opponent just
      // finished placing and it's their turn to place. Without this, the
      // anti-cheat projection (myShips: [] for the player who hasn't
      // placed yet) leaves no signal that they still need to act.
      if (action.type === 'shipsPlaced') {
        if (action.playerId === myId) {
          setMessage('Kapalmu sudah ditempatkan! Menunggu lawan...');
        } else {
          setMessage('Lawan sudah menempatkan kapal. Saatnya kamu! 🚢');
        }
        const id = window.setTimeout(() => {
          setMessage('');
          timersRef.current.delete(id);
        }, 3000);
        timersRef.current.add(id);
      }
    };

    socket.on('game:action', handleAction);
    return () => { socket.off('game:action', handleAction); };
  }, [socket, myId]);

  const autoPlace = useCallback(() => {
    socket.emit('game:action', { type: 'autoPlace' });
    setDraftShips([]);
    setSelectedId(null);
    setSetupHint('');
    setMessage('Menempatkan kapal...');
  }, [socket]);

  // SB-1: lightweight client mirror of the server buffer rule — reject early
  // on clicks that the engine would reject anyway (UX is instant, not ack).
  const canPlaceDraft = (cells: [number, number][]): string | null => {
    for (const [r, c] of cells) {
      if (r < 0 || r > 9 || c < 0 || c > 9) return 'Kapal keluar dari papan!';
      for (const d of draftShips) {
        for (const [dr, dc] of d.cells) {
          if (Math.max(Math.abs(r - dr), Math.abs(c - dc)) <= 1) {
            return 'Kapal tidak boleh menempel atau tumpang tindih!';
          }
        }
      }
    }
    return null;
  };

  const handleSetupClick = useCallback((row: number, col: number) => {
    // Clicking a placed draft ship picks it back up.
    const hit = draftShips.find((d) => d.cells.some(([r, c]) => r === row && c === col));
    if (hit) {
      setDraftShips((prev) => prev.filter((d) => d.fleetId !== hit.fleetId));
      setSetupHint('Kapal diambil kembali — letakkan lagi dari daftar.');
      return;
    }
    if (selectedId == null) {
      setSetupHint('Pilih kapal dulu dari daftar di atas.');
      return;
    }
    const entry = FLEET.find((f) => f.id === selectedId);
    if (!entry) return;
    const cells: [number, number][] = [];
    for (let i = 0; i < entry.size; i++) {
      cells.push(orientation === 'H' ? [row, col + i] : [row + i, col]);
    }
    const problem = canPlaceDraft(cells);
    if (problem) {
      setSetupHint(problem);
      return;
    }
    const next = [...draftShips, { fleetId: entry.id, size: entry.size, cells }];
    setDraftShips(next);
    // Two Cruisers share a size — keep the selection when another of the
    // same size is still in the tray, otherwise clear so the hint prompts.
    const stillHave = FLEET.some((f) => f.size === entry.size && !next.some((d) => d.fleetId === f.id));
    setSelectedId(stillHave ? entry.id : null);
    setSetupHint('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, draftShips, selectedId, orientation]);

  const confirmPlacement = useCallback(() => {
    if (draftShips.length !== 5) return;
    socket.emit('game:action', { type: 'placeShips', payload: { ships: draftShips.map(({ cells }) => ({ cells })) } });
    setDraftShips([]);
    setSelectedId(null);
    setSetupHint('');
    setMessage('Menempatkan kapal...');
  }, [socket, draftShips]);

  const resetDraft = useCallback(() => {
    setDraftShips([]);
    setSetupHint('');
  }, []);

  const fire = useCallback((row: number, col: number) => {
    const grid = gameState?.enemyGrid;
    if (!gameState || gameState.phase !== 'playing') return;
    // Enemy grid cells are only 'H'/'M'/' ' — an unfired cell is ' '
    // ('S' never reaches us while playing).
    if (!grid || !grid[row] || grid[row][col] !== ' ') return;
    socket.emit('game:action', { type: 'fire', payload: { row, col } });
  }, [socket, gameState]);

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-cute-muted text-xl">Memuat game...</p>
      </div>
    );
  }

  const myGrid = gameState.myGrid ?? [];
  const enemyGrid = gameState.enemyGrid ?? [];
  const myShips = gameState.myShips ?? [];

  const isMyTurn = !!gameState.currentTurn && gameState.currentTurn === myId;
  const isSetup = gameState.phase === 'setup';
  const isOver = gameState.phase === 'finished';
  // Setup-turn indicator: highlights "your turn to place" when both
  // conditions hold — game is in setup, and the engine's currentTurn
  // points at us. Sea-battle keeps state.currentTurn = player1 throughout
  // setup (no per-tick rotation), so this lights up for player1 from
  // the start and switches to player2 once player1 finishes. Both can
  // still click the button any time during setup; this is purely UX.
  const isMySetupTurn = isSetup && isMyTurn;
  // Opponent has placed when their side has any ships. Used to render a
  // confirmation hint so player2 knows they're racing player1, not alone.
  const enemyShipsPlaced = gameState.enemyShipsPlaced ?? 0;
  // SB-1: own board is click-to-place while the local draft is incomplete.
  const isDrafting = isSetup && !myShipsPlaced && draftShips.length < 5;
  const previewGrid = isSetup && draftShips.length > 0
    ? myGrid.map((row, r) => row.map((cell, c) => draftShips.some((d) => d.cells.some(([dr, dc]) => dr === r && dc === c)) ? 'S' : cell))
    : myGrid;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Status message */}
      <AnimatePresence mode="wait">
        <motion.div
          key={isOver ? `over-${gameState.winner}` : message || 'waiting'}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="text-center text-lg font-bold text-cute-text"
        >
          {isOver
            ? gameState.winner === myId && gameState.winner !== null
              ? '🎉 Kamu Menang! Semua kapal lawan tenggelam!'
              : '😵 Kamu Kalah... Semua kapalmu tenggelam!'

            : message || 'Menunggu...'}
        </motion.div>
      </AnimatePresence>

      {/* Setup phase: tray + auto + confirm */}
      {isSetup && (
        <div className="text-center space-y-3">
          {!myShipsPlaced && (
            <>
              <div className="flex flex-wrap justify-center gap-2">
                {FLEET.map((f) => {
                  const used = draftShips.some((d) => d.fleetId === f.id);
                  const selected = selectedId === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => { setSelectedId(selected ? null : f.id); setSetupHint(''); }}
                      disabled={used}
                      className={`px-3 py-2 rounded-cute border-2 text-sm font-bold transition-all ${
                        used
                          ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed line-through'
                          : selected
                            ? 'border-primary bg-pink-50 text-cute-text shadow-soft'
                            : 'border-gray-200 bg-white text-cute-text hover:border-primary'
                      }`}
                    >
                      {f.label} <span className="text-xs">{'🚢'.repeat(f.size)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setOrientation((o) => (o === 'H' ? 'V' : 'H'))} variant="secondary">
                  🔄 Putar: {orientation === 'H' ? 'Horizontal' : 'Vertikal'}
                </Button>
                <Button onClick={resetDraft} variant="ghost" disabled={draftShips.length === 0}>
                  ↩️ Atur Ulang
                </Button>
                <Button onClick={autoPlace}>🎲 Acak</Button>
                <Button onClick={confirmPlacement} disabled={draftShips.length !== 5}>
                  ✅ Konfirmasi ({draftShips.length}/5)
                </Button>
              </div>
              {setupHint && (
                <p className="text-xs font-semibold text-primary">{setupHint}</p>
              )}
            </>
          )}
          {myShipsPlaced && (
            <Button onClick={autoPlace} disabled>
              ✅ Kapal sudah ditempatkan
            </Button>
          )}
          {isMySetupTurn && !myShipsPlaced && (
            <p className="text-sm font-semibold text-cute-primary">
              ⏳ Giliranmu: tempatkan kapalmu!
            </p>
          )}
          {enemyShipsPlaced > 0 && !myShipsPlaced && (
            <p className="text-xs text-cute-muted">
              Lawan sudah menempatkan {enemyShipsPlaced} kapal.
            </p>
          )}
        </div>
      )}

      {/* Grids */}
      <div className="flex flex-col md:flex-row gap-8 justify-center">
        {/* My grid — click-to-place while drafting (SB-1) */}
        <div className="text-center">
          <h3 className="font-bold text-cute-text mb-2">⭐ Papanmu</h3>
          <Grid grid={previewGrid} isOwn={true} showShips={true} onCellClick={isDrafting ? handleSetupClick : undefined} disabled={!isDrafting} />
          <p className="text-xs text-cute-muted mt-1">
            Kapal:{' '}
            {myShips.map(s => s.type).join(', ') || (isDrafting ? `${draftShips.length}/5 ditaruh` : 'Belum ada')}
          </p>
        </div>

        {/* Enemy grid */}
        <div className="text-center">
          <h3 className="font-bold text-cute-text mb-2">🎯 Lawan</h3>
          <Grid
            grid={enemyGrid}
            isOwn={false}
            showShips={false}
            onCellClick={isMyTurn && !isSetup && !isOver ? fire : undefined}
            lastShot={lastShot}
            disabled={!isMyTurn || isSetup || isOver}
          />
          <p className="text-xs text-cute-muted mt-1">
            Kapal lawan tenggelam: {gameState.enemySunkShips ?? 0}/5
            {isMyTurn && !isSetup && !isOver && ' · Klik grid untuk menembak!'}
          </p>
        </div>
      </div>
    </div>
  );
}

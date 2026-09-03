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

// C1: the server now sends each player their OWN projection (myGrid/enemyGrid/
// myShips/enemySunkShips). The old client received both raw grids and stripped
// enemy ships locally — pointless once the payload itself was the leak.
export default function SeaBattleContainer({ socket, state: initial, myId: myIdProp }: Props) {
  const [gameState, setGameState] = useState<SeaBattlePlayerView | null>(initial);
  const [message, setMessage] = useState('');
  const [lastShot, setLastShot] = useState<{ row: number; col: number } | null>(null);
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
    setMessage('Menempatkan kapal...');
  }, [socket]);

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
  const myShipsPlaced = myShips.length > 0;
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

      {/* Setup phase: auto-place button */}
      {isSetup && (
        <div className="text-center space-y-2">
          <Button onClick={autoPlace} disabled={myShipsPlaced}>
            {myShipsPlaced ? '✅ Kapal sudah ditempatkan' : '🚢 Tempatkan Kapal (Auto)'}
          </Button>
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
        {/* My grid */}
        <div className="text-center">
          <h3 className="font-bold text-cute-text mb-2">⭐ Papanmu</h3>
          <Grid grid={myGrid} isOwn={true} showShips={true} disabled={true} />
          <p className="text-xs text-cute-muted mt-1">
            Kapal:{' '}
            {myShips.map(s => s.type).join(', ') || 'Belum ada'}
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

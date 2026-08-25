'use client';

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import Grid from './Grid';
import Button from '@/components/ui/Button';
import type { SeaBattlePlayerView, ServerToClientEvents, ClientToServerEvents } from '@/types';

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: SeaBattlePlayerView | null;
}

// C1: the server now sends each player their OWN projection (myGrid/enemyGrid/
// myShips/enemySunkShips). The old client received both raw grids and stripped
// enemy ships locally — pointless once the payload itself was the leak.
export default function SeaBattleContainer({ socket, state: initial }: Props) {
  const [gameState, setGameState] = useState<SeaBattlePlayerView | null>(initial);
  const [message, setMessage] = useState('');
  const [lastShot, setLastShot] = useState<{ row: number; col: number } | null>(null);
  const myId = socket.id;

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
        setTimeout(() => setLastShot(null), 1500);
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

  useEffect(() => {
    setGameState(initial);
  }, [initial]);

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
        <div className="text-center">
          <Button onClick={autoPlace} disabled={myShipsPlaced}>
            {myShipsPlaced ? '✅ Kapal sudah ditempatkan' : '🚢 Tempatkan Kapal (Auto)'}
          </Button>
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

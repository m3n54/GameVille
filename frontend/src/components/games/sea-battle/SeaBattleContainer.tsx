'use client';

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import Grid from './Grid';
import Button from '@/components/ui/Button';
import type { SeaBattleState, ServerToClientEvents, ClientToServerEvents } from '@/types';

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: SeaBattleState | null;
}

export default function SeaBattleContainer({ socket, state: initial }: Props) {
  const [gameState, setGameState] = useState<SeaBattleState | null>(initial);
  const [myGrid, setMyGrid] = useState<string[][]>([]);
  const [enemyGrid, setEnemyGrid] = useState<string[][]>([]);
  const [message, setMessage] = useState('');
  const [lastShot, setLastShot] = useState<{ row: number; col: number } | null>(null);
  const myId = socket.id;

  // Sync full game state
  useEffect(() => {
    if (!socket) return;

    const handleState = (state: unknown) => {
      const s = state as SeaBattleState;
      setGameState(s);

      if (myId === s.player1Id) {
        setMyGrid(s.grid1);
        setEnemyGrid(getEnemyView(s.grid2));
      } else {
        setMyGrid(s.grid2);
        setEnemyGrid(getEnemyView(s.grid1));
      }
    };

    socket.on('game:state', handleState);
    return () => { socket.off('game:state', handleState); };
  }, [socket, myId]);

  // React to game events
  useEffect(() => {
    if (!socket) return;

    const handleAction = (data: unknown) => {
      const action = data as {
        type: string;
        nextPlayerId?: string;
        playerId?: string;
        row?: number;
        col?: number;
        hit?: boolean;
        sunkShip?: string | null;
        firstTurn?: string;
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
    if (!gameState || gameState.phase !== 'playing') return;
    if (enemyGrid[row][col] !== ' ') return;
    socket.emit('game:action', { type: 'fire', payload: { row, col } });
  }, [socket, gameState, enemyGrid]);

  useEffect(() => {
    if (initial) {
      setGameState(initial);
      if (myId === initial.player1Id) {
        setMyGrid(initial.grid1);
        setEnemyGrid(getEnemyView(initial.grid2));
      } else {
        setMyGrid(initial.grid2);
        setEnemyGrid(getEnemyView(initial.grid1));
      }
    }
  }, [initial, myId]);

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-cute-muted text-xl">Memuat game...</p>
      </div>
    );
  }

  const isMyTurn = gameState.currentTurn === myId;
  const isSetup = gameState.phase === 'setup';
  const myShipsPlaced = myId === gameState.player1Id
    ? gameState.ships1.length > 0
    : gameState.ships2.length > 0;
  const isOver = gameState.phase === 'finished';

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
            ? gameState.winner === myId
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
            {myId === gameState.player1Id
              ? gameState.ships1.map(s => s.type).join(', ') || 'Belum ada'
              : gameState.ships2.map(s => s.type).join(', ') || 'Belum ada'}
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
            {isMyTurn && !isSetup && !isOver && 'Klik grid untuk menembak!'}
          </p>
        </div>
      </div>
    </div>
  );
}

function getEnemyView(grid: string[][]): string[][] {
  return grid.map(row =>
    row.map(cell => {
      if (cell === 'H') return 'H';
      if (cell === 'M') return 'M';
      return ' ';
    }),
  );
}

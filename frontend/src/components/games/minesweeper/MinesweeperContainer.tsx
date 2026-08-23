'use client';

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import MinesweeperGrid from './MinesweeperGrid';
import type {
  MinesweeperView,
  MinesweeperDifficulty,
  MinesweeperMode,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@/types';

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: MinesweeperView | null;
}

const DIFFICULTIES: { value: MinesweeperDifficulty; label: string; detail: string }[] = [
  { value: 'mudah', label: 'Mudah', detail: '8×8 · 10 bom' },
  { value: 'sedang', label: 'Sedang', detail: '10×10 · 15 bom' },
  { value: 'sulit', label: 'Sulit', detail: '12×12 · 25 bom' },
  { value: 'ekstrem', label: 'Ekstrem', detail: '14×14 · 40 bom' },
];

const MODES: { value: MinesweeperMode; label: string; detail: string }[] = [
  { value: 'santai', label: 'Santai', detail: '1 aksi per giliran' },
  { value: 'tantangan', label: 'Tantangan', detail: 'Rangkaian selama aman' },
];

export default function MinesweeperContainer({ socket, state: initial }: Props) {
  const [view, setView] = useState<MinesweeperView | null>(
    initial as MinesweeperView | null,
  );
  const [message, setMessage] = useState('');
  // View projection has no playerOrder — track whose turn via events
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<MinesweeperDifficulty>('sedang');
  const [mode, setMode] = useState<MinesweeperMode>('santai');
  const myId = socket.id;

  // Sync server state — server sends the projected MinesweeperView
  useEffect(() => {
    if (!socket) return;

    const handleState = (state: unknown) => {
      setView(state as MinesweeperView);
    };

    socket.on('game:state', handleState);
    return () => {
      socket.off('game:state', handleState);
    };
  }, [socket]);

  // React to game events — reveal feedback + turn tracking
  useEffect(() => {
    if (!socket) return;

    const handleAction = (data: unknown) => {
      const action = data as {
        type: string;
        result?: 'safe' | 'boom';
        cells?: unknown[];
        nextPlayerId?: string;
        firstTurnId?: string;
        firstTurn?: string;
      };

      if (action.type === 'revealResult') {
        if (action.result === 'safe') {
          const opened = action.cells?.length ?? 0;
          setMessage(`Aman! ${opened} kotak terbuka`);
          window.setTimeout(() => setMessage(''), 2500);
        } else if (action.result === 'boom') {
          setMessage('💥 BOOM! Tim kalah');
        }
      } else if (action.type === 'gameStart') {
        const first = action.firstTurnId ?? action.firstTurn ?? null;
        setCurrentPlayerId(first);
        setMessage(first === myId ? 'Giliranmu!' : 'Giliran pemain lain...');
      } else if (action.type === 'turn') {
        setCurrentPlayerId(action.nextPlayerId ?? null);
        if (!view?.winner && action.result !== 'boom') {
          setMessage(
            action.nextPlayerId === myId
              ? 'Giliranmu!'
              : 'Giliran pemain lain...',
          );
        }
      }
    };

    socket.on('game:action', handleAction);
    return () => {
      socket.off('game:action', handleAction);
    };
  }, [socket, myId, view?.winner]);

  // Win banner — overrides transient messages once server confirms
  useEffect(() => {
    if (view?.winner === 'team') {
      setMessage('🎉 Bersih! Tim menang!');
    } else if (view?.winner === 'none') {
      setMessage('💥 BOOM! Tim kalah');
    }
  }, [view?.winner]);

  const sendAction = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      socket.emit('game:action', { type, payload });
    },
    [socket],
  );

  const handleReveal = useCallback(
    (row: number, col: number) => {
      sendAction('reveal', { row, col });
    },
    [sendAction],
  );

  const handleToggleFlag = useCallback(
    (row: number, col: number) => {
      sendAction('toggleFlag', { row, col });
    },
    [sendAction],
  );

  const handleConfig = useCallback(() => {
    sendAction('config', { difficulty, mode });
  }, [sendAction, difficulty, mode]);

  // === Config phase — board not generated yet (rows === 0) ===
  if (!view || view.rows === 0 || !view.cells) {
    return (
      <div className="max-w-md mx-auto space-y-6 text-center">
        <p className="text-2xl">💣</p>
        <h2 className="text-xl font-bold text-cute-text">Minesweeper Co-op</h2>
        <p className="text-cute-muted text-sm">
          Pilih kesulitan dan mode giliran, lalu mulai papan.
        </p>

        <div className="space-y-2 text-left">
          <p className="text-sm font-bold text-cute-text">Kesulitan</p>
          {DIFFICULTIES.map((d) => (
            <button
              key={d.value}
              onClick={() => setDifficulty(d.value)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-all ${
                difficulty === d.value
                  ? 'border-primary bg-pink-50 shadow-soft'
                  : 'border-pink-100 bg-white hover:border-primary'
              }`}
            >
              <span className="font-bold text-cute-text">{d.label}</span>
              <span className="text-xs text-cute-muted">{d.detail}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2 text-left">
          <p className="text-sm font-bold text-cute-text">Mode Giliran</p>
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-all ${
                mode === m.value
                  ? 'border-primary bg-pink-50 shadow-soft'
                  : 'border-pink-100 bg-white hover:border-primary'
              }`}
            >
              <span className="font-bold text-cute-text">{m.label}</span>
              <span className="text-xs text-cute-muted">{m.detail}</span>
            </button>
          ))}
        </div>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleConfig}
          className="w-full bg-primary text-white font-bold py-3 rounded-xl shadow-soft"
        >
          Mulai Papan
        </motion.button>
      </div>
    );
  }

  if (view.cells.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-cute-muted text-xl">Memuat papan...</p>
      </div>
    );
  }

  // Unknown current player (e.g. mid-game join before events replay) → optimistic;
  // server remains authoritative anyway
  const isMyTurn = currentPlayerId == null || currentPlayerId === myId;
  const isOver = view.winner != null;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Scoreboard */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="bg-white px-4 py-1.5 rounded-full text-sm font-bold text-cute-text shadow-soft">
          💣 {Math.max(0, view.bombCount - view.flagsUsed)}
        </span>
        {!isOver && (
          <span
            className={`px-4 py-1.5 rounded-full text-sm font-bold shadow-soft ${
              isMyTurn ? 'bg-success text-cute-text' : 'bg-gray-200 text-gray-500'
            }`}
          >
            {isMyTurn ? 'Giliranmu!' : 'Giliran lawan'}
          </span>
        )}
        <span
          className={`px-4 py-1.5 rounded-full text-sm font-bold text-white shadow-soft ${
            view.mode === 'santai' ? 'bg-secondary' : 'bg-primary'
          }`}
        >
          {view.mode === 'santai' ? 'Santai' : 'Tantangan'}
        </span>
        {view.mode === 'tantangan' && view.chainActive && !isOver && (
          <span className="bg-accent px-4 py-1.5 rounded-full text-sm font-bold text-cute-text shadow-soft">
            🔥 Rangkaian aktif
          </span>
        )}
      </div>

      {/* Message banner */}
      <AnimatePresence mode="wait">
        <motion.div
          key={isOver ? `over-${view.winner}` : message || 'idle'}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="text-center text-lg font-bold text-cute-text min-h-[1.75rem]"
        >
          {isOver
            ? view.winner === 'none'
              ? '💥 BOOM! Tim kalah'
              : '🎉 Bersih! Tim menang!'
            : message || 'Menunggu giliran...'}
        </motion.div>
      </AnimatePresence>

      {/* Grid */}
      <div className="flex justify-center overflow-x-auto">
        <MinesweeperGrid
          view={view}
          myTurn={isMyTurn}
          onReveal={handleReveal}
          onToggleFlag={handleToggleFlag}
        />
      </div>

      <p className="text-center text-xs text-cute-muted">
        Klik kiri buka · Klik kanan bendera
      </p>

      {/* Pass button — tantangan mode only */}
      {view.mode === 'tantangan' && !isOver && (
        <div className="flex justify-center">
          <motion.button
            whileHover={isMyTurn ? { scale: 1.03 } : {}}
            whileTap={isMyTurn ? { scale: 0.97 } : {}}
            onClick={() => sendAction('pass')}
            disabled={!isMyTurn}
            className={`px-6 py-2 rounded-xl font-bold text-sm shadow-soft ${
              isMyTurn
                ? 'bg-white border-2 border-primary text-primary cursor-pointer'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
            }`}
          >
            Lewati Giliran
          </motion.button>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import MinesweeperGrid from './MinesweeperGrid';
import type {
  MinesweeperView,
  MinesweeperDifficulty,
  MinesweeperMode,
  GameAction,
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
  // Turn tracking via useGameTurn — strict equality (FE-F3): unknown turn is
  // NEVER "my turn". The old optimistic null made everyone see "Giliranmu!"
  // before the first event.
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<MinesweeperDifficulty>('sedang');
  const [mode, setMode] = useState<MinesweeperMode>('santai');
  const myId = socket.id;
  // F4: the action listener used to read `view?.winner` with it in the deps
  // array — re-adding listeners on every winner flip (a drop window) while
  // capturing a stale `view`. A ref keeps the handler stable instead.
  const winnerRef = useRef<string | null>(null);

  useEffect(() => {
    winnerRef.current = view?.winner ?? null;
  }, [view?.winner]);

  useEffect(() => {
    if (!socket) return;

    const onAction = (data: unknown) => {
      const action = data as { type?: string; nextPlayerId?: string };
      if (action.type === 'turn') setCurrentPlayerId(action.nextPlayerId ?? null);
      if (action.type === 'gameStart') {
        const g = data as { firstTurn?: string; firstTurnId?: string };
        setCurrentPlayerId(g.firstTurn ?? g.firstTurnId ?? null);
        if ((g.firstTurn ?? g.firstTurnId) === myId) setMessage('Giliranmu!');
      }
      if (action.type === 'revealResult') {
        const r = data as { result?: string; cells?: unknown[] };
        if (r.result === 'safe') {
          const opened = r.cells?.length ?? 0;
          setMessage(`Aman! ${opened} kotak terbuka`);
          window.setTimeout(() => setMessage(''), 2500);
        } else if (r.result === 'boom') {
          setMessage('💥 BOOM! Tim kalah');
        }
      }
    };

    // Errors surface via the shared GameErrorBanner in /room/[pin] — no local
    // room:error listener is registered here (F7 fix: was duplicating the banner).
    socket.on('game:action', onAction);
    return () => {
      socket.off('game:action', onAction);
    };
  }, [socket, myId]);

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

  // Win banner — overrides transient messages once server confirms
  useEffect(() => {
    if (view?.winner === 'team') {
      setMessage('🎉 Bersih! Tim menang!');
    } else if (view?.winner === 'none') {
      setMessage('💥 BOOM! Tim kalah');
    }
  }, [view?.winner]);

  const sendAction = useCallback(
    (action: GameAction) => {
      socket.emit('game:action', action);
    },
    [socket],
  );

  const handleReveal = useCallback(
    (row: number, col: number) => {
      sendAction({ type: 'reveal', payload: { row, col } });
    },
    [sendAction],
  );

  const handleToggleFlag = useCallback(
    (row: number, col: number) => {
      sendAction({ type: 'toggleFlag', payload: { row, col } });
    },
    [sendAction],
  );

  const handleConfig = useCallback(() => {
    sendAction({ type: 'config', payload: { difficulty, mode } });
  }, [sendAction, difficulty, mode]);

  // === Config phase — server starts in phase 'config' with empty cells ===
  if (!view || view.phase === 'config' || !view.cells || view.cells.length === 0) {
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

  // Strict turn check — unknown ≠ my turn (FE-F3)
  const isMyTurn = currentPlayerId != null && currentPlayerId === myId;
  const isOver = view.winner != null;
  void winnerRef; // reserved for future stable-handler refactor

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Scoreboard */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="bg-white px-4 py-1.5 rounded-full text-sm font-bold text-cute-text shadow-soft">
          💣 {Math.max(0, (view.bombCount ?? 0) - (view.flagsUsed ?? 0))}
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
            onClick={() => sendAction({ type: 'pass' })}
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

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import Board2D from './Board2D';
import Dice3D from './Dice3D';
import SoundFx from './SoundFx';
import Confetti from './Confetti';
import { SLIDE_MAX_MS } from './usePawnAnim';
import { buildSegments } from './paths';
import type { Segment } from './types';
import type { SnakesLaddersState, ServerToClientEvents, ClientToServerEvents } from '@/types';

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: SnakesLaddersState | null;
}

// Server-emitted `game:action` payloads (event.data shape, not the client GameAction union).
// See server/src/games/snakes-ladders.ts + server/src/index.ts:309-313 — `turnChange`
// is rewritten to `turn` on the wire.
type ServerGameAction =
  | {
      type: 'diceResult';
      playerId: string;
      value: number;
      newPosition: number;
      snakeHit: [number, number] | null;
      ladderHit: [number, number] | null;
    }
  | { type: 'turn'; nextPlayerId?: string; message?: string }
  // Older code paths / future-proof: server may send `turnChange` directly.
  | { type: 'turnChange'; nextPlayerId?: string; message?: string };

const dispatchSfx = (kind: 'roll' | 'hop' | 'snake' | 'ladder' | 'win') => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('gameville:sfx', { detail: kind }));
};

export default function SnakesLaddersContainer({ socket, state: initial }: Props) {
  const [gameState, setGameState] = useState<SnakesLaddersState | null>(initial);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState('');
  const [glow, setGlow] = useState<{ tile: number; kind: 'snake' | 'ladder' } | null>(null);
  const [skipAnim, setSkipAnim] = useState(false);
  // Per-player animation segments, indexed by socket id. Reset on each new dice roll
  // for the rolling player; other players keep their previous segments until their
  // own diceResult arrives.
  const [segments, setSegments] = useState<Record<string, Segment[] | undefined>>({});
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard against win SFX replay on tab remount (isMyWin is true on first render
  // after refresh of a finished game; we want it to fire once per actual win).
  const hasPlayedWinRef = useRef(false);
  const myId = socket.id;

  useEffect(() => {
    if (!socket) return;

    const handleState = (state: unknown) => {
      setGameState(state as SnakesLaddersState);
      setRolling(false);
    };

    const handleAction = (data: unknown) => {
      const action = data as ServerGameAction;
      if (action.type === 'turn' || action.type === 'turnChange') {
        const nextId = action.nextPlayerId;
        if (nextId === myId) {
          setMessage('Giliranmu! Lempar dadu! 🎲');
        } else {
          setMessage('Menunggu giliran pemain lain...');
        }
        return;
      }
      if (action.type === 'diceResult') {
        // Roll + hop SFX are per-player (only fire for the rolling player). Snake/ladder
        // glow + SFX are world events — everyone sees/hears them.
        if (action.playerId === myId) {
          dispatchSfx('roll');
          if (typeof action.value === 'number') {
            setSkipAnim(false); // fresh hop sequence per dice
            // Fire hop SFX synchronously (was setTimeout(0) which raced the
            // Board2D RAF — the ~1 frame slip is inaudible).
            dispatchSfx('hop');
          }
        }
        if (action.snakeHit) {
          const [head] = action.snakeHit;
          setGlow({ tile: head, kind: 'snake' });
          dispatchSfx('snake');
        } else if (action.ladderHit) {
          const [bottom] = action.ladderHit;
          setGlow({ tile: bottom, kind: 'ladder' });
          dispatchSfx('ladder');
        }
        // Compute and store the full traversal segments for the rolling player so
        // Board2D can animate hop-by-hop through the snake head/tail (or ladder
        // bottom/top) instead of jumping pre-snake to post-snake in one step.
        const from = (gameState?.players ?? []).find((p) => p.id === action.playerId)?.position ?? 0;
        setSegments((prev) => ({
          ...prev,
          [action.playerId]: buildSegments(from, action.newPosition, action.snakeHit, action.ladderHit),
        }));
        // Glow must outlive the slide animation (SLIDE_MAX_MS = 4000) — the old
        // 1200ms timer made the highlight vanish mid-slide for every snake/ladder.
        if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
        glowTimerRef.current = setTimeout(() => setGlow(null), SLIDE_MAX_MS);
      }
    };

    socket.on('game:state', handleState);
    socket.on('game:action', handleAction);

    return () => {
      socket.off('game:state', handleState);
      socket.off('game:action', handleAction);
      if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
    };
  }, [socket, myId, gameState?.players]);

  // Confetti + win SFX fire on game over. The ref ensures a single fire per
  // actual win — refreshing the tab after winning would otherwise replay the
  // sound because isMyWin is true on first render.
  const isGameOver = gameState?.winner != null;
  const isMyWin = isGameOver && gameState?.winner === myId;
  useEffect(() => {
    if (isMyWin && !hasPlayedWinRef.current) {
      hasPlayedWinRef.current = true;
      dispatchSfx('win');
    }
    if (!isMyWin && hasPlayedWinRef.current) {
      // Reset for the next game's potential win.
      hasPlayedWinRef.current = false;
    }
  }, [isMyWin]);

  const rollDice = useCallback(() => {
    if (rolling) return;
    setRolling(true);
    setMessage('Melempar dadu...');
    socket.emit('game:action', { type: 'roll' });
  }, [socket, rolling]);

  // Defensive: during mid-game recovery the state may be partial — players could be
  // undefined/empty while currentTurn points past the end. Guard every indexed access.
  // Memoized so the useMemo for boardPlayers (line 129) doesn't invalidate on every render.
  const players = useMemo(() => gameState?.players ?? [], [gameState]);
  const safeCurrentTurn = typeof gameState?.currentTurn === 'number' ? gameState.currentTurn : -1;
  const currentPlayer = players[safeCurrentTurn] ?? null;
  const isMyTurn = !!currentPlayer && currentPlayer.id === myId;

  // Memoize the arrays so Board2D's useMemo on (snakes, ladders) stays stable across renders.
  const snakes = useMemo<[number, number][]>(
    () => gameState?.snakes ?? [],
    [gameState?.snakes],
  );
  const ladders = useMemo<[number, number][]>(
    () => gameState?.ladders ?? [],
    [gameState?.ladders],
  );

  const boardPlayers = useMemo(
    () => players.map((p) => {
      const segs = segments[p.id];
      // Flatten segments to a flat tile path so Board2D's current usePawnAnim
      // (which still consumes `path`) keeps its snake/ladder traversal until T11
      // rewires it to consume `segments` directly. Drop undefined segments.
      const flatPath = segs && segs.length > 0 ? segs.flatMap((s) => s.tiles) : undefined;
      return {
        id: p.id,
        position: p.position,
        color: p.color,
        path: flatPath,
        segments: segs,
      };
    }),
    [players, segments],
  );

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-cute-muted text-xl">Memuat papan...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score board */}
      <div className="flex justify-center gap-4 flex-wrap">
        {players.map((p, i) => (
          <div
            key={p.id}
            className={`px-4 py-2 rounded-cute border-2 transition-all ${
              i === safeCurrentTurn ? 'border-primary bg-pink-50 shadow-soft scale-105' : 'border-gray-100 bg-white'
            }`}
            style={{ borderColor: i === safeCurrentTurn ? p.color : undefined }}
          >
            <p className="font-bold text-sm" style={{ color: p.color }}>
              {p.id === myId ? 'Kamu' : `Pemain ${i + 1}`}
            </p>
            <p className="text-xs text-cute-muted">Tile: {p.position}</p>
          </div>
        ))}
      </div>

      {/* Message */}
      <AnimatePresence>
        {message && (
          <motion.div
            key="game-message"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center text-lg font-bold text-cute-text bg-white py-2 px-4 rounded-cute shadow-soft"
          >
            {isGameOver ? `🎉 ${isMyWin ? 'Kamu Menang!' : 'Game Selesai!'}` : message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2D Board — tap to skip current hop/slide animation */}
      <div
        onClick={() => {
          if (!skipAnim) setSkipAnim(true);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !skipAnim) setSkipAnim(true);
        }}
        aria-label="Papan ular tangga — ketuk untuk melewati animasi"
      >
        <Board2D
          players={boardPlayers}
          snakes={snakes}
          ladders={ladders}
          currentTurn={safeCurrentTurn}
          glowTile={glow}
          skipAnim={skipAnim}
          onAnimComplete={() => setSkipAnim(false)}
        />
      </div>

      {/* Dice */}
      <div className="flex justify-center">
        <Dice3D
          value={gameState.diceValue}
          rolling={rolling}
          onRoll={rollDice}
          disabled={!isMyTurn || rolling || isGameOver}
        />
      </div>

      <Confetti trigger={isMyWin} />
      <SoundFx />
    </div>
  );
}

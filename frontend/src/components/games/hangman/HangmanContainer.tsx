'use client';

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import HangmanDrawing from './HangmanDrawing';
import type { HangmanState, ServerToClientEvents, ClientToServerEvents } from '@/types';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Runtime state from server includes extra fields beyond the shared type
type RuntimeHangmanState = HangmanState & {
  word?: string;
  playerOrder?: string[];
};

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: HangmanState | null;
}

export default function HangmanContainer({ socket, state: initial }: Props) {
  const [gameState, setGameState] = useState<RuntimeHangmanState | null>(
    initial as RuntimeHangmanState | null,
  );
  const [message, setMessage] = useState('');
  const [flashLetter, setFlashLetter] = useState<{ letter: string; ok: boolean } | null>(null);
  const myId = socket.id;

  // Sync server state
  useEffect(() => {
    if (!socket) return;

    const handleState = (state: unknown) => {
      setGameState(state as RuntimeHangmanState);
    };

    socket.on('game:state', handleState);
    return () => {
      socket.off('game:state', handleState);
    };
  }, [socket]);

  // React to game events — turn changes and guess feedback
  useEffect(() => {
    if (!socket) return;

    const handleAction = (data: unknown) => {
      const action = data as {
        type: string;
        nextPlayerId?: string;
        letter?: string;
        message?: string;
      };

      if (action.type === 'turn') {
        if (action.nextPlayerId === myId) {
          setMessage('Giliranmu! Tebak satu huruf');
        } else {
          setMessage('Giliran pemain lain...');
        }
      } else if (action.type === 'correctGuess' && action.letter) {
        setFlashLetter({ letter: action.letter, ok: true });
        window.setTimeout(() => setFlashLetter(null), 700);
      } else if (action.type === 'wrongGuess' && action.letter) {
        setFlashLetter({ letter: action.letter, ok: false });
        window.setTimeout(() => setFlashLetter(null), 700);
      }
    };

    socket.on('game:action', handleAction);
    return () => {
      socket.off('game:action', handleAction);
    };
  }, [socket, myId]);

  const guessLetter = useCallback(
    (letter: string) => {
      if (!gameState) return;
      const already = gameState.guessedLetters.includes(letter);
      if (already) return;
      socket.emit('game:action', { type: 'guess', payload: { letter } });
    },
    [socket, gameState],
  );

  // Keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!gameState) return;
      const key = e.key.toUpperCase();
      if (ALPHABET.includes(key)) {
        guessLetter(key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameState, guessLetter]);

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-cute-muted text-xl">Memuat game...</p>
      </div>
    );
  }

  const playerOrder = gameState.playerOrder ?? [];
  const isMyTurn = playerOrder.length > 0
    ? playerOrder[gameState.currentTurn] === myId
    : true;
  const isOver = gameState.winner != null;
  const guessedLetters = gameState.guessedLetters || [];
  const correctLetters = gameState.correctLetters || [];
  const word = gameState.word;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Status / Message */}
      <AnimatePresence mode="wait">
        <motion.div
          key={isOver ? `over-${gameState.winner}` : message}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="text-center text-lg font-bold text-cute-text"
        >
          {isOver
            ? gameState.winner === 'none'
              ? `Game Over! Kata: ${word ?? '???'}`
              : 'Selamat! Kata berhasil ditebak!'
            : message || 'Menunggu giliran...'}
        </motion.div>
      </AnimatePresence>

      {/* Category */}
      <div className="text-center">
        <span className="bg-secondary text-white px-4 py-1 rounded-full text-sm font-bold">
          Kategori: {gameState.category}
        </span>
      </div>

      {/* Drawing + Word */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-8">
        <HangmanDrawing attemptsLeft={gameState.remainingAttempts} maxAttempts={6} />

        <div className="space-y-3">
          {/* Word display */}
          <div className="flex gap-2 flex-wrap justify-center mb-4">
            {correctLetters.map((letter, i) => (
              <motion.div
                key={`${i}-${letter ?? ''}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="w-10 h-12 border-b-4 border-primary flex items-center justify-center"
              >
                <span className="text-2xl font-bold text-cute-text">{letter || ''}</span>
              </motion.div>
            ))}
          </div>

          {/* Attempts info */}
          <p className="text-center text-cute-muted text-sm">
            Sisa percobaan: {gameState.remainingAttempts} / 6
          </p>

          {/* Debug: turn indicator */}
          {!isOver && playerOrder.length > 0 && (
            <p className="text-center text-xs text-cute-muted">
              Giliran: {isMyTurn ? 'kamu' : 'pemain lain'}
            </p>
          )}
        </div>
      </div>

      {/* Keyboard */}
      <div className="flex flex-wrap justify-center gap-1.5 max-w-md mx-auto">
        {ALPHABET.map((letter) => {
          const guessed = guessedLetters.includes(letter);
          const isFlashing = flashLetter?.letter === letter;
          return (
            <motion.button
              key={letter}
              whileHover={!guessed && isMyTurn && !isOver ? { scale: 1.15 } : {}}
              whileTap={!guessed && isMyTurn && !isOver ? { scale: 0.9 } : {}}
              onClick={() => guessLetter(letter)}
              disabled={guessed || !isMyTurn || isOver}
              aria-label={`Tebak huruf ${letter}`}
              className={`w-9 h-9 rounded-lg font-bold text-sm transition-all ${
                isFlashing
                  ? flashLetter?.ok
                    ? 'bg-green-400 text-white'
                    : 'bg-red-400 text-white'
                  : guessed
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : isMyTurn && !isOver
                      ? 'bg-white border-2 border-primary text-cute-text hover:bg-primary hover:text-white shadow-soft cursor-pointer'
                      : 'bg-gray-50 text-gray-300 cursor-not-allowed'
              }`}
            >
              {letter}
            </motion.button>
          );
        })}
      </div>

      {/* Game over reveal */}
      <AnimatePresence>
        {isOver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            {gameState.winner !== 'none' && word && (
              <p className="text-cute-muted">
                Jawabannya: <span className="font-bold text-primary">{word}</span>
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

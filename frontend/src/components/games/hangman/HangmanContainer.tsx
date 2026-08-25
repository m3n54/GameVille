'use client';

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import HangmanDrawing from './HangmanDrawing';
import type { HangmanState, ServerToClientEvents, ClientToServerEvents } from '@/types';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Runtime state from server: projected view (word hidden until game over, playerOrder included)
type RuntimeHangmanState = HangmanState & {
  word?: string;
  playerOrder?: string[];
};

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: HangmanState | null;
}

type Lang = 'id' | 'en';

export default function HangmanContainer({ socket, state: initial }: Props) {
  const [gameState, setGameState] = useState<RuntimeHangmanState | null>(
    initial as RuntimeHangmanState | null,
  );
  const [message, setMessage] = useState('');
  const [flashLetter, setFlashLetter] = useState<{ letter: string; ok: boolean } | null>(null);
  // Server state projection has no playerOrder — track whose turn via events
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [language, setLanguage] = useState<Lang>('id');
  const myId = socket.id;

  const sendConfig = useCallback(() => {
    socket.emit('game:action', { type: 'config', payload: { language } });
  }, [socket, language]);

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
        firstTurn?: string;
        letter?: string;
        message?: string;
      };

      if (action.type === 'turn') {
        setCurrentPlayerId(action.nextPlayerId ?? null);
        if (action.nextPlayerId === myId) {
          setMessage('Giliranmu! Tebak satu huruf');
        } else {
          setMessage('Giliran pemain lain...');
        }
      } else if (action.type === 'gameStart') {
        setCurrentPlayerId(action.firstTurn ?? null);
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
      const already = (gameState.guessedLetters || []).includes(letter);
      if (already) return;
      socket.emit('game:action', { type: 'guess', payload: { letter } });
    },
    [socket, gameState],
  );

  // Keyboard support — gated on the same turn/game-over checks as the buttons
  // (F9: typing used to bypass the disabled state entirely).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!gameState || (gameState.phase ?? 'config') === 'config') return;
      if (gameState.winner != null) return;
      // Strict turn check inline — matches the render-level isMyTurn below
      if (currentPlayerId == null || currentPlayerId !== myId) return;
      const key = e.key.toUpperCase();
      if (ALPHABET.includes(key)) {
        guessLetter(key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameState, guessLetter, currentPlayerId, myId]);

  // Config phase — host belum pilih bahasa
  if (
    !gameState ||
    (gameState.phase ?? 'config') === 'config' ||
    (gameState.wordLength ?? 0) === 0
  ) {
    return (
      <div className="max-w-md mx-auto space-y-6 text-center">
        <p className="text-2xl">💀</p>
        <h2 className="text-xl font-bold text-cute-text">Hangman Co-op</h2>
        <p className="text-cute-muted text-sm">Pilih bahasa kata yang akan ditebak.</p>

        <div className="space-y-2">
          {([
            { value: 'id' as Lang, label: '🇮🇩 Bahasa Indonesia', detail: 'Hewan · Buah · Negara' },
            { value: 'en' as Lang, label: '🇬🇧 English', detail: 'Animal · Fruit · Country' },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setLanguage(opt.value)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-all ${
                language === opt.value
                  ? 'border-primary bg-pink-50 shadow-soft'
                  : 'border-pink-100 bg-white hover:border-primary'
              }`}
            >
              <span className="font-bold text-cute-text">{opt.label}</span>
              <span className="text-xs text-cute-muted">{opt.detail}</span>
            </button>
          ))}
        </div>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={sendConfig}
          className="w-full bg-primary text-white font-bold py-3 rounded-xl shadow-soft"
        >
          Mulai Main
        </motion.button>
      </div>
    );
  }

  // Strict turn check (FE-F3): unknown ≠ my turn. The old optimistic default
  // let everyone act (and type) before the first turn event arrived.
  const isMyTurn = currentPlayerId != null && currentPlayerId === myId;
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
              ? `😵 Game Over! Kata: ${word ?? '???'}`
              : '🎉 Selamat! Kalian menang! Kata berhasil ditebak!'
            : message || 'Menunggu giliran...'}
        </motion.div>
      </AnimatePresence>

      {/* Category */}
      <div className="text-center">
        <span className="bg-secondary text-white px-4 py-1 rounded-full text-sm font-bold">
          Kategori: {gameState.category ?? ''}
        </span>
      </div>

      {/* Drawing + Word */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-8">
        <HangmanDrawing attemptsLeft={gameState.remainingAttempts ?? 6} maxAttempts={6} />

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
            Sisa percobaan: {gameState.remainingAttempts ?? 6} / 6
          </p>

          {/* Debug: turn indicator */}
          {!isOver && currentPlayerId != null && (
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

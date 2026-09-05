'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// Classic 3×3 pip grid — pip size + spacing is opinionated big so the face
// is legible without squinting (the 3D cube's sphere 0.075 was hard to see).
const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]],
};

interface Dice2DProps {
  value: number | null;
  rolling: boolean;
  onRoll: () => void;
  disabled: boolean;
}

export default function Dice2D({ value, rolling, onRoll, disabled }: Dice2DProps): JSX.Element {
  const [rollingFace, setRollingFace] = useState<number>(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [justLanded, setJustLanded] = useState(false);
  const prevRollingRef = useRef(rolling);

  // Rapid digit cycling while `rolling === true` — the server value is what
  // lands, but the rolling faces make the shake feel alive.
  useEffect(() => {
    if (rolling) {
      intervalRef.current = setInterval(() => setRollingFace(1 + Math.floor(Math.random() * 6)), 80);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [rolling]);

  // Pop flash when the server value first arrives (rolling true → false).
  useEffect(() => {
    const was = prevRollingRef.current;
    prevRollingRef.current = rolling;
    if (was && !rolling && value != null) {
      setJustLanded(true);
      const t = setTimeout(() => setJustLanded(false), 420);
      return () => clearTimeout(t);
    }
  }, [rolling, value]);

  const face = rolling ? rollingFace : value;
  const faceAvailable = face != null && face >= 1 && face <= 6;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Card — shake while rolling; pop while just-landed */}
      <motion.div
        animate={rolling ? { rotate: [0, 8, -8, 10, -6, 0], scale: [1, 1.05, 1, 1.06, 1, 1] } : { rotate: 0, scale: 1 }}
        transition={rolling ? { duration: 0.55, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.22, ease: 'easeOut' }}
        className={`relative w-36 h-36 rounded-3xl shadow-soft border-2 bg-white flex items-center justify-center overflow-hidden
          ${rolling ? 'border-primary' : faceAvailable ? 'border-primary' : 'border-gray-200'}`}
        aria-label={faceAvailable ? `Dadu ${rolling ? 'mengocok' : `menunjukkan ${face}`}` : 'Dadu siap'}
      >
        {faceAvailable && (
          <motion.div
            key={face}
            initial={rolling ? { scale: 0.92, opacity: 0.85 } : { scale: 0 }}
            animate={{ scale: justLanded ? [1, 1.18, 1] : 1, opacity: 1 }}
            transition={justLanded ? { duration: 0.38, ease: 'easeOut' } : { duration: 0.18, ease: 'easeOut' }}
            className="w-28 h-28 shrink-0"
          >
            <div className="grid grid-cols-3 grid-rows-3 gap-2 w-28 h-28 p-3">
              {Array.from({ length: 9 }).map((_, idx) => {
                const r = Math.floor(idx / 3);
                const c = idx % 3;
                const hasPip = (PIP_POSITIONS[face] ?? []).some(([pr, pc]) => pr === r && pc === c);
                return (
                  <div key={idx} className="flex items-center justify-center">
                    {hasPip && <span className="block w-5 h-5 rounded-full bg-cute-text shadow-sm" />}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
        {!faceAvailable && !rolling && (
          <span className="text-4xl leading-none text-cute-muted select-none" aria-hidden>?</span>
        )}
        {/* Instant reading — number badge visible AS SOON as the server value
            arrives (not gated behind a post-spin settling state, so the result
            is never ambiguous). */}
        {faceAvailable && !rolling && (
          <span className={`absolute right-2 bottom-1.5 text-2xl font-black select-none ${justLanded ? 'text-primary' : 'text-cute-muted'}`} aria-hidden>
            {face}
          </span>
        )}
      </motion.div>

      <motion.button
        whileHover={!disabled ? { scale: 1.08 } : {}}
        whileTap={!disabled ? { scale: 0.96 } : {}}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        onClick={() => { if (!disabled) onRoll(); }}
        disabled={disabled}
        className={`px-6 py-3 bg-primary text-white font-bold rounded-button shadow-soft transition-all
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-pink-400'}`}
      >
        🎲 Lempar Dadu!
      </motion.button>
    </div>
  );
}

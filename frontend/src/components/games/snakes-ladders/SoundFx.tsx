'use client';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const SOUNDS = {
  roll: '/sfx/roll.mp3',
  hop: '/sfx/hop.mp3',
  snake: '/sfx/snake.mp3',
  ladder: '/sfx/ladder.mp3',
  win: '/sfx/win.mp3',
};

const STORAGE_KEY = 'gameville:sfx-muted';

interface Props {
  onPlay?: (kind: keyof typeof SOUNDS) => void;
}

export default function SoundFx({ onPlay }: Props) {
  const [muted, setMuted] = useState(false);
  const refs = useRef<Record<string, HTMLAudioElement | null>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setMuted(localStorage.getItem(STORAGE_KEY) === '1');
    Object.entries(SOUNDS).forEach(([k, src]) => {
      refs.current[k] = new Audio(src);
      refs.current[k]!.preload = 'auto';
    });
    return () => {
      Object.values(refs.current).forEach((a) => a?.pause());
    };
  }, []);

  // Expose play via window event so container can fire-and-forget
  useEffect(() => {
    const handler = (e: Event) => {
      const kind = (e as CustomEvent<keyof typeof SOUNDS>).detail;
      if (!(kind in SOUNDS)) return;
      if (muted) return;
      refs.current[kind]?.play().catch(() => {});
      onPlay?.(kind);
    };
    window.addEventListener('gameville:sfx', handler);
    return () => window.removeEventListener('gameville:sfx', handler);
  }, [muted, onPlay]);

  return (
    <motion.button
      onClick={() => {
        const next = !muted;
        setMuted(next);
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      }}
      className="fixed bottom-3 right-3 w-10 h-10 rounded-full bg-white shadow-soft flex items-center justify-center z-50"
      whileTap={{ scale: 0.9 }}
      title={muted ? 'Nyalakan suara' : 'Matikan suara'}
    >
      {muted ? '🔇' : '🔊'}
    </motion.button>
  );
}

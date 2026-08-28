'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props { trigger: boolean; }

const COLORS = ['#FF9BB5', '#A8D8EA', '#FFD3B6', '#B5EAD7', '#FFE66D', '#C490E4'];

export default function Confetti({ trigger }: Props) {
  const [pieces, setPieces] = useState<Array<{ id: number; x: number; color: string; rot: number }>>([]);
  useEffect(() => {
    if (!trigger) return;
    const ps = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#FF9BB5',
      rot: Math.random() * 360,
    }));
    setPieces(ps);
    // I4 review fix: outer timeout must cover inner piece duration (2 + Math.random() up to 3s).
    // 2500ms caused pieces to vanish mid-fall. 3000ms gives the slowest piece room to finish.
    const t = setTimeout(() => setPieces([]), 3000);
    return () => clearTimeout(t);
  }, [trigger]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <AnimatePresence>
        {pieces.map((p) => (
          <motion.span
            key={p.id}
            initial={{ y: -20, x: `${p.x}vw`, rotate: 0, opacity: 1 }}
            animate={{ y: '110vh', rotate: p.rot, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 + Math.random(), ease: 'easeIn' }}
            className="absolute top-0 w-3 h-4"
            style={{ background: p.color, borderRadius: 2 }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

'use client';

import { motion } from 'framer-motion';

interface PawnSVGProps {
  color: string;
  size?: number; // px, default 44
  bounce?: boolean; // idle bounce animation
}

export default function PawnSVG({ color, size = 44, bounce = true }: PawnSVGProps) {
  return (
    <motion.div
      animate={bounce ? { y: [0, -3, 0] } : { y: 0 }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ width: size, height: size }}
    >
      <svg viewBox="-1 -1 2 2" width={size} height={size}>
        <circle r="0.95" fill={color} stroke="#FFFFFF" strokeWidth="0.12" />
        {/* mata besar */}
        <ellipse cx="-0.32" cy="-0.18" rx="0.18" ry="0.22" fill="#FFFFFF" />
        <ellipse cx="0.32" cy="-0.18" rx="0.18" ry="0.22" fill="#FFFFFF" />
        <circle cx="-0.32" cy="-0.15" r="0.1" fill="#1A1A1A" />
        <circle cx="0.32" cy="-0.15" r="0.1" fill="#1A1A1A" />
        <circle cx="-0.28" cy="-0.20" r="0.03" fill="#FFFFFF" />
        <circle cx="0.36" cy="-0.20" r="0.03" fill="#FFFFFF" />
        {/* senyum */}
        <path d="M -0.3 0.3 Q 0 0.5 0.3 0.3" stroke="#1A1A1A" strokeWidth="0.08" fill="none" strokeLinecap="round" />
        {/* pipi */}
        <circle cx="-0.55" cy="0.15" r="0.12" fill="#FFB5C5" opacity="0.7" />
        <circle cx="0.55" cy="0.15" r="0.12" fill="#FFB5C5" opacity="0.7" />
      </svg>
    </motion.div>
  );
}

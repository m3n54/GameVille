import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

type Phase = 'idle' | 'walking' | 'sliding';
interface State { from: number; to: number; progress: number; phase: Phase; }

// Durations (ms) — tuned per design call: 6-tile hop ≈ 3-4 s, snake/ladder slide ≈ 2.5-3 s.
const HOP_MS_PER_TILE = 600; // 6 tile = 3600 ms ✓
const SLIDE_MS_PER_TILE = 400; // ladder climb (avg 30 tile) ≈ 12 s; snake bite (avg 40 tile) ≈ 16 s — clamp at 4 s
const SLIDE_MAX_MS = 4000;

export function usePawnAnim(position: number, skip: boolean, onComplete?: () => void) {
  const anim = useRef<State>({ from: position, to: position, progress: 1, phase: 'idle' });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState({ tile: position, phase: 'idle' as Phase });

  useEffect(() => {
    if (position === anim.current.to) return;
    const a = anim.current;
    a.from = a.to;
    a.to = position;
    a.progress = 0;
    const delta = Math.abs(position - a.from);
    a.phase = delta > 6 ? 'sliding' : 'walking';
  }, [position]);

  useEffect(() => {
    if (skip && anim.current.phase !== 'idle') {
      anim.current.progress = 1;
      if (anim.current.phase === 'walking') {
        const t = anim.current.to;
        anim.current.phase = 'idle';
        setDisplay({ tile: t, phase: 'idle' });
        onComplete?.();
      }
      // For sliding, single dispatch — caller re-issues skip on landing.
    }
  }, [skip, onComplete]);

  useEffect(() => {
    const a = anim.current;
    if (a.phase === 'idle') return;
    if (reduced) {
      a.progress = 1;
      setDisplay({ tile: a.to, phase: 'idle' });
      a.phase = 'idle';
      onComplete?.();
      return;
    }
    let raf: number;
    const start = performance.now();
    const totalMs = a.phase === 'walking'
      ? Math.abs(a.to - a.from) * HOP_MS_PER_TILE
      : Math.min(SLIDE_MAX_MS, Math.abs(a.to - a.from) * SLIDE_MS_PER_TILE);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / totalMs);
      a.progress = t;
      if (a.phase === 'walking') {
        // step-by-step: report intermediate tile
        const dir = Math.sign(a.to - a.from) || 1;
        const steps = Math.abs(a.to - a.from);
        const stepFloat = steps * t;
        const stepIdx = Math.min(steps - 1, Math.floor(stepFloat));
        setDisplay({ tile: a.from + dir * stepIdx, phase: 'walking' });
      } else {
        setDisplay({ tile: a.from, phase: 'sliding' });
      }
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        a.phase = 'idle';
        setDisplay({ tile: a.to, phase: 'idle' });
        onComplete?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [display.phase, reduced, onComplete]);

  return display;
}

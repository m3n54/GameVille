import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

type Phase = 'idle' | 'walking' | 'sliding';

// Durations (ms) — tuned per design call: 6-tile hop ≈ 3-4 s, snake/ladder slide ≈ 2.5-3 s.
const HOP_MS_PER_TILE = 600; // 6 tile = 3600 ms ✓
const SLIDE_MS_PER_TILE = 400; // ladder climb (avg 30 tile) ≈ 12 s; snake bite (avg 40 tile) ≈ 16 s — clamp at 4 s
const SLIDE_MAX_MS = 4000;

interface Display { tile: number; phase: Phase; }
interface AnimState { from: number; to: number; phase: Phase; }

export function usePawnAnim(position: number, skip: boolean, onComplete?: () => void) {
  const reduced = useReducedMotion();

  // Source of truth: drives re-render only on real state change (not per RAF frame).
  const [anim, setAnim] = useState<AnimState>({ from: position, to: position, phase: 'idle' });
  const [display, setDisplay] = useState<Display>({ tile: position, phase: 'idle' });

  // Latest-ref for onComplete — avoids re-running the tick effect on every parent render.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Refs for RAF bookkeeping + generation counter (cancels mid-flight retarget).
  const rafRef = useRef<number | null>(null);
  const genRef = useRef(0);

  const cancelRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Position change → retarget. Cancels in-flight RAF and bumps generation.
  useEffect(() => {
    setAnim((prev) => {
      if (prev.to === position && prev.phase === 'idle') return prev;
      const delta = Math.abs(position - prev.to);
      return { from: prev.to, to: position, phase: delta > 6 ? 'sliding' : 'walking' };
    });
  }, [position]);

  // Skip → snap to end-state. Fires onComplete for BOTH walking and sliding (C1/H1 review follow-up).
  useEffect(() => {
    if (!skip) return;
    setAnim((prev) => {
      if (prev.phase === 'idle') return prev;
      return { from: prev.to, to: prev.to, phase: 'idle' };
    });
    setDisplay((prev) => ({ tile: prev.tile, phase: 'idle' }));
    cancelRaf();
    genRef.current++;
    onCompleteRef.current?.();
  }, [skip, cancelRaf]);

  // Tick effect — restarts whenever `anim` changes (real state transitions, not per-frame).
  useEffect(() => {
    if (anim.phase === 'idle') return;
    if (reduced) {
      const t = anim.to;
      setDisplay({ tile: t, phase: 'idle' });
      setAnim({ from: t, to: t, phase: 'idle' });
      onCompleteRef.current?.();
      return;
    }

    const myGen = ++genRef.current;
    const start = performance.now();
    const totalMs = anim.phase === 'walking'
      ? Math.abs(anim.to - anim.from) * HOP_MS_PER_TILE
      : Math.min(SLIDE_MAX_MS, Math.abs(anim.to - anim.from) * SLIDE_MS_PER_TILE);

    const tick = (now: number) => {
      // Bail if a newer animation/retarget has started.
      if (myGen !== genRef.current) return;
      const t = Math.min(1, (now - start) / totalMs);
      if (anim.phase === 'walking') {
        const dir = Math.sign(anim.to - anim.from) || 1;
        const steps = Math.abs(anim.to - anim.from);
        const stepFloat = steps * t;
        const stepIdx = Math.min(steps - 1, Math.floor(stepFloat));
        setDisplay({ tile: anim.from + dir * stepIdx, phase: 'walking' });
      } else {
        // Board2D uses CSS transition for the slide path (Task 6) — stay at `from` here.
        setDisplay({ tile: anim.from, phase: 'sliding' });
      }
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setDisplay({ tile: anim.to, phase: 'idle' });
        setAnim((prev) => ({ from: prev.to, to: prev.to, phase: 'idle' }));
        onCompleteRef.current?.();
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      // Only cancel if this effect's generation is still active.
      const currentGen = genRef.current;
      if (myGen === currentGen) cancelRaf();
    };
  }, [anim, reduced, cancelRaf]);

  return display;
}

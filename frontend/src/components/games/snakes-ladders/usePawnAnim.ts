import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

type Phase = 'idle' | 'walking' | 'sliding';

// Durations (ms) — tuned per design call: 6-tile hop ≈ 3-4 s, snake/ladder slide ≈ 2.5-3 s.
const HOP_MS_PER_TILE = 600; // 6 tile = 3600 ms ✓
const SLIDE_MS_PER_TILE = 400; // ladder climb (avg 30 tile) ≈ 12 s; snake bite (avg 40 tile) ≈ 16 s — clamp at 4 s
export const SLIDE_MAX_MS = 4000;

interface Display { tile: number; phase: Phase; }
interface AnimState { path: number[]; phase: Phase; }

export function usePawnAnim(position: number, skip: boolean, pathOverride?: number[], onComplete?: () => void) {
  const reduced = useReducedMotion();

  // Source of truth: drives re-render only on real state change (not per RAF frame).
  const [anim, setAnim] = useState<AnimState>({ path: [position], phase: 'idle' });
  const [display, setDisplay] = useState<Display>({ tile: position, phase: 'idle' });

  // Latest-ref mirrors for onComplete + anim (skip effect reads anim.to without
  // re-running on every anim change).
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  const animRef = useRef<AnimState>({ path: [position], phase: 'idle' });

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
  // `pathOverride` (e.g. snake/ladder synthesized path) takes precedence — the
  // container pre-computes the full traversal from current position through the
  // snake head/tail (or ladder bottom/top). Without it, we build a plain hop
  // path from current to new position.
  useEffect(() => {
    const lastTile = animRef.current.path[animRef.current.path.length - 1] ?? position;
    if (lastTile === position && animRef.current.phase === 'idle') return;
    const from = animRef.current.phase === 'idle' ? lastTile : animRef.current.path[0] ?? lastTile;
    let nextPath: number[];
    if (pathOverride && pathOverride.length >= 2) {
      nextPath = pathOverride;
    } else {
      const dir = Math.sign(position - from) || 1;
      const steps = Math.abs(position - from);
      nextPath = Array.from({ length: steps }, (_, i) => from + dir * (i + 1));
    }
    const delta = Math.abs(nextPath[nextPath.length - 1]! - nextPath[0]!);
    const phase: Phase = delta > 6 ? 'sliding' : 'walking';
    setAnim({ path: nextPath, phase });
  }, [position, pathOverride]);

  // Skip → snap to end-state. Fires onComplete for BOTH walking and sliding.
  useEffect(() => {
    if (!skip) return;
    const cur = animRef.current;
    if (cur.phase === 'idle') return;
    const lastTile = cur.path[cur.path.length - 1] ?? 0;
    setAnim({ path: [lastTile], phase: 'idle' });
    setDisplay({ tile: lastTile, phase: 'idle' });
    cancelRaf();
    genRef.current++;
    onCompleteRef.current?.();
  }, [skip, cancelRaf]);

  // Tick effect — restarts whenever `anim` changes (real state transitions, not per-frame).
  useEffect(() => {
    animRef.current = anim;
    if (anim.phase === 'idle') return;
    if (reduced) {
      const t = anim.path[anim.path.length - 1] ?? 0;
      setDisplay({ tile: t, phase: 'idle' });
      setAnim({ path: [t], phase: 'idle' });
      onCompleteRef.current?.();
      return;
    }

    const myGen = ++genRef.current;
    const start = performance.now();
    const firstTile = anim.path[0] ?? 0;
    const lastTile = anim.path[anim.path.length - 1] ?? 0;
    const totalMs = anim.phase === 'walking'
      ? anim.path.length * HOP_MS_PER_TILE
      : Math.min(SLIDE_MAX_MS, Math.abs(lastTile - firstTile) * SLIDE_MS_PER_TILE);

    const tick = (now: number) => {
      // Bail if a newer animation/retarget has started.
      if (myGen !== genRef.current) return;
      const t = Math.min(1, (now - start) / totalMs);
      if (anim.phase === 'walking') {
        const stepFloat = anim.path.length * t;
        const stepIdx = Math.min(anim.path.length - 1, Math.floor(stepFloat));
        const tile = anim.path[stepIdx] ?? lastTile;
        setDisplay({ tile, phase: 'walking' });
      } else {
        // Interpolate slide so the pawn visibly traverses from head→tail.
        const dir = Math.sign(lastTile - firstTile) || 1;
        const stepsTotal = Math.abs(lastTile - firstTile);
        const stepFloat = stepsTotal * t;
        const stepIdx = Math.min(stepsTotal - 1, Math.floor(stepFloat));
        const tile = firstTile + dir * stepIdx;
        setDisplay({ tile, phase: 'sliding' });
      }
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setDisplay({ tile: lastTile, phase: 'idle' });
        setAnim({ path: [lastTile], phase: 'idle' });
        onCompleteRef.current?.();
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      // Only cancel if this effect's generation is still active.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const currentGen = genRef.current;
      if (myGen === currentGen) cancelRaf();
    };
  }, [anim, reduced, cancelRaf]);

  return display;
}

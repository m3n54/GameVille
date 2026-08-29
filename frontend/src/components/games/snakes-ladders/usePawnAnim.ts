import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

type Phase = 'idle' | 'walking' | 'sliding';

// Durations (ms) — tuned per design call:
//   6-tile hop ≈ 4.2 s  (6 × 600 ms hop + 5 × 80 ms pause between hops)
//   snake/ladder slide ≈ 2.5-3 s, clamped at SLIDE_MAX_MS.
const HOP_MS_PER_TILE = 600;
const HOP_DELAY_MS = 80; // pause between hops (per design call: 80ms)
const SLIDE_MS_PER_TILE = 400;
export const SLIDE_MAX_MS = 4000;

// Cubic ease-in-out: slow start + end, fast middle. Used per-hop so each hop
// feels like a small bounce rather than a continuous slide. Pattern from
// easings.net — not yet exported from boardUtils (T12 will centralize).
const easeInOutCubic = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

interface Display { tile: number; phase: Phase; }
interface AnimState { path: number[]; phase: Phase; }

export type TileEnterKind = 'walk' | 'sliding';

export function usePawnAnim(
  position: number,
  skip: boolean,
  pathOverride?: number[],
  onComplete?: () => void,
  onTileEnter?: (tile: number, kind: TileEnterKind) => void,
) {
  const reduced = useReducedMotion();

  // Source of truth: drives re-render only on real state change (not per RAF frame).
  const [anim, setAnim] = useState<AnimState>({ path: [position], phase: 'idle' });
  const [display, setDisplay] = useState<Display>({ tile: position, phase: 'idle' });

  // Latest-ref mirrors for callbacks + anim (skip effect reads anim.to without
  // re-running on every anim change).
  const onCompleteRef = useRef(onComplete);
  const onTileEnterRef = useRef(onTileEnter);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    onTileEnterRef.current = onTileEnter;
  }, [onTileEnter]);
  const animRef = useRef<AnimState>({ path: [position], phase: 'idle' });

  // Refs for RAF bookkeeping + generation counter (cancels mid-flight retarget).
  const rafRef = useRef<number | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genRef = useRef(0);

  const cancelRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const clearDelay = useCallback(() => {
    if (delayTimerRef.current !== null) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
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
    cancelRaf();
    clearDelay();
    genRef.current++;
    setAnim({ path: [lastTile], phase: 'idle' });
    setDisplay({ tile: lastTile, phase: 'idle' });
    onCompleteRef.current?.();
  }, [skip, cancelRaf, clearDelay]);

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

    // WALKING: per-hop animation. Each hop eases (easeInOutCubic gives a small
    // arc-like feel), with HOP_DELAY_MS pause between hops. We track the
    // current hop index `hopIdx` in a closure and reschedule via setTimeout —
    // NOT via a separate useEffect (that would re-create on every render).
    if (anim.phase === 'walking') {
      const firstTile = anim.path[0] ?? 0;
      const lastTile = anim.path[anim.path.length - 1] ?? 0;
      const totalHops = anim.path.length; // hop N goes from path[N-1] → path[N]

      let hopIdx = 0;
      let cancelled = false;

      const playNextHop = () => {
        if (cancelled) return;
        if (myGen !== genRef.current) return;
        if (hopIdx >= totalHops) {
          // All hops done — settle.
          setDisplay({ tile: lastTile, phase: 'idle' });
          setAnim({ path: [lastTile], phase: 'idle' });
          onCompleteRef.current?.();
          return;
        }
        const fromTile = hopIdx === 0 ? firstTile : anim.path[hopIdx - 1] ?? firstTile;
        const toTile = anim.path[hopIdx] ?? lastTile;
        const start = performance.now();

        // Fire onTileEnter when the pawn LANDS on this hop's target tile.
        // We fire it here (not in the RAF tick) so the callback fires once per
        // hop boundary, not per frame.
        onTileEnterRef.current?.(toTile, 'walk');

        const tick = (now: number) => {
          if (cancelled) return;
          if (myGen !== genRef.current) return;
          const tRaw = Math.min(1, (now - start) / HOP_MS_PER_TILE);
          const t = easeInOutCubic(tRaw);
          // Sub-tile interpolation: ease within the single hop from fromTile to
          // toTile. The eased version produces a smooth arc; for one-tile hops
          // the pawn still reads as a discrete hop because HOP_DELAY_MS pauses
          // between tiles.
          const interpolated = fromTile + (toTile - fromTile) * t;
          setDisplay({ tile: interpolated, phase: 'walking' });

          if (tRaw < 1) {
            rafRef.current = requestAnimationFrame(tick);
          } else {
            rafRef.current = null;
            // Snap to exact target tile and pause before next hop.
            setDisplay({ tile: toTile, phase: 'walking' });
            hopIdx += 1;
            if (hopIdx < totalHops) {
              delayTimerRef.current = setTimeout(playNextHop, HOP_DELAY_MS);
            } else {
              setDisplay({ tile: lastTile, phase: 'idle' });
              setAnim({ path: [lastTile], phase: 'idle' });
              onCompleteRef.current?.();
            }
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      };

      playNextHop();

      return () => {
        cancelled = true;
        clearDelay();
        const currentGen = genRef.current;
        if (myGen === currentGen) cancelRaf();
      };
    }

    // SLIDING: continuous interpolation, step-by-step tile display.
    const start = performance.now();
    const firstTile = anim.path[0] ?? 0;
    const lastTile = anim.path[anim.path.length - 1] ?? 0;
    const totalMs = Math.min(SLIDE_MAX_MS, Math.abs(lastTile - firstTile) * SLIDE_MS_PER_TILE);
    const stepsTotal = Math.abs(lastTile - firstTile);
    const dir = Math.sign(lastTile - firstTile) || 1;

    // Fire onTileEnter for the initial tile at slide start.
    onTileEnterRef.current?.(firstTile, 'sliding');

    let lastReportedIdx = -1;
    const tick = (now: number) => {
      // Bail if a newer animation/retarget has started.
      if (myGen !== genRef.current) return;
      const t = Math.min(1, (now - start) / totalMs);
      const stepFloat = stepsTotal * t;
      const stepIdx = Math.min(stepsTotal - 1, Math.floor(stepFloat));
      if (stepIdx !== lastReportedIdx) {
        onTileEnterRef.current?.(firstTile + dir * stepIdx, 'sliding');
        lastReportedIdx = stepIdx;
      }
      const tile = firstTile + dir * stepIdx;
      setDisplay({ tile, phase: 'sliding' });
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
  }, [anim, reduced, cancelRaf, clearDelay]);

  return display;
}

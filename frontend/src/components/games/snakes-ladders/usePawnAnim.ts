import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Segment } from './types';

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
interface AnimState {
  /** Flattened tile path (legacy single-motion shape). For multi-segment
   *  traversals (walk+slide) the animation still drives the pawn through
   *  `path` in order; the per-tile hop vs slide is chosen by the segments
   *  that produced this path. */
  path: number[];
  phase: Phase;
  /** When present, dictates per-tile animation: walk segments hop step-by-step
   *  with HOP_DELAY_MS pause; sliding segments interpolate continuously. */
  segments?: Segment[];
}

export type TileEnterKind = 'walk' | 'sliding';

export function usePawnAnim(
  position: number,
  segments?: Segment[],
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
  // `segments` (e.g. snake/ladder traversal) takes precedence — the container
  // pre-computes the full traversal (walk + sliding) from current position
  // through the snake head/tail (or ladder bottom/top). When segments is
  // absent, fall back to the legacy `delta > 6` heuristic by building a plain
  // hop path from current to new position.
  useEffect(() => {
    const lastTile = animRef.current.path[animRef.current.path.length - 1] ?? position;
    if (lastTile === position && animRef.current.phase === 'idle') return;
    const from = animRef.current.phase === 'idle' ? lastTile : animRef.current.path[0] ?? lastTile;
    let nextPath: number[];
    let phase: Phase;
    let nextSegments: Segment[] | undefined;
    if (segments && segments.length > 0) {
      // Walk through each segment in order: walk segments step-by-step,
      // sliding segments in one continuous interpolation. Phase is determined
      // by the LAST segment's kind — the visual phase matches the final motion.
      nextPath = [];
      for (const seg of segments) {
        for (const t of seg.tiles) nextPath.push(t);
      }
      const lastSeg = segments[segments.length - 1]!;
      phase = lastSeg.kind === 'sliding' ? 'sliding' : 'walking';
      nextSegments = segments;
    } else {
      const dir = Math.sign(position - from) || 1;
      const steps = Math.abs(position - from);
      nextPath = Array.from({ length: steps }, (_, i) => from + dir * (i + 1));
      const delta = Math.abs(nextPath[nextPath.length - 1]! - nextPath[0]!);
      phase = delta > 6 ? 'sliding' : 'walking';
      nextSegments = undefined;
    }
    setAnim({ path: nextPath, phase, segments: nextSegments });
  }, [position, segments]);

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
    //
    // When `anim.segments` is present (T11 path builder), we iterate segments
    // in order: each `walk` segment uses the per-hop animation, each `sliding`
    // segment uses the continuous slide. Pauses between segments are zero —
    // adjacent hop targets flow into each other.
    if (anim.phase === 'walking' || anim.phase === 'sliding') {
      const lastTile = anim.path[anim.path.length - 1] ?? 0;
      const segs: Segment[] =
        anim.segments && anim.segments.length > 0
          ? anim.segments
          : [
              {
                // Map anim.Phase ('walking' | 'sliding') to Segment.kind
                // ('walk' | 'sliding') for the synthetic back-compat segment.
                kind: anim.phase === 'walking' ? 'walk' : 'sliding',
                tiles: anim.path.slice(1), // drop the starting tile
              },
            ];

      let segIdx = 0;
      let cancelled = false;

      const settle = () => {
        setDisplay({ tile: lastTile, phase: 'idle' });
        setAnim({ path: [lastTile], phase: 'idle' });
        onCompleteRef.current?.();
      };

      // Play one walk hop with ease-in-out arc + HOP_DELAY_MS pause.
      // `tiles` is the per-segment tile list (no leading position).
      const playWalkSegment = (tiles: number[], done: () => void) => {
        if (cancelled) return done();
        if (tiles.length === 0) return done();
        let hopIdx = 0;
        const playHop = () => {
          if (cancelled) return;
          if (myGen !== genRef.current) return;
          if (hopIdx >= tiles.length) return done();
          const fromTile = hopIdx === 0 ? anim.path[0] ?? tiles[0] ?? 0 : tiles[hopIdx - 1] ?? 0;
          const toTile = tiles[hopIdx] ?? lastTile;
          const start = performance.now();
          onTileEnterRef.current?.(toTile, 'walk');
          const tick = (now: number) => {
            if (cancelled) return;
            if (myGen !== genRef.current) return;
            const tRaw = Math.min(1, (now - start) / HOP_MS_PER_TILE);
            const t = easeInOutCubic(tRaw);
            const interpolated = fromTile + (toTile - fromTile) * t;
            setDisplay({ tile: interpolated, phase: 'walking' });
            if (tRaw < 1) {
              rafRef.current = requestAnimationFrame(tick);
            } else {
              rafRef.current = null;
              setDisplay({ tile: toTile, phase: 'walking' });
              hopIdx += 1;
              if (hopIdx < tiles.length) {
                delayTimerRef.current = setTimeout(playHop, HOP_DELAY_MS);
              } else {
                done();
              }
            }
          };
          rafRef.current = requestAnimationFrame(tick);
        };
        playHop();
      };

      // Play one slide segment: continuous interpolation across `tiles` with
      // SLIDE_MAX_MS clamp, step-by-step display.
      const playSlideSegment = (tiles: number[], done: () => void) => {
        if (cancelled) return done();
        if (tiles.length === 0) return done();
        const firstTile = tiles[0] ?? 0;
        const finalTile = tiles[tiles.length - 1] ?? firstTile;
        const stepsTotal = Math.abs(finalTile - firstTile);
        if (stepsTotal === 0) {
          setDisplay({ tile: finalTile, phase: 'sliding' });
          return done();
        }
        const totalMs = Math.min(SLIDE_MAX_MS, stepsTotal * SLIDE_MS_PER_TILE);
        const dir = Math.sign(finalTile - firstTile) || 1;
        const start = performance.now();
        onTileEnterRef.current?.(firstTile, 'sliding');
        let lastReportedIdx = -1;
        const tick = (now: number) => {
          if (cancelled) return;
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
            setDisplay({ tile: finalTile, phase: 'sliding' });
            done();
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      };

      const playNextSegment = () => {
        if (cancelled) return;
        if (myGen !== genRef.current) return;
        if (segIdx >= segs.length) {
          settle();
          return;
        }
        const seg = segs[segIdx]!;
        segIdx += 1;
        if (seg.kind === 'walk') {
          playWalkSegment(seg.tiles, playNextSegment);
        } else {
          playSlideSegment(seg.tiles, playNextSegment);
        }
      };

      playNextSegment();

      return () => {
        cancelled = true;
        clearDelay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
        const currentGen = genRef.current;
        if (myGen === currentGen) cancelRaf();
      };
    }

    // Unreachable: `anim.phase` is always one of 'idle' | 'walking' | 'sliding'
    // and the combined branch above handles walking + sliding via segments.
    return undefined;
  }, [anim, reduced, cancelRaf, clearDelay]);

  return display;
}

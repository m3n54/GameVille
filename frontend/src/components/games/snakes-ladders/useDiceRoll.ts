import { useEffect, useState, useRef } from 'react';
import { easeOutCubic } from './boardUtils';

export type FaceValue = 1 | 2 | 3 | 4 | 5 | 6;
export type RollPhase = 'idle' | 'spinning' | 'settling' | 'landed';

// Round 2 T9: 1.7s ease-out envelope (was 3.0s linear). Decelerating spin feels
// snappier and matches the "dramatic but short" dice cadence chosen on 2026-08-29.
export const SPIN_MS = 1700;
export const SETTLE_MS = 250;

export function useDiceRoll(value: number | null, rolling: boolean) {
  const [phase, setPhase] = useState<RollPhase>('idle');
  const [target, setTarget] = useState<FaceValue>(1);
  // `progress` ticks ~60fps while spinning so consumers (Dice3D useFrame) can
  // derive an eased angular velocity without doing their own RAF.
  const [progress, setProgress] = useState<number>(1);
  const startRef = useRef<number>(0);
  // I2 review fix: read latest `phase` via a ref so the effect doesn't re-run when
  // the phase flips (which would re-create t1/t2 timers and could fire double).
  const phaseRef = useRef<RollPhase>('idle');
  phaseRef.current = phase;

  useEffect(() => {
    if (rolling) {
      setPhase('spinning');
      startRef.current = performance.now();
    } else if (phaseRef.current === 'spinning' && value != null) {
      const tRaw = (performance.now() - startRef.current) / SPIN_MS;
      const t = Math.max(0, Math.min(1, tRaw));
      const remaining = 1 - t;
      setTarget(value as FaceValue);
      const wait = remaining * SPIN_MS;
      const t1 = setTimeout(() => setPhase('settling'), wait);
      const t2 = setTimeout(() => setPhase('landed'), wait + SETTLE_MS);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    return undefined;
  }, [rolling, value]);

  // RAF tick: drives `progress` 0→1 across SPIN_MS, then idles at 1.
  useEffect(() => {
    if (phase !== 'spinning') {
      setProgress(1);
      return undefined;
    }
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - startRef.current) / SPIN_MS);
      setProgress(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Eased progress (0..1) — Dice3D reads this for angular velocity.
  const easedProgress = easeOutCubic(progress);

  return { phase, target, progress, easedProgress };
}

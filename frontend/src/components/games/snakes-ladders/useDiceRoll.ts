import { useEffect, useState, useRef } from 'react';

export type FaceValue = 1 | 2 | 3 | 4 | 5 | 6;
export type RollPhase = 'idle' | 'spinning' | 'settling' | 'landed';

export const SPIN_MS = 3000;
export const SETTLE_MS = 200;

export function useDiceRoll(value: number | null, rolling: boolean) {
  const [phase, setPhase] = useState<RollPhase>('idle');
  const [target, setTarget] = useState<FaceValue>(1);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (rolling) {
      setPhase('spinning');
      startRef.current = performance.now();
    } else if (phase === 'spinning' && value != null) {
      const t = (performance.now() - startRef.current) / SPIN_MS;
      const remaining = Math.max(0, 1 - t);
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
  }, [rolling, value, phase]);

  const skip = () => {
    if (phase !== 'landed' && value != null) {
      setTarget(value as FaceValue);
      setPhase('landed');
    }
  };

  const progress =
    phase === 'spinning'
      ? (performance.now() - startRef.current) / SPIN_MS
      : phase === 'settling'
        ? 1
        : 1;

  return { phase, target, skip, progress };
}

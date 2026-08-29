import type { Segment } from './types';

/**
 * Build explicit walk/sliding segments for a pawn's hop on a diceResult.
 * Replaces the inline `buildPath` in SnakesLaddersContainer.
 */
export function buildSegments(
  from: number,
  to: number,
  snakeHit: [number, number] | null,
  ladderHit: [number, number] | null,
): Segment[] {
  const segs: Segment[] = [];

  // Plain hop: walk from+1..to
  const hopDir = Math.sign(to - from) || 1;
  const hopLen = Math.abs(to - from);
  if (hopLen > 0) {
    const tiles: number[] = [];
    for (let i = 1; i <= hopLen; i++) tiles.push(from + hopDir * i);
    segs.push({ kind: 'walk', tiles });
  }

  if (snakeHit) {
    const [head, tail] = snakeHit;
    const slideDir = Math.sign(tail - head) || -1;
    const slideLen = Math.abs(tail - head);
    if (slideLen > 0) {
      const tiles: number[] = [];
      for (let i = 1; i <= slideLen; i++) tiles.push(head + slideDir * i);
      segs.push({ kind: 'sliding', tiles });
    }
  } else if (ladderHit) {
    const [bottom, top] = ladderHit;
    const slideDir = Math.sign(top - bottom) || 1;
    const slideLen = Math.abs(top - bottom);
    if (slideLen > 0) {
      const tiles: number[] = [];
      for (let i = 1; i <= slideLen; i++) tiles.push(bottom + slideDir * i);
      segs.push({ kind: 'sliding', tiles });
    }
  }

  return segs;
}

import { useMemo } from 'react';
import { tileCenter } from './boardUtils';

interface SnakeSVGProps {
  headTile: number;
  tailTile: number;
}

const BODY_COLOR = '#7BC96F';
const BODY_DARK = '#4E9F3D';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export default function SnakeSVG({ headTile, tailTile }: SnakeSVGProps) {
  const { path, head } = useMemo(() => {
    const h = tileCenter(headTile);
    const t = tileCenter(tailTile);
    const dx = t.x - h.x;
    const dy = t.y - h.y;
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular unit vector (rotated 90deg from head->tail)
    const px = -dy / len;
    const py = dx / len;
    // Bow perpendicular to head-tail line; alternating sign keeps adjacent
    // snakes from bowing into the same side.
    const sign = (headTile + tailTile) % 2 === 0 ? 1 : -1;
    const bow = sign * clamp(len * 0.18, 0.2, 0.6);
    // Cubic Bézier: control points offset perpendicular at half bow.
    const d =
      `M ${h.x} ${h.y} ` +
      `C ${h.x + px * bow * 0.5} ${h.y + py * bow * 0.5}, ` +
      `${t.x - px * bow * 0.5} ${t.y - py * bow * 0.5}, ` +
      `${t.x} ${t.y}`;
    return { path: d, head: h };
  }, [headTile, tailTile]);

  return (
    <g>
      {/* body stroke — thick, tapered via filter */}
      <path d={path} stroke={BODY_DARK} strokeWidth="0.55" fill="none" strokeLinecap="round" />
      <path d={path} stroke={BODY_COLOR} strokeWidth="0.42" fill="none" strokeLinecap="round" />
      {/* chibi head — bulat besar, anchored at tile center */}
      <g transform={`translate(${head.x}, ${head.y})`}>
        <circle r="0.6" fill={BODY_COLOR} stroke={BODY_DARK} strokeWidth="0.08" />
        {/* mata besar */}
        <ellipse cx="-0.2" cy="-0.15" rx="0.18" ry="0.22" fill="#FFFFFF" />
        <ellipse cx="0.2" cy="-0.15" rx="0.18" ry="0.22" fill="#FFFFFF" />
        <circle cx="-0.2" cy="-0.12" r="0.1" fill="#1A1A1A" />
        <circle cx="0.2" cy="-0.12" r="0.1" fill="#1A1A1A" />
        {/* lidah forked */}
        <path
          d="M 0 0.25 L 0 0.5 M 0 0.5 L -0.08 0.6 M 0 0.5 L 0.08 0.6"
          stroke="#E23B3B"
          strokeWidth="0.06"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

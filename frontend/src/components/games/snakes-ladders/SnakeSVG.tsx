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
      {/* body stroke — R4 shrink: 0.55→0.28, 0.42→0.22 (was occluding tile numbers) */}
      <path d={path} stroke={BODY_DARK} strokeWidth="0.28" fill="none" strokeLinecap="round" />
      <path d={path} stroke={BODY_COLOR} strokeWidth="0.22" fill="none" strokeLinecap="round" />
      {/* chibi head — R4 shrink: r 0.6→0.36, face features scaled proportionally */}
      <g transform={`translate(${head.x}, ${head.y})`}>
        <circle r="0.36" fill={BODY_COLOR} stroke={BODY_DARK} strokeWidth="0.06" />
        {/* mata besar */}
        <ellipse cx="-0.11" cy="-0.09" rx="0.10" ry="0.13" fill="#FFFFFF" />
        <ellipse cx="0.11" cy="-0.09" rx="0.10" ry="0.13" fill="#FFFFFF" />
        <circle cx="-0.11" cy="-0.07" r="0.06" fill="#1A1A1A" />
        <circle cx="0.11" cy="-0.07" r="0.06" fill="#1A1A1A" />
        {/* lidah forked */}
        <path
          d="M 0 0.15 L 0 0.30 M 0 0.30 L -0.05 0.36 M 0 0.30 L 0.05 0.36"
          stroke="#E23B3B"
          strokeWidth="0.04"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

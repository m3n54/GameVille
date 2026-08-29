import { useMemo } from 'react';
import { tileCenter } from './boardUtils';

interface LadderSVGProps {
  bottomTile: number;
  topTile: number;
}

const RAIL_COLOR = '#C490E4'; // purple rope
const RUNG_COLORS = ['#FF9BB5', '#FFD3B6', '#B5EAD7', '#A8D8EA', '#FFE66D'];

export default function LadderSVG({ bottomTile, topTile }: LadderSVGProps) {
  const { railL, railR, rungs, angle } = useMemo(() => {
    const b = tileCenter(bottomTile);
    const t = tileCenter(topTile);
    const dx = t.x - b.x;
    const dy = t.y - b.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    // Perpendicular offset for two rails
    const px = -uy * 0.28;
    const py = ux * 0.28;
    const railL = `M ${b.x + px} ${b.y + py} L ${t.x + px} ${t.y + py}`;
    const railR = `M ${b.x - px} ${b.y - py} L ${t.x - px} ${t.y - py}`;
    const span = Math.abs(topTile - bottomTile);
    const count = Math.max(4, Math.min(14, Math.round(span)));
    const rungs = Array.from({ length: count }, (_, i) => {
      const f = count === 1 ? 0.5 : i / (count - 1);
      return {
        x: b.x + dx * f,
        y: b.y + dy * f,
        color: RUNG_COLORS[i % RUNG_COLORS.length] ?? '#FF9BB5',
      };
    });
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    return { railL, railR, rungs, angle };
  }, [bottomTile, topTile]);

  return (
    <g>
      <path d={railL} stroke={RAIL_COLOR} strokeWidth="0.12" fill="none" strokeLinecap="round" />
      <path d={railR} stroke={RAIL_COLOR} strokeWidth="0.12" fill="none" strokeLinecap="round" />
      {rungs.map((r, i) => (
        <rect
          key={i}
          x={-0.18}
          y={-0.04}
          width={0.36}
          height={0.08}
          transform={`translate(${r.x} ${r.y}) rotate(${angle})`}
          fill={r.color}
          stroke="#FFFFFF"
          strokeWidth="0.04"
        />
      ))}
    </g>
  );
}

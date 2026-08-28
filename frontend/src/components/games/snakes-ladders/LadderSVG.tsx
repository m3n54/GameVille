import { useMemo } from 'react';
import { tileToGridPos } from './boardUtils';

interface LadderSVGProps {
  bottomTile: number;
  topTile: number;
}

const RAIL_COLOR = '#C490E4'; // purple rope
const RUNG_COLORS = ['#FF9BB5', '#FFD3B6', '#B5EAD7', '#A8D8EA', '#FFE66D'];

export default function LadderSVG({ bottomTile, topTile }: LadderSVGProps) {
  const { railL, railR, rungs } = useMemo(() => {
    const b = tileToGridPos(bottomTile);
    const t = tileToGridPos(topTile);
    const dx = t.col - b.col;
    const dy = t.row - b.row;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    // Perpendicular offset for two rails
    const px = -uy * 0.18;
    const py = ux * 0.18;
    const railL = `M ${b.col + px} ${b.row + py} L ${t.col + px} ${t.row + py}`;
    const railR = `M ${b.col - px} ${b.row - py} L ${t.col - px} ${t.row - py}`;
    const count = Math.max(3, Math.min(7, Math.round(length)));
    const rungs = Array.from({ length: count }, (_, i) => {
      const f = count === 1 ? 0.5 : i / (count - 1);
      return {
        x: b.col + dx * f,
        y: b.row + dy * f,
        color: RUNG_COLORS[i % RUNG_COLORS.length] ?? '#FF9BB5',
      };
    });
    return { railL, railR, rungs };
  }, [bottomTile, topTile]);

  return (
    <g>
      <path d={railL} stroke={RAIL_COLOR} strokeWidth="0.12" fill="none" strokeLinecap="round" />
      <path d={railR} stroke={RAIL_COLOR} strokeWidth="0.12" fill="none" strokeLinecap="round" />
      {rungs.map((r, i) => (
        <circle key={i} cx={r.x} cy={r.y} r="0.18" fill={r.color} stroke="#FFFFFF" strokeWidth="0.05" />
      ))}
    </g>
  );
}

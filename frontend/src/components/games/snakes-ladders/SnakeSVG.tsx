import { useMemo } from 'react';
import { tileToGridPos } from './boardUtils';

interface SnakeSVGProps {
  headTile: number;
  tailTile: number;
}

const BODY_COLOR = '#7BC96F';
const BODY_DARK = '#4E9F3D';

export default function SnakeSVG({ headTile, tailTile }: SnakeSVGProps) {
  const { path, headPos } = useMemo(() => {
    const head = tileToGridPos(headTile);
    const tail = tileToGridPos(tailTile);
    // S-curve: midpoint offset perpendicular to head-tail line
    const dx = tail.col - head.col;
    const dy = tail.row - head.row;
    const sign = (headTile + tailTile) % 2 === 0 ? 1 : -1;
    const midCol = (head.col + tail.col) / 2 + sign * Math.min(1.5, Math.hypot(dx, dy) * 0.25);
    const midRow = (head.row + tail.row) / 2;
    // Quadratic-bezier-ish path
    const d = `M ${head.col} ${head.row} Q ${midCol} ${midRow} ${tail.col} ${tail.row}`;
    return { path: d, headPos: head };
  }, [headTile, tailTile]);

  return (
    <g>
      {/* body stroke — thick, tapered via filter */}
      <path d={path} stroke={BODY_DARK} strokeWidth="0.55" fill="none" strokeLinecap="round" />
      <path d={path} stroke={BODY_COLOR} strokeWidth="0.42" fill="none" strokeLinecap="round" />
      {/* chibi head — bulat besar */}
      <g transform={`translate(${headPos.col}, ${headPos.row})`}>
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

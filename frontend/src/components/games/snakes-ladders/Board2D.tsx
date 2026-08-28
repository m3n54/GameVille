'use client';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import SnakeSVG from './SnakeSVG';
import LadderSVG from './LadderSVG';
import PawnSVG from './PawnSVG';
import { tileToGridPos, GRID_SIZE } from './boardUtils';
import { usePawnAnim } from './usePawnAnim';

interface PlayerState {
  id: string;
  position: number;
  color: string;
}
interface Props {
  players: PlayerState[];
  snakes: [number, number][];
  ladders: [number, number][];
  currentTurn: number;
  glowTile?: { tile: number; kind: 'snake' | 'ladder' } | null;
  skipAnim?: boolean;
  onAnimComplete?: (playerId: string) => void;
}

const TILE_PALETTE = ['#FFF5F7', '#FFE4EC', '#E5F4FB', '#FFEFD8']; // checkerboard 4-color

function buildSpecialTileSet(
  snakes: [number, number][],
  ladders: [number, number][],
): Set<number> {
  const s = new Set<number>();
  snakes.forEach(([a, b]) => {
    s.add(a);
    s.add(b);
  });
  ladders.forEach(([a, b]) => {
    s.add(a);
    s.add(b);
  });
  return s;
}

function PawnLayer({
  p,
  skip,
  onComplete,
}: {
  p: PlayerState;
  skip: boolean;
  onComplete: () => void;
}) {
  const display = usePawnAnim(p.position, skip, onComplete);
  const { row, col } = tileToGridPos(display.tile);
  // Multi-pawn per tile: stack vertically via last-hex-digit offset
  const stackOffset = (parseInt(p.id.slice(-1), 16) % 2) * 18;
  return (
    <div
      className="absolute"
      style={{
        left: `calc(${(col + 0.5) / GRID_SIZE * 100}% + 4px)`,
        top: `calc(${(row + 0.5) / GRID_SIZE * 100}% + ${stackOffset}px)`,
        transform: 'translate(-50%, -50%)',
        transition:
          display.phase === 'sliding'
            ? 'left 0.5s cubic-bezier(0.4, 0, 0.2, 1), top 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
            : 'none',
        zIndex: 20,
      }}
    >
      <PawnSVG color={p.color} />
    </div>
  );
}

export default function Board2D({
  players,
  snakes,
  ladders,
  currentTurn,
  glowTile = null,
  skipAnim = false,
  onAnimComplete,
}: Props) {
  const specialTiles = useMemo(
    () => buildSpecialTileSet(snakes, ladders),
    [snakes, ladders],
  );

  return (
    <div
      className="relative w-full max-w-[420px] mx-auto bg-white rounded-cute shadow-soft overflow-hidden"
      style={{ aspectRatio: '1 / 1' }}
    >
      {/* Tile grid */}
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
          gap: '2px',
          padding: '2px',
        }}
      >
        {Array.from({ length: 100 }, (_, i) => {
          const { row, col } = tileToGridPos(i);
          const isSpecial = specialTiles.has(i);
          const color = isSpecial
            ? '#FFE9A8'
            : TILE_PALETTE[(row + col) % TILE_PALETTE.length] ?? '#FFF5F7';
          return (
            <div
              key={i}
              className="relative rounded-sm flex items-center justify-center text-[9px] font-bold text-cute-muted"
              style={{
                background: color,
                direction: row % 2 === 1 ? 'rtl' : 'ltr',
              }}
            >
              {i + 1}
            </div>
          );
        })}
      </div>
      {/* SVG overlay — snakes & ladders */}
      <svg
        className="absolute inset-0 pointer-events-none"
        viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`}
        preserveAspectRatio="none"
        style={{ zIndex: 10 }}
      >
        {snakes.map(([head, tail], i) => (
          <SnakeSVG key={`s-${i}`} headTile={head} tailTile={tail} />
        ))}
        {ladders.map(([bot, top], i) => (
          <LadderSVG key={`l-${i}`} bottomTile={bot} topTile={top} />
        ))}
        {/* Glow on snake bite / ladder climb — driven by container (Task 8) */}
        {glowTile && (
          <motion.circle
            key={`g-${glowTile.tile}-${glowTile.kind}`}
            cx={tileToGridPos(glowTile.tile).col + 0.5}
            cy={tileToGridPos(glowTile.tile).row + 0.5}
            r="0.8"
            fill={glowTile.kind === 'snake' ? '#FF6B6B' : '#FFE66D'}
            initial={{ opacity: 0.6, scale: 0.5 }}
            animate={{ opacity: 0, scale: 2.2 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        )}
      </svg>
      {/* Pawns */}
      {players.map((p) => (
        <PawnLayer
          key={p.id}
          p={p}
          skip={skipAnim}
          onComplete={() => onAnimComplete?.(p.id)}
        />
      ))}
    </div>
  );
}

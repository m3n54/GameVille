'use client';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import SnakeSVG from './SnakeSVG';
import LadderSVG from './LadderSVG';
import PawnSVG from './PawnSVG';
import { tileToGridPos, tileCenter, GRID_SIZE, tileColor } from './boardUtils';
import { usePawnAnim } from './usePawnAnim';
import type { Segment } from './types';

interface PlayerState {
  id: string;
  position: number;
  color: string;
  /** Tagged traversal segments (walk vs sliding). The container synthesizes
   *  these on every diceResult so the pawn can visit every intermediate tile
   *  (walk step-by-step + slide continuous). Wired through usePawnAnim. */
  segments?: Segment[];
}
interface Props {
  players: PlayerState[];
  snakes: [number, number][];
  ladders: [number, number][];
  currentTurn: number;
  glowTile?: { tile: number; kind: 'snake' | 'ladder' } | null;
  skipAnim?: boolean;
  onAnimComplete?: (playerId: string) => void;
  /** Per-tile callback fired by usePawnAnim for each hop boundary. Container
   *  uses this to dispatch the per-hop SFX (existing 'hop' kind). */
  onTileEnter?: (playerId: string, tile: number, kind: 'walk' | 'sliding') => void;
}

const STACK_OFFSET_STEP_PX = 14;

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
  onTileEnter,
  onComplete,
}: {
  p: PlayerState;
  skip: boolean;
  onTileEnter: (tile: number, kind: 'walk' | 'sliding') => void;
  onComplete: () => void;
}) {
  const display = usePawnAnim(p.position, skip, p.segments, onComplete, onTileEnter);
  const { row, col } = tileToGridPos(display.tile);
  // Multi-pawn per tile: deterministic vertical stack via charCode mod. Socket.IO
  // ids are A-Za-z0-9_- — `parseInt(., 16)` was NaN ~70% of the time, breaking
  // CSS. charCodeAt always returns a number; mod 4 caps the visible offset.
  const stackOffset = ((p.id.charCodeAt(p.id.length - 1) || 0) % 4) * STACK_OFFSET_STEP_PX;
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
      <PawnSVG color={p.color} phase={display.phase} />
    </div>
  );
}

export default function Board2D({
  players,
  snakes,
  ladders,
  // currentTurn is received so the parent can derive visual state later (e.g.
  // a turn indicator); Board2D itself doesn't need it now but the prop is part
  // of the contract for future enhancements.
  currentTurn,
  glowTile = null,
  skipAnim = false,
  onAnimComplete,
  onTileEnter,
}: Props) {
  void currentTurn;
  const specialTiles = useMemo(
    () => buildSpecialTileSet(snakes, ladders),
    [snakes, ladders],
  );

  // Z-stack contract (T5 + R3):
  // z=0..4: free for future background layers
  // z=10: tile grid (numbers visible)
  // z=15: SVG overlay (snakes/ladders/glow) — above tile numbers, below pawns
  // z=20: pawns
  // z=30+: free for future foreground layers (e.g. tooltips)
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
          zIndex: 10,
        }}
      >
        {Array.from({ length: 100 }, (_, i) => {
          const isSpecial = specialTiles.has(i);
          const color = isSpecial
            ? '#FFE9A8'
            : tileColor(i);
          return (
            <div
              key={i}
              className="relative rounded-sm flex items-center justify-center text-[9px] font-bold text-cute-muted"
              style={{ background: color }}
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
        style={{ zIndex: 15 }}
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
            cx={tileCenter(glowTile.tile).x}
            cy={tileCenter(glowTile.tile).y}
            r="0.5"
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
          onTileEnter={
            onTileEnter
              ? (tile, kind) => onTileEnter(p.id, tile, kind)
              : () => {}
          }
          onComplete={() => onAnimComplete?.(p.id)}
        />
      ))}
    </div>
  );
}

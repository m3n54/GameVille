import { useMemo } from 'react';
import { tileToWorld } from './boardUtils';

interface LadderModelProps {
  bottomTile: number; // tile index 0-99 ladder base
  topTile: number; // tile index 0-99 ladder top
}

const RAIL_RADIUS = 0.045;
const RUNG_RADIUS = 0.03;
const RAIL_OFFSET = 0.14; // perpendicular offset of each rail from center line
const INSET = 0.25; // total shortening vs raw tile-center distance
const RUNG_SPACING = 0.28;
const HEIGHT_Y = 0.07; // ladders lie flat on the board

const RAIL_COLOR = '#D9A05B';
const RUNG_COLOR = '#C08A45';

/** A board-game-style wooden ladder lying flat on the board. */
export default function LadderModel({ bottomTile, topTile }: LadderModelProps): JSX.Element {
  const layout = useMemo(() => {
    const [bx, bz] = tileToWorld(bottomTile);
    const [tx, tz] = tileToWorld(topTile);

    const dx = tx - bx;
    const dz = tz - bz;
    const dist = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);

    // Group sits at midpoint, rotated so its local +X axis points bottom -> top.
    const railLength = Math.max(dist - INSET, RAIL_OFFSET * 2);
    const halfRail = railLength / 2;

    const rungCount = Math.max(3, Math.min(8, Math.round(railLength / RUNG_SPACING)));
    const rungs = Array.from({ length: rungCount }, (_, i) => {
      // Spread rungs evenly across the rail length, centered.
      const t = rungCount === 1 ? 0.5 : i / (rungCount - 1);
      return -halfRail + t * railLength;
    });

    return {
      midX: (bx + tx) / 2,
      midZ: (bz + tz) / 2,
      rotationY: -angle,
      halfRail,
      rungs,
    };
  }, [bottomTile, topTile]);

  return (
    <group position={[layout.midX, 0, layout.midZ]} rotation={[0, layout.rotationY, 0]}>
      {/* Rails: cylinders laid along local X */}
      {[-RAIL_OFFSET, RAIL_OFFSET].map((offsetZ) => (
        <mesh key={`rail-${offsetZ}`} position={[0, HEIGHT_Y, offsetZ]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[RAIL_RADIUS, RAIL_RADIUS, layout.halfRail * 2, 12]} />
          <meshStandardMaterial color={RAIL_COLOR} roughness={0.6} />
        </mesh>
      ))}
      {/* Rungs: cylinders spanning between the rails along local Z */}
      {layout.rungs.map((x, i) => (
        <mesh key={`rung-${i}`} position={[x, HEIGHT_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[RUNG_RADIUS, RUNG_RADIUS, RAIL_OFFSET * 2, 10]} />
          <meshStandardMaterial color={RUNG_COLOR} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

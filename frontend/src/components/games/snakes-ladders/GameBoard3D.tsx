'use client';

import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import SnakeModel from './SnakeModel';
import LadderModel from './LadderModel';
import { tileToWorld, tileColor, TILE_SIZE } from './boardUtils';

interface PlayerState {
  id: string;
  position: number;
  color: string;
}

interface GameBoard3DProps {
  players: PlayerState[];
  snakes: [number, number][];
  ladders: [number, number][];
  currentTurn: number;
}

/** Tiles occupied by snake heads/tails or ladder ends get an accent tint. */
function buildSpecialTileSet(snakes: [number, number][], ladders: [number, number][]): Set<number> {
  const special = new Set<number>();
  for (const [a] of snakes) special.add(a);
  for (const [, b] of snakes) special.add(b);
  for (const [b] of ladders) special.add(b);
  for (const [, t] of ladders) special.add(t);
  return special;
}

function BoardTile({ index }: { index: number }) {
  const [x, z] = tileToWorld(index);
  const base = tileColor(index);
  const isSpecial = SPECIAL_TILES.has(index);
  const color = isSpecial ? '#FFE9A8' : base; // warm accent under snakes/ladders

  return (
    <mesh position={[x, 0, z]} receiveShadow>
      <boxGeometry args={[TILE_SIZE, 0.12, TILE_SIZE]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

function TileNumber({ index }: { index: number }) {
  const [x, z] = tileToWorld(index);
  return (
    <Html position={[x, 0.18, z]} center zIndexRange={[10, 0]}>
      <span className="text-[8px] font-bold text-gray-400 select-none pointer-events-none">
        {index + 1}
      </span>
    </Html>
  );
}

function PlayerPiece({ position, color }: { position: number; color: string }) {
  const groupRef = useRef<THREE.Group>(null);

  // Animation state kept in refs so useFrame stays stable across renders
  const anim = useRef({
    from: position,
    to: position,
    progress: 1, // 0..1 along current movement
    phase: 'idle' as 'walking' | 'sliding' | 'idle',
  });
  // Track previous prop value to detect moves
  const prevPosition = useRef(position);

  useEffect(() => {
    if (position === prevPosition.current) return;
    const a = anim.current;
    a.from = prevPosition.current;
    a.to = position;
    a.progress = 0;

    // Snake bite or ladder climb (|delta| > dice max 6) → single glide arc
    a.phase = Math.abs(position - prevPosition.current) > 6 ? 'sliding' : 'walking';
    prevPosition.current = position;
  }, [position]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g || anim.current.phase === 'idle') return;
    const a = anim.current;
    const speed = a.phase === 'walking' ? 3.2 : 1.6; // hops faster than glides
    a.progress = Math.min(1, a.progress + delta * speed);

    const [fx, fz] = tileToWorld(a.from);
    const [tx, tz] = tileToWorld(a.to);
    const t = easeInOut(a.progress);

    if (a.phase === 'walking') {
      // Step tile-by-tile toward the target
      const dir = Math.sign(a.to - a.from) || 1;
      const steps = Math.abs(a.to - a.from);
      const stepFloat = steps * t;
      const stepIndex = Math.min(steps - 1, Math.floor(stepFloat));
      const stepT = steps === 0 ? 1 : stepFloat - stepIndex;
      const fromTile = a.from + dir * stepIndex;
      const [sx, sz] = tileToWorld(fromTile);
      const [ex, ez] = tileToWorld(fromTile + dir);
      g.position.x = sx + (ex - sx) * stepT;
      g.position.z = sz + (ez - sz) * stepT;
      // Hop arc — one bounce per tile
      g.position.y = 0.32 + Math.sin(Math.PI * stepT) * 0.35;
    } else {
      // Sliding (snake/ladder): smooth diagonal glide with high arc
      g.position.x = fx + (tx - fx) * t;
      g.position.z = fz + (tz - fz) * t;
      const arcHeight = Math.max(0.8, Math.hypot(tx - fx, tz - fz) * 0.18);
      g.position.y = 0.32 + Math.sin(Math.PI * t) * arcHeight;
    }

    if (a.progress >= 1) {
      a.phase = 'idle';
      const [rx, rz] = tileToWorld(a.to);
      g.position.set(rx, 0.32, rz);
    }
  });

  // Slight per-player offset so pieces on the same tile don't fully overlap
  const [ox, oz] = tileToWorld(position);
  const seed = (position % 4) - 1.5;

  return (
    <group ref={groupRef} position={[ox + seed * 0.08, 0.32, oz]}>
      {/* Pawn body — rounded cone look */}
      <mesh>
        <sphereGeometry args={[0.2, 20, 20]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.16, 0]}>
        <cylinderGeometry args={[0.12, 0.19, 0.1, 14]} />
        <meshStandardMaterial color="#4A4A4A" roughness={0.5} />
      </mesh>
      {/* Tiny highlight */}
      <mesh position={[0.06, 0.08, 0.06]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial color="#FFFFFF" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function TurnIndicator({ currentTurn, playerColors }: { currentTurn: number; playerColors: string[] }) {
  const color = playerColors[currentTurn] || '#FF9BB5';

  return (
    <Html position={[0, 3.2, 0]} center>
      <div className="bg-white px-4 py-2 rounded-cute shadow-soft border-2 border-primary text-center">
        <p className="text-sm font-bold" style={{ color }}>Giliran pemain #{currentTurn + 1}</p>
      </div>
    </Html>
  );
}

export default function GameBoard3D({ players, snakes, ladders, currentTurn }: GameBoard3DProps) {
  const specialTiles = buildSpecialTileSet(snakes, ladders);
  SPECIAL_TILES = specialTiles;

  return (
    <div className="w-full h-[500px] md:h-[600px] bg-gradient-to-b from-sky-50 via-pink-50 to-amber-50 rounded-cute overflow-hidden">
      <Canvas shadows camera={{ position: [9, 11, 9], fov: 42 }}>
        <ambientLight intensity={0.65} />
        <directionalLight
          position={[6, 12, 4]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <OrbitControls
          enableZoom
          enablePan={false}
          minPolarAngle={Math.PI / 4.5}
          maxPolarAngle={Math.PI / 2.6}
          target={[0, 0, 0]}
        />

        {/* Board tiles */}
        {Array.from({ length: 100 }, (_, i) => (
          <BoardTile key={`t-${i}`} index={i} />
        ))}
        {Array.from({ length: 100 }, (_, i) => (
          <TileNumber key={`n-${i}`} index={i} />
        ))}

        {/* Snakes & Ladders */}
        {snakes.map(([head, tail], i) => (
          <SnakeModel key={`s-${i}`} headTile={head} tailTile={tail} />
        ))}
        {ladders.map(([bottom, top], i) => (
          <LadderModel key={`l-${i}`} bottomTile={bottom} topTile={top} />
        ))}

        {/* Player pieces */}
        {players.map((p) => (
          <PlayerPiece key={p.id} position={p.position} color={p.color} />
        ))}

        <TurnIndicator currentTurn={currentTurn} playerColors={players.map(p => p.color)} />
      </Canvas>
    </div>
  );
}

// Module-level set consumed by BoardTile (rebuilt each render of GameBoard3D)
let SPECIAL_TILES = new Set<number>();

// Smooth acceleration/deceleration for movement phases
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

'use client';

import { useRef } from 'react';
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
  const [tx, tz] = tileToWorld(position);
  const groupRef = useRef<THREE.Group>(null);
  const target = new THREE.Vector3(tx, 0.32, tz);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    // Smooth hop toward the target tile
    const g = groupRef.current;
    g.position.lerp(target, Math.min(1, delta * 6));
  });

  // Slight per-player offset so pieces on the same tile don't fully overlap
  const seed = position % 4;

  return (
    <group ref={groupRef} position={[target.x + (seed - 1.5) * 0.08, 0.32, target.z]}>
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

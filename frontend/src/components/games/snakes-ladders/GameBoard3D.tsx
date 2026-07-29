'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';

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

const TILE_COLORS = ['#FFD3B6', '#FF9BB5', '#A8D8EA', '#B5EAD7', '#FFDAC1'];
const GRID_SIZE = 10;
const TILE_SIZE = 0.9;
const GAP = 0.05;

function BoardTile({ index, color }: { index: number; color: string }) {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const x = (col - 4.5) * (TILE_SIZE + GAP);
  const z = (row - 4.5) * (TILE_SIZE + GAP);

  return (
    <mesh position={[x, 0, z]} receiveShadow>
      <boxGeometry args={[TILE_SIZE, 0.1, TILE_SIZE]} />
      <meshStandardMaterial color={color} />
      <Html position={[0, 0.2, 0]} center>
        <span className="text-[8px] font-bold text-gray-500 select-none">{index + 1}</span>
      </Html>
    </mesh>
  );
}

function PlayerPiece({ position, color }: { position: number; color: string }) {
  const row = Math.floor(position / GRID_SIZE);
  const col = position % GRID_SIZE;
  const x = (col - 4.5) * (TILE_SIZE + GAP);
  const z = (row - 4.5) * (TILE_SIZE + GAP);

  return (
    <group position={[x, 0.3, z]}>
      <mesh>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 0.08, 12]} />
        <meshStandardMaterial color="#4A4A4A" />
      </mesh>
    </group>
  );
}

function SnakeModel({ head, tail }: { head: number; tail: number }) {
  const headRow = Math.floor(head / GRID_SIZE);
  const headCol = head % GRID_SIZE;
  const tailRow = Math.floor(tail / GRID_SIZE);
  const tailCol = tail % GRID_SIZE;

  const hx = (headCol - 4.5) * (TILE_SIZE + GAP);
  const hz = (headRow - 4.5) * (TILE_SIZE + GAP);
  const tx = (tailCol - 4.5) * (TILE_SIZE + GAP);
  const tz = (tailRow - 4.5) * (TILE_SIZE + GAP);

  const midX = (hx + tx) / 2;
  const midZ = (hz + tz) / 2;
  const length = Math.sqrt((hx - tx) ** 2 + (hz - tz) ** 2);
  const angle = Math.atan2(hz - tz, hx - tx);

  return (
    <mesh position={[midX, 0.05, midZ]} rotation={[0, -angle, 0]}>
      <cylinderGeometry args={[0.06, 0.12, length, 6]} />
      <meshStandardMaterial color="#E74C3C" transparent opacity={0.6} />
    </mesh>
  );
}

function LadderModel({ bottom, top }: { bottom: number; top: number }) {
  const botRow = Math.floor(bottom / GRID_SIZE);
  const botCol = bottom % GRID_SIZE;
  const topRow = Math.floor(top / GRID_SIZE);
  const topCol = top % GRID_SIZE;

  const bx = (botCol - 4.5) * (TILE_SIZE + GAP);
  const bz = (botRow - 4.5) * (TILE_SIZE + GAP);
  const tx = (topCol - 4.5) * (TILE_SIZE + GAP);
  const tz = (topRow - 4.5) * (TILE_SIZE + GAP);

  const midX = (bx + tx) / 2;
  const midZ = (bz + tz) / 2;
  const length = Math.sqrt((bx - tx) ** 2 + (bz - tz) ** 2);
  const angle = Math.atan2(bz - tz, bx - tx);

  return (
    <mesh position={[midX, 0.05, midZ]} rotation={[0, -angle, 0]}>
      <boxGeometry args={[0.08, 0.08, length]} />
      <meshStandardMaterial color="#2ECC71" transparent opacity={0.7} />
    </mesh>
  );
}

function TurnIndicator({ currentTurn, playerColors }: { currentTurn: number; playerIds: string[]; playerColors: string[] }) {
  const color = playerColors[currentTurn] || '#FF9BB5';

  return (
    <Html position={[0, 3, 0]} center>
      <div className="bg-white px-4 py-2 rounded-cute shadow-soft border-2 border-primary text-center">
        <p className="text-sm font-bold" style={{ color }}>Giliran pemain #{currentTurn + 1}</p>
      </div>
    </Html>
  );
}

export default function GameBoard3D({ players, snakes, ladders, currentTurn }: GameBoard3DProps) {
  return (
    <div className="w-full h-[500px] md:h-[600px] bg-gradient-to-b from-blue-50 to-pink-50 rounded-cute overflow-hidden">
      <Canvas camera={{ position: [8, 8, 8], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.5}
          target={[0, 0, 0]}
        />

        {/* Board */}
        {Array.from({ length: 100 }, (_, i) => (
          <BoardTile key={i} index={i} color={TILE_COLORS[Math.floor(i / 10) % TILE_COLORS.length]} />
        ))}

        {/* Snakes */}
        {snakes.map(([head, tail], i) => (
          <SnakeModel key={`s-${i}`} head={head} tail={tail} />
        ))}

        {/* Ladders */}
        {ladders.map(([bottom, top], i) => (
          <LadderModel key={`l-${i}`} bottom={bottom} top={top} />
        ))}

        {/* Player pieces */}
        {players.map((p) => (
          <PlayerPiece key={p.id} position={p.position} color={p.color} />
        ))}

        {/* Turn indicator */}
        <TurnIndicator
          currentTurn={currentTurn}
          playerIds={players.map(p => p.id)}
          playerColors={players.map(p => p.color)}
        />
      </Canvas>
    </div>
  );
}

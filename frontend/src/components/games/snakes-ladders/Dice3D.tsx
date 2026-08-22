'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { motion } from 'framer-motion';

type FaceValue = 1 | 2 | 3 | 4 | 5 | 6;

// Normalized pip coordinates in [-0.32..0.32], laid out on each face plane.
const PIP_LAYOUTS: Record<FaceValue, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-0.32, -0.32],
    [0.32, 0.32],
  ],
  3: [
    [-0.32, -0.32],
    [0, 0],
    [0.32, 0.32],
  ],
  4: [
    [-0.32, -0.32],
    [0.32, -0.32],
    [-0.32, 0.32],
    [0.32, 0.32],
  ],
  5: [
    [-0.32, -0.32],
    [0.32, -0.32],
    [0, 0],
    [-0.32, 0.32],
    [0.32, 0.32],
  ],
  6: [
    [-0.32, -0.32],
    [0.32, -0.32],
    [-0.32, 0],
    [0.32, 0],
    [-0.32, 0.32],
    [0.32, 0.32],
  ],
};

// Face placement: plane offset 0.01 outside the cube surface (half of 1.4 = 0.7),
// rotated so the plane's +Z normal points outward. Opposite faces sum to 7:
// +Y=1 / -Y=6, +X=2 / -X=5, +Z=3 / -Z=4.
const FACES: {
  value: FaceValue;
  position: [number, number, number];
  rotation: [number, number, number];
}[] = [
  { value: 1, position: [0, 0.71, 0], rotation: [-Math.PI / 2, 0, 0] },
  { value: 6, position: [0, -0.71, 0], rotation: [Math.PI / 2, 0, 0] },
  { value: 2, position: [0.71, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { value: 5, position: [-0.71, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  { value: 3, position: [0, 0, 0.71], rotation: [0, 0, 0] },
  { value: 4, position: [0, 0, -0.71], rotation: [0, Math.PI, 0] },
];

// Rotation [rx, ry] that turns each face's normal toward the camera (+Z).
const TARGET_ROTATIONS: Record<FaceValue, [number, number]> = {
  1: [Math.PI / 2, 0],
  6: [-Math.PI / 2, 0],
  2: [0, -Math.PI / 2],
  5: [0, Math.PI / 2],
  3: [0, 0],
  4: [0, Math.PI],
};

const TWO_PI = Math.PI * 2;
const DAMP_LAMBDA = 8; // settles in ~0.4s

// Shortest-path target: nearest full-turn equivalent of the target angle.
function nearestTurn(current: number, target: number): number {
  return target + Math.round((current - target) / TWO_PI) * TWO_PI;
}

function DiceModel({ value, rolling }: { value: number; rolling: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    if (rolling) {
      group.rotation.x += delta * 6;
      group.rotation.y += delta * 8;
    } else {
      const [tx, ty] = TARGET_ROTATIONS[(value as FaceValue) in TARGET_ROTATIONS ? (value as FaceValue) : 3];
      const factor = 1 - Math.exp(-DAMP_LAMBDA * delta);
      group.rotation.x += (nearestTurn(group.rotation.x, tx) - group.rotation.x) * factor;
      group.rotation.y += (nearestTurn(group.rotation.y, ty) - group.rotation.y) * factor;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Cube body */}
      <mesh>
        <boxGeometry args={[1.4, 1.4, 1.4]} />
        <meshStandardMaterial
          color="#FFF8F0"
          roughness={0.35}
          emissive="#FFE4EC"
          emissiveIntensity={0.15}
        />
      </mesh>
      {/* Face planes + pips */}
      {FACES.map((face) => (
        <group key={face.value} position={face.position} rotation={face.rotation}>
          <mesh>
            <planeGeometry args={[1.4, 1.4]} />
            <meshStandardMaterial color="#FFF8F0" roughness={0.5} />
          </mesh>
          {PIP_LAYOUTS[face.value].map(([px, py], i) => (
            <mesh key={i} position={[px, py, 0.012]}>
              <sphereGeometry args={[0.075, 16, 16]} />
              <meshStandardMaterial color="#4A4A4A" roughness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

interface Dice3DProps {
  value: number | null;
  rolling: boolean;
  onRoll: () => void;
  disabled: boolean;
}

export default function Dice3D({ value, rolling, onRoll, disabled }: Dice3DProps): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-36 h-36">
        <Canvas camera={{ position: [0, 0, 4.6], fov: 45 }}>
          <ambientLight intensity={0.65} />
          <pointLight position={[4, 6, 5]} intensity={0.9} />
          <pointLight position={[-4, -3, 3]} intensity={0.35} />
          <group position={[0, 0.15, 0]}>
            <DiceModel value={value || 1} rolling={rolling} />
          </group>
          {/* Soft ground shadow */}
          <mesh position={[0, -1.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1.05, 32]} />
            <meshBasicMaterial color="#E8C7D3" transparent opacity={0.45} />
          </mesh>
        </Canvas>
      </div>
      <motion.button
        whileHover={!disabled ? { scale: 1.1 } : {}}
        whileTap={!disabled ? { scale: 0.9 } : {}}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        onClick={onRoll}
        disabled={disabled}
        className={`px-6 py-3 bg-primary text-white font-bold rounded-button shadow-soft
          transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-pink-400'}`}
      >
        {rolling ? '🎲 Melempar...' : '🎲 Lempar Dadu!'}
      </motion.button>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import { useDiceRoll, RollPhase, SPIN_MS, FaceValue } from './useDiceRoll';

type FaceValueLocal = 1 | 2 | 3 | 4 | 5 | 6;

// Normalized pip coordinates in [-0.32..0.32], laid out on each face plane.
const PIP_LAYOUTS: Record<FaceValueLocal, [number, number][]> = {
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
  value: FaceValueLocal;
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
const TARGET_ROTATIONS: Record<FaceValueLocal, [number, number]> = {
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

function DiceModel({
  value,
  phase,
  skip,
}: {
  value: number;
  phase: RollPhase;
  skip: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const startRef = useRef<number>(0);
  const [rx, setRx] = useState(0);
  const [ry, setRy] = useState(0);

  useEffect(() => {
    if (phase === 'spinning') {
      startRef.current = performance.now();
      const spin = () => {
        const t = (performance.now() - startRef.current) / SPIN_MS;
        if (t < 1) {
          setRx((r) => r + 0.18);
          setRy((r) => r + 0.24);
          requestAnimationFrame(spin);
        }
      };
      requestAnimationFrame(spin);
    } else if (phase === 'settling' || phase === 'landed') {
      const v: FaceValue =
        value in TARGET_ROTATIONS ? (value as FaceValue) : 3;
      const [tx, ty] = TARGET_ROTATIONS[v];
      setRx(nearestTurn(rx, tx));
      setRy(nearestTurn(ry, ty));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, value]);

  // Skip: jump directly to target
  useEffect(() => {
    if (skip && (value as FaceValue) in TARGET_ROTATIONS) {
      const [tx, ty] = TARGET_ROTATIONS[value as FaceValue];
      setRx(tx);
      setRy(ty);
    }
  }, [skip, value]);

  // Lightweight useFrame for ambient wobble while spinning (preserves prior feel).
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    if (phase === 'spinning') {
      group.rotation.x += delta * 6;
      group.rotation.y += delta * 8;
    }
  });

  return (
    <group ref={groupRef} rotation={[rx, ry, 0]}>
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

export default function Dice3D({
  value,
  rolling,
  onRoll,
  disabled,
}: Dice3DProps): JSX.Element {
  const { phase, target, skip } = useDiceRoll(value, rolling);
  const [skipAnim, setSkipAnim] = useState(false);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-36 h-36">
        <Canvas camera={{ position: [0, 0, 4.6], fov: 45 }}>
          <ambientLight intensity={0.65} />
          <pointLight position={[4, 6, 5]} intensity={0.9} />
          <pointLight position={[-4, -3, 3]} intensity={0.35} />
          <group position={[0, 0.15, 0]}>
            <DiceModel value={value || target} phase={phase} skip={skipAnim} />
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
        onClick={() => {
          if (phase === 'spinning' || phase === 'settling') {
            skip();
            setSkipAnim(true);
          } else if (!disabled) {
            onRoll();
          }
        }}
        disabled={disabled}
        className={`px-6 py-3 bg-primary text-white font-bold rounded-button shadow-soft
          transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-pink-400'}`}
      >
        {phase === 'spinning'
          ? '⏩ Lewati (tap)'
          : phase === 'settling'
            ? '⏩ Mendarat...'
            : '🎲 Lempar Dadu!'}
      </motion.button>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import { useDiceRoll, RollPhase, SPIN_MS, FaceValue } from './useDiceRoll';
import { easeOutCubic } from './boardUtils';

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
  // `rx`/`ry` are the React-mirrored rotation, used only for terminal settle / skip
  // (one-shot state writes). During `spinning` we mutate `groupRef.current.rotation`
  // directly each frame via `useFrame` to avoid 60 Hz setState churn.
  const [rx, setRx] = useState(0);
  const [ry, setRy] = useState(0);
  const rxRef = useRef(0);
  const ryRef = useRef(0);
  const spinStartRef = useRef<number>(0);

  // R3F render loop. `dt` is seconds since last frame. Decelerate from 6.5 rad/s
  // to 0.5 rad/s using easeOutCubic on the linear progress. Mutating
  // `groupRef.current.rotation` directly bypasses the React render cycle.
  useFrame((_, dt) => {
    if (phase !== 'spinning') return;
    const g = groupRef.current;
    if (!g) return;
    const t = Math.min(1, (performance.now() - spinStartRef.current) / SPIN_MS);
    const easedAngVel = 6 * (1 - easeOutCubic(t)) + 0.5;
    g.rotation.x += easedAngVel * dt;
    g.rotation.y += easedAngVel * dt * 1.05;
  });

  useEffect(() => {
    if (phase === 'spinning') {
      spinStartRef.current = performance.now();
      return;
    }
    if (phase === 'settling' || phase === 'landed') {
      const g = groupRef.current;
      const v: FaceValue = value in TARGET_ROTATIONS ? (value as FaceValue) : 3;
      const [tx, ty] = TARGET_ROTATIONS[v];
      // One-shot: pick shortest-path turn from current rotation, mirror to state.
      const curX = g ? g.rotation.x : rxRef.current;
      const curY = g ? g.rotation.y : ryRef.current;
      const nextRx = nearestTurn(curX, tx);
      const nextRy = nearestTurn(curY, ty);
      if (g) {
        g.rotation.x = nextRx;
        g.rotation.y = nextRy;
      }
      rxRef.current = nextRx;
      ryRef.current = nextRy;
      setRx(nextRx);
      setRy(nextRy);
    }
  }, [phase, value]);

  // Skip: jump directly to target via shortest-path turn (one-shot state write).
  useEffect(() => {
    if (skip && (value as FaceValue) in TARGET_ROTATIONS) {
      const [tx, ty] = TARGET_ROTATIONS[value as FaceValue];
      const g = groupRef.current;
      const curX = g ? g.rotation.x : rxRef.current;
      const curY = g ? g.rotation.y : ryRef.current;
      const nextRx = nearestTurn(curX, tx);
      const nextRy = nearestTurn(curY, ty);
      if (g) {
        g.rotation.x = nextRx;
        g.rotation.y = nextRy;
      }
      rxRef.current = nextRx;
      ryRef.current = nextRy;
      setRx(nextRx);
      setRy(nextRy);
    }
  }, [skip, value]);

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

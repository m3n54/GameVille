'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { motion } from 'framer-motion';

function DiceModel({ value, rolling }: { value: number; rolling: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (rolling && groupRef.current) {
      groupRef.current.rotation.x += delta * 5;
      groupRef.current.rotation.y += delta * 7;
      groupRef.current.rotation.z += delta * 3;
    }
  });

  // Map value to cube face rotation
  const rotations: Record<number, [number, number, number]> = {
    1: [0, 0, 0],
    2: [0, Math.PI / 2, 0],
    3: [-Math.PI / 2, 0, 0],
    4: [Math.PI / 2, 0, 0],
    5: [0, -Math.PI / 2, 0],
    6: [Math.PI, 0, 0],
  };

  const targetRotation = rolling ? [0, 0, 0] : rotations[value] || [0, 0, 0];

  return (
    <group ref={groupRef} rotation={targetRotation as [number, number, number]}>
      {/* Cube body */}
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#FF9BB5" transparent opacity={0.3} />
      </mesh>
      {/* Cube edges */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
        <lineBasicMaterial color="#FF9BB5" />
      </lineSegments>
    </group>
  );
}

interface Dice3DProps {
  value: number | null;
  rolling: boolean;
  onRoll: () => void;
  disabled: boolean;
}

export default function Dice3D({ value, rolling, onRoll, disabled }: Dice3DProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-24 h-24">
        <Canvas camera={{ position: [0, 0, 3], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[5, 5, 5]} />
          <DiceModel value={value || 1} rolling={rolling} />
        </Canvas>
      </div>
      <motion.button
        whileHover={!disabled ? { scale: 1.1 } : {}}
        whileTap={!disabled ? { scale: 0.9 } : {}}
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

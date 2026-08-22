'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { tileToWorld } from './boardUtils';

interface SnakeModelProps {
  headTile: number; // tile index 0-99 where the snake head sits
  tailTile: number; // tile index 0-99 where the tail ends
}

const BODY_Y = 0.08;
const SEGMENT_COUNT = 14;
const HEAD_COLOR = new THREE.Color('#7BC96F');
const TAIL_COLOR = new THREE.Color('#4E9F3D');

interface BodySegment {
  position: [number, number, number];
  radius: number;
  color: string;
}

/** Smooth S-curved snake lying flat on the board plane. */
export default function SnakeModel({ headTile, tailTile }: SnakeModelProps): JSX.Element {
  const { segments, headPosition, heading } = useMemo(() => {
    const [hx, hz] = tileToWorld(headTile);
    const [tx, tz] = tileToWorld(tailTile);

    const head = new THREE.Vector3(hx, BODY_Y, hz);
    const tail = new THREE.Vector3(tx, BODY_Y, tz);

    // Perpendicular offset at the midpoint -> gentle S-bend. Alternate sign
    // based on orientation so adjacent snakes don't all bow the same way.
    const dir = new THREE.Vector3().subVectors(tail, head);
    const length = dir.length();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const sign = Math.floor(headTile) % 2 === 0 ? 1 : -1;
    const bend = Math.min(1.5, Math.max(0.8, length * 0.22)) * sign;

    const mid = new THREE.Vector3().addVectors(head, tail).multiplyScalar(0.5).add(perp.multiplyScalar(bend));

    // Two extra quarter-points give the Catmull-Rom curve a softer S shape.
    const quarter = new THREE.Vector3().lerpVectors(head, mid, 0.5);
    quarter.add(perp.clone().multiplyScalar(-bend * 0.35));
    const threeQuarter = new THREE.Vector3().lerpVectors(mid, tail, 0.5);
    threeQuarter.add(perp.clone().multiplyScalar(-bend * 0.35));

    const curve = new THREE.CatmullRomCurve3([head, quarter, mid, threeQuarter, tail]);
    const points = curve.getPoints(SEGMENT_COUNT - 1);

    const segs: BodySegment[] = points.map((p, i) => {
      const t = i / (SEGMENT_COUNT - 1);
      const radius = 0.14 + (0.05 - 0.14) * t; // taper 0.14 -> 0.05
      const color = HEAD_COLOR.clone().lerp(TAIL_COLOR, t);
      return { position: [p.x, p.y, p.z] as [number, number, number], radius, color: `#${color.getHexString()}` };
    });

    // Heading from second-to-first path point so the head faces along the body.
    const second = points[1];
    const headingAngle = Math.atan2(second.z - points[0].z, second.x - points[0].x);

    return { segments: segs, headPosition: head, heading: headingAngle };
  }, [headTile, tailTile]);

  const eyeOffsets: Array<{ pos: [number, number, number]; pupil: [number, number, number] }> = [
    { pos: [0.09, 0.14, 0.1], pupil: [0.09, 0.14, 0.135] },
    { pos: [-0.09, 0.14, 0.1], pupil: [-0.09, 0.14, 0.14] },
  ];

  return (
    <group>
      {segments.map((seg, i) => (
        <mesh key={i} position={seg.position}>
          <sphereGeometry args={[seg.radius, 12, 12]} />
          <meshStandardMaterial color={seg.color} roughness={0.5} />
        </mesh>
      ))}

      {/* Head group: positioned at head tile, rotated so +Z faces away from tail */}
      <group position={[headPosition.x, 0.18, headPosition.z]} rotation={[0, heading + Math.PI, 0]}>
        <mesh>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#7BC96F" roughness={0.5} />
        </mesh>

        {/* Eyes on top-front of head */}
        {eyeOffsets.map((eye, i) => (
          <group key={i}>
            <mesh position={eye.pos}>
              <sphereGeometry args={[0.04, 8, 8]} />
              <meshStandardMaterial color="#FFFFFF" roughness={0.3} />
            </mesh>
            <mesh position={eye.pupil}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <meshStandardMaterial color="#1A1A1A" roughness={0.3} />
            </mesh>
          </group>
        ))}

        {/* Forked red tongue pointing forward (+Z after rotation) */}
        <mesh position={[0, -0.06, 0.24]} rotation={[0, 0.35, 0]}>
          <boxGeometry args={[0.02, 0.02, 0.14]} />
          <meshStandardMaterial color="#E23B3B" roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.06, 0.24]} rotation={[0, -0.35, 0]}>
          <boxGeometry args={[0.02, 0.02, 0.14]} />
          <meshStandardMaterial color="#E23B3B" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

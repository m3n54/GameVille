'use client';

import { Socket } from 'socket.io-client';
import type { SeaBattleState, ServerToClientEvents, ClientToServerEvents } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: SeaBattleState | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function SeaBattleContainer({ socket, state }: Props) {
  return <div className="text-center p-8 text-cute-muted">⚓ Sea Battle — Segera hadir!</div>;
}

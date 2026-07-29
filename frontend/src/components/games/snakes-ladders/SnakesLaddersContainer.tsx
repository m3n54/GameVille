'use client';

import { Socket } from 'socket.io-client';
import type { SnakesLaddersState, ServerToClientEvents, ClientToServerEvents } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: SnakesLaddersState | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function SnakesLaddersContainer({ socket, state }: Props) {
  return <div className="text-center p-8 text-cute-muted">🐍 Ular Tangga — Segera hadir!</div>;
}

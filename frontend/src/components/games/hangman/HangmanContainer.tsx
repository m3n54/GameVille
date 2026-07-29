'use client';

import { Socket } from 'socket.io-client';
import type { HangmanState, ServerToClientEvents, ClientToServerEvents } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  state: HangmanState | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function HangmanContainer({ socket, state }: Props) {
  return <div className="text-center p-8 text-cute-muted">💀 Hangman — Segera hadir!</div>;
}

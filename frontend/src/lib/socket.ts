'use client';

import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types';

// Deploy F2: on Vercel this env var MUST be set (see docs/DEPLOYMENT.md).
// Without it a production build silently dials localhost:3001 — dead sockets.
if (!process.env.NEXT_PUBLIC_SERVER_URL && process.env.NODE_ENV === 'production') {
  console.warn('[GameVille] NEXT_PUBLIC_SERVER_URL tidak diset — fallback ke http://localhost:3001');
}
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}

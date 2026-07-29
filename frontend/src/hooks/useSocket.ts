'use client';

import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types';
import { connectSocket, disconnectSocket } from '@/lib/socket';

export function useSocket() {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = connectSocket();

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    setSocket(s);

    return () => {
      disconnectSocket();
    };
  }, []);

  return { socket, connected };
}

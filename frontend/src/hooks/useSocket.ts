'use client';

import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types';
import { connectSocket } from '@/lib/socket';

export function useSocket() {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = connectSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    if (s.connected) setConnected(true);

    setSocket(s);

    // Socket is an app-lifetime singleton — do NOT disconnect on unmount,
    // otherwise navigating pages drops the player from their room.
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket, connected };
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types';
import { connectSocket } from '@/lib/socket';

// FE-F2: expose `reconnecting` so the room page can show a banner and re-sync
// once the connection returns. The server treats a reconnect as a brand-new
// connection (new socket.id), so consumers must re-run room:sync on recovery.
export function useSocket() {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [connected, setConnected] = useState(false);
  // everConnected turns true after the first successful handshake and stays
  // true — a later disconnect therefore means "lost an existing session".
  const everConnected = useRef(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const s = connectSocket();

    const onConnect = () => {
      everConnected.current = true;
      setConnected(true);
      setReconnecting(false);
    };
    const onDisconnect = () => {
      setConnected(false);
      setReconnecting(everConnected.current);
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    if (s.connected) {
      everConnected.current = true;
      setConnected(true);
    }

    setSocket(s);

    // Socket is an app-lifetime singleton — do NOT disconnect on unmount,
    // otherwise navigating pages drops the player from their room.
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket, connected, reconnecting };
}

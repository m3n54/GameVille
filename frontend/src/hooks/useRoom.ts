'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Socket } from 'socket.io-client';
import type { Room, Player, GameType, ServerToClientEvents, ClientToServerEvents } from '@/types';

const IDENTITY_KEY = 'gameville_identity';

export interface PlayerIdentity {
  nickname: string;
  color: string;
  emoji: string;
}

export function saveIdentity(identity: PlayerIdentity) {
  try { sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch {}
}

export function loadIdentity(): PlayerIdentity | null {
  try {
    const raw = sessionStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as PlayerIdentity) : null;
  } catch { return null; }
}

interface UseRoomReturn {
  room: Room | null;
  players: Player[];
  createRoom: (name: string, nickname: string, color: string, emoji: string) => void;
  joinRoom: (pin: string, nickname: string, color: string, emoji: string) => void;
  syncRoom: (pin: string) => void;
  leaveRoom: () => void;
  toggleReady: () => void;
  selectGame: (gameType: GameType) => void;
  startGame: () => void;
}

export function useRoom(socket: Socket<ServerToClientEvents, ClientToServerEvents> | null): UseRoomReturn {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const players = room?.players ?? [];

  // Keep server room state in sync (player list, ready, game selection)
  useEffect(() => {
    if (!socket) return;
    const handler = (updated: Room) => setRoom(updated);
    socket.on('room:state', handler);
    socket.on('player:update', (updatedPlayers: Player[]) => {
      setRoom(prev => (prev ? { ...prev, players: updatedPlayers } : prev));
    });
    return () => {
      socket.off('room:state', handler);
      socket.off('player:update');
    };
  }, [socket]);

  const createRoom = useCallback((name: string, nickname: string, color: string, emoji: string) => {
    if (!socket) return;
    saveIdentity({ nickname, color, emoji });
    socket.emit('room:create', { name, nickname, color, emoji });
    socket.once('room:created', (r: Room) => {
      setRoom(r);
      router.push(`/room/${r.pin}`);
    });
  }, [socket, router]);

  const joinRoom = useCallback((pin: string, nickname: string, color: string, emoji: string) => {
    if (!socket) return;
    saveIdentity({ nickname, color, emoji });
    socket.emit('room:join', { pin, nickname, color, emoji });
    socket.once('room:joined', (r: Room) => {
      setRoom(r);
      router.push(`/room/${r.pin}`);
    });
    socket.once('room:error', (err) => {
      alert(err.message);
    });
  }, [socket, router]);

  // After navigation: same socket (still a member server-side) asks for room state by PIN
  const syncRoom = useCallback((pin: string) => {
    if (!socket) return;
    socket.emit('room:sync', { pin }, (response) => {
      if (response.ok && response.room) {
        setRoom(response.room);
      } else {
        router.push('/');
      }
    });
  }, [socket, router]);

  const leaveRoom = useCallback(() => {
    socket?.emit('room:leave');
    setRoom(null);
    router.push('/');
  }, [socket, router]);

  const toggleReady = useCallback(() => {
    if (!room) return;
    const me = players.find(p => p.id === socket?.id);
    socket?.emit('player:ready', { ready: !me?.isReady });
  }, [socket, room, players]);

  const selectGame = useCallback((gameType: GameType) => {
    socket?.emit('game:select', { gameType });
  }, [socket]);

  const startGame = useCallback(() => {
    socket?.emit('game:start');
  }, [socket]);

  return { room, players, createRoom, joinRoom, syncRoom, leaveRoom, toggleReady, selectGame, startGame };
}

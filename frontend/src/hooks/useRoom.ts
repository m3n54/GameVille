'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Socket } from 'socket.io-client';
import type { Room, Player, GameType, ServerToClientEvents, ClientToServerEvents } from '@/types';

interface UseRoomReturn {
  room: Room | null;
  players: Player[];
  createRoom: (name: string, nickname: string, color: string, emoji: string) => void;
  joinRoom: (pin: string, nickname: string, color: string, emoji: string) => void;
  leaveRoom: () => void;
  toggleReady: () => void;
  selectGame: (gameType: GameType) => void;
  startGame: () => void;
}

export function useRoom(socket: Socket<ServerToClientEvents, ClientToServerEvents> | null): UseRoomReturn {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const players = room?.players ?? [];

  const createRoom = useCallback((name: string, nickname: string, color: string, emoji: string) => {
    if (!socket) return;
    socket.emit('room:create', { name, nickname, color, emoji });
    socket.once('room:created', (r: Room) => {
      setRoom(r);
      router.push(`/room/${r.pin}`);
    });
  }, [socket, router]);

  const joinRoom = useCallback((pin: string, nickname: string, color: string, emoji: string) => {
    if (!socket) return;
    socket.emit('room:join', { pin, nickname, color, emoji });
    socket.once('room:joined', (r: Room) => {
      setRoom(r);
      router.push(`/room/${r.pin}`);
    });
    socket.once('room:error', (err) => {
      alert(err.message);
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

  return { room, players, createRoom, joinRoom, leaveRoom, toggleReady, selectGame, startGame };
}

'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Socket } from 'socket.io-client';
import type { Room, Player, GameType, ServerToClientEvents, ClientToServerEvents, RoomAck, SyncAck } from '@/types';

// Identity persistence intentionally absent — CLAUDE.md: client-side sessionStorage
// room/identity persistence produced frozen phantom rooms and was removed.
const IDENTITY_KEY = 'gameville_identity';

function saveIdentity(identity: { nickname: string; color: string; emoji: string }) {
  try { sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch {}
}

function loadIdentity(): { nickname: string; color: string; emoji: string } | null {
  try {
    const raw = sessionStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as { nickname: string; color: string; emoji: string }) : null;
  } catch {
    return null;
  }
}

// SyncResponse is an alias retained for backwards-compat — SyncAck is the
// canonical shape. Use SyncAck directly in new code.
export type SyncResponse = SyncAck;

interface UseRoomReturn {
  room: Room | null;
  players: Player[];
  /** Stable self id — matched by saved nickname against room.players. Survives websocket reconnects (socket.id does not). */
  myId: string | null;
  error: string | null;
  clearError: () => void;
  /** True between emit and ack — gates the submit buttons against double-clicks. */
  submitting: boolean;
  createRoom: (name: string, nickname: string, color: string, emoji: string) => void;
  joinRoom: (pin: string, nickname: string, color: string, emoji: string) => void;
  syncRoom: (pin: string, onGameState?: (state: unknown, turnPlayerId?: string) => void) => void;
  leaveRoom: () => void;
  toggleReady: () => void;
  selectGame: (gameType: GameType) => void;
  startGame: () => void;
}

export function useRoom(socket: Socket<ServerToClientEvents, ClientToServerEvents> | null): UseRoomReturn {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Anti-double-click: true between emit and ack. The old UI let a second click
  // fire room:create/join again while the first was in flight.
  const [submitting, setSubmitting] = useState(false);
  // Memoize so toggleReady's useCallback deps are stable; otherwise the
  // expression `room?.players ?? []` returns a new array each render and the
  // exhaustive-deps lint flags it.
  const players = useMemo(() => room?.players ?? [], [room?.players]);
  // FE-F2: socket.id changes on every reconnect; the player's real id does not.
  // Track it by matching our saved identity (nickname) against the roster.
  const myPlayerIdRef = useRef<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  const recomputeMyId = useCallback((updatedPlayers: Player[]) => {
    if (!socket) return;
    const identity = loadIdentity();
    const me = identity
      ? updatedPlayers.find(p => p.nickname === identity.nickname)
      : undefined;
    const resolved = me?.id ?? socket.id ?? null;
    myPlayerIdRef.current = resolved;
    setMyId(resolved);
  }, [socket]);

  // Keep server room state in sync (player list, ready, game selection)
  useEffect(() => {
    if (!socket) return;
    const handler = (updated: Room) => {
      setRoom(updated);
      recomputeMyId(updated.players);
    };
    socket.on('room:state', handler);
    socket.on('player:update', (updatedPlayers: Player[]) => {
      setRoom(prev => (prev ? { ...prev, players: updatedPlayers } : prev));
      recomputeMyId(updatedPlayers);
    });
    return () => {
      socket.off('room:state', handler);
      socket.off('player:update');
    };
  }, [socket, recomputeMyId]);

  // FE-F7: the old global alert() popped a native dialog on EVERY room:error,
  // double-reporting alongside in-game banners and blocking the thread.
  // Errors now land in `error` state for the UI to render inline.
  useEffect(() => {
    if (!socket) return;
    const onRoomError = (err: { message: string }) => {
      setError(err.message);
    };
    socket.on('room:error', onRoomError);
    return () => {
      socket.off('room:error', onRoomError);
    };
  }, [socket]);

  // FE-F1: response handling via ack callback instead of socket.once() — the
  // once-handlers lived forever on the app-lifetime singleton and ALL fired
  // together after failed attempts, double-pushing navigation / double rooms.
  const createRoom = useCallback((name: string, nickname: string, color: string, emoji: string) => {
    if (!socket) return;
    saveIdentity({ nickname, color, emoji });
    setError(null);
    setSubmitting(true);
    socket.emit('room:create', { name, nickname, color, emoji }, (res: RoomAck) => {
      setSubmitting(false);
      if (res.ok && res.room) {
        recomputeMyId(res.room.players);
        setRoom(res.room);
        router.push(`/room/${res.room.pin}`);
      } else {
        setError(res.error ?? 'Gagal membuat ruang');
      }
    });
  }, [socket, router, recomputeMyId]);

  const joinRoom = useCallback((pin: string, nickname: string, color: string, emoji: string) => {
    if (!socket) return;
    saveIdentity({ nickname, color, emoji });
    setError(null);
    setSubmitting(true);
    socket.emit('room:join', { pin, nickname, color, emoji }, (res: RoomAck) => {
      setSubmitting(false);
      if (res.ok && res.room) {
        recomputeMyId(res.room.players);
        setRoom(res.room);
        router.push(`/room/${res.room.pin}`);
      } else {
        setError(res.error ?? 'Gagal masuk ruang');
      }
    });
  }, [socket, router, recomputeMyId]);

  // After navigation or reconnect: same membership asks for room state by PIN.
  // onGameState receives the replayed snapshot + whose turn it is mid-game.
  const syncRoom = useCallback((pin: string, onGameState?: (state: unknown, turnPlayerId?: string) => void) => {
    if (!socket) return;
    socket.emit('room:sync', { pin }, (response: SyncAck) => {
      if (response.ok && response.room) {
        setRoom(response.room);
        recomputeMyId(response.room.players);
        if (onGameState && response.gameState != null) {
          onGameState(response.gameState, response.turnPlayerId);
        }
      } else {
        router.push('/');
      }
    });
  }, [socket, router, recomputeMyId]);

  const leaveRoom = useCallback(() => {
    socket?.emit('room:leave');
    setRoom(null);
    router.push('/');
  }, [socket, router]);

  const toggleReady = useCallback(() => {
    if (!room) return;
    const me = players.find(p => p.id === myPlayerIdRef.current);
    socket?.emit('player:ready', { ready: !me?.isReady });
  }, [socket, room, players]);

  const selectGame = useCallback((gameType: GameType) => {
    socket?.emit('game:select', { gameType });
  }, [socket]);

  const startGame = useCallback(() => {
    socket?.emit('game:start');
  }, [socket]);

  return { room, players, myId, error, submitting, clearError: () => setError(null), createRoom, joinRoom, syncRoom, leaveRoom, toggleReady, selectGame, startGame };
}

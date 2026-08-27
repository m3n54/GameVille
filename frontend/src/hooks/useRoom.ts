'use client';

import { useCallback, useRef, useSyncExternalStore, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Socket } from 'socket.io-client';
import type { Room, Player, GameType, ServerToClientEvents, ClientToServerEvents, RoomAck, SyncAck } from '@/types';
import {
  getRoomStoreState,
  setRoomStoreState,
  subscribeRoomStore,
} from '@/lib/roomStore';

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

  // Subscribe to the module-scoped roomStore so the same `room` survives
  // landing → /room/[pin] route transitions. Without this, useState inside
  // useRoom was reset on each fresh mount, dropping the createRoom ack's
  // state and making /room/[pin] think the user wasn't a member.
  const store = useSyncExternalStore(subscribeRoomStore, getRoomStoreState, getRoomStoreState);
  const { room, myId, error, submitting } = store;
  const players = room?.players ?? [];

  const myPlayerIdRef = useRef<string | null>(myId);

  const recomputeMyId = useCallback((updatedPlayers: Player[]) => {
    if (!socket) return;
    const identity = loadIdentity();
    const me = identity
      ? updatedPlayers.find(p => p.nickname === identity.nickname)
      : undefined;
    const resolved = me?.id ?? socket.id ?? null;
    myPlayerIdRef.current = resolved;
    setRoomStoreState({ myId: resolved });
  }, [socket]);

  // Keep server room state in sync (player list, ready, game selection)
  // FE-H4: F8 fix — always off() by named handler reference. The old code
  // called `socket.off('player:update')` with no handler, which removes EVERY
  // listener for that event on the app-lifetime socket singleton — including
  // any that the active game container (SnakesLadders, Hangman, etc.) had
  // registered. Hoist to a named const so cleanup targets only this hook's
  // listener.
  useEffect(() => {
    if (!socket) return;
    const onRoomState = (updated: Room) => {
      setRoomStoreState({ room: updated });
      recomputeMyId(updated.players);
    };
    const onPlayerUpdate = (updatedPlayers: Player[]) => {
      setRoomStoreState((s) => (s.room ? { ...s, room: { ...s.room, players: updatedPlayers } } : s));
      recomputeMyId(updatedPlayers);
    };
    socket.on('room:state', onRoomState);
    socket.on('player:update', onPlayerUpdate);
    return () => {
      socket.off('room:state', onRoomState);
      socket.off('player:update', onPlayerUpdate);
    };
  }, [socket, recomputeMyId]);

  // FE-F7: the old global alert() popped a native dialog on EVERY room:error,
  // double-reporting alongside in-game banners and blocking the thread.
  // Errors now land in `error` state for the UI to render inline.
  useEffect(() => {
    if (!socket) return;
    const onRoomError = (err: { message: string }) => {
      setRoomStoreState({ error: err.message });
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
    setRoomStoreState({ error: null, submitting: true });
    socket.emit('room:create', { name, nickname, color, emoji }, (res: RoomAck) => {
      setRoomStoreState({ submitting: false });
      if (res.ok && res.room) {
        recomputeMyId(res.room.players);
        setRoomStoreState({ room: res.room });
        router.push(`/room/${res.room.pin}`);
      } else {
        setRoomStoreState({ error: res.error ?? 'Gagal membuat ruang' });
      }
    });
  }, [socket, router, recomputeMyId]);

  const joinRoom = useCallback((pin: string, nickname: string, color: string, emoji: string) => {
    if (!socket) return;
    saveIdentity({ nickname, color, emoji });
    setRoomStoreState({ error: null, submitting: true });
    socket.emit('room:join', { pin, nickname, color, emoji }, (res: RoomAck) => {
      setRoomStoreState({ submitting: false });
      if (res.ok && res.room) {
        recomputeMyId(res.room.players);
        setRoomStoreState({ room: res.room });
        router.push(`/room/${res.room.pin}`);
      } else {
        setRoomStoreState({ error: res.error ?? 'Gagal masuk ruang' });
      }
    });
  }, [socket, router, recomputeMyId]);

  // After navigation or reconnect: same membership asks for room state by PIN.
  // onGameState receives the replayed snapshot + whose turn it is mid-game.
  // On failure (not a member), we do NOT redirect — /room/[pin] shows its own
  // join form so the user can join from the URL they pasted. The old
  // router.push('/') silently sent them back to landing and they clicked
  // "Buat Ruang Baru" by mistake, creating a fresh room.
  const syncRoom = useCallback((pin: string, onGameState?: (state: unknown, turnPlayerId?: string) => void) => {
    if (!socket) return;
    socket.emit('room:sync', { pin }, (response: SyncAck) => {
      if (response.ok && response.room) {
        setRoomStoreState({ room: response.room });
        recomputeMyId(response.room.players);
        if (onGameState && response.gameState != null) {
          onGameState(response.gameState, response.turnPlayerId);
        }
      }
    });
  }, [socket, recomputeMyId]);

  const leaveRoom = useCallback(() => {
    socket?.emit('room:leave');
    // Clear the cached membership but stay on /room/[pin] — the page's F9 grace
    // timer will detect !room && !myId and show the JoinRoom form pre-filled
    // with the URL's PIN, so the user can re-join without re-typing it. The
    // old `router.push('/')` silently sent them back to landing where they'd
    // often click "Buat Ruang Baru" by mistake and create a fresh, separate
    // room — see commit 128dbd0 for the original F9 fix.
    setRoomStoreState({ room: null, myId: null, error: null });
  }, [socket]);

  const toggleReady = useCallback(() => {
    if (!room) return;
    const me = (room.players).find(p => p.id === myPlayerIdRef.current);
    socket?.emit('player:ready', { ready: !me?.isReady });
  }, [socket, room]);

  const selectGame = useCallback((gameType: GameType) => {
    socket?.emit('game:select', { gameType });
  }, [socket]);

  const startGame = useCallback(() => {
    socket?.emit('game:start');
  }, [socket]);

  return {
    room,
    players,
    myId,
    error,
    submitting,
    clearError: () => setRoomStoreState({ error: null }),
    createRoom,
    joinRoom,
    syncRoom,
    leaveRoom,
    toggleReady,
    selectGame,
    startGame,
  };
}

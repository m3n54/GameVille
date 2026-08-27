'use client';

import type { Room, Player } from '@/types';

interface RoomStoreState {
  room: Room | null;
  players: Player[];
  myId: string | null;
  error: string | null;
  submitting: boolean;
}

// Module-scoped singleton — survives the landing → /room/[pin] route transition
// where useState inside useRoom was getting reset on every fresh mount, causing
// `createRoom`'s ack to set state in the landing hook instance, then unmount +
// remount dropping that state, and `/room/[pin]` thinking the user wasn't a member
// and showing the JoinRoom form pre-filled with the PIN. Filling it in produced
// a second `room:join` against the same PIN with the same nickname → 2 "menza
// (Kamu)" entries in the player list.
let state: RoomStoreState = {
  room: null,
  players: [],
  myId: null,
  error: null,
  submitting: false,
};

const listeners = new Set<() => void>();

export function getRoomStoreState(): RoomStoreState {
  return state;
}

export function setRoomStoreState(
  patch: Partial<RoomStoreState> | ((s: RoomStoreState) => Partial<RoomStoreState>),
): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function subscribeRoomStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

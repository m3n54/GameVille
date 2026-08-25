'use client';

import { useEffect, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

// FE-F6: turn tracking was copy-pasted across Hangman/Minesweeper (and parsed
// differently in the other two). One hook now owns it.
//
// FE-F3: `currentPlayerId` starts as null meaning "unknown" and isMyTurn is a
// STRICT equality check. The old optimistic default
// (`currentPlayerId == null || currentPlayerId === myId`) made every player see
// "Giliranmu!" before the first event arrived.
export function useGameTurn(
  socket: Socket | null,
  myId: string | null,
  initialTurnPlayerId?: string | null,
) {
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(initialTurnPlayerId ?? null);

  // Feed turn info from game:action events ({type:'turn', nextPlayerId}) and
  // gameStart payloads ({firstTurn} / {firstTurnId}).
  useEffect(() => {
    if (!socket) return;

    const handleAction = (data: unknown) => {
      const action = data as { type?: string; nextPlayerId?: string; firstTurn?: string; firstTurnId?: string };
      if (action.type === 'turn') {
        setCurrentPlayerId(action.nextPlayerId ?? null);
      } else if (action.type === 'gameStart') {
        setCurrentPlayerId(action.firstTurn ?? action.firstTurnId ?? null);
      }
    };

    socket.on('game:action', handleAction);
    return () => {
      socket.off('game:action', handleAction);
    };
  }, [socket]);

  const reset = useCallback((playerId: string | null) => setCurrentPlayerId(playerId), []);

  const isMyTurn = currentPlayerId != null && currentPlayerId === myId;

  return { currentPlayerId, setCurrentPlayerId: reset, isMyTurn };
}

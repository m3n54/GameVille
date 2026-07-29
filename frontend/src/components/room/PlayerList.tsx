'use client';

import type { Player } from '@/types';
import PlayerCard from './PlayerCard';

interface PlayerListProps {
  players: Player[];
  myId: string | undefined;
}

export default function PlayerList({ players, myId }: PlayerListProps) {
  return (
    <div className="space-y-2">
      <h3 className="font-bold text-cute-text text-lg">
        Pemain ({players.length}/4)
      </h3>
      {players.map((p) => (
        <PlayerCard key={p.id} player={p} isMe={p.id === myId} />
      ))}
    </div>
  );
}

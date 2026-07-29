'use client';

import { motion } from 'framer-motion';
import type { Player } from '@/types';

interface PlayerCardProps {
  player: Player;
  isMe: boolean;
}

export default function PlayerCard({ player, isMe }: PlayerCardProps) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 12 }}
      className={`flex items-center gap-3 p-3 rounded-cute border-2 transition-all ${
        isMe ? 'border-primary bg-pink-50' : 'border-gray-100 bg-white'
      }`}
    >
      <span className="text-3xl">{player.emoji}</span>
      <div className="flex-1">
        <p className="font-bold text-cute-text">
          {player.nickname}
          {isMe && ' (Kamu)'}
          {player.isHost && ' 👑'}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: player.color }}
          />
          <span className={`text-xs font-semibold ${player.isReady ? 'text-green-500' : 'text-cute-muted'}`}>
            {player.isReady ? 'Siap!' : 'Belum siap'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

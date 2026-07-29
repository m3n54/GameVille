'use client';

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

interface EmojiReactionsProps {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
}

const QUICK_EMOJIS = ['😄', '🎉', '🔥', '😂', '😱', '🙌', '💪', '🥳'];

interface FloatingEmoji {
  id: string;
  emoji: string;
  timestamp: number;
}

export default function EmojiReactions({ socket }: EmojiReactionsProps) {
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);

  useEffect(() => {
    if (!socket) return;
    const handler = (data: { nickname: string; emoji: string }) => {
      const id = `${Date.now()}-${Math.random()}`;
      setFloating((prev) => [...prev, { id, emoji: data.emoji, timestamp: Date.now() }]);
      setTimeout(() => setFloating((prev) => prev.filter((e) => e.id !== id)), 3000);
    };
    socket.on('reaction:received', handler);
    return () => { socket.off('reaction:received', handler); };
  }, [socket]);

  const sendReaction = useCallback((emoji: string) => {
    socket?.emit('reaction:send', { emoji });
    const id = `me-${Date.now()}`;
    setFloating((prev) => [...prev, { id, emoji, timestamp: Date.now() }]);
    setTimeout(() => setFloating((prev) => prev.filter((e) => e.id !== id)), 3000);
  }, [socket]);

  return (
    <div className="relative">
      <div className="flex gap-1 flex-wrap">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => sendReaction(emoji)}
            className="text-xl hover:scale-125 transition-transform p-1"
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="absolute bottom-full left-0 flex gap-2 pointer-events-none">
        <AnimatePresence>
          {floating.map((f, i) => (
            <motion.span
              key={f.id}
              initial={{ y: 0, opacity: 1, x: i * 10 }}
              animate={{ y: -60, opacity: 0, x: (i % 3) * 20 - 20 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2 }}
              className="text-2xl"
            >
              {f.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

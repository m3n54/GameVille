'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  // FE-H2: track every pending removal timer so unmount clears them. Without
  // this, a route change during the 3s window fires setState on the unmounted
  // component (React 18 warning) and the next mount sees stale state.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    if (!socket) return;
    const handler = (data: { nickname: string; emoji: string }) => {
      const id = `${Date.now()}-${Math.random()}`;
      setFloating((prev) => [...prev, { id, emoji: data.emoji, timestamp: Date.now() }]);
      const t = setTimeout(() => {
        setFloating((prev) => prev.filter((e) => e.id !== id));
        timersRef.current.delete(t);
      }, 3000);
      timersRef.current.add(t);
    };
    socket.on('reaction:received', handler);
    return () => {
      socket.off('reaction:received', handler);
    };
  }, [socket]);

  // FE-H2: clear every pending timer on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    if (!socket) return;
    socket.emit('reaction:send', { emoji });
    // Optimistic add for the sender — the server uses socket.to() which
    // excludes the sender from the broadcast, so without this the sender
    // would see nothing. Use a uniquely-random id (same scheme as the
    // server-received branch) to avoid the "me-" id collision when two
    // reactions fire in the same millisecond.
    const id = `${Date.now()}-${Math.random()}`;
    setFloating((prev) => [...prev, { id, emoji, timestamp: Date.now() }]);
    const t = setTimeout(() => {
      setFloating((prev) => prev.filter((e) => e.id !== id));
      timersRef.current.delete(t);
    }, 3000);
    timersRef.current.add(t);
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

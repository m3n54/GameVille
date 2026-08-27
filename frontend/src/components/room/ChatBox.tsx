'use client';

import { useState, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types';

interface ChatBoxProps {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  myNickname: string;
  // FE-1: stable self id from useRoom. Survives socket reconnects (which give
  // socket.io a new id). Comparing against socket.id made self-aligned chat
  // bubbles flip to the other side on every reconnect.
  myId: string | null;
}

interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  timestamp: number;
}

export default function ChatBox({ socket, myNickname, myId }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  // FE-H2: track every pending removal timer so unmount can clear them.
  // Without this, a route change during the 3s window would fire setState on
  // the unmounted component (React 18 warning) or, after remount, the
  // leftover timer would remove a still-visible message.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    if (!socket) return;
    const handler = (data: { playerId: string; nickname: string; text: string }) => {
      setMessages((prev) => [...prev, { ...data, id: `${Date.now()}-${Math.random()}`, timestamp: Date.now() }]);
    };
    socket.on('chat:received', handler);
    return () => {
      socket.off('chat:received', handler);
    };
  }, [socket]);

  // FE-H2: clear all pending timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!input.trim() || !socket) return;
    socket.emit('chat:message', { text: input.trim() });
    // FE-1: tag optimistic self-messages with the stable myId (not socket.id)
    // so the bubble's alignment survives a reconnect.
    setMessages((prev) => [...prev, {
      id: `me-${Date.now()}-${Math.random()}`,
      playerId: myId ?? socket.id ?? '',
      nickname: myNickname,
      text: input.trim(),
      timestamp: Date.now(),
    }]);
    setInput('');
  };

  return (
    <div className="flex flex-col h-64 bg-white rounded-cute shadow-soft">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg) => {
          // FE-1: compare against the stable myId, not socket.id.
          const isSelf = msg.playerId !== '' && msg.playerId === myId;
          return (
            <div key={msg.id} className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                isSelf
                  ? 'bg-primary text-white rounded-br-md'
                  : 'bg-gray-100 text-cute-text rounded-bl-md'
              }`}>
                {!isSelf && (
                  <p className="text-xs font-bold text-cute-muted mb-1">{msg.nickname}</p>
                )}
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="p-2 border-t border-gray-100 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ketik pesan..."
          maxLength={100}
          className="flex-1 px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          className="px-3 py-2 bg-primary text-white rounded-xl text-sm font-bold disabled:opacity-50"
        >
          Kirim
        </button>
      </div>
    </div>
  );
}

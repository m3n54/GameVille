'use client';

import { useState, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types';

interface ChatBoxProps {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  myNickname: string;
}

interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  timestamp: number;
}

export default function ChatBox({ socket, myNickname }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;
    const handler = (data: { playerId: string; nickname: string; text: string }) => {
      setMessages((prev) => [...prev, { ...data, id: `${Date.now()}-${Math.random()}`, timestamp: Date.now() }]);
    };
    socket.on('chat:received', handler);
    return () => { socket.off('chat:received', handler); };
  }, [socket]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!input.trim() || !socket) return;
    socket.emit('chat:message', { text: input.trim() });
    setMessages((prev) => [...prev, {
      id: `me-${Date.now()}`,
      playerId: socket.id || '',
      nickname: myNickname,
      text: input.trim(),
      timestamp: Date.now(),
    }]);
    setInput('');
  };

  return (
    <div className="flex flex-col h-64 bg-white rounded-cute shadow-soft">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.playerId === socket?.id ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
              msg.playerId === socket?.id
                ? 'bg-primary text-white rounded-br-md'
                : 'bg-gray-100 text-cute-text rounded-bl-md'
            }`}>
              {msg.playerId !== socket?.id && (
                <p className="text-xs font-bold text-cute-muted mb-1">{msg.nickname}</p>
              )}
              {msg.text}
            </div>
          </div>
        ))}
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

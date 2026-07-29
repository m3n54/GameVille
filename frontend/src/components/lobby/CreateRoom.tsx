'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface CreateRoomProps {
  onCreate: (name: string, nickname: string, color: string, emoji: string) => void;
}

const COLORS = ['#FF9BB5', '#A8D8EA', '#B5EAD7', '#FFD3B6', '#C3AED6', '#FFB347'];
const EMOJIS = ['🦊', '🐰', '🐼', '🐱', '🦁', '🐸', '🐵', '🐶'];

export default function CreateRoom({ onCreate }: CreateRoomProps) {
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [emoji, setEmoji] = useState(EMOJIS[0]);

  return (
    <div className="space-y-4">
      <Input
        value={nickname}
        onChange={setNickname}
        placeholder="Nama panggilan..."
        maxLength={12}
        autoFocus
      />
      <div>
        <p className="text-sm font-semibold text-cute-text mb-2">Warna</p>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-2 ring-pink-300' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-cute-text mb-2">Avatar</p>
        <div className="flex gap-2 flex-wrap">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`text-2xl w-10 h-10 flex items-center justify-center rounded-full transition-transform ${
                emoji === e ? 'scale-125 bg-pink-100 ring-2 ring-pink-300' : ''
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <Button
        onClick={() => onCreate(`Ruang ${nickname || 'Player'}`, nickname || 'Player', color, emoji)}
        disabled={!nickname.trim()}
        className="w-full"
      >
        🎮 Buat Ruang Baru
      </Button>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface JoinRoomProps {
  onJoin: (pin: string, nickname: string, color: string, emoji: string) => void;
  /** Server/validation error surfaced from useRoom — rendered inline. */
  error?: string | null;
  /** Disables submit while a join ack is in flight. */
  submitting?: boolean;
}

const COLORS = ['#FF9BB5', '#A8D8EA', '#B5EAD7', '#FFD3B6', '#C3AED6', '#FFB347'];
const EMOJIS = ['🦊', '🐰', '🐼', '🐱', '🦁', '🐸', '🐵', '🐶'];

export default function JoinRoom({ onJoin, error, submitting = false }: JoinRoomProps) {
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState<string>(COLORS[0] ?? '#FF9BB5');
  const [emoji, setEmoji] = useState<string>(EMOJIS[0] ?? '🦊');

  return (
    <div className="space-y-4">
      <Input
        value={pin}
        onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
        placeholder="Kode ruang (6 angka)..."
        maxLength={6}
      />
      <Input
        value={nickname}
        onChange={setNickname}
        placeholder="Nama panggilan..."
        maxLength={12}
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
      {error && (
        <p role="alert" className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
          ⚠️ {error}
        </p>
      )}
      <Button
        onClick={() => {
          const nick = nickname.trim() || 'Player';
          onJoin(pin, nick, color, emoji);
        }}
        disabled={pin.length !== 6 || !nickname.trim() || submitting}
        className="w-full"
      >
        {submitting ? '⏳ Bergabung...' : '🔗 Gabung Ruang'}
      </Button>
    </div>
  );
}

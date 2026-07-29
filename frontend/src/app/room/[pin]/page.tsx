'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { useRoom } from '@/hooks/useRoom';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import PlayerList from '@/components/room/PlayerList';
import ChatBox from '@/components/room/ChatBox';
import EmojiReactions from '@/components/room/EmojiReactions';
import SnakesLaddersContainer from '@/components/games/snakes-ladders/SnakesLaddersContainer';
import HangmanContainer from '@/components/games/hangman/HangmanContainer';
import SeaBattleContainer from '@/components/games/sea-battle/SeaBattleContainer';
import type { GameType, SnakesLaddersState, HangmanState, SeaBattleState } from '@/types';

export default function RoomPage() {
  const params = useParams();
  const pin = params.pin as string;
  const { socket, connected } = useSocket();
  const { room, players, leaveRoom, toggleReady, selectGame, startGame } = useRoom(socket);
  const [gameState, setGameState] = useState<unknown>(null);
  const [gameActive, setGameActive] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on('room:state', () => {
      // Room state updated from server
    });

    socket.on('game:started', () => {
      setGameActive(true);
    });

    socket.on('game:state', (state) => {
      setGameState(state);
    });

    socket.on('game:over', () => {
      setGameActive(false);
      setGameState(null);
    });

    return () => {
      socket.off('room:state');
      socket.off('game:started');
      socket.off('game:state');
      socket.off('game:over');
    };
  }, [socket]);

  // Room events listeners untuk update dari server
  useEffect(() => {
    if (!socket) return;

    const handlePlayerEntered = () => { /* room state updated via room:state */ };
    const handlePlayerLeft = () => { /* room state updated via room:state */ };

    socket.on('player:entered', handlePlayerEntered);
    socket.on('player:left', handlePlayerLeft);

    return () => {
      socket.off('player:entered', handlePlayerLeft);
      socket.off('player:left', handlePlayerLeft);
    };
  }, [socket]);

  const myId = socket?.id;
  const isHost = players.find(p => p.id === myId)?.isHost ?? false;
  const allReady = players.every(p => p.isReady) && players.length >= 2;

  const myNickname = players.find(p => p.id === myId)?.nickname ?? '';

  // Pastikan socket ready sebelum render
  if (!connected || !room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-cute-muted text-xl">Menghubungkan ke ruang...</p>
      </div>
    );
  }

  // Jika game aktif, render game view
  if (gameActive && room.gameType) {
    const renderGame = () => {
      switch (room.gameType) {
        case 'snakes-ladders':
          return <SnakesLaddersContainer socket={socket!} state={gameState as SnakesLaddersState} />;
        case 'hangman':
          return <HangmanContainer socket={socket!} state={gameState as HangmanState} />;
        case 'sea-battle':
          return <SeaBattleContainer socket={socket!} state={gameState as SeaBattleState} />;
        default:
          return <p>Game tidak dikenal</p>;
      }
    };

    return (
      <div className="min-h-screen p-4 flex flex-col lg:flex-row gap-4">
        <div className="flex-1">{renderGame()}</div>
        <div className="w-full lg:w-80 space-y-4">
          <ChatBox socket={socket!} myNickname={myNickname} />
          <EmojiReactions socket={socket!} />
          <Button variant="ghost" onClick={() => { setGameActive(false); leaveRoom(); }}>
            ← Keluar
          </Button>
        </div>
      </div>
    );
  }

  // Lobby view
  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Room Info + Players */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-cute-text">🎮 {room.name}</h1>
                  <p className="text-cute-muted text-sm mt-1">
                    Kode ruang: <span className="font-mono font-bold text-primary text-lg">{pin}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(window.location.href)}
                      className="ml-2 text-secondary hover:text-blue-400 transition-colors"
                      title="Salin link"
                    >
                      📋
                    </button>
                  </p>
                </div>
              </div>
              <PlayerList players={players} myId={myId} />
            </Card>

            {/* Game Selector */}
            <Card title="🎯 Pilih Game">
              <div className="space-y-3">
                {(['snakes-ladders', 'hangman', 'sea-battle'] as GameType[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => isHost && selectGame(g)}
                    disabled={!isHost}
                    className={`w-full text-left p-3 rounded-cute border-2 transition-all ${
                      room.gameType === g
                        ? 'border-primary bg-pink-50'
                        : 'border-gray-100 hover:border-gray-200'
                    } ${!isHost ? 'opacity-60' : ''}`}
                  >
                    <p className="font-bold text-cute-text">
                      {g === 'snakes-ladders' ? '🐍 Ular Tangga' : g === 'hangman' ? '💀 Hangman' : '⚓ Sea Battle'}
                    </p>
                    <p className="text-sm text-cute-muted">
                      {g === 'snakes-ladders' ? '2-4 pemain · Dadu 3D · Papan isometric' : g === 'hangman' ? '2-4 pemain · Tebak kata bareng-bareng' : '2 pemain · Perang kapal di grid'}
                    </p>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: Controls + Chat */}
          <div className="space-y-4">
            <Card>
              <div className="space-y-3">
                <Button onClick={toggleReady} variant={players.find(p => p.id === myId)?.isReady ? 'secondary' : 'primary'} className="w-full">
                  {players.find(p => p.id === myId)?.isReady ? '✅ Siap!' : '⏳ Saya Siap'}
                </Button>
                {isHost && (
                  <Button
                    onClick={startGame}
                    disabled={!allReady || !room.gameType}
                    className="w-full"
                  >
                    🚀 Mulai Game
                  </Button>
                )}
                {!isHost && (
                  <p className="text-center text-sm text-cute-muted">
                    Host yang memulai game
                  </p>
                )}
                <Button variant="ghost" onClick={leaveRoom} className="w-full">
                  🚪 Keluar Ruang
                </Button>
              </div>
            </Card>

            <ChatBox socket={socket!} myNickname={myNickname} />
            <EmojiReactions socket={socket!} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { useRoom } from '@/hooks/useRoom';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import PlayerList from '@/components/room/PlayerList';
import ChatBox from '@/components/room/ChatBox';
import EmojiReactions from '@/components/room/EmojiReactions';
import ConnectionStatus from '@/components/room/ConnectionStatus';
import GameErrorBanner from '@/components/room/GameErrorBanner';
import JoinRoom from '@/components/lobby/JoinRoom';
import SnakesLaddersContainer from '@/components/games/snakes-ladders/SnakesLaddersContainer';
import HangmanContainer from '@/components/games/hangman/HangmanContainer';
import SeaBattleContainer from '@/components/games/sea-battle/SeaBattleContainer';
import MinesweeperContainer from '@/components/games/minesweeper/MinesweeperContainer';
import type { GameType, SnakesLaddersState, HangmanState, SeaBattlePlayerView, MinesweeperView } from '@/types';

export default function RoomPage() {
  const params = useParams();
  const pin = params.pin as string;
  const { socket, connected, reconnecting } = useSocket();
  const { room, players, myId, error, clearError, leaveRoom, toggleReady, selectGame, startGame, syncRoom, joinRoom, submitting } = useRoom(socket);
  const [gameState, setGameState] = useState<unknown>(null);
  const [gameActive, setGameActive] = useState(false);
  const [gameWinner, setGameWinner] = useState<{ id: string; name: string } | null>(null);
  // F9 fix: when the user pastes /room/[pin] but isn't a member yet (new socket,
  // new tab), room:sync fails silently and we should show a join form pre-filled
  // with the PIN, NOT redirect back to landing. Track a brief grace window
  // before deciding we need to show the form.
  const [showJoinForm, setShowJoinForm] = useState(false);
  // FE-F2: track the previous connected flag so a false→true transition
  // (reconnect) triggers exactly one re-sync.
  const prevConnected = useRef(connected);

  // After navigation the component is fresh — ask the server for room state.
  // Mid-game recovery: server replays the current game snapshot + whose turn
  // it is in the same ack.
  useEffect(() => {
    if (!socket || !connected) return;
    if (!room) {
      syncRoom(pin, (state, turnPlayerId) => {
        if (state != null) {
          setGameState(state);
          setGameActive(true);
        }
        if (turnPlayerId) {
          // Hand the recovered turn to any container that just mounted —
          // dispatched after mount via a microtask-safe custom event is
          // overkill; containers read this through their own sync callback.
          window.dispatchEvent(new CustomEvent('gameville:turn', { detail: turnPlayerId }));
        }
      });
    }
  }, [socket, connected, pin, room, syncRoom]);

  // F9 fix: if 1.5s after a successful socket connect we still have no room,
  // we're not a member of this PIN. Show the join form pre-filled with the PIN
  // so the user can join from the URL they pasted (instead of the old behaviour
  // of redirecting to '/' which caused them to click "Buat Ruang Baru" again
  // and create a fresh, separate room).
  useEffect(() => {
    if (!connected) {
      setShowJoinForm(false);
      return;
    }
    const t = window.setTimeout(() => {
      if (!room && !myId) setShowJoinForm(true);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [connected, room, myId]);

  // FE-F2: on reconnect the server sees us as a brand-new connection with a new
  // socket.id. Re-sync immediately so membership + game state are restored.
  useEffect(() => {
    if (!prevConnected.current && connected && socket) {
      setGameState(null);
      setGameActive(false);
      setGameWinner(null);
      setRoomNullThenSync();
    }
    prevConnected.current = connected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, socket]);

  const setRoomNullThenSync = () => {
    // Clear local state first so the sync effect's `!room` gate re-runs.
    // syncRoom itself re-fetches regardless; clearing avoids stale renders
    // between reconnect and ack.
    syncRoom(pin, (state, turnPlayerId) => {
      if (state != null) {
        setGameState(state);
        setGameActive(true);
      }
      if (turnPlayerId) {
        window.dispatchEvent(new CustomEvent('gameville:turn', { detail: turnPlayerId }));
      }
    });
  };

  // F8 fix: always off() by named handler — never off(eventName), which nukes
  // listeners registered by the active game container on the same singleton.
  useEffect(() => {
    if (!socket) return;

    const onStarted = () => {
      setGameActive(true);
    };
    const onState = (state: unknown) => {
      setGameState(state);
    };
    const onOver = (data: { winnerId: string; winnerName: string }) => {
      setGameWinner({ id: data.winnerId, name: data.winnerName });
      setGameActive(true);
    };

    socket.on('game:started', onStarted);
    socket.on('game:state', onState);
    socket.on('game:over', onOver);

    return () => {
      socket.off('game:started', onStarted);
      socket.off('game:state', onState);
      socket.off('game:over', onOver);
    };
  }, [socket]);

  const isHost = players.find(p => p.id === myId)?.isHost ?? false;
  const allReady = players.every(p => p.isReady) && players.length >= 2;
  const me = players.find(p => p.id === myId);
  const myNickname = me?.nickname ?? '';

  if (!connected || !room || !myId) {
    // F9: paste-URL flow — show the join form instead of redirecting away.
    if (showJoinForm) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <ConnectionStatus reconnecting={reconnecting} />
          <Card title={`🔗 Masuk Ruang ${pin}`}>
            <JoinRoom
              initialPin={pin}
              onJoin={(p, nickname, color, emoji) => joinRoom(p, nickname, color, emoji)}
              error={error}
              submitting={submitting}
            />
          </Card>
        </div>
      );
    }
    return (
      <div className="min-h-screen">
        <ConnectionStatus reconnecting={reconnecting} />
        <div className="flex items-center justify-center" style={{ minHeight: '80vh' }}>
          <p className="text-cute-muted text-xl">Menghubungkan ke ruang...</p>
        </div>
      </div>
    );
  }

  if (gameActive && room.gameType) {
    const renderGame = () => {
      switch (room.gameType) {
        case 'snakes-ladders':
          return <SnakesLaddersContainer socket={socket!} state={gameState as SnakesLaddersState} />;
        case 'hangman':
          return <HangmanContainer socket={socket!} state={gameState as HangmanState} />;
        case 'sea-battle':
          return <SeaBattleContainer socket={socket!} state={gameState as SeaBattlePlayerView} />;
        case 'minesweeper':
          return <MinesweeperContainer socket={socket!} state={gameState as MinesweeperView} />;
        default:
          return <p>Game tidak dikenal</p>;
      }
    };

    return (
      <div className="min-h-screen p-4 flex flex-col lg:flex-row gap-4">
        <ConnectionStatus reconnecting={reconnecting} />
        <div className="flex-1">{renderGame()}</div>
        <div className="w-full lg:w-80 space-y-4">
          <GameErrorBanner message={error} onDismiss={clearError} />
          <ChatBox socket={socket!} myNickname={myNickname} />
          <EmojiReactions socket={socket!} />
          <Button variant="ghost" onClick={() => { setGameActive(false); leaveRoom(); }}>
            ← Keluar
          </Button>
        </div>
        {gameWinner && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="bg-white p-8 rounded-cute shadow-soft text-center max-w-sm mx-4"
            >
              {/* Co-op outcomes: 'team' = everyone won, 'none' = team lost.
                  Otherwise 1v1/ffa: compare against my stable id (myId from
                  useRoom survives reconnects; socket.id does not). */}
              {(() => {
                const isTeamWin = gameWinner.id === 'team';
                const isTeamLoss = gameWinner.id === 'none';
                const iWon = !isTeamLoss && (isTeamWin || gameWinner.id === myId);
                const emoji = isTeamLoss ? '😵' : iWon ? '🎉' : '🙌';
                const title = isTeamLoss
                  ? 'Tim Kalah!'
                  : isTeamWin
                    ? 'Tim Menang! 🎉'
                    : iWon
                      ? 'Kamu Menang!'
                      : `${gameWinner.name} Menang!`;
                return (
                  <>
                    <p className="text-5xl mb-4">{emoji}</p>
                    <h2 className="text-2xl font-bold text-cute-text mb-2">{title}</h2>
                    <p className="text-cute-muted mb-6">Game selesai!</p>
                  </>
                );
              })()}
              <div className="space-y-3">
                <Button onClick={() => { setGameWinner(null); setGameActive(false); }} className="w-full">
                  🔄 Kembali ke Lobby
                </Button>
                <Button variant="ghost" onClick={leaveRoom} className="w-full">
                  🚪 Keluar Ruang
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <ConnectionStatus reconnecting={reconnecting} />
      <div className="max-w-4xl mx-auto pt-2 space-y-3">
        <GameErrorBanner message={error} onDismiss={clearError} />
      </div>
      <div className="max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

            <Card title="🎯 Pilih Game">
              <div className="space-y-3">
                {(['snakes-ladders', 'hangman', 'sea-battle', 'minesweeper'] as GameType[]).map((g) => (
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
                      {g === 'snakes-ladders' ? '🐍 Ular Tangga' : g === 'hangman' ? '💀 Hangman' : g === 'sea-battle' ? '⚓ Sea Battle' : '💣 Minesweeper'}
                    </p>
                    <p className="text-sm text-cute-muted">
                      {g === 'snakes-ladders' ? '2-4 pemain · Dadu 3D · Papan isometric' : g === 'hangman' ? '2-4 pemain · Tebak kata bareng-bareng' : g === 'sea-battle' ? '2 pemain · Perang kapal di grid' : '2 pemain · Co-op · Hindari bom bareng'}
                    </p>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <div className="space-y-3">
                <Button onClick={toggleReady} variant={me?.isReady ? 'secondary' : 'primary'} className="w-full">
                  {me?.isReady ? '✅ Siap!' : '⏳ Saya Siap'}
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

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  // FE-H3: per-page "ever had room" flag — set INSIDE syncRoom ack callbacks
  // (the only server-side signal that the user is a member of this PIN).
  // Declared here so the sync effect on first mount can read/write it; the
  // F9 grace timer below reads it to decide whether to show the join form.
  // Per-page (useRef) so navigating to a different /room/[pin] resets it.
  const everHadRoomRef = useRef(false);
  // H5: guard against the mount-sync effect and the reconnect effect both
  // calling `syncRoom` in the same tick. Without this, both effects fire
  // on a fresh mount (e.g. tab refresh right after a reconnect) and the
  // server runs `room:sync` twice, racing the ack callbacks.
  const isSyncingRef = useRef(false);

  // After navigation the component is fresh — ask the server for room state.
  // Mid-game recovery: server replays the current game snapshot + whose turn
  // it is in the same ack.
  // FE-H3 follow-up: a successful sync ack is the source of truth that this
  // page's user is a member of the room — flip `everHadRoomRef` INSIDE the
  // ack callback so a slow (>1.5s) network round-trip can't trigger F9 over
  // a legitimate re-syncing member. The previous version only set the ref
  // on the `room` truthy effect, which fires after the next render — too
  // late if F9's setTimeout already armed with the old `false` value.
  useEffect(() => {
    if (!socket || !connected) return;
    if (room) return;
    if (isSyncingRef.current) return; // H5: another effect already triggered sync
    isSyncingRef.current = true;
    syncRoom(pin, (state) => {
      isSyncingRef.current = false;
      everHadRoomRef.current = true;
      if (state != null) {
        setGameState(state);
        setGameActive(true);
      }
      // T1 (audit H4): the turnPlayerId CustomEvent relay was removed — nothing
      // ever listened for it, and MinesweeperContainer now derives the turn
      // from the snapshot's playerOrder[currentTurn] (the other games already
      // read their turn from the replayed state).
    });
  }, [socket, connected, pin, room, syncRoom]);

  // F9 fix: if 1.5s after a successful socket connect we still have no room,
  // we're not a member of this PIN. Show the join form pre-filled with the PIN
  // so the user can join from the URL they pasted (instead of the old behaviour
  // of redirecting to '/' which caused them to click "Buat Ruang Baru" again
  // and create a fresh, separate room).
  // FE-H3: gate on a per-page "ever had room" flag. A re-syncing member whose
  // room:sync ack takes >1.5s used to see the F9 form pop up over their
  // recovering game, and clicking Gabung would create a duplicate "menza
  // (Kamu)". The flag is per-page (useRef) so navigating away resets it.
  useEffect(() => {
    if (room) everHadRoomRef.current = true;
  }, [room]);
  useEffect(() => {
    if (!connected) {
      setShowJoinForm(false);
      return;
    }
    // Skip the timer entirely if this user has ever been a member of THIS
    // page's room — they're a legitimate re-syncing member, not a new visitor.
    if (everHadRoomRef.current) return;
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
    // H5: skip if the mount-sync effect is already in flight.
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    // Clear local state first so the sync effect's `!room` gate re-runs.
    // syncRoom itself re-fetches regardless; clearing avoids stale renders
    // between reconnect and ack.
    syncRoom(pin, (state) => {
      isSyncingRef.current = false;
      // Same gate as the mount effect — a reconnected member whose sync ack
      // takes >1.5s must not see the F9 join form pop over their game.
      everHadRoomRef.current = true;
      if (state != null) {
        setGameState(state);
        setGameActive(true);
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

  // R5-2: leaveRoom clears the room store but the F9 grace timer gates on
  // everHadRoomRef (set true on first successful sync) to avoid flashing the
  // join form over a re-syncing member. After an explicit leave we want F9
  // to fire so the user can re-join from the same URL — reset the ref here.
  const handleLeave = useCallback(() => {
    everHadRoomRef.current = false;
    leaveRoom();
  }, [leaveRoom]);

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
      // L-5: containers must not derive identity from socket.id — it changes
      // on every websocket reconnect. Pass the stable myId (matched by
      // nickname against room.players via useRoom) down instead.
      switch (room.gameType) {
        case 'snakes-ladders':
          return <SnakesLaddersContainer socket={socket!} state={gameState as SnakesLaddersState} myId={myId} />;
        case 'hangman':
          return <HangmanContainer socket={socket!} state={gameState as HangmanState} myId={myId} />;
        case 'sea-battle':
          return <SeaBattleContainer socket={socket!} state={gameState as SeaBattlePlayerView} myId={myId} />;
        case 'minesweeper':
          return <MinesweeperContainer socket={socket!} state={gameState as MinesweeperView} myId={myId} />;
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
          <ChatBox socket={socket!} myNickname={myNickname} myId={myId} />
          <EmojiReactions socket={socket!} />
          <Button variant="ghost" onClick={() => { setGameActive(false); handleLeave(); }}>
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
                <Button variant="ghost" onClick={handleLeave} className="w-full">
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
                <Button variant="ghost" onClick={handleLeave} className="w-full">
                  🚪 Keluar Ruang
                </Button>
              </div>
            </Card>

            <ChatBox socket={socket!} myNickname={myNickname} myId={myId} />
            <EmojiReactions socket={socket!} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

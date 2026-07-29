import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ClientToServerEvents, ServerToClientEvents, GameType } from './types';
import { createRoom, joinRoom, leaveRoom, toggleReady, setGameType, canStartGame, setRoomState, getRoom, findByPlayer } from './rooms';
import { BaseGame, GameInstance } from './games/base';
import { SnakesLaddersEngine } from './games/snakes-ladders';

const GAMES = new Map<string, GameInstance>();

const engines: Record<string, BaseGame> = {
  'snakes-ladders': new SnakesLaddersEngine(),
};

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: io.engine.clientsCount });
});

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  // === ROOM EVENTS ===

  socket.on('room:create', (data) => {
    const room = createRoom(data, socket.id);
    socket.join(room.id);
    socket.emit('room:created', room);
    console.log(`[Room] Created: ${room.pin} by ${data.nickname}`);
  });

  socket.on('room:join', (data) => {
    const room = joinRoom(data.pin, data, socket.id);
    if (!room) {
      socket.emit('room:error', { message: 'Kode ruang tidak valid atau ruang sudah penuh!' });
      return;
    }
    socket.join(room.id);
    socket.emit('room:joined', room);
    socket.to(room.id).emit('player:entered', room.players[room.players.length - 1]);
    socket.to(room.id).emit('room:state', room);
  });

  socket.on('room:leave', () => {
    const result = leaveRoom(socket.id);
    if (result.roomId) {
      socket.leave(result.roomId);
      socket.to(result.roomId).emit('player:left', socket.id);
      if (result.newHost) {
        socket.to(result.roomId).emit('player:update', getRoom(result.roomId)!.players);
      }
    }
  });

  socket.on('player:ready', (data) => {
    const room = toggleReady(socket.id, data.ready);
    if (room) {
      io.to(room.id).emit('player:update', room.players);
    }
  });

  socket.on('game:start', () => {
    const roomData = findByPlayer(socket.id);
    if (!roomData) return;
    if (roomData.hostId !== socket.id) return;
    if (!canStartGame(roomData.id)) return;

    const engine = engines[roomData.gameType!];
    if (!engine) return;

    const playerOrder = roomData.players.map(p => p.id);
    const instance: GameInstance = {
      roomId: roomData.id,
      gameType: roomData.gameType!,
      state: engine.createInitialState(playerOrder),
      currentTurnIndex: 0,
      playerOrder,
      winner: null,
    };

    GAMES.set(roomData.id, instance);
    setRoomState(roomData.id, 'playing');

    // Notify all players
    io.to(roomData.id).emit('game:started', roomData.gameType!);
    io.to(roomData.id).emit('game:state', instance.state);

    // Notify whose turn it is
    const currentPlayerId = instance.playerOrder[instance.currentTurnIndex];
    io.to(roomData.id).emit('game:action', { type: 'turn', playerId: currentPlayerId });
  });

  socket.on('game:action', (data) => {
    // Find the room and game instance for this socket
    let gameRoom: { id: string } | null = null;
    for (const [roomId, instance] of GAMES) {
      if (instance.playerOrder.includes(socket.id)) {
        gameRoom = { id: roomId };
        break;
      }
    }
    if (!gameRoom) return;

    const instance = GAMES.get(gameRoom.id);
    if (!instance) return;

    // Single source of truth: engine's state.winner — block actions after game over
    const currentState = instance.state as { winner?: string | null };
    if (currentState.winner) return;

    const engine = engines[instance.gameType];
    if (!engine) return;

    const result = engine.handleAction(instance.state, socket.id, data);
    instance.state = result.newState;

    // Process all events
    for (const event of result.events) {
      switch (event.type) {
        case 'diceResult':
          io.to(gameRoom.id).emit('game:state', instance.state);
          io.to(gameRoom.id).emit('game:action', event.data);
          break;
        case 'turnChange':
          io.to(gameRoom.id).emit('game:action', event.data);
          break;
        case 'gameOver':
          const winner = instance.playerOrder.find(p => p === event.data.winnerId);
          const winnerName = getRoom(gameRoom.id)?.players.find(p => p.id === winner)?.nickname ?? 'Unknown';
          io.to(gameRoom.id).emit('game:over', { winnerId: event.data.winnerId as string, winnerName });
          setRoomState(gameRoom.id, 'finished');
          break;
        case 'error':
          socket.emit('room:error', event.data as { message: string });
          break;
      }
    }
  });

  socket.on('game:select', (data) => {
    const room = setGameType(socket.id, data.gameType);
    if (room) {
      io.to(room.id).emit('room:state', room);
    }
  });

  socket.on('chat:message', (data) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    socket.to(room.id).emit('chat:received', {
      playerId: socket.id,
      nickname: findPlayerNickname(socket.id),
      text: data.text,
    });
  });

  socket.on('reaction:send', (data) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    socket.to(room.id).emit('reaction:received', {
      playerId: socket.id,
      nickname: findPlayerNickname(socket.id),
      emoji: data.emoji,
    });
  });

  socket.on('disconnect', () => {
    const result = leaveRoom(socket.id);
    if (result.roomId) {
      socket.to(result.roomId).emit('player:left', socket.id);
      if (result.newHost) {
        socket.to(result.roomId).emit('player:update', getRoom(result.roomId)!.players);
      }

      // Clean up game if room finished
      const game = GAMES.get(result.roomId);
      if (game && getRoom(result.roomId)?.state === 'finished') {
        GAMES.delete(result.roomId);
      }
    }
    console.log(`[-] Player disconnected: ${socket.id}`);
  });
});

function findRoomBySocket(socketId: string) {
  const room = findByPlayer(socketId);
  if (!room) return null;
  return { id: room.id };
}

function findPlayerNickname(socketId: string): string {
  const room = findByPlayer(socketId);
  if (!room) return 'Unknown';
  return room.players.find(p => p.id === socketId)?.nickname ?? 'Unknown';
}

const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`[GameVille Server] Running on port ${PORT}`);
});

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ClientToServerEvents, ServerToClientEvents } from './types';
import { createRoom, joinRoom, leaveRoom, toggleReady, setGameType, canStartGame, setRoomState, getRoom } from './rooms';

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

  socket.on('game:select', (data) => {
    const room = setGameType(socket.id, data.gameType);
    if (room) {
      io.to(room.id).emit('room:state', room);
    }
  });

  socket.on('disconnect', () => {
    const result = leaveRoom(socket.id);
    if (result.roomId) {
      socket.to(result.roomId).emit('player:left', socket.id);
      if (result.newHost) {
        socket.to(result.roomId).emit('player:update', getRoom(result.roomId)!.players);
      }
    }
    console.log(`[-] Player disconnected: ${socket.id}`);
  });
});

const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`[GameVille Server] Running on port ${PORT}`);
});

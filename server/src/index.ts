import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ClientToServerEvents, ServerToClientEvents } from './types';

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

  socket.on('disconnect', () => {
    console.log(`[-] Player disconnected: ${socket.id}`);
  });
});

const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`[GameVille Server] Running on port ${PORT}`);
});

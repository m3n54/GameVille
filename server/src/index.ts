import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import type { ClientToServerEvents, ServerToClientEvents } from './types';
import { registerSocketHandlers } from './socketHandlers';
import { startRoomSweeper, startExitSweeper } from './gameService';

// === CORS (deploy F4) =======================================================
// Comma-separated origin list. Entries of the form `https://*.domain.tld` are
// treated as suffix wildcards — needed because Vercel preview deployments get
// per-PR subdomains that a single pinned origin would reject.
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin: string): boolean {
  return corsOrigins.some((allowed) => {
    if (allowed.startsWith('https://*.')) {
      const suffix = allowed.slice('https://*'.length); // ".vercel.app"
      return origin.endsWith(suffix);
    }
    return allowed === origin;
  });
}

const corsOriginFn = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // Allow non-browser tools (no Origin header) plus anything on the list.
  if (!origin || isOriginAllowed(origin)) return callback(null, true);
  callback(new Error('Not allowed by CORS'));
};

const app = express();
app.use(cors({ origin: corsOriginFn }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: corsOriginFn, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 64 * 1024, // M5: payloads beyond chat-sized input are abuse
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: io.engine.clientsCount });
});

startRoomSweeper();
// R1 (audit H-3): forfeit mid-game grace exits once GRACE_MS passes — the
// sweeper needs io because expiry replays the full immediate exit path
// (broadcasts included).
startExitSweeper(io);

// S1 (audit H1): all connection wiring lives in socketHandlers.ts — both so the
// exit/turn paths stay in one reviewable layer and so the handler layer can be
// integration-tested without booting this entrypoint (which listens on a port).
registerSocketHandlers(io);

const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`[GameVille Server] Running on port ${PORT}`);
});

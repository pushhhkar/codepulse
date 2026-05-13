import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@codepulse/types';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.routes.js';

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRoutes);

// ── HTTP server (Socket.io must own the server instance, not Express) ─────────
const httpServer = createServer(app);

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  {
    cors: {
      origin: env.clientUrl,
      credentials: true,
    },
  },
);

io.on('connection', (socket) => {
  console.log(`[socket] connected   id=${socket.id}`);

  socket.on('JOIN_WORKSPACE', ({ workspaceId }) => {
    void socket.join(workspaceId);
    socket.data.workspaceId = workspaceId;
    console.log(`[socket] id=${socket.id} joined workspace=${workspaceId}`);

    // Notify everyone else already in the room that a new user arrived
    socket.to(workspaceId).emit('USER_JOINED', {
      userId: socket.id,
      workspaceId,
    });
  });

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected id=${socket.id} reason=${reason}`);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  await connectDB();
  httpServer.listen(env.port, () => {
    console.log(`[server] Running on http://localhost:${env.port}`);
    console.log(`[server] Environment: ${env.nodeEnv}`);
  });
}

void bootstrap();

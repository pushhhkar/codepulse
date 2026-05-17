import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@codepulse/types';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import sandboxRoutes from './routes/sandbox.routes.js';
import aiRoutes from './routes/ai.routes.js';
import workspacesRoutes from './routes/workspaces.routes.js';

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
app.use('/api/sandbox', sandboxRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/workspaces', workspacesRoutes);

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

    socket.to(workspaceId).emit('USER_JOINED', { userId: socket.id, workspaceId });
  });

  socket.on('CODE_CHANGE', ({ workspaceId, content }) => {
    // Relay to everyone in the room except the sender
    socket.to(workspaceId).emit('CODE_CHANGE', { content });
  });

  socket.on('CURSOR_MOVE', ({ workspaceId, cursor, userId, userName }) => {
    socket.to(workspaceId).emit('CURSOR_MOVE', { cursor, userId, userName });
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

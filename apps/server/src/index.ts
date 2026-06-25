import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import type {
  ActiveUser,
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@codepulse/types';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import sandboxRoutes from './routes/sandbox.routes.js';
import aiRoutes from './routes/ai.routes.js';
import workspacesRoutes from './routes/workspaces.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import githubRoutes from './routes/github.routes.js';

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);
app.use(
  express.json({
    // Capture the exact raw bytes so webhook HMAC signatures can be verified
    // against the byte-for-byte payload GitHub signed.
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);
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
app.use('/api/github', githubRoutes);
app.use('/webhook', webhookRoutes);

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

// ── Presence tracking ─────────────────────────────────────────────────────────
// Single-process in-memory map of socket.id → user + room. Cleared on disconnect
// to prevent leaks. (Not horizontally scalable — Phase N would back this with
// Redis adapter + presence store.)
interface TrackedUser extends ActiveUser {
  roomId: string;
}
const socketUserMap = new Map<string, TrackedUser>();

function activeUsersInRoom(roomId: string): ActiveUser[] {
  const users: ActiveUser[] = [];
  for (const tracked of socketUserMap.values()) {
    if (tracked.roomId === roomId) {
      // Strip roomId before broadcasting — clients don't need it.
      const { socketId, userId, name, avatarUrl } = tracked;
      users.push({ socketId, userId, name, avatarUrl });
    }
  }
  return users;
}

io.on('connection', (socket) => {
  console.log(`[socket] connected   id=${socket.id}`);

  socket.on('JOIN_WORKSPACE', (workspaceId, user) => {
    void socket.join(workspaceId);
    socket.data.workspaceId = workspaceId;
    socketUserMap.set(socket.id, {
      socketId: socket.id,
      userId: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      roomId: workspaceId,
    });

    console.log(`[socket] id=${socket.id} (${user.name}) joined workspace=${workspaceId}`);

    // Notify everyone in the room — including the joiner — of the full active list.
    io.to(workspaceId).emit('ACTIVE_USERS', activeUsersInRoom(workspaceId));

    // Legacy event kept for any listeners still relying on it.
    socket.to(workspaceId).emit('USER_JOINED', { userId: user.id, workspaceId });
  });

  socket.on('CODE_CHANGE', ({ workspaceId, content }) => {
    // Relay to everyone in the room except the sender
    socket.to(workspaceId).emit('CODE_CHANGE', { content });
  });

  socket.on('CURSOR_MOVE', ({ workspaceId, cursor, userId, userName }) => {
    socket.to(workspaceId).emit('CURSOR_MOVE', { cursor, userId, userName });
  });

  socket.on('disconnect', (reason) => {
    const tracked = socketUserMap.get(socket.id);
    if (tracked) {
      const { roomId } = tracked;
      socketUserMap.delete(socket.id);
      io.to(roomId).emit('ACTIVE_USERS', activeUsersInRoom(roomId));
    }
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

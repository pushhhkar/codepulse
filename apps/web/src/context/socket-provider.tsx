'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@codepulse/types';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface SocketContextValue {
  socket: AppSocket | null;
  status: ConnectionStatus;
}

const SocketContext = createContext<SocketContextValue | null>(null);

const SERVER_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:5000';

export function SocketProvider({ children }: { children: ReactNode }) {
  // Keep socket instance in state so consumers re-render when it's ready.
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    const s: AppSocket = io(SERVER_URL, {
      withCredentials: true, // forwards the httpOnly auth cookie
      transports: ['websocket', 'polling'],
    });

    setSocket(s);

    s.on('connect', () => setStatus('connected'));
    s.on('disconnect', () => setStatus('disconnected'));
    s.on('connect_error', () => setStatus('disconnected'));

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, status }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket must be used inside <SocketProvider>');
  }
  return ctx;
}

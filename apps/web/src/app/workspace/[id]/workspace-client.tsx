'use client';

import { useEffect } from 'react';
import { useSocket } from '@/context/socket-provider';
import CollaborativeEditor from '@/components/collaborative-editor';

interface WorkspaceClientProps {
  workspaceId: string;
}

export default function WorkspaceClient({ workspaceId }: WorkspaceClientProps) {
  const { socket, status } = useSocket();

  // Emit JOIN_WORKSPACE once the socket is connected and we have the id.
  useEffect(() => {
    if (!socket || status !== 'connected') return;

    socket.emit('JOIN_WORKSPACE', { workspaceId });
  }, [socket, status, workspaceId]);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Connection status badge */}
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            status === 'connected'
              ? 'bg-green-400'
              : status === 'connecting'
                ? 'animate-pulse bg-yellow-400'
                : 'bg-red-500'
          }`}
        />
        <span className="text-xs capitalize text-slate-400">{status}</span>
      </div>

      {/* Editor fills the remaining height */}
      <div className="flex-1">
        <CollaborativeEditor workspaceId={workspaceId} />
      </div>
    </div>
  );
}

// Typed Socket.io event maps shared between server and client.
// Both sides import from here so the event names and payloads can never drift.

export interface JoinWorkspacePayload {
  workspaceId: string;
}

// Events the CLIENT emits → SERVER listens
export interface ClientToServerEvents {
  JOIN_WORKSPACE: (payload: JoinWorkspacePayload) => void;
}

// Events the SERVER emits → CLIENT listens
export interface ServerToClientEvents {
  // Placeholder — Phase 2B will add CONTENT_UPDATE etc.
  USER_JOINED: (payload: { userId: string; workspaceId: string }) => void;
}

// Per-socket server-side data (attached to socket.data)
export interface SocketData {
  workspaceId?: string;
}

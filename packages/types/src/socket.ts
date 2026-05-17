// Typed Socket.io event maps shared between server and client.
// Both sides import from here so the event names and payloads can never drift.

export interface JoinWorkspacePayload {
  workspaceId: string;
}

export interface CursorPosition {
  lineNumber: number;
  column: number;
}

// Events the CLIENT emits → SERVER listens
export interface ClientToServerEvents {
  JOIN_WORKSPACE: (payload: JoinWorkspacePayload) => void;
  CODE_CHANGE: (data: { workspaceId: string; content: string }) => void;
  CURSOR_MOVE: (data: {
    workspaceId: string;
    cursor: CursorPosition;
    userId: string;
    userName: string;
  }) => void;
}

// Events the SERVER emits → CLIENT listens
export interface ServerToClientEvents {
  USER_JOINED: (payload: { userId: string; workspaceId: string }) => void;
  CODE_CHANGE: (data: { content: string }) => void;
  CURSOR_MOVE: (data: {
    cursor: CursorPosition;
    userId: string;
    userName: string;
  }) => void;
}

// Per-socket server-side data (attached to socket.data)
export interface SocketData {
  workspaceId?: string;
}

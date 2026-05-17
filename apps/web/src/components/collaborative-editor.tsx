'use client';

import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor';
import type { ClientToServerEvents, ServerToClientEvents } from '@codepulse/types';
import type { Socket } from 'socket.io-client';

const DEFAULT_VALUE = `console.log('Hello CodePulse');`;

const CURSOR_COLOURS = [
  '#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4',
];

function colourForUser(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CURSOR_COLOURS[Math.abs(hash) % CURSOR_COLOURS.length] ?? '#f59e0b';
}

function injectUserCursorStyle(uid: string, colour: string, name: string): void {
  const safeId = uid.replace(/[^a-z0-9]/gi, '_');
  const styleId = `ghost-cursor-style-${safeId}`;
  if (document.getElementById(styleId)) return;

  const safeName = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .ghost-cursor--${safeId} {
      border-left: 2px solid ${colour};
      position: relative;
    }
    .ghost-cursor--${safeId}::after {
      content: "${safeName}";
      position: absolute;
      top: -1.25rem;
      left: 0;
      background: ${colour};
      color: #000;
      font-size: 0.65rem;
      font-weight: 600;
      padding: 1px 4px;
      border-radius: 3px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 100;
    }
  `;
  document.head.appendChild(style);
}

interface RemoteCursor {
  userId: string;
  userName: string;
  lineNumber: number;
  column: number;
  colour: string;
}

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface CollaborativeEditorProps {
  workspaceId: string;
  language?: string;
  socket: AppSocket | null;
  userId: string;
  userName: string;
}

export default function CollaborativeEditor({
  workspaceId,
  language = 'javascript',
  socket,
  userId,
  userName,
}: CollaborativeEditorProps) {
  // State so changes trigger the socket-listener effect below.
  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [monaco, setMonaco] = useState<typeof Monaco | null>(null);

  // Guards against: local change → emit → receive → onChange → emit…
  const isRemoteUpdate = useRef(false);

  // Decoration collection for ghost cursors (replaces deprecated deltaDecorations).
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  // Latest known remote cursor positions, keyed by userId.
  const remoteCursorsRef = useRef<Map<string, RemoteCursor>>(new Map());

  // ── Redraw all ghost-cursor decorations ───────────────────────────────────
  function applyDecorations(
    ed: Monaco.editor.IStandaloneCodeEditor,
    mc: typeof Monaco,
  ): void {
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

    for (const rc of remoteCursorsRef.current.values()) {
      injectUserCursorStyle(rc.userId, rc.colour, rc.userName);
      const safeId = rc.userId.replace(/[^a-z0-9]/gi, '_');

      decorations.push({
        range: new mc.Range(rc.lineNumber, rc.column, rc.lineNumber, rc.column),
        options: {
          className: `ghost-cursor ghost-cursor--${safeId}`,
          stickiness: mc.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    }

    if (decorationsRef.current) {
      decorationsRef.current.set(decorations);
    } else {
      decorationsRef.current = ed.createDecorationsCollection(decorations);
    }
  }

  // ── Socket listeners — re-registered when socket or editor change ─────────
  useEffect(() => {
    if (!socket || !editor || !monaco) return;

    // Capture as non-nullable consts so TypeScript narrows them inside closures.
    const ed = editor;
    const mc = monaco;

    function onCodeChange({ content }: { content: string }): void {
      const model = ed.getModel();
      if (!model) return;

      const savedPosition = ed.getPosition();
      const savedSelections = ed.getSelections();

      isRemoteUpdate.current = true;

      // applyEdits keeps undo history intact and does not reset the viewport,
      // unlike setValue() which scrolls to top and resets cursor.
      model.applyEdits([{ range: model.getFullModelRange(), text: content }]);

      // queueMicrotask runs after the model-change event propagates but before
      // the next paint — tighter than setTimeout(0), sufficient to clear the flag.
      queueMicrotask(() => {
        if (savedPosition) ed.setPosition(savedPosition);
        if (savedSelections) ed.setSelections(savedSelections);
        isRemoteUpdate.current = false;
      });
    }

    function onCursorMove({
      cursor,
      userId: remoteUserId,
      userName: remoteUserName,
    }: {
      cursor: { lineNumber: number; column: number };
      userId: string;
      userName: string;
    }): void {
      remoteCursorsRef.current.set(remoteUserId, {
        userId: remoteUserId,
        userName: remoteUserName,
        lineNumber: cursor.lineNumber,
        column: cursor.column,
        colour: colourForUser(remoteUserId),
      });
      applyDecorations(ed, mc);
    }

    socket.on('CODE_CHANGE', onCodeChange);
    socket.on('CURSOR_MOVE', onCursorMove);

    return () => {
      socket.off('CODE_CHANGE', onCodeChange);
      socket.off('CURSOR_MOVE', onCursorMove);
    };
  }, [socket, editor, monaco]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Monaco mount ──────────────────────────────────────────────────────────
  const handleMount: OnMount = (ed, mc) => {
    setEditor(ed);
    setMonaco(mc);
    ed.focus();

    ed.onDidChangeModelContent(() => {
      if (isRemoteUpdate.current) return;
      socket?.emit('CODE_CHANGE', { workspaceId, content: ed.getValue() });
    });

    ed.onDidChangeCursorPosition((e) => {
      if (isRemoteUpdate.current) return;
      socket?.emit('CURSOR_MOVE', {
        workspaceId,
        cursor: { lineNumber: e.position.lineNumber, column: e.position.column },
        userId,
        userName,
      });
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-surface-600 bg-surface-800">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-surface-600 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="h-3 w-3 rounded-full bg-yellow-400" />
          <span className="h-3 w-3 rounded-full bg-green-500" />
        </div>
        <span className="font-mono text-xs text-slate-500">
          workspace:{workspaceId} &middot; {language}
        </span>
        <span className="w-16" />
      </div>

      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage={language}
          defaultValue={DEFAULT_VALUE}
          theme="vs-dark"
          onMount={handleMount}
          options={{
            fontSize: 14,
            fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            renderLineHighlight: 'gutter',
            padding: { top: 16, bottom: 16 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            readOnly: false,
          }}
        />
      </div>
    </div>
  );
}

'use client';

import Editor, { type OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor';
import Image from 'next/image';
import type {
  ActiveUser,
  ClientToServerEvents,
  ServerToClientEvents,
  Workspace,
} from '@codepulse/types';
import type { Socket } from 'socket.io-client';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:5000';
const AUTOSAVE_DELAY_MS = 1000;

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
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface WorkspaceData {
  code: string;
  language: string;
}

interface WorkspaceApiResponse {
  workspace: Workspace;
}

// Numeric severities match Monaco's MarkerSeverity: 1=Hint, 2=Info, 4=Warning, 8=Error.
interface AiReviewComment {
  line: number;
  message: string;
  severity: 1 | 2 | 4 | 8;
}

interface AiReviewResult {
  detectedLanguage: string;
  comments: AiReviewComment[];
}

export interface CollaborativeEditorProps {
  workspaceId: string;
  socket: AppSocket | null;
  userId: string;
  userName: string;
}

export default function CollaborativeEditor({
  workspaceId,
  socket,
  userId,
  userName,
}: CollaborativeEditorProps) {
  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [monaco, setMonaco] = useState<typeof Monaco | null>(null);

  // Imperative handles — survive re-renders and avoid stale-closure / state-timing
  // issues when applying markers from inside async callbacks.
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  // Hydration state
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState(false);

  // Editor language — seeded from hydration, then mutable via AI auto-detect.
  const [language, setLanguage] = useState('javascript');

  // AI review state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeFailed, setAnalyzeFailed] = useState(false);
  const [editorEmpty, setEditorEmpty] = useState(false);

  // Multiplayer presence — broadcast by the server on JOIN_WORKSPACE / disconnect.
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);

  // Save status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guards against: local change → emit → receive → onChange → emit…
  const isRemoteUpdate = useRef(false);

  // Decoration collection for ghost cursors
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const remoteCursorsRef = useRef<Map<string, RemoteCursor>>(new Map());

  // ── Hydrate on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function hydrate(): Promise<void> {
      try {
        const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}`, {
          credentials: 'include',
          cache: 'no-store',
        });

        if (!res.ok) {
          if (!cancelled) setHydrationError(true);
          return;
        }

        const { workspace } = (await res.json()) as WorkspaceApiResponse;
        if (!cancelled) {
          setWorkspaceData({ code: workspace.code, language: workspace.language });
          setLanguage(workspace.language || 'javascript');
        }
      } catch {
        if (!cancelled) setHydrationError(true);
      } finally {
        if (!cancelled) setIsHydrating(false);
      }
    }

    void hydrate();
    return () => { cancelled = true; };
  }, [workspaceId]);

  // ── Auto-save (debounced) ──────────────────────────────────────────────────
  const scheduleAutoSave = useCallback((code: string): void => {
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);

    setSaveStatus('saving');

    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code }),
          });

          setSaveStatus(res.ok ? 'saved' : 'error');
        } catch {
          setSaveStatus('error');
        }
      })();
    }, AUTOSAVE_DELAY_MS);
  }, [workspaceId]);

  // ── AI review ──────────────────────────────────────────────────────────────
  const flagAnalyzeFailure = useCallback((): void => {
    setAnalyzeFailed(true);
    setTimeout(() => setAnalyzeFailed(false), 2000);
  }, []);

  const flagEditorEmpty = useCallback((): void => {
    setEditorEmpty(true);
    setTimeout(() => setEditorEmpty(false), 2000);
  }, []);

  const handleAnalyze = useCallback(async (): Promise<void> => {
    const ed = editorRef.current;
    const mc = monacoRef.current;
    if (!ed || !mc || isAnalyzing) return;

    const model = ed.getModel();
    if (!model) return;

    // Early exit on empty/whitespace-only code — never start the spinner,
    // never hit the network (the server would just 400 on empty code).
    const code = ed.getValue();
    if (!code.trim()) {
      flagEditorEmpty();
      return;
    }

    setIsAnalyzing(true);
    setAnalyzeFailed(false);
    try {
      const res = await fetch(`${API_URL}/api/ai/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          workspaceId,
          // The server only accepts 'javascript' | 'cpp' as the hint; the AI
          // returns the *actual* detected language in the response body.
          language: language === 'cpp' ? 'cpp' : 'javascript',
          code,
        }),
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        console.error(`[ai-review] ${res.status} ${res.statusText} —`, bodyText);
        flagAnalyzeFailure();
        return;
      }

      const result = (await res.json()) as AiReviewResult;

      const lineCount = model.getLineCount();

      // Map AI comments → Monaco IMarkerData. Clamp every line into the model's
      // valid range — Monaco silently discards markers whose range is invalid,
      // which is the most common reason "squiggles don't appear".
      const markers: Monaco.editor.IMarkerData[] = result.comments.map((c) => {
        const line = Math.min(Math.max(Math.floor(c.line), 1), lineCount);
        return {
          severity: c.severity,
          message: c.message,
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: model.getLineMaxColumn(line) || 100,
        };
      });

      mc.editor.setModelMarkers(model, 'ai-review', markers);

      // Auto-language detection: update UI + Monaco model, persist in background.
      const detected = result.detectedLanguage;
      if (detected && detected !== language) {
        setLanguage(detected);
        mc.editor.setModelLanguage(model, detected);

        void fetch(`${API_URL}/api/workspaces/${workspaceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ language: detected }),
        }).catch((err: unknown) => {
          console.error('[ai-review] Failed to persist detected language:', err);
        });
      }
    } catch (err) {
      console.error('[ai-review] Network error:', err);
      flagAnalyzeFailure();
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing, workspaceId, language, flagAnalyzeFailure, flagEditorEmpty]);

  // ── Redraw ghost-cursor decorations ───────────────────────────────────────
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

  // ── Socket listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !editor || !monaco) return;

    const ed = editor;
    const mc = monaco;

    function onCodeChange({ content }: { content: string }): void {
      const model = ed.getModel();
      if (!model) return;

      const savedPosition = ed.getPosition();
      const savedSelections = ed.getSelections();

      isRemoteUpdate.current = true;
      model.applyEdits([{ range: model.getFullModelRange(), text: content }]);

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

    function onActiveUsers(users: ActiveUser[]): void {
      setActiveUsers(users);
    }

    socket.on('CODE_CHANGE', onCodeChange);
    socket.on('CURSOR_MOVE', onCursorMove);
    socket.on('ACTIVE_USERS', onActiveUsers);

    return () => {
      socket.off('CODE_CHANGE', onCodeChange);
      socket.off('CURSOR_MOVE', onCursorMove);
      socket.off('ACTIVE_USERS', onActiveUsers);
    };
  }, [socket, editor, monaco]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Monaco mount ──────────────────────────────────────────────────────────
  const handleMount: OnMount = (ed, mc) => {
    editorRef.current = ed;
    monacoRef.current = mc;
    setEditor(ed);
    setMonaco(mc);
    ed.focus();

    ed.onDidChangeModelContent(() => {
      if (isRemoteUpdate.current) return;
      const content = ed.getValue();
      socket?.emit('CODE_CHANGE', { workspaceId, content });
      scheduleAutoSave(content);
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

  // ── Loading / error states ─────────────────────────────────────────────────
  if (isHydrating) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-surface-600 bg-surface-800">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-8 w-8 animate-spin text-brand-400"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="animate-pulse text-sm text-slate-400">Loading workspace…</span>
        </div>
      </div>
    );
  }

  if (hydrationError || !workspaceData) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-red-500/30 bg-surface-800">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-sm font-medium text-red-400">Failed to load workspace</span>
          <span className="text-xs text-slate-500">Check your connection and refresh the page.</span>
        </div>
      </div>
    );
  }

  const initialCode = workspaceData.code;

  // ── Save status chip ───────────────────────────────────────────────────────
  const saveChip = {
    saving: (
      <span className="flex items-center gap-1.5 rounded-md border border-slate-600/40 bg-slate-700/20 px-2 py-1 text-xs text-slate-400">
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Saving…
      </span>
    ),
    saved: (
      <span className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        Saved
      </span>
    ),
    error: (
      <span className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-400">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
        Save failed
      </span>
    ),
    idle: null,
  }[saveStatus];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-surface-600 bg-surface-800">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-surface-600 px-4 py-2">
        {/* macOS traffic lights */}
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="h-3 w-3 rounded-full bg-yellow-400" />
          <span className="h-3 w-3 rounded-full bg-green-500" />
        </div>

        {/* Workspace label */}
        <span className="font-mono text-xs text-slate-500">
          workspace:{workspaceId} &middot; {language}
        </span>

        {/* Right cluster: presence avatars + save chip + AI button */}
        <div className="flex items-center gap-3">
          {/* Active users — Google Docs–style overlapping stack */}
          {activeUsers.length > 0 && (
            <div className="flex items-center -space-x-2 overflow-hidden mr-4">
              {activeUsers.map((user) => (
                <span
                  key={user.socketId}
                  title={user.name}
                  className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-surface-600 bg-surface-700 ring-2 ring-surface-900"
                >
                  {user.avatarUrl ? (
                    <Image
                      src={user.avatarUrl}
                      alt={user.name}
                      width={32}
                      height={32}
                      className="h-full w-full rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="text-xs font-semibold uppercase text-slate-300">
                      {user.name.charAt(0) || '?'}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}

          <div className="flex w-28 items-center justify-end">
            {saveChip}
          </div>

          <button
            onClick={() => void handleAnalyze()}
            disabled={isAnalyzing}
            className={`
              flex items-center gap-2 rounded px-3 py-1.5 text-xs
              backdrop-blur-sm transition-all duration-200
              disabled:cursor-not-allowed disabled:opacity-50
              ${
                analyzeFailed
                  ? 'border border-red-500/40 bg-red-600/10 text-red-400'
                  : editorEmpty
                    ? 'border border-yellow-500/40 bg-yellow-600/10 text-yellow-400'
                    : `border border-brand-500/40 bg-brand-600/10 text-brand-400
                       hover:bg-brand-600/20 hover:border-brand-500/60
                       hover:shadow-[0_0_12px_rgba(99,102,241,0.4)]
                       disabled:hover:shadow-none disabled:hover:bg-brand-600/10`
              }
            `}
          >
            {isAnalyzing ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin text-brand-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="animate-pulse">Analyzing…</span>
              </>
            ) : analyzeFailed ? (
              <>
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                Failed!
              </>
            ) : editorEmpty ? (
              <>
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
                Editor is empty!
              </>
            ) : (
              <>
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1m0-12.8l-2.1 2.1m-8.6 8.6l-2.1 2.1" />
                </svg>
                Analyze with AI
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          defaultValue={initialCode}
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

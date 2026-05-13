'use client';

import Editor, { type OnMount } from '@monaco-editor/react';
import { useRef } from 'react';
import type * as Monaco from 'monaco-editor';

const DEFAULT_VALUE = `console.log('Hello CodePulse');`;

interface CollaborativeEditorProps {
  workspaceId: string;
  language?: string;
}

export default function CollaborativeEditor({
  workspaceId,
  language = 'javascript',
}: CollaborativeEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    // Auto-focus the editor on mount so the user can type immediately.
    editor.focus();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-surface-600 bg-surface-800">
      {/* Editor toolbar */}
      <div className="flex items-center justify-between border-b border-surface-600 px-4 py-2">
        <div className="flex items-center gap-2">
          {/* macOS-style traffic lights */}
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="h-3 w-3 rounded-full bg-yellow-400" />
          <span className="h-3 w-3 rounded-full bg-green-500" />
        </div>
        <span className="font-mono text-xs text-slate-500">
          workspace:{workspaceId} &middot; {language}
        </span>
        <span className="w-16" />
      </div>

      {/* Monaco editor */}
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
            // Phase 2B will flip readOnly off once syncing is wired up
            readOnly: false,
          }}
        />
      </div>
    </div>
  );
}

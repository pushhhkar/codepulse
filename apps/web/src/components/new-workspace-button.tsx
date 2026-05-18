'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface CreateWorkspaceResponse {
  success: true;
  workspaceId: string;
}

interface CreateWorkspaceError {
  error: string;
}

type CreateWorkspaceResult = CreateWorkspaceResponse | CreateWorkspaceError;

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:5000';

export default function NewWorkspaceButton() {
  const router = useRouter();
  const [isInputMode, setIsInputMode] = useState(false);
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  function exitInputMode(): void {
    setIsInputMode(false);
    setTitle('');
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (isCreating) return;

    setIsCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: title.trim() }),
      });

      const data = (await res.json()) as CreateWorkspaceResult;

      if (!res.ok || !('workspaceId' in data)) {
        const message = 'error' in data ? data.error : 'Unexpected response shape';
        console.error(`[new-workspace] ${res.status} ${res.statusText} —`, message, data);
        return;
      }

      router.push(`/workspace/${data.workspaceId}`);
    } catch (err) {
      console.error('[new-workspace] Network error:', err);
    } finally {
      setIsCreating(false);
    }
  }

  if (!isInputMode) {
    return (
      <button
        onClick={() => setIsInputMode(true)}
        className="
          flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
          border border-brand-500/40 bg-brand-600/10 text-brand-400
          backdrop-blur-sm
          hover:bg-brand-600/20 hover:border-brand-500/60
          hover:shadow-[0_0_12px_rgba(99,102,241,0.4)]
          transition-all duration-200
        "
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        New Workspace
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="
        flex items-center gap-1.5 rounded-lg px-1.5 py-1
        border border-brand-500/40 bg-brand-600/10 backdrop-blur-sm
        focus-within:border-brand-500/60
        focus-within:shadow-[0_0_12px_rgba(99,102,241,0.4)]
        transition-all duration-200
      "
    >
      <input
        type="text"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') exitInputMode();
        }}
        placeholder="Workspace name…"
        disabled={isCreating}
        maxLength={120}
        className="
          w-52 bg-transparent px-2 py-1 text-sm text-white
          placeholder:text-slate-500 focus:outline-none
          disabled:opacity-50
        "
      />

      <button
        type="submit"
        disabled={isCreating}
        aria-label="Create workspace"
        className="
          flex h-7 w-7 items-center justify-center rounded-md
          text-brand-400
          hover:bg-brand-600/20
          transition-all duration-200
          disabled:cursor-not-allowed disabled:opacity-50
        "
      >
        {isCreating ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </button>

      <button
        type="button"
        onClick={exitInputMode}
        disabled={isCreating}
        aria-label="Cancel"
        className="
          flex h-7 w-7 items-center justify-center rounded-md
          text-slate-400
          hover:bg-red-500/10 hover:text-red-400
          transition-all duration-200
          disabled:cursor-not-allowed disabled:opacity-50
        "
      >
        <svg
          className="h-4 w-4"
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
      </button>
    </form>
  );
}

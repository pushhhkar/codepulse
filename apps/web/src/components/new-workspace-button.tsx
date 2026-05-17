'use client';

import { useState } from 'react';
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
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreateWorkspace() {
    setIsCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
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

  return (
    <button
      onClick={() => void handleCreateWorkspace()}
      disabled={isCreating}
      className="
        flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
        border border-brand-500/40 bg-brand-600/10 text-brand-400
        backdrop-blur-sm
        hover:bg-brand-600/20 hover:border-brand-500/60
        hover:shadow-[0_0_12px_rgba(99,102,241,0.4)]
        transition-all duration-200
        disabled:cursor-not-allowed disabled:opacity-50
        disabled:hover:shadow-none disabled:hover:bg-brand-600/10
      "
    >
      {isCreating ? (
        <>
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="animate-pulse">Creating...</span>
        </>
      ) : (
        <>
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
        </>
      )}
    </button>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:5000';

interface DeleteWorkspaceButtonProps {
  workspaceId: string;
}

export default function DeleteWorkspaceButton({ workspaceId }: DeleteWorkspaceButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete(): Promise<void> {
    if (isDeleting) return;
    if (!window.confirm('Delete this workspace? This cannot be undone.')) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        console.error(`[delete-workspace] ${res.status} ${res.statusText}`);
        return;
      }

      router.refresh();
    } catch (err) {
      console.error('[delete-workspace] Network error:', err);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleDelete()}
      disabled={isDeleting}
      aria-label="Delete workspace"
      className="
        flex h-7 w-7 items-center justify-center rounded-md
        text-surface-400 opacity-0
        transition-all duration-200 group-hover:opacity-100
        hover:bg-red-500/10 hover:text-red-400
        disabled:cursor-not-allowed disabled:opacity-50
      "
    >
      {isDeleting ? (
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
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      )}
    </button>
  );
}

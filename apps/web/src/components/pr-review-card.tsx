'use client';

import { useState, type FormEvent } from 'react';

type ReviewStatus = 'idle' | 'success' | 'error';

interface PrReviewSuccess {
  success: true;
  commentCount: number;
}

interface PrReviewError {
  error: string;
}

type PrReviewResult = PrReviewSuccess | PrReviewError;

export default function PrReviewCard() {
  const [prUrl, setPrUrl] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [status, setStatus] = useState<ReviewStatus>('idle');
  const [message, setMessage] = useState('');

  async function handlePrReview(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (isReviewing || prUrl.trim().length === 0) return;

    setIsReviewing(true);
    setStatus('idle');
    setMessage('');

    try {
      const res = await fetch('/api/ai/review-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prUrl: prUrl.trim() }),
      });

      const data = (await res.json().catch(() => ({}))) as Partial<PrReviewResult>;

      if (!res.ok || !('success' in data)) {
        const errMsg =
          'error' in data && typeof data.error === 'string'
            ? data.error
            : `Review failed (${res.status}). Please try again.`;
        setStatus('error');
        setMessage(errMsg);
        return;
      }

      const count = 'commentCount' in data ? data.commentCount : 0;
      setStatus('success');
      setMessage(
        count > 0
          ? `Review posted successfully — ${count} comment${count === 1 ? '' : 's'} added. Check your PR on GitHub.`
          : 'Review posted successfully! No issues found. Check your PR on GitHub.',
      );
      setPrUrl('');
    } catch {
      setStatus('error');
      setMessage('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsReviewing(false);
    }
  }

  return (
    <section className="rounded-xl border border-surface-600 bg-surface-800 p-6 shadow-xl backdrop-blur-sm">
      {/* Header */}
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-500/40 bg-brand-600/10 text-brand-400">
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <path d="M6 21V9a9 9 0 0 0 9 9" />
          </svg>
        </span>
        <div>
          <h2 className="text-lg font-semibold text-white">Automated Code Review</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Paste a GitHub Pull Request URL and CodePulse posts inline AI review comments
            directly to the PR.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={(e) => void handlePrReview(e)} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          disabled={isReviewing}
          placeholder="https://github.com/owner/repo/pull/123"
          className="flex-1 rounded border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={isReviewing || prUrl.trim().length === 0}
          className="
            flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium
            border border-brand-500/40 bg-brand-600/10 text-brand-400
            backdrop-blur-sm transition-all duration-200
            hover:bg-brand-600/20 hover:border-brand-500/60
            hover:shadow-[0_0_12px_rgba(99,102,241,0.4)]
            disabled:cursor-not-allowed disabled:opacity-50
            disabled:hover:shadow-none disabled:hover:bg-brand-600/10
          "
        >
          {isReviewing ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="animate-pulse">Analyzing PR…</span>
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
                <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1m0-12.8l-2.1 2.1m-8.6 8.6l-2.1 2.1" />
              </svg>
              Review PR
            </>
          )}
        </button>
      </form>

      {/* Feedback banner */}
      {status === 'success' && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
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
          <span>{message}</span>
        </div>
      )}

      {status === 'error' && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          <span>{message}</span>
        </div>
      )}
    </section>
  );
}

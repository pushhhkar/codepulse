import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { getServerUser } from '@/lib/auth';
import NewWorkspaceButton from '@/components/new-workspace-button';
import DeleteWorkspaceButton from '@/components/delete-workspace-button';
import PrReviewCard from '@/components/pr-review-card';
import type { Workspace } from '@codepulse/types';

export const metadata: Metadata = {
  title: 'Dashboard',
};

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:5000';

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Updated just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Updated ${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Updated ${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `Updated ${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

const LANGUAGE_COLOURS: Record<string, string> = {
  javascript: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400',
  typescript: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
  cpp: 'border-purple-500/40 bg-purple-500/10 text-purple-400',
  python: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
};

function languageBadgeClass(language: string): string {
  return LANGUAGE_COLOURS[language] ?? 'border-slate-500/40 bg-slate-500/10 text-slate-400';
}

async function fetchWorkspaces(token: string): Promise<Workspace[]> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces`, {
      headers: { Cookie: `token=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { workspaces: Workspace[] };
    return data.workspaces;
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const user = await getServerUser();

  if (!user) {
    redirect('/');
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value ?? '';
  const workspaces = await fetchWorkspaces(token);

  return (
    <main className="flex min-h-screen flex-col bg-surface-900">
      {/* Top nav */}
      <header className="border-b border-surface-700 bg-surface-800 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              CP
            </span>
            <span className="font-semibold text-white">CodePulse</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">{user.email}</span>
            <Image
              src={user.avatarUrl}
              alt={`${user.name}'s avatar`}
              width={32}
              height={32}
              className="rounded-full ring-2 ring-brand-500"
            />
          </div>
        </div>
      </header>

      {/* Dashboard body */}
      <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-12">
        {/* Welcome banner */}
        <section className="rounded-2xl border border-surface-700 bg-surface-800 p-8">
          <div className="flex items-center gap-5">
            <Image
              src={user.avatarUrl}
              alt={`${user.name}'s avatar`}
              width={64}
              height={64}
              className="rounded-2xl ring-2 ring-brand-500"
            />
            <div>
              <p className="text-sm text-slate-400">Signed in as</p>
              <h1 className="text-3xl font-bold text-white">{user.name}</h1>
            </div>
          </div>
        </section>

        {/* Automated PR reviewer */}
        <div className="mt-10">
          <PrReviewCard />
        </div>

        {/* Workspaces grid */}
        <section className="mt-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Your Workspaces</h2>
            <NewWorkspaceButton />
          </div>

          {workspaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-600 py-20 text-center">
              <span className="mb-3 text-4xl">🚀</span>
              <p className="font-medium text-slate-300">No workspaces yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Hit &ldquo;New Workspace&rdquo; to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="group relative flex flex-col rounded-xl border border-surface-600 bg-surface-800 transition-all duration-200 hover:border-brand-500/50 hover:shadow-[0_0_24px_rgba(99,102,241,0.15)]"
                >
                  {/* Clickable overlay — stretches across the whole card */}
                  <Link
                    href={`/workspace/${ws.id}`}
                    aria-label={`Open workspace ${ws.title}`}
                    className="absolute inset-0 z-0 rounded-xl"
                  />

                  {/* Delete button — sits above the link overlay */}
                  <div className="absolute right-3 top-3 z-10">
                    <DeleteWorkspaceButton workspaceId={ws.id} />
                  </div>

                  {/* Card content — does not block the link click */}
                  <div className="pointer-events-none relative z-[1] flex flex-col">
                    {/* Card header — pr-12 clears the absolute delete button */}
                    <div className="flex items-start justify-between gap-3 px-4 pr-12 pt-4">
                      <h3 className="truncate font-medium text-white transition-colors duration-200 group-hover:text-brand-300">
                        {ws.title}
                      </h3>
                      <span
                        className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-xs ${languageBadgeClass(ws.language)}`}
                      >
                        {ws.language}
                      </span>
                    </div>

                    {/* Code preview */}
                    <div className="mx-4 mt-3 overflow-hidden rounded-lg border border-surface-700 bg-[#0d1117]">
                      <pre className="line-clamp-3 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-400 [overflow-wrap:anywhere]">
                        {(ws.code ?? '').trim() || <span className="italic text-slate-600">Empty workspace</span>}
                      </pre>
                    </div>

                    {/* Timestamp */}
                    <div className="px-4 pb-4 pt-3">
                      <span className="text-xs text-slate-500">
                        {formatRelativeTime(new Date(ws.updatedAt))}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

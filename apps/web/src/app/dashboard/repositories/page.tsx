import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import IntegrationStatusCard from '@/components/integration-status-card';

export const metadata: Metadata = {
  title: 'Repositories',
};

const APP_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000';

interface InstallationRepo {
  id: number;
  name: string;
  fullName: string;
  isPrivate: boolean;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  updatedAt: string | null;
}

async function fetchRepositories(): Promise<InstallationRepo[]> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return [];

    const res = await fetch(new URL('/api/github/repositories', APP_URL).toString(), {
      headers: { Cookie: `token=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { repositories?: InstallationRepo[] };
    return data.repositories ?? [];
  } catch {
    return [];
  }
}

function formatUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffDay < 1) return 'Updated today';
  if (diffDay === 1) return 'Updated yesterday';
  if (diffDay < 30) return `Updated ${diffDay} days ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `Updated ${diffMonth} month${diffMonth === 1 ? '' : 's'} ago`;
}

export default async function RepositoriesPage() {
  const repositories = await fetchRepositories();

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Repositories</h1>
        <p className="mt-1 text-sm text-slate-500">
          Repositories where the CodePulse GitHub App is installed.
        </p>
      </div>

      <IntegrationStatusCard />

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Connected repositories</h2>
          {repositories.length > 0 ? (
            <span className="rounded-full border border-surface-600 bg-surface-800 px-3 py-1 text-xs font-medium text-slate-400">
              {repositories.length} {repositories.length === 1 ? 'repo' : 'repos'}
            </span>
          ) : null}
        </div>

        {repositories.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-600 py-20 text-center">
            <span className="mb-3 text-4xl">📦</span>
            <p className="font-medium text-slate-300">No repositories connected yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Use &ldquo;Manage repositories&rdquo; above to grant CodePulse access.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {repositories.map((repo) => {
              const updated = formatUpdated(repo.updatedAt);
              return (
                <li key={repo.id}>
                  <a
                    href={repo.htmlUrl}
                    rel="noreferrer"
                    className="group flex items-start justify-between gap-4 rounded-xl border border-surface-600 bg-surface-800 px-5 py-4 transition-all duration-150 hover:border-brand-500/50 hover:shadow-[0_0_24px_rgba(99,102,241,0.12)]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="truncate font-medium text-white transition-colors group-hover:text-brand-300">
                          {repo.fullName}
                        </span>
                        <span
                          className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                            repo.isPrivate
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          }`}
                        >
                          {repo.isPrivate ? 'Private' : 'Public'}
                        </span>
                      </div>
                      {repo.description ? (
                        <p className="mt-1 truncate text-sm text-slate-500">{repo.description}</p>
                      ) : null}
                      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                        {repo.language ? (
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-brand-400" />
                            {repo.language}
                          </span>
                        ) : null}
                        {updated ? <span>{updated}</span> : null}
                      </div>
                    </div>
                    <span className="mt-1 shrink-0 text-slate-600 transition-colors group-hover:text-brand-400">
                      ↗
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

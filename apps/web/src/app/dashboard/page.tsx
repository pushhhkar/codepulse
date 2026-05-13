import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { getServerUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default async function DashboardPage() {
  const user = await getServerUser();

  if (!user) {
    redirect('/');
  }

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

        {/* Placeholder workspaces grid */}
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Your Workspaces</h2>
            <button
              disabled
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white opacity-50 cursor-not-allowed"
            >
              + New Workspace
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Empty state */}
            <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-600 py-16 text-center">
              <span className="mb-3 text-4xl">🚀</span>
              <p className="font-medium text-slate-300">No workspaces yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Workspaces will appear here once you create them.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Image from 'next/image';
import { getServerUser } from '@/lib/auth';
import PrReviewCard from '@/components/pr-review-card';
import IntegrationStatusCard from '@/components/integration-status-card';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default async function DashboardPage() {
  const user = await getServerUser();

  if (!user) {
    redirect('/');
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-10">
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your GitHub integration and AI code reviews.
        </p>
      </div>

      {/* Dashboard body */}
      <div className="w-full">
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
              <p className="text-3xl font-bold text-white">{user.name}</p>
            </div>
          </div>
        </section>

        {/* GitHub App integration */}
        <div className="mt-10">
          <IntegrationStatusCard />
        </div>

        {/* Automated PR reviewer */}
        <div className="mt-10">
          <PrReviewCard />
        </div>
      </div>
    </main>
  );
}
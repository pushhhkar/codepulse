import type { Metadata } from 'next';
import Image from 'next/image';
import { getServerUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Settings',
};

export default async function SettingsPage() {
  // The dashboard layout already guards auth; this is non-null in practice.
  const user = await getServerUser();

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Your account and profile details.</p>
      </div>

      <section className="rounded-2xl border border-surface-700 bg-surface-800 p-8">
        <h2 className="text-base font-semibold text-white">Profile</h2>
        <div className="mt-6 flex items-center gap-5">
          {user ? (
            <>
              <Image
                src={user.avatarUrl}
                alt={`${user.name}'s avatar`}
                width={64}
                height={64}
                className="rounded-2xl ring-2 ring-surface-600"
              />
              <div className="space-y-1">
                <p className="text-lg font-semibold text-white">{user.name}</p>
                <p className="text-sm text-slate-400">{user.email}</p>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

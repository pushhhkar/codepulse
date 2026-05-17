import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getServerUser } from '@/lib/auth';
import WorkspaceClient from './workspace-client';

interface WorkspacePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: WorkspacePageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Workspace ${id}` };
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { id } = await params;
  const user = await getServerUser();

  if (!user) {
    redirect('/');
  }

  return (
    <div className="flex h-screen flex-col bg-surface-900">
      {/* Top nav */}
      <header className="flex-none border-b border-surface-700 bg-surface-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-slate-400 transition-colors hover:text-white"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Dashboard
            </Link>
            <span className="text-surface-600 select-none">/</span>
            <span className="font-mono text-sm text-slate-300">{id}</span>
          </div>

          <div className="flex items-center gap-2">
            <Image
              src={user.avatarUrl}
              alt={`${user.name}'s avatar`}
              width={28}
              height={28}
              className="rounded-full ring-2 ring-brand-500"
            />
          </div>
        </div>
      </header>

      {/* Workspace body — fills remaining height */}
      <main className="min-h-0 flex-1">
        <WorkspaceClient workspaceId={id} userId={user.id} userName={user.name} />
      </main>
    </div>
  );
}

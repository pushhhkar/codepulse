import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/auth';
import DashboardSidebar from '@/components/dashboard-sidebar';

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getServerUser();

  // Protected area: bounce unauthenticated visitors back to the landing page.
  if (!user) {
    redirect('/');
  }

  return (
    <div className="flex min-h-screen bg-surface-900">
      <DashboardSidebar
        user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl }}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

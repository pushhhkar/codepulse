import type { User } from '@codepulse/types';

const APP_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000';

export async function getServerUser(): Promise<User | null> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) return null;

    const res = await fetch(new URL('/auth/me', APP_URL).toString(), {
      headers: { Cookie: `token=${token}` },
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { user: User };
    return data.user;
  } catch {
    return null;
  }
}

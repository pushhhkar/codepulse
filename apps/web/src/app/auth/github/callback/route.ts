import { type NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '@/lib/backend-proxy';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/?error=oauth', request.nextUrl.origin));
  }

  const upstreamUrl = new URL('/auth/github/callback', backendUrl('/'));
  upstreamUrl.searchParams.set('code', code);

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: { accept: 'application/json' },
    redirect: 'manual',
  });

  const setCookies = upstreamResponse.headers.getSetCookie?.() ?? [];
  const response = NextResponse.redirect(new URL('/dashboard', request.nextUrl.origin));

  for (const cookie of setCookies) {
    response.headers.append('set-cookie', cookie);
  }

  return response;
}

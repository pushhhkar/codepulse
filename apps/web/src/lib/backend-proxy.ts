import { NextResponse, type NextRequest } from 'next/server';

const API_ORIGIN = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:5000';

export function backendUrl(path: string): string {
  return new URL(path, API_ORIGIN).toString();
}

export async function proxyJsonRequest(
  request: NextRequest,
  pathname: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  const upstreamUrl = backendUrl(pathname);
  const headers = new Headers(init.headers);

  const incomingCookie = request.headers.get('cookie');
  if (incomingCookie) {
    headers.set('cookie', incomingCookie);
  }

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    ...init,
    headers,
  });

  const payload = await upstreamResponse.text();
  const response = new NextResponse(payload || undefined, {
    status: upstreamResponse.status,
    headers: {
      'content-type': upstreamResponse.headers.get('content-type') ?? 'application/json',
    },
  });

  const setCookies = upstreamResponse.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookies) {
    response.headers.append('set-cookie', cookie);
  }

  return response;
}

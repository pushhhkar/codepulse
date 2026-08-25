import { type NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '@/lib/backend-proxy';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get('token')?.value;
  const backendUrlString = new URL('/auth/logout', backendUrl('/')).toString();

  try {
    await fetch(backendUrlString, {
      method: 'POST',
      headers: token ? { Cookie: `token=${token}` } : {},
      redirect: 'manual',
    });
  } catch {
    // Intentionally ignore upstream errors and still clear the frontend cookie.
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('token', '', {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}

import { type NextRequest, NextResponse } from 'next/server';
import { proxyJsonRequest } from '@/lib/backend-proxy';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyJsonRequest(request, '/auth/me', {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });
}

import { type NextRequest, NextResponse } from 'next/server';
import { proxyJsonRequest } from '@/lib/backend-proxy';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();

  return proxyJsonRequest(request, '/api/ai/review-pr', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body,
  });
}

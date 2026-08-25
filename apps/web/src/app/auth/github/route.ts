import { NextResponse } from 'next/server';
import { backendUrl } from '@/lib/backend-proxy';

export async function GET(): Promise<NextResponse> {
  return NextResponse.redirect(backendUrl('/auth/github'));
}

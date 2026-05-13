import type { Metadata } from 'next';
import LoginButton from '@/components/login-button';

export const metadata: Metadata = {
  title: 'Welcome',
};

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-900 px-4">
      {/* Radial glow accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-[600px] w-[600px] rounded-full bg-brand-600/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-10 text-center">
        {/* Logo / wordmark */}
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
            CP
          </span>
          <span className="text-2xl font-bold tracking-tight text-white">CodePulse</span>
        </div>

        {/* Hero copy */}
        <div className="max-w-xl space-y-4">
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-white">
            Code review,{' '}
            <span className="bg-gradient-to-r from-brand-400 to-indigo-400 bg-clip-text text-transparent">
              in real time.
            </span>
          </h1>
          <p className="text-lg text-slate-400">
            Collaborate on code with your team — live cursors, inline comments, and instant
            feedback, all in one workspace.
          </p>
        </div>

        {/* CTA */}
        <LoginButton />

        <p className="text-xs text-slate-600">
          By signing in you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </main>
  );
}

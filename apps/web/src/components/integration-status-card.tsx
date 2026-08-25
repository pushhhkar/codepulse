import { cookies } from 'next/headers';

const APP_NAME = process.env['NEXT_PUBLIC_GITHUB_APP_NAME'];
const APP_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000';

interface InstallationStatus {
  installed: boolean;
  installationId: number | null;
  accountLogin: string | null;
  manageUrl: string | null;
}

async function fetchInstallationStatus(): Promise<InstallationStatus | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return null;

    const res = await fetch(new URL('/api/github/installation', APP_URL).toString(), {
      headers: { Cookie: `token=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    return (await res.json()) as InstallationStatus;
  } catch {
    return null;
  }
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .319.216.694.825.576C20.565 21.795 24 17.298 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export default async function IntegrationStatusCard() {
  const status = await fetchInstallationStatus();
  const connected = status?.installed === true;

  const installUrl = APP_NAME
    ? `https://github.com/apps/${APP_NAME}/installations/new`
    : null;
  // Prefer GitHub's per-installation settings page; fall back to the install flow.
  const manageUrl = status?.manageUrl ?? installUrl;

  return (
    <section className="rounded-2xl border border-surface-700 bg-surface-800 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-surface-600 bg-surface-900 text-white">
            <GitHubIcon className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-white">GitHub Integration</h2>
            <p className="mt-1 max-w-md text-sm text-slate-400">
              {connected
                ? 'CodePulse is installed and reviewing pull requests on your selected repositories.'
                : 'Install the CodePulse GitHub App to enable automated AI code reviews on your pull requests.'}
            </p>
          </div>
        </div>

        {connected ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Not connected
          </span>
        )}
      </div>

      <div className="mt-6">
        {connected ? (
          manageUrl ? (
            <a
              href={manageUrl}
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 rounded-xl border border-surface-600 bg-surface-700 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:border-brand-500/50 hover:bg-surface-600 active:scale-95"
            >
              <GitHubIcon className="h-4 w-4" />
              Manage repositories
            </a>
          ) : null
        ) : installUrl ? (
          <a
            href={installUrl}
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-all duration-150 hover:bg-brand-500 hover:shadow-xl active:scale-95"
          >
            <GitHubIcon className="h-4 w-4" />
            Install CodePulse on GitHub
          </a>
        ) : (
          <div className="inline-flex flex-col gap-1">
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center gap-2.5 rounded-xl bg-surface-700 px-5 py-2.5 text-sm font-semibold text-slate-500"
            >
              <GitHubIcon className="h-4 w-4" />
              Install CodePulse on GitHub
            </button>
            <p className="text-xs text-amber-400/80">
              Set <code className="font-mono">NEXT_PUBLIC_GITHUB_APP_NAME</code> to enable this button.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

// ── GitHub App authentication ───────────────────────────────────────────────────
//
// GitHub Apps authenticate in two steps:
//   1. Sign a short-lived JWT (RS256) with the app's private key — this proves
//      "I am app <GITHUB_APP_ID>".
//   2. Exchange that JWT for an installation access token scoped to a single
//      installation (i.e. one account/org's selected repositories).
//
// The installation token is what we then use for all REST calls (check runs,
// review comments, diff fetch) on that repository.

const GITHUB_API = 'https://api.github.com';

function getAppCredentials(): { appId: string; privateKey: string } {
  const appId = process.env['GITHUB_APP_ID'];
  const rawKey = process.env['GITHUB_APP_PRIVATE_KEY'];

  if (!appId) throw new Error('Missing required environment variable: GITHUB_APP_ID');
  if (!rawKey) throw new Error('Missing required environment variable: GITHUB_APP_PRIVATE_KEY');

  // PEM keys stored in a single-line .env have their newlines escaped as the
  // literal two-character sequence "\n"; restore them so RS256 signing works.
  const privateKey = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;

  return { appId, privateKey };
}

/**
 * Build a short-lived app JWT. GitHub caps the lifetime at 10 minutes; we
 * backdate `iat` by 60s to tolerate minor clock drift between us and GitHub.
 */
function generateAppJwt(): string {
  const { appId, privateKey } = getAppCredentials();
  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iat: now - 60,
      exp: now + 600, // 10 minutes
      iss: appId,
    },
    privateKey,
    { algorithm: 'RS256' },
  );
}

/**
 * Exchange the app JWT for an installation access token scoped to a single
 * installation. The returned token is valid for one hour and is what all
 * subsequent repository-level REST calls authenticate with.
 */
export async function getInstallationToken(installationId: string): Promise<string> {
  const appJwt = generateAppJwt();

  const res = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appJwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'CodePulse',
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to mint installation token (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { token?: unknown };
  if (typeof data.token !== 'string' || data.token.length === 0) {
    throw new Error('GitHub installation token response did not include a token.');
  }

  return data.token;
}

// ── Installation discovery ──────────────────────────────────────────────────────

export interface AppInstallation {
  id: number;
  accountId: number | null;
  accountLogin: string | null;
}

/**
 * List every installation of this GitHub App, authenticated with the app JWT.
 * Used to detect whether a given user account has the app installed.
 */
export async function listAppInstallations(): Promise<AppInstallation[]> {
  const appJwt = generateAppJwt();

  const res = await fetch(`${GITHUB_API}/app/installations?per_page=100`, {
    headers: {
      Authorization: `Bearer ${appJwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'CodePulse',
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to list app installations (${res.status}): ${detail}`);
  }

  const raw = await res.json();
  if (!Array.isArray(raw)) return [];

  const installations: AppInstallation[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const id = obj['id'];
    if (typeof id !== 'number') continue;

    const account =
      typeof obj['account'] === 'object' && obj['account'] !== null
        ? (obj['account'] as Record<string, unknown>)
        : null;
    const accountId = account && typeof account['id'] === 'number' ? account['id'] : null;
    const accountLogin =
      account && typeof account['login'] === 'string' ? account['login'] : null;

    installations.push({ id, accountId, accountLogin });
  }

  return installations;
}

export interface InstallationRepo {
  id: number;
  name: string;
  fullName: string;
  isPrivate: boolean;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  updatedAt: string | null;
}

/**
 * List the repositories a given installation can access, authenticated with a
 * freshly-minted installation access token.
 */
export async function listInstallationRepositories(
  installationId: string,
): Promise<InstallationRepo[]> {
  const token = await getInstallationToken(installationId);

  const res = await fetch(`${GITHUB_API}/installation/repositories?per_page=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'CodePulse',
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to list installation repositories (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { repositories?: unknown };
  const raw = Array.isArray(data.repositories) ? data.repositories : [];

  const repos: InstallationRepo[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;

    const id = obj['id'];
    const fullName = obj['full_name'];
    const name = obj['name'];
    const htmlUrl = obj['html_url'];
    if (typeof id !== 'number' || typeof fullName !== 'string' || typeof name !== 'string') {
      continue;
    }

    repos.push({
      id,
      name,
      fullName,
      isPrivate: obj['private'] === true,
      htmlUrl: typeof htmlUrl === 'string' ? htmlUrl : `https://github.com/${fullName}`,
      description: typeof obj['description'] === 'string' ? obj['description'] : null,
      language: typeof obj['language'] === 'string' ? obj['language'] : null,
      updatedAt: typeof obj['updated_at'] === 'string' ? obj['updated_at'] : null,
    });
  }

  return repos;
}

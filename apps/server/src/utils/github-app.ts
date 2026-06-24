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

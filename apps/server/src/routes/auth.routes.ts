import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import { env } from '../config/env.js';
import { UserModel } from '../models/user.model.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { encrypt } from '../utils/encryption.js';

const router = Router();

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

interface GithubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

// GET /auth/github — redirect to GitHub authorization page
router.get('/github', (_req: Request, res: Response): void => {
  const params = new URLSearchParams({
    client_id: env.github.clientId,
    redirect_uri: env.github.callbackUrl,
    scope: 'read:user user:email repo',
  });
  res.redirect(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`);
});

// GET /auth/github/callback — GitHub redirects here after user authorizes
router.get('/github/callback', async (req: Request, res: Response): Promise<void> => {
  const code = req.query['code'];

  if (typeof code !== 'string' || !code) {
    res.status(400).json({ error: 'Missing OAuth code' });
    return;
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.github.clientId,
        client_secret: env.github.clientSecret,
        code,
        redirect_uri: env.github.callbackUrl,
      }),
    });

    if (!tokenRes.ok) {
      res.status(502).json({ error: 'Failed to exchange token with GitHub' });
      return;
    }

    const tokenData = (await tokenRes.json()) as GithubTokenResponse;
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      res.status(502).json({ error: 'GitHub did not return an access token' });
      return;
    }

    // Fetch authenticated user profile from GitHub
    const userRes = await fetch(GITHUB_USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!userRes.ok) {
      res.status(502).json({ error: 'Failed to fetch user from GitHub' });
      return;
    }

    const githubUser = (await userRes.json()) as GithubUser;

    const email = githubUser.email ?? `${githubUser.login}@users.noreply.github.com`;
    const name = githubUser.name ?? githubUser.login;

    // Upsert user — create on first login, update profile on subsequent logins
    const user = await UserModel.findOneAndUpdate(
      { githubId: String(githubUser.id) },
      {
        $set: {
          name,
          email,
          avatarUrl: githubUser.avatar_url,
          githubId: String(githubUser.id),
          // Encrypted at rest (AES-256-GCM), stored server-side only (select: false)
          // for later GitHub API calls on the user's behalf. Never sent to the client.
          githubAccessToken: encrypt(accessToken),
        },
      },
      { upsert: true, new: true, runValidators: true },
    );

    const userId = (user._id as unknown as { toString(): string }).toString();

    // Issue a signed JWT — never expose to frontend JS; stored as httpOnly cookie only
    const token = jwt.sign(
      {
        sub: userId,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        githubId: user.githubId,
      },
      env.jwtSecret,
      { expiresIn: '7d', algorithm: 'HS256' },
    );

    const isProd = env.nodeEnv === 'production';

    res.cookie('token', token, {
      httpOnly: true,              // not accessible via document.cookie
      secure: isProd,              // HTTPS-only in production
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      path: '/',
    });

    // Redirect to the frontend dashboard — no token in the URL
    res.redirect(`${env.clientUrl}/dashboard`);
  } catch (err) {
    console.error('[auth] OAuth callback error:', err);
    res.status(500).json({ error: 'Internal server error during OAuth' });
  }
});

// GET /auth/me — return the current authenticated user (cookie auth)
router.get('/me', requireAuth, (req: Request, res: Response): void => {
  res.json({ user: req.user });
});

// POST /auth/logout — clear the auth cookie
router.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie('token', { path: '/' });
  res.json({ success: true });
});

export default router;

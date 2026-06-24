import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import fetch from 'node-fetch';
import { env } from '../config/env.js';
import { requestPrReview, type PullRequestComment } from '../services/ai-review.js';
import { getInstallationToken } from '../utils/github-app.js';

const router = Router();

const GITHUB_API = 'https://api.github.com';
const CHECK_RUN_NAME = 'CodePulse AI Review';

// ── HMAC signature verification ─────────────────────────────────────────────────

/**
 * Verify the `x-hub-signature-256` header against an HMAC-SHA256 of the raw
 * request body keyed with WEBHOOK_SECRET. Uses a constant-time comparison to
 * avoid leaking the expected signature via timing.
 */
function isValidSignature(req: Request): boolean {
  const signature = req.header('x-hub-signature-256');
  if (!signature || !req.rawBody) return false;

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', env.webhookSecret).update(req.rawBody).digest('hex');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);

  // timingSafeEqual throws on length mismatch, so guard length first.
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

// ── Payload extraction (the webhook body is untyped external JSON) ──────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

interface PrWebhookContext {
  installationId: string;
  owner: string;
  repo: string;
  sha: string;
  pullNumber: number;
}

function extractPrContext(payload: Record<string, unknown>): PrWebhookContext | null {
  const installation = asRecord(payload['installation']);
  const repository = asRecord(payload['repository']);
  const pullRequest = asRecord(payload['pull_request']);
  if (!installation || !repository || !pullRequest) return null;

  const owner = asRecord(repository['owner']);
  const head = asRecord(pullRequest['head']);
  if (!owner || !head) return null;

  const installationId = installation['id'];
  const ownerLogin = owner['login'];
  const repoName = repository['name'];
  const sha = head['sha'];
  const pullNumber = pullRequest['number'];

  if (
    (typeof installationId !== 'number' && typeof installationId !== 'string') ||
    typeof ownerLogin !== 'string' ||
    typeof repoName !== 'string' ||
    typeof sha !== 'string' ||
    typeof pullNumber !== 'number'
  ) {
    return null;
  }

  return {
    installationId: String(installationId),
    owner: ownerLogin,
    repo: repoName,
    sha,
    pullNumber,
  };
}

// ── GitHub REST helpers (all authenticated with the installation token) ─────────

function githubHeaders(token: string, json = false): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CodePulse',
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

/** Stage 1 — open the check run and return its id. */
async function createCheckRun(
  token: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<number> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/check-runs`, {
    method: 'POST',
    headers: githubHeaders(token, true),
    body: JSON.stringify({
      name: CHECK_RUN_NAME,
      head_sha: sha,
      status: 'in_progress',
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Check run creation failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { id?: unknown };
  if (typeof data.id !== 'number') {
    throw new Error('Check run response did not include a numeric id.');
  }
  return data.id;
}

/** Stage 3 — update the check run to its terminal state. */
async function patchCheckRun(
  token: string,
  owner: string,
  repo: string,
  checkRunId: number,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/check-runs/${checkRunId}`, {
    method: 'PATCH',
    headers: githubHeaders(token, true),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Check run update failed (${res.status}): ${detail}`);
  }
}

async function fetchPrDiff(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3.diff',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'CodePulse',
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`PR diff fetch failed (${res.status}): ${detail}`);
  }

  return res.text();
}

/** Post the AI comments as a single review. Mirrors the OAuth path in ai.routes. */
async function postReviewComments(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  comments: PullRequestComment[],
): Promise<void> {
  if (comments.length === 0) return;

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, {
    method: 'POST',
    headers: githubHeaders(token, true),
    body: JSON.stringify({
      body: 'CodePulse AI Automated Review',
      event: 'COMMENT',
      // `priority` is internal-only; GitHub rejects unknown comment fields (422).
      comments: comments.map(({ path, line, body }) => ({ path, line, body })),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Posting review comments failed (${res.status}): ${detail}`);
  }
}

// ── Background execution (Stage 2 + Stage 3) ────────────────────────────────────

async function runReviewInBackground(
  token: string,
  ctx: PrWebhookContext,
  checkRunId: number,
): Promise<void> {
  const { owner, repo, pullNumber } = ctx;

  try {
    const diff = await fetchPrDiff(token, owner, repo, pullNumber);
    const comments = diff.trim().length > 0 ? await requestPrReview(diff) : [];

    await postReviewComments(token, owner, repo, pullNumber, comments);

    await patchCheckRun(token, owner, repo, checkRunId, {
      status: 'completed',
      conclusion: 'success',
      output: {
        title: 'Review Complete',
        summary: `CodePulse found ${comments.length} suggestion${comments.length === 1 ? '' : 's'}.`,
      },
    });
  } catch (err) {
    console.error('[webhook/github] Background review failed:', err);

    // Never leave the check run stuck in `in_progress` — mark it failed.
    try {
      await patchCheckRun(token, owner, repo, checkRunId, {
        status: 'completed',
        conclusion: 'failure',
        output: {
          title: 'Review Failed',
          summary: 'CodePulse encountered an error while reviewing this pull request.',
        },
      });
    } catch (patchErr) {
      console.error('[webhook/github] Failed to mark check run as failed:', patchErr);
    }
  }
}

// ── Webhook entrypoint ──────────────────────────────────────────────────────────

/**
 * POST /webhook/github
 *
 * GitHub App webhook receiver. Acts only on `pull_request` events with an
 * `opened` or `synchronize` action: opens a check run, acks immediately with
 * 202, then runs the AI review in the background.
 */
router.post('/github', async (req: Request, res: Response): Promise<void> => {
  // Reject any payload that isn't signed by GitHub with our shared secret.
  if (!isValidSignature(req)) {
    res.status(401).json({ error: 'Invalid or missing webhook signature.' });
    return;
  }

  const event = req.header('x-github-event');

  // Ack non-pull_request events so GitHub doesn't retry them.
  if (event !== 'pull_request') {
    res.status(204).end();
    return;
  }

  const payload = asRecord(req.body) ?? {};
  const action = payload['action'];

  if (action !== 'opened' && action !== 'synchronize') {
    res.status(204).end();
    return;
  }

  const ctx = extractPrContext(payload);
  if (!ctx) {
    res.status(400).json({ error: 'Malformed pull_request payload.' });
    return;
  }

  // Authenticate as this specific installation.
  let token: string;
  try {
    token = await getInstallationToken(ctx.installationId);
  } catch (err) {
    console.error('[webhook/github] Installation token error:', err);
    res.status(500).json({ error: 'Failed to authenticate as GitHub App installation.' });
    return;
  }

  // Stage 1 — open the check run and capture its id before we respond.
  let checkRunId: number;
  try {
    checkRunId = await createCheckRun(token, ctx.owner, ctx.repo, ctx.sha);
  } catch (err) {
    console.error('[webhook/github] Check run init error:', err);
    res.status(500).json({ error: 'Failed to create check run.' });
    return;
  }

  // Ack GitHub immediately; Stage 2 + 3 run in the background.
  res.status(202).json({ checkRunId });

  void runReviewInBackground(token, ctx, checkRunId);
});

export default router;

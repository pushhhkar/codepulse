import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import fetch from 'node-fetch';
import { env } from '../config/env.js';
import { requestPrReview, type PullRequestComment } from '../services/ai-review.js';
import { getInstallationToken } from '../utils/github-app.js';
import {
  parseUnifiedDiff,
  validateAiComments,
  type FileDiff,
  type ValidatedComment,
} from '../utils/diff-validation.js';

const router = Router();

const GITHUB_API = 'https://api.github.com';
const CHECK_RUN_NAME = 'CodePulse AI Review';
const REREVIEW_ACTION_ID = 'rereview';
const REREVIEW_ACTION_LABEL = 'Re-review';
const REREVIEW_ACTION_DESC = 'Run CodePulse AI review again';

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

/** Extract PR context from a check_run webhook payload. */
function extractPrContextFromCheckRun(payload: Record<string, unknown>): PrWebhookContext | null {
  const installation = asRecord(payload['installation']);
  const checkRun = asRecord(payload['check_run']);
  const repository = asRecord(payload['repository']);
  if (!installation || !checkRun || !repository) return null;

  const pullRequests = checkRun['pull_requests'];
  if (!Array.isArray(pullRequests) || pullRequests.length === 0) return null;

  const pr = pullRequests[0];
  const head = asRecord(pr['head']);
  if (!head) return null;

  const fullName = repository['full_name'];
  if (typeof fullName !== 'string') return null;

  const [ownerLogin, repoName] = fullName.split('/');
  if (!ownerLogin || !repoName) return null;

  const installationId = installation['id'];
  const sha = head['sha'];
  const pullNumber = pr['number'];

  if (
    (typeof installationId !== 'number' && typeof installationId !== 'string') ||
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
  commitId: string,
  comments: ValidatedComment[],
): Promise<void> {
  if (comments.length === 0) return;

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, {
    method: 'POST',
    headers: githubHeaders(token, true),
    body: JSON.stringify({
      body: 'CodePulse AI Automated Review',
      event: 'COMMENT',
      commit_id: commitId,
      // `priority` is internal-only; GitHub rejects unknown comment fields (422).
      comments: comments.map(({ path, line, body, side }) => ({ path, line, body, side })),
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

    if (comments.length === 0) {
      await patchCheckRun(token, owner, repo, checkRunId, {
        status: 'completed',
        conclusion: 'success',
        output: {
          title: 'Review Complete',
          summary: 'No issues found.',
        },
        actions: [
          {
            label: REREVIEW_ACTION_LABEL,
            identifier: REREVIEW_ACTION_ID,
            description: 'Trigger a fresh CodePulse AI review of this PR',
          },
        ],
      });
      return;
    }

    // Parse diff and validate comments against actual diff
    const fileDiffs = parseUnifiedDiff(diff);
    const fileDiffMap = new Map(fileDiffs.map((fd) => [fd.path, fd]));
    const { validComments, skippedComments } = validateAiComments(comments, fileDiffMap);

    // Fetch PR metadata to get head.sha (commit_id) for review posting
    let commitId: string;
    try {
      const prRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}`, {
        headers: githubHeaders(token),
      });
      if (!prRes.ok) {
        throw new Error(`PR metadata fetch failed (${prRes.status})`);
      }
      const prData = (await prRes.json()) as { head?: { sha?: string } };
      commitId = prData.head?.sha ?? ctx.sha;
    } catch {
      commitId = ctx.sha;
    }

    // Only post valid comments
    if (validComments.length > 0) {
      await postReviewComments(token, owner, repo, pullNumber, commitId, validComments);
    }

    const criticalCount = comments.filter((c) => c.priority === 'CRITICAL').length;
    const importantCount = comments.filter((c) => c.priority === 'IMPORTANT').length;
    const moderateCount = comments.filter((c) => c.priority === 'MODERATE').length;
    const minorCount = comments.filter((c) => c.priority === 'MINOR').length;

    let summary: string;
    if (validComments.length === 0) {
      summary = 'No valid comments could be mapped to the PR diff. Nothing posted to GitHub.';
      if (skippedComments.length > 0) {
        summary += ` (${skippedComments.length} AI comment${skippedComments.length === 1 ? '' : 's'} skipped)`;
      }
    } else {
      const parts: string[] = [];
      if (criticalCount) parts.push(`${criticalCount} Critical`);
      if (importantCount) parts.push(`${importantCount} Important`);
      if (moderateCount) parts.push(`${moderateCount} Moderate`);
      if (minorCount) parts.push(`${minorCount} Minor`);
      summary = `CodePulse found ${comments.length} suggestion${comments.length === 1 ? '' : 's'} (${parts.join(', ')}).`;
      if (skippedComments.length > 0) {
        summary += ` ${skippedComments.length} skipped.`;
      }
    }

    await patchCheckRun(token, owner, repo, checkRunId, {
      status: 'completed',
      conclusion: validComments.length > 0 ? 'success' : 'neutral',
      output: {
        title: validComments.length > 0 ? 'Review Complete' : 'Review Completed (No Valid Comments)',
        summary,
      },
      actions: [
        {
          label: REREVIEW_ACTION_LABEL,
          identifier: REREVIEW_ACTION_ID,
          description: REREVIEW_ACTION_DESC,
        },
      ],
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
 * GitHub App webhook receiver. Handles:
 * - `pull_request` events (opened, synchronize): opens a check run, runs AI review
 * - `check_run` events (requested_action with rereview): re-runs AI review
 */
router.post('/github', async (req: Request, res: Response): Promise<void> => {
  // Reject any payload that isn't signed by GitHub with our shared secret.
  if (!isValidSignature(req)) {
    res.status(401).json({ error: 'Invalid or missing webhook signature.' });
    return;
  }

  const event = req.header('x-github-event');
  const payload = asRecord(req.body) ?? {};

  // Handle check_run.requested_action for re-review
  if (event === 'check_run') {
    const action = payload['action'];
    if (action === 'requested_action') {
      const requestedAction = asRecord(payload['requested_action']);
      if (requestedAction?.['identifier'] === REREVIEW_ACTION_ID) {
        await handleRereview(payload, res);
        return;
      }
    }
    // Ack other check_run events
    res.status(204).end();
    return;
  }

  // Handle pull_request events (opened, synchronize)
  if (event !== 'pull_request') {
    res.status(204).end();
    return;
  }

  const prAction = payload['action'];
  if (prAction !== 'opened' && prAction !== 'synchronize') {
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

/** Handle re-review requested action from check_run webhook. */
async function handleRereview(payload: Record<string, unknown>, res: Response): Promise<void> {
  const ctx = extractPrContextFromCheckRun(payload);
  if (!ctx) {
    console.warn('[webhook/github] Could not extract PR context from check_run payload');
    res.status(400).json({ error: 'Could not extract PR context from check_run payload.' });
    return;
  }

  const { installationId, owner, repo, sha, pullNumber } = ctx;

  // Authenticate as this specific installation.
  let token: string;
  try {
    token = await getInstallationToken(installationId);
  } catch (err) {
    console.error('[webhook/github] Installation token error for re-review:', err);
    res.status(500).json({ error: 'Failed to authenticate as GitHub App installation.' });
    return;
  }

  // Create a new check run for the re-review (same SHA, new check run)
  let checkRunId: number;
  try {
    checkRunId = await createCheckRun(token, owner, repo, sha);
  } catch (err) {
    console.error('[webhook/github] Check run init error for re-review:', err);
    res.status(500).json({ error: 'Failed to create check run for re-review.' });
    return;
  }

  // Ack GitHub immediately; re-review runs in the background.
  res.status(202).json({ checkRunId });

  void runReviewInBackground(token, { ...ctx, sha }, checkRunId);
}

export default router;

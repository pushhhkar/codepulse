import { Router, type Request, type Response } from 'express';
import fetch from 'node-fetch';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  requestAiReview,
  requestPrReview,
  markerSeverityToReviewSeverity,
  type AiReviewResult,
  type PullRequestComment,
} from '../services/ai-review.js';
import { UserModel } from '../models/user.model.js';
import { decrypt } from '../utils/encryption.js';
import {
  parseUnifiedDiff,
  matchDiffPath,
  isLineCommentable,
  validateAiComments,
  type FileDiff,
  type ValidatedComment,
} from '../utils/diff-validation.js';

interface PrMetadata {
  head: { sha: string };
  base: { sha: string };
}

const router = Router();

router.use(requireAuth);

// ── PR review ──────────────────────────────────────────────────────────────────

const GITHUB_API = 'https://api.github.com';
const PR_URL_REGEX = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

interface ParsedPr {
  owner: string;
  repo: string;
  pullNumber: number;
}

function parsePrUrl(url: string): ParsedPr | null {
  const match = PR_URL_REGEX.exec(url);
  if (!match) return null;

  const [, owner, repo, num] = match;
  if (!owner || !repo || !num) return null;

  return { owner, repo, pullNumber: Number(num) };
}

/**
 * POST /api/ai/review-pr
 *
 * Body:    { prUrl: string }  e.g. https://github.com/owner/repo/pull/1
 * Returns: { success: true, commentCount: number }
 */
router.post('/review-pr', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const prUrl = body['prUrl'];

  // ── Validate + parse the PR URL ─────────────────────────────────────────────
  if (typeof prUrl !== 'string' || prUrl.trim().length === 0) {
    res.status(400).json({ error: '`prUrl` must be a non-empty string.' });
    return;
  }

  const parsed = parsePrUrl(prUrl);
  if (!parsed) {
    res.status(400).json({
      error: 'Invalid GitHub PR URL. Expected https://github.com/{owner}/{repo}/pull/{number}.',
    });
    return;
  }
  const { owner, repo, pullNumber } = parsed;

  // ── Fetch + decrypt the user's GitHub token ─────────────────────────────────
  let token: string;
  try {
    const user = await UserModel.findById(req.user!.id).select('+githubAccessToken');
    if (!user || !user.githubAccessToken) {
      res.status(401).json({
        error: 'No GitHub access token on file. Please re-authenticate with GitHub.',
      });
      return;
    }
    token = decrypt(user.githubAccessToken);
  } catch (err) {
    console.error('[ai/review-pr] Token retrieval/decryption failed:', err);
    res.status(401).json({
      error: 'Could not read your GitHub credentials. Please re-authenticate with GitHub.',
    });
    return;
  }

  // ── Fetch PR metadata to get head.sha (commit_id) ─────────────────────────────
  let prMetadata: PrMetadata;
  try {
    const prRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'CodePulse',
      },
    });

    if (!prRes.ok) {
      const detail = await prRes.text().catch(() => '');
      console.error(`[ai/review-pr] GitHub PR metadata fetch failed: ${prRes.status}`, detail);
      res.status(502).json({ error: `Failed to fetch PR metadata from GitHub (${prRes.status}).` });
      return;
    }

    prMetadata = (await prRes.json()) as PrMetadata;
  } catch (err) {
    console.error('[ai/review-pr] GitHub PR metadata request error:', err);
    res.status(502).json({ error: 'Failed to reach GitHub to fetch PR metadata.' });
    return;
  }

  const commitId = prMetadata.head.sha;

  // ── Fetch the raw unified diff from GitHub ──────────────────────────────────
  let diff: string;
  try {
    const diffRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3.diff',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'CodePulse',
      },
    });

    if (!diffRes.ok) {
      const detail = await diffRes.text().catch(() => '');
      console.error(`[ai/review-pr] GitHub diff fetch failed: ${diffRes.status}`, detail);
      res.status(502).json({ error: `Failed to fetch PR diff from GitHub (${diffRes.status}).` });
      return;
    }

    diff = await diffRes.text();
  } catch (err) {
    console.error('[ai/review-pr] GitHub diff request error:', err);
    res.status(502).json({ error: 'Failed to reach GitHub to fetch the PR diff.' });
    return;
  }

  if (diff.trim().length === 0) {
    res.status(422).json({ error: 'The PR diff is empty — nothing to review.' });
    return;
  }

  // ── Parse diff and build commentable line mapping per file ────────────────────
  const fileDiffs = parseUnifiedDiff(diff);
  const fileDiffMap = new Map(fileDiffs.map((fd) => [fd.path, fd]));

  // ── Generate AI review comments ─────────────────────────────────────────────
  let comments: PullRequestComment[];
  try {
    comments = await requestPrReview(diff);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    console.error('[ai/review-pr] Gemini pipeline error:', message);
    res.status(502).json({ error: `AI review failed: ${message}` });
    return;
  }

  // ── Validate AI comments against parsed diff ─────────────────────────────────
  const { validComments, skippedComments } = validateAiComments(comments, fileDiffMap);

  if (validComments.length === 0) {
    const reasons = skippedComments.map((s) => `${s.path}:${s.line} - ${s.reason}`);
    console.warn(`[ai/review-pr] No valid comments to post. All ${skippedComments.length} AI comments were skipped.`);
    res.status(200).json({
      success: false,
      posted: 0,
      skipped: skippedComments.length,
      reasons,
      message: 'No comments could be mapped to the PR diff. Nothing posted to GitHub.',
    });
    return;
  }

  // ── Post the review back to the PR ──────────────────────────────────────────
  try {
    const reviewRes = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'CodePulse',
        },
        body: JSON.stringify({
          body: 'CodePulse AI Automated Review',
          event: 'COMMENT',
          commit_id: commitId,
          comments: validComments,
        }),
      },
    );

    if (!reviewRes.ok) {
      const detail = await reviewRes.text().catch(() => '');
      console.error(`[ai/review-pr] GitHub review post failed: ${reviewRes.status}`, detail);
      res.status(502).json({ error: `Failed to post review to GitHub (${reviewRes.status}).` });
      return;
    }

    res.status(201).json({ success: true, commentCount: validComments.length, skipped: skippedComments.length });
  } catch (err) {
    console.error('[ai/review-pr] GitHub review request error:', err);
    res.status(502).json({ error: 'Failed to reach GitHub to post the review.' });
  }
});

export default router;
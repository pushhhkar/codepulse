import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import fetch from 'node-fetch';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  requestAiReview,
  requestPrReview,
  markerSeverityToReviewSeverity,
  type AiReviewResult,
  type PullRequestComment,
} from '../services/ai-review.js';
import { ReviewCommentModel } from '../models/review-comment.model.js';
import { UserModel } from '../models/user.model.js';
import { decrypt } from '../utils/encryption.js';

const router = Router();

router.use(requireAuth);

const SUPPORTED_LANGUAGES = new Set(['javascript', 'cpp']);

// Sentinel ObjectId used as authorId for AI-generated comments.
// All-zeros with a trailing 1 is a valid ObjectId that will never
// match a real user document, making AI comments clearly identifiable.
const AI_AUTHOR_ID = new Types.ObjectId('000000000000000000000001');

/**
 * POST /api/ai/review
 *
 * Body:    { workspaceId: string, language: 'javascript' | 'cpp', code: string }
 * Returns: AiReviewResult = { detectedLanguage: string, comments: AiReviewComment[] }
 */
router.post('/review', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const { workspaceId, language, code } = body;

  // ── Validate input ──────────────────────────────────────────────────────────
  if (typeof workspaceId !== 'string' || !Types.ObjectId.isValid(workspaceId)) {
    res.status(400).json({ error: '`workspaceId` must be a valid ObjectId string.' });
    return;
  }

  if (typeof language !== 'string' || !SUPPORTED_LANGUAGES.has(language)) {
    res.status(400).json({
      error: `\`language\` must be one of: ${[...SUPPORTED_LANGUAGES].join(', ')}.`,
    });
    return;
  }

  if (typeof code !== 'string' || code.trim().length === 0) {
    res.status(400).json({ error: '`code` must be a non-empty string.' });
    return;
  }

  // ── Call Gemini ─────────────────────────────────────────────────────────────
  let review: AiReviewResult;
  try {
    review = await requestAiReview({ language, code });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    console.error('[ai/review] Gemini pipeline error:', message);
    res.status(502).json({ error: `AI review failed: ${message}` });
    return;
  }

  // ── Persist to MongoDB (best-effort: never block the response on this) ──────
  try {
    const docs = review.comments.map((c) => ({
      workspaceId: new Types.ObjectId(workspaceId),
      authorId: AI_AUTHOR_ID,
      lineNumber: c.line,
      severity: markerSeverityToReviewSeverity(c.severity),
      message: c.message,
      suggestion: c.message,
    }));

    if (docs.length > 0) {
      await ReviewCommentModel.insertMany(docs, { ordered: false });
    }
  } catch (err) {
    // Persistence is secondary — the markers are the primary deliverable.
    console.error('[ai/review] DB insert error (non-fatal):', err);
  }

  res.status(200).json(review);
});

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
          comments: comments.map(({ path, line, body }) => ({ path, line, body })),
        }),
      },
    );

    if (!reviewRes.ok) {
      const detail = await reviewRes.text().catch(() => '');
      console.error(`[ai/review-pr] GitHub review post failed: ${reviewRes.status}`, detail);
      res.status(502).json({ error: `Failed to post review to GitHub (${reviewRes.status}).` });
      return;
    }

    res.status(201).json({ success: true, commentCount: comments.length });
  } catch (err) {
    console.error('[ai/review-pr] GitHub review request error:', err);
    res.status(502).json({ error: 'Failed to reach GitHub to post the review.' });
  }
});

export default router;

import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  requestAiReview,
  markerSeverityToReviewSeverity,
  type AiReviewResult,
} from '../services/ai-review.js';
import { ReviewCommentModel } from '../models/review-comment.model.js';

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

export default router;

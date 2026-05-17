import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requestAiReview } from '../services/ai-review.js';
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
 * Returns: { success: true, reviews: ReviewComment[] }
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
  let rawComments: Awaited<ReturnType<typeof requestAiReview>>;
  try {
    rawComments = await requestAiReview({ language, code });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    console.error('[ai/review] Gemini pipeline error:', message);
    res.status(502).json({ error: `AI review failed: ${message}` });
    return;
  }

  // ── Persist to MongoDB ──────────────────────────────────────────────────────
  let saved: InstanceType<typeof ReviewCommentModel>[];
  try {
    const docs = rawComments.map((c) => ({
      workspaceId: new Types.ObjectId(workspaceId),
      authorId: AI_AUTHOR_ID,
      lineNumber: c.lineNumber,
      severity: c.severity,
      message: c.message,
      suggestion: c.suggestion,
    }));

    saved = await ReviewCommentModel.insertMany(docs, { ordered: false });
  } catch (err) {
    console.error('[ai/review] DB insert error:', err);
    res.status(500).json({ error: 'Failed to persist review comments.' });
    return;
  }

  res.status(201).json({ success: true, reviews: saved.map((doc) => doc.toJSON()) });
});

export default router;

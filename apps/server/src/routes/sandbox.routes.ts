import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { executeCode, type SupportedLanguage } from '../services/sandbox.js';
import { env } from '../config/env.js';

const router = Router();

// All sandbox routes require a valid JWT cookie.
router.use(requireAuth);

const SUPPORTED_LANGUAGES = new Set<SupportedLanguage>(['javascript', 'cpp']);

function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.has(value as SupportedLanguage);
}

/**
 * POST /api/sandbox/execute
 *
 * Body: { language: 'javascript' | 'cpp', code: string }
 *
 * Response:
 *   200 { success: true,  output: string, error?: string }
 *   200 { success: false, output: string, error: string  }  ← compile/runtime failure
 *   400 { error: string }                                   ← bad request
 *   500 { error: string }                                   ← infrastructure failure
 */
router.post('/execute', async (req: Request, res: Response): Promise<void> => {
  const { language, code } = req.body as Record<string, unknown>;

  // ── Validate ────────────────────────────────────────────────────────────────
  if (!isSupportedLanguage(language)) {
    res.status(400).json({
      error: `Unsupported language. Must be one of: ${[...SUPPORTED_LANGUAGES].join(', ')}.`,
    });
    return;
  }

  if (typeof code !== 'string' || code.length === 0) {
    res.status(400).json({ error: '`code` must be a non-empty string.' });
    return;
  }

  const codeBytes = Buffer.byteLength(code, 'utf8');
  if (codeBytes > env.sandbox.maxCodeBytes) {
    res.status(400).json({
      error: `Code exceeds maximum allowed size of ${env.sandbox.maxCodeBytes} bytes.`,
    });
    return;
  }

  // ── Execute ─────────────────────────────────────────────────────────────────
  try {
    const result = await executeCode({ language, code });
    // Always 200 — the `success` field in the body conveys pass/fail.
    // The HTTP status code reflects the health of the API itself, not user code.
    res.json(result);
  } catch (err) {
    console.error('[sandbox] Unexpected infrastructure error:', err);
    res.status(500).json({ error: 'Internal error while executing sandbox.' });
  }
});

export default router;

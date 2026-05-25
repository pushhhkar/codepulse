import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ReviewSeverity } from '@codepulse/types';
import { env } from '../config/env.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReviewRequest {
  language: string;
  code: string;
}

/**
 * Numeric severity matching Monaco's MarkerSeverity enum:
 * 1 = Hint, 2 = Info, 4 = Warning, 8 = Error.
 */
export type MarkerSeverity = 1 | 2 | 4 | 8;

export interface AiReviewComment {
  line: number;
  message: string;
  severity: MarkerSeverity;
}

export interface AiReviewResult {
  detectedLanguage: string;
  comments: AiReviewComment[];
}

// ── Gemini client (singleton) ─────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(env.geminiApiKey);

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction:
    'You are a Staff Software Engineer reviewing code. ' +
    'Ignore basic syntax. Focus on Time/Space complexity (Big O) and algorithmic inefficiencies. ' +
    'Detect the programming language of the submitted code and report it using a Monaco-compatible ' +
    'identifier string (e.g. "javascript", "typescript", "python", "cpp"). ' +
    'Return ONLY a single raw JSON object — no markdown, no code fences, no prose. ' +
    'The JSON schema must strictly be: ' +
    '{ "detectedLanguage": "string", "comments": [ ' +
    '{ "line": number, "message": "string", "severity": number } ] }. ' +
    'The "severity" field MUST be one of these integers: ' +
    '1 (Hint), 2 (Info), 4 (Warning), 8 (Error). ' +
    'If the code has no issues, return an empty "comments" array.',
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.2,
  },
});

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_SEVERITIES = new Set<MarkerSeverity>([1, 2, 4, 8]);

function isMarkerSeverity(value: unknown): value is MarkerSeverity {
  return typeof value === 'number' && VALID_SEVERITIES.has(value as MarkerSeverity);
}

/**
 * Gemini occasionally wraps JSON in ```json … ``` fences despite the
 * responseMimeType hint. Strip any leading/trailing markdown fence so
 * JSON.parse never chokes on the wrapper.
 */
function stripMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;

  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function parseAndValidate(raw: string): AiReviewResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stripMarkdownFence(raw));
  } catch {
    throw new Error(`AI returned non-JSON response: ${raw.slice(0, 200)}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('AI response was not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;
  const detected = obj['detectedLanguage'];
  const rawComments = obj['comments'];

  const detectedLanguage =
    typeof detected === 'string' && detected.trim().length > 0
      ? detected.trim().toLowerCase()
      : 'plaintext';

  const comments: AiReviewComment[] = [];

  if (Array.isArray(rawComments)) {
    for (const item of rawComments) {
      if (typeof item !== 'object' || item === null) continue;

      const c = item as Record<string, unknown>;
      const line = c['line'];
      const message = c['message'];
      const severity = c['severity'];

      // Silently skip malformed entries rather than rejecting the whole batch.
      if (
        typeof line !== 'number' ||
        !Number.isInteger(line) ||
        line < 1 ||
        typeof message !== 'string' ||
        message.trim().length === 0 ||
        !isMarkerSeverity(severity)
      ) {
        continue;
      }

      comments.push({ line, message: message.trim(), severity });
    }
  }

  return { detectedLanguage, comments };
}

// ── Severity mapping for DB persistence ───────────────────────────────────────

/**
 * The ReviewComment Mongoose schema stores severity as a string enum.
 * Map the numeric Monaco severity back to that enum for persistence.
 */
export function markerSeverityToReviewSeverity(severity: MarkerSeverity): ReviewSeverity {
  switch (severity) {
    case 8:
      return 'error';
    case 4:
      return 'warning';
    default:
      return 'info';
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function requestAiReview(request: ReviewRequest): Promise<AiReviewResult> {
  const userMessage = `Language hint: ${request.language}\n\n\`\`\`\n${request.code}\n\`\`\``;

  const result = await model.generateContent(userMessage);
  const content = result.response.text();

  if (!content) {
    throw new Error('Gemini returned an empty response');
  }

  return parseAndValidate(content);
}

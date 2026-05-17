import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ReviewSeverity } from '@codepulse/types';
import { env } from '../config/env.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReviewRequest {
  language: string;
  code: string;
}

export interface RawComment {
  lineNumber: number;
  severity: ReviewSeverity;
  message: string;
  suggestion: string;
}

// ── Gemini client (singleton) ─────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(env.geminiApiKey);

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction:
    'You are a Staff Software Engineer reviewing code. ' +
    'Ignore basic syntax. Focus on Time/Space complexity (Big O) and algorithmic inefficiencies. ' +
    'Return ONLY a raw JSON array of objects. ' +
    'The JSON schema must strictly be: ' +
    '[{ "lineNumber": number, "severity": "info" | "warning" | "error", "message": "string", "suggestion": "string" }]. ' +
    'If the code has no issues return an empty array []. ' +
    'No markdown, no code fences, no prose — pure JSON only.',
  generationConfig: {
    // Forces the model to return valid JSON, equivalent to OpenAI's json_object mode.
    responseMimeType: 'application/json',
    temperature: 0.2,
  },
});

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_SEVERITIES = new Set<ReviewSeverity>(['info', 'warning', 'error']);

function isValidSeverity(value: unknown): value is ReviewSeverity {
  return typeof value === 'string' && VALID_SEVERITIES.has(value as ReviewSeverity);
}

function parseAndValidateComments(raw: string): RawComment[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AI returned non-JSON response: ${raw.slice(0, 200)}`);
  }

  // Gemini with responseMimeType json sometimes wraps the array in an object
  // e.g. {"reviews": [...]}. Unwrap the first array value we find.
  if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
    const firstArray = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
    if (firstArray !== undefined) {
      parsed = firstArray;
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error('AI response was not a JSON array');
  }

  const validated: RawComment[] = [];

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;

    const obj = item as Record<string, unknown>;
    const lineNumber = obj['lineNumber'];
    const severity = obj['severity'];
    const message = obj['message'];
    const suggestion = obj['suggestion'];

    // Silently skip malformed entries rather than rejecting the whole batch.
    if (
      typeof lineNumber !== 'number' ||
      !Number.isInteger(lineNumber) ||
      lineNumber < 1 ||
      !isValidSeverity(severity) ||
      typeof message !== 'string' ||
      message.trim().length === 0 ||
      typeof suggestion !== 'string' ||
      suggestion.trim().length === 0
    ) {
      continue;
    }

    validated.push({
      lineNumber,
      severity,
      message: message.trim(),
      suggestion: suggestion.trim(),
    });
  }

  return validated;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function requestAiReview(request: ReviewRequest): Promise<RawComment[]> {
  const userMessage = `Language: ${request.language}\n\n\`\`\`\n${request.code}\n\`\`\``;

  const result = await model.generateContent(userMessage);
  const content = result.response.text();

  if (!content) {
    throw new Error('Gemini returned an empty response');
  }

  return parseAndValidateComments(content.trim());
}

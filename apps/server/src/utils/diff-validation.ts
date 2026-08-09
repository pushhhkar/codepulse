export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

export interface FileDiff {
  path: string;
  hunks: DiffHunk[];
  newFileLineSet: Set<number>;
}

export function parseUnifiedDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = diff.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Only process +++ lines for file path extraction (standard unified diff format)
    if (line.startsWith('+++ ')) {
      const pathMatch = line.match(/^\+\+\+\s+b\/(.+)$/);
      if (!pathMatch) {
        i++;
        continue;
      }

      const path = pathMatch[1] ?? '';
      const hunks: DiffHunk[] = [];
      const newFileLineSet = new Set<number>();

      i++;
      while (i < lines.length) {
        const hunkLine = lines[i] ?? '';
        if (hunkLine.startsWith('@@ ')) {
          const hunkMatch = hunkLine.match(/^@@\s+-(\d+),?(\d*)\s+\+(\d+),?(\d*)\s+@@/);
          if (hunkMatch) {
            const oldStart = parseInt(hunkMatch[1] ?? '0', 10);
            const oldLines = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
            const newStart = parseInt(hunkMatch[3] ?? '0', 10);
            const newLines = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;

            hunks.push({ oldStart, oldLines, newStart, newLines });

            let newLineNum = newStart;
            i++;
            while (i < lines.length) {
              const contentLine = lines[i] ?? '';
              if (contentLine.startsWith('@@ ')) {
                // Next hunk header - exit content loop, outer loop will handle it
                break;
              }
              if (contentLine.startsWith('--- ') || contentLine.startsWith('+++ ')) {
                // Next file - exit content loop
                break;
              }
              if (contentLine.startsWith('+')) {
                newFileLineSet.add(newLineNum);
                newLineNum++;
              } else if (contentLine.startsWith('-')) {
                // Removed line: doesn't exist in new file, don't increment newLineNum
              } else {
                // Context line: exists in both old and new
                newFileLineSet.add(newLineNum);
                newLineNum++;
              }
              i++;
            }
            continue;
          }
        }
        if (hunkLine.startsWith('--- ') || hunkLine.startsWith('+++ ')) {
          break;
        }
        i++;
      }

      files.push({ path, hunks, newFileLineSet });
    } else {
      i++;
    }
  }

  return files;
}

export function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

export function matchDiffPath(
  aiPath: string,
  fileDiffMap: Map<string, FileDiff>,
): { matchedPath: string; method: 'exact' | 'fallback' } | null {
  // 1. Exact match
  if (fileDiffMap.has(aiPath)) {
    return { matchedPath: aiPath, method: 'exact' };
  }

  // 2. Fallback: match by basename
  const aiBasename = basename(aiPath);
  const candidates: string[] = [];

  for (const [diffPath] of fileDiffMap) {
    if (basename(diffPath) === aiBasename) {
      candidates.push(diffPath);
    }
  }

  if (candidates.length === 1) {
    const matchedPath = candidates[0]!;
    console.info(`[ai/review-pr] Fallback match: AI path "${aiPath}" -> diff path "${matchedPath}" (basename: "${aiBasename}")`);
    return { matchedPath, method: 'fallback' };
  }

  if (candidates.length > 1) {
    console.warn(`[ai/review-pr] Ambiguous basename "${aiBasename}" matches multiple diff files: ${candidates.join(', ')}. Skipping.`);
    return null;
  }

  console.warn(`[ai/review-pr] No diff file found for AI path "${aiPath}" (basename: "${aiBasename}"). Skipping.`);
  return null;
}

export function isLineCommentable(fileDiff: FileDiff, line: number): boolean {
  return fileDiff.newFileLineSet.has(line);
}

export interface ValidatedComment {
  path: string;
  line: number;
  side: 'RIGHT';
  body: string;
  priority: 'CRITICAL' | 'IMPORTANT' | 'MODERATE' | 'MINOR';
}

export interface ValidationResult {
  validComments: ValidatedComment[];
  skippedComments: { path: string; line: number; reason: string }[];
}

export function validateAiComments(
  comments: { path: string; line: number; body: string; priority: 'CRITICAL' | 'IMPORTANT' | 'MODERATE' | 'MINOR' }[],
  fileDiffMap: Map<string, FileDiff>,
): ValidationResult {
  const validComments: ValidatedComment[] = [];
  const skippedComments: { path: string; line: number; reason: string }[] = [];

  for (const comment of comments) {
    const matchResult = matchDiffPath(comment.path, fileDiffMap);
    if (!matchResult) {
      skippedComments.push({ path: comment.path, line: comment.line, reason: 'File not found in diff (no exact or unique basename match)' });
      continue;
    }

    const { matchedPath, method } = matchResult;
    const fileDiff = fileDiffMap.get(matchedPath)!;

    if (!isLineCommentable(fileDiff, comment.line)) {
      skippedComments.push({ path: matchedPath, line: comment.line, reason: 'Line not commentable in diff (not added or context)' });
      console.warn(`[ai/review-pr] Skipping comment: line ${comment.line} in "${matchedPath}" (AI path: "${comment.path}", match: ${method}) not present in new file diff`);
      continue;
    }

    console.info(`[ai/review-pr] Valid comment: "${matchedPath}":${comment.line} (AI path: "${comment.path}", match: ${method})`);
    validComments.push({
      path: matchedPath,
      line: comment.line,
      side: 'RIGHT',
      body: comment.body,
      priority: comment.priority,
    });
  }

  if (skippedComments.length > 0) {
    console.info(`[ai/review-pr] Skipped ${skippedComments.length} invalid AI comments:`, skippedComments);
  }

  return { validComments, skippedComments };
}
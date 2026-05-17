export type ReviewSeverity = 'info' | 'warning' | 'error';

export interface ReviewComment {
  id: string;
  workspaceId: string;
  authorId: string;
  lineNumber: number;
  severity: ReviewSeverity;
  message: string;
  suggestion: string;
  createdAt: Date;
}

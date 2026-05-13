export interface CodeSnippet {
  id: string;
  workspaceId: string;
  language: string;
  code: string;
  version: number;
  lastModified: Date;
}

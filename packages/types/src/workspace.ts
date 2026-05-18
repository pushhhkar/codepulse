export interface Workspace {
  id: string;
  ownerId: string;
  title: string;
  isPublic: boolean;
  code: string;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

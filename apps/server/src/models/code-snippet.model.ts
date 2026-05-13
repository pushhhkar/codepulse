import { Schema, model, type Document, type Model, Types } from 'mongoose';
import type { CodeSnippet } from '@codepulse/types';

export interface CodeSnippetDocument
  extends Omit<CodeSnippet, 'id' | 'workspaceId' | 'lastModified'>,
    Document {
  workspaceId: Types.ObjectId;
  lastModified: Date;
}

const codeSnippetSchema = new Schema<CodeSnippetDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    language: { type: String, required: true, trim: true },
    code: { type: String, required: true, default: '' },
    version: { type: Number, required: true, default: 1, min: 1 },
    lastModified: { type: Date, required: true, default: () => new Date() },
  },
  {
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        ret['id'] = ret['_id'];
        ret['workspaceId'] = String(ret['workspaceId']);
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete ret['_id'];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete ret['__v'];
      },
    },
  },
);

export const CodeSnippetModel: Model<CodeSnippetDocument> = model<CodeSnippetDocument>(
  'CodeSnippet',
  codeSnippetSchema,
);

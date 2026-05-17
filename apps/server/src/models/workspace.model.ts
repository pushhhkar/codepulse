import { Schema, model, type Document, type Model, Types } from 'mongoose';
import type { Workspace } from '@codepulse/types';

export interface WorkspaceDocument extends Omit<Workspace, 'id' | 'ownerId' | 'createdAt'>, Document {
  ownerId: Types.ObjectId;
  createdAt: Date;
}

const workspaceSchema = new Schema<WorkspaceDocument>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    isPublic: { type: Boolean, required: true, default: false },
    code: { type: String, default: '' },
    language: { type: String, required: true, default: 'javascript' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        ret['id'] = ret['_id'];
        ret['ownerId'] = String(ret['ownerId']);
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete ret['_id'];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete ret['__v'];
      },
    },
  },
);

export const WorkspaceModel: Model<WorkspaceDocument> = model<WorkspaceDocument>(
  'Workspace',
  workspaceSchema,
);

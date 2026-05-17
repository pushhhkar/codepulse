import { Schema, model, type Document, type Model, Types } from 'mongoose';
import type { ReviewComment, ReviewSeverity } from '@codepulse/types';

export interface ReviewCommentDocument
  extends Omit<ReviewComment, 'id' | 'workspaceId' | 'authorId' | 'createdAt'>,
    Document {
  workspaceId: Types.ObjectId;
  authorId: Types.ObjectId;
  createdAt: Date;
}

const SEVERITIES: ReadonlyArray<ReviewSeverity> = ['info', 'warning', 'error'];

const reviewCommentSchema = new Schema<ReviewCommentDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lineNumber: { type: Number, required: true, min: 1 },
    severity: { type: String, enum: SEVERITIES, required: true },
    message: { type: String, required: true, trim: true },
    suggestion: { type: String, required: true, trim: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        ret['id'] = ret['_id'];
        ret['workspaceId'] = String(ret['workspaceId']);
        ret['authorId'] = String(ret['authorId']);
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete ret['_id'];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete ret['__v'];
      },
    },
  },
);

export const ReviewCommentModel: Model<ReviewCommentDocument> =
  model<ReviewCommentDocument>('ReviewComment', reviewCommentSchema);

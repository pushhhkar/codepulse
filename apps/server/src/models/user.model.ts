import { Schema, model, type Document, type Model } from 'mongoose';
import type { User } from '@codepulse/types';

// `githubAccessToken` is server-only — deliberately NOT part of the shared `User`
// type (which is sent to the client). Persisted with `select: false` so it never
// loads on default queries; retrieve explicitly via `.select('+githubAccessToken')`.
export interface UserDocument extends Omit<User, 'id'>, Document {
  githubAccessToken?: string;
}

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    avatarUrl: { type: String, required: true },
    githubId: { type: String, required: true, unique: true, index: true },
    githubAccessToken: { type: String, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        ret['id'] = ret['_id'];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete ret['_id'];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete ret['__v'];
        // Defense in depth: never serialize the token even if explicitly selected.
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete ret['githubAccessToken'];
      },
    },
  },
);

export const UserModel: Model<UserDocument> = model<UserDocument>('User', userSchema);

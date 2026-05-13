import type { User } from '@codepulse/types';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

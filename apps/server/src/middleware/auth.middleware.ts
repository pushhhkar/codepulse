import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { User } from '@codepulse/types';

interface JwtPayload {
  sub: string;
  name: string;
  email: string;
  avatarUrl: string;
  githubId: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies['token'] as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    req.user = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      avatarUrl: payload.avatarUrl,
      githubId: payload.githubId,
    } satisfies User;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

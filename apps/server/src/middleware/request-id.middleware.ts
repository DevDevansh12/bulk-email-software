import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const id = (req.headers['x-request-id'] as string | undefined) ?? uuidv4();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}

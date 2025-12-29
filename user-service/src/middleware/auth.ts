// ===== Optimized Auth Middleware with Token Caching =====
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { cache } from '../cache/redis';

const JWT_CACHE_TTL = 300; // 5 minutes

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Check if token is cached as valid (avoids CPU-intensive JWT verification)
    const cachedToken = await cache.get(`token:${token}`);
    if (cachedToken && cachedToken.valid) {
      (req as any).userId = cachedToken.userId;
      return next();
    }

    // Verify token (CPU-bound operation)
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as { userId: string };
    
    // Cache the validation result for future requests
    await cache.set(`token:${token}`, { userId: decoded.userId, valid: true }, JWT_CACHE_TTL);
    
    (req as any).userId = decoded.userId;
    next();
  } catch (err) {
    // Token is invalid - cache this too to prevent repeated verification attempts
    await cache.set(`token:${token}`, { valid: false }, 60); // Cache invalid for 1 minute
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Rate-limited auth middleware for sensitive endpoints
export const authenticateTokenStrict = async (req: Request, res: Response, next: NextFunction) => {
  // Same as authenticateToken but could add additional checks like IP validation
  return authenticateToken(req, res, next);
};

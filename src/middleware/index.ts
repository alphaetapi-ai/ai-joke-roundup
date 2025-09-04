import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

// Function to generate visitor nonce
export function generateVisitorNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Middleware to ensure visitor has a unique identifier
export function ensureVisitorCookie(req: Request, res: Response, next: NextFunction): void {
  if (!req.cookies.visitor_id) {
    const visitorId = generateVisitorNonce();
    res.cookie('visitor_id', visitorId, {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax'
    });
    req.visitor_id = visitorId;
  } else {
    req.visitor_id = req.cookies.visitor_id;
  }
  next();
}
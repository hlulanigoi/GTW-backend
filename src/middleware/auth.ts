import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
  role?: string;
}

export function generateTokens(userId: string, email: string, role: string) {
  const accessToken = jwt.sign(
    { userId, email, role },
    config.jwtSecret!,
    { expiresIn: config.jwtExpiration }
  );

  const refreshToken = jwt.sign(
    { userId, email, role },
    config.jwtRefreshSecret!,
    { expiresIn: config.jwtRefreshExpiration }
  );

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret!) as JwtPayload;
  } catch (error) {
    return null;
  }
}

export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtRefreshSecret!) as JwtPayload;
  } catch (error) {
    return null;
  }
}

export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }
  return parts[1];
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        error: "Unauthorized: Missing authentication token",
        code: "MISSING_TOKEN",
      });
      return;
    }

    const payload = verifyAccessToken(token);

    if (!payload) {
      res.status(401).json({
        error: "Unauthorized: Invalid or expired token",
        code: "INVALID_TOKEN",
      });
      return;
    }

    // Check if user is suspended
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.userId),
    });

    if (!user) {
      res.status(401).json({
        error: "Unauthorized: User not found",
        code: "USER_NOT_FOUND",
      });
      return;
    }

    if (user.suspended) {
      res.status(403).json({
        error: "Forbidden: Account has been suspended",
        code: "ACCOUNT_SUSPENDED",
      });
      return;
    }

    req.userId = payload.userId;
    req.user = user;
    req.role = user.role;

    next();
  } catch (error) {
    res.status(500).json({
      error: "Internal server error during authentication",
      code: "AUTH_ERROR",
    });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.role || !roles.includes(req.role)) {
      res.status(403).json({
        error: `Forbidden: This action requires one of these roles: ${roles.join(", ")}`,
        code: "INSUFFICIENT_PERMISSION",
      });
      return;
    }
    next();
  };
}

export function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      next();
      return;
    }

    const payload = verifyAccessToken(token);

    if (payload) {
      req.userId = payload.userId;
      req.role = payload.role;
    }

    next();
  } catch (error) {
    next();
  }
}

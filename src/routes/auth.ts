import { Router } from "express";
import { db } from "../../db";
import { users, passwordResetTokens } from "../../db/schema";
import {
  generateTokens,
  verifyRefreshToken,
  authMiddleware,
  extractTokenFromHeader,
  AuthRequest,
} from "../../middleware/auth";
import { AppError, catchAsync } from "../../middleware/errorHandler";
import {
  signupSchema,
  signinSchema,
  refreshTokenSchema,
  changePasswordSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  validateRequest,
} from "../../utils/validation";
import { hashPassword, comparePasswords, generateConfirmationToken } from "../../utils/helpers";
import { generateFirebasePasswordResetLink } from "../../utils/firebase";
import { sendMail } from "../../utils/email";
import config from "../../config";
import { eq } from "drizzle-orm";
import { Response } from "express";

const router = Router();

// POST /api/auth/signup
router.post(
  "/signup",
  validateRequest(signupSchema),
  catchAsync(async (req, res: Response) => {
    const { email, password, name, phone } = req.validatedData;

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      throw new AppError(409, "Email already registered", "EMAIL_EXISTS");
    }

    const passwordHash = await hashPassword(password);

    const [newUser] = await db
      .insert(users)
      .values({
        email,
        name,
        phone,
        passwordHash,
      })
      .returning();

    const { accessToken, refreshToken } = generateTokens(
      newUser.id,
      newUser.email,
      newUser.role
    );

    res.status(201).json({
      user: sanitizeUser(newUser),
      accessToken,
      refreshToken,
      expiresIn: "15m",
    });
  })
);

// POST /api/auth/signin
router.post(
  "/signin",
  validateRequest(signinSchema),
  catchAsync(async (req, res: Response) => {
    const { email, password } = req.validatedData;

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    if (user.suspended) {
      throw new AppError(
        403,
        "Account has been suspended",
        "ACCOUNT_SUSPENDED"
      );
    }

    const isPasswordValid = await comparePasswords(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.email,
      user.role
    );

    res.json({
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
      expiresIn: "15m",
    });
  })
);

// POST /api/auth/refresh
router.post(
  "/refresh",
  validateRequest(refreshTokenSchema),
  catchAsync(async (req, res: Response) => {
    const { refreshToken } = req.validatedData;

    const payload = verifyRefreshToken(refreshToken);

    if (!payload) {
      throw new AppError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.userId),
    });

    if (!user || user.suspended) {
      throw new AppError(401, "User not found or suspended", "INVALID_USER");
    }

    const tokens = generateTokens(user.id, user.email, user.role);

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: "15m",
    });
  })
);

// POST /api/auth/signout
router.post(
  "/signout",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    // In a production app, you'd invalidate the token by storing it in a blacklist
    res.json({ message: "Signed out successfully" });
  })
);

// POST /api/auth/change-password
router.post(
  "/change-password",
  authMiddleware,
  validateRequest(changePasswordSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.validatedData;

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.userId!),
    });

    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    const isCurrentPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash
    );

    if (!isCurrentPasswordValid) {
      throw new AppError(
        401,
        "Current password is incorrect",
        "INVALID_PASSWORD"
      );
    }

    const newPasswordHash = await hashPassword(newPassword);

    await db
      .update(users)
      .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
      .where(eq(users.id, req.userId!));

    res.json({ message: "Password changed successfully" });
  })
);

// POST /api/auth/request-password-reset
router.post(
  "/request-password-reset",
  validateRequest(requestPasswordResetSchema),
  catchAsync(async (req, res: Response) => {
    const { email } = req.validatedData;

    // Don't reveal if email exists
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (user) {
      let resetUrl: string | null = null;

      try {
        resetUrl = await generateFirebasePasswordResetLink(email);

        await sendMail({
          to: email,
          subject: "Reset your password",
          text: `A password reset was requested. Use the link below to reset your password:\n\n${resetUrl}\n\nIf you didn't request this, ignore this message.`,
          html: `<p>A password reset was requested. Use the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
        });

        console.info(`Firebase password reset link sent to ${email}`);
      } catch (error) {
        console.warn("Firebase password reset failed, falling back to local flow:", error);

        const token = generateConfirmationToken();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

        await db
          .insert(passwordResetTokens)
          .values({
            userId: user.id,
            token,
            expiresAt,
          })
          .onConflictDoNothing();

        const localResetUrl = `${config.apiBaseUrl}/auth/reset-password?token=${token}`;
        console.info(`Local password reset link for ${user.email}: ${localResetUrl}`);

        // Email local link as fallback
        await sendMail({
          to: email,
          subject: "Reset your password",
          text: `A password reset was requested. Use the link below to reset your password:\n\n${localResetUrl}\n\nIf you didn't request this, ignore this message.`,
          html: `<p>A password reset was requested. Use the link below to reset your password:</p><p><a href="${localResetUrl}">${localResetUrl}</a></p>`,
        });
      }
    }

    res.json({
      message:
        "If an account with this email exists, a reset link has been sent",
    });
  })
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  validateRequest(resetPasswordSchema),
  catchAsync(async (req, res: Response) => {
    const { token, newPassword } = req.validatedData;

    const record = await db.query.passwordResetTokens.findFirst({
      where: eq(passwordResetTokens.token, token),
    });

    if (!record || record.used || new Date(record.expiresAt) < new Date()) {
      throw new AppError(400, "Invalid or expired password reset token", "INVALID_TOKEN");
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, record.userId),
    });

    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    const newPasswordHash = await hashPassword(newPassword);

    await db
      .update(users)
      .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, record.id));

    res.json({ message: "Password has been reset successfully" });
  })
);

// GET /api/auth/me
router.get(
  "/me",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.userId!),
    });

    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    res.json(sanitizeUser(user));
  })
);

// Helper function
function sanitizeUser(user: any) {
  const { passwordHash, ...sanitized } = user;
  return sanitized;
}

export default router;

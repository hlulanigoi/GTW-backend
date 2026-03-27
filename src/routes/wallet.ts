import { Router } from "express";
import { db } from "../../db";
import {
  users,
  walletTransactions,
  payments,
  savedPaymentMethods,
  autoTopUpSettings,
} from "../../db/schema";
import { authMiddleware, AuthRequest } from "../../middleware/auth";
import { AppError, catchAsync } from "../../middleware/errorHandler";
import {
  topupInitializeSchema,
  autoTopupSchema,
  validateRequest,
} from "../../utils/validation";
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
  calculatePlatformFee,
} from "../../utils/helpers";
import { eq, and } from "drizzle-orm";
import { Response } from "express";

const router = Router();

// GET /api/wallet/balance
router.get(
  "/balance",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.userId!),
    });

    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    res.json({
      balance: user.walletBalance,
      currency: "ZAR",
    });
  })
);

// GET /api/wallet/transactions
router.get(
  "/transactions",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const transactions = await db.query.walletTransactions.findMany({
      where: eq(walletTransactions.userId, req.userId!),
      limit,
      offset,
    });

    res.json({
      transactions,
      page,
      limit,
    });
  })
);

// POST /api/wallet/topup/initialize
router.post(
  "/topup/initialize",
  authMiddleware,
  validateRequest(topupInitializeSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { amount } = req.validatedData;

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.userId!),
    });

    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    // Create pending transaction record
    const [transaction] = await db
      .insert(walletTransactions)
      .values({
        userId: req.userId!,
        type: "topup",
        amount: amount.toString(),
        currency: "ZAR",
        status: "pending",
        description: "Wallet top-up",
      })
      .returning();

    // Initialize Paystack transaction
    const paystackResponse = await initializePaystackTransaction(
      user.email,
      amount,
      { transactionId: transaction.id, userId: req.userId! }
    );

    if (!paystackResponse.status) {
      throw new AppError(
        400,
        "Failed to initialize payment",
        "PAYSTACK_ERROR"
      );
    }

    res.json({
      authorizationUrl: paystackResponse.data.authorization_url,
      accessCode: paystackResponse.data.access_code,
      reference: paystackResponse.data.reference,
    });
  })
);

// GET /api/wallet/topup/verify/:reference
router.get(
  "/topup/verify/:reference",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { reference } = req.params;

    // Verify with Paystack
    const verificationResult = await verifyPaystackTransaction(reference);

    if (!verificationResult.status) {
      throw new AppError(
        400,
        "Payment verification failed",
        "VERIFICATION_FAILED"
      );
    }

    const paystackData = verificationResult.data;
    const amount = paystackData.amount / 100; // Convert from kobo

    // Find the transaction record
    const transaction = await db.query.walletTransactions.findFirst({
      where: and(
        eq(walletTransactions.userId, req.userId!),
        eq(walletTransactions.type, "topup"),
        eq(walletTransactions.reference, reference)
      ),
    });

    if (transaction) {
      // Update transaction status
      await db
        .update(walletTransactions)
        .set({
          status: "completed",
          reference,
        })
        .where(eq(walletTransactions.id, transaction.id));

      // Update user wallet balance
      const user = await db.query.users.findFirst({
        where: eq(users.id, req.userId!),
      });

      if (user) {
        const newBalance =
          parseFloat(user.walletBalance as any) + amount;
        await db
          .update(users)
          .set({
            walletBalance: newBalance.toString(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, req.userId!));
      }
    }

    res.json({
      success: true,
      message: "Payment verified successfully",
      amount,
    });
  })
);

// GET /api/wallet/payment-methods
router.get(
  "/payment-methods",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const methods = await db.query.savedPaymentMethods.findMany({
      where: eq(savedPaymentMethods.userId, req.userId!),
    });

    res.json(methods);
  })
);

// DELETE /api/wallet/payment-methods/:id
router.delete(
  "/payment-methods/:id",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const method = await db.query.savedPaymentMethods.findFirst({
      where: eq(savedPaymentMethods.id, req.params.id),
    });

    if (!method) {
      throw new AppError(404, "Payment method not found", "NOT_FOUND");
    }

    if (method.userId !== req.userId!) {
      throw new AppError(403, "Unauthorized", "FORBIDDEN");
    }

    await db
      .delete(savedPaymentMethods)
      .where(eq(savedPaymentMethods.id, req.params.id));

    res.status(204).send();
  })
);

// GET /api/wallet/auto-topup
router.get(
  "/auto-topup",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const settings = await db.query.autoTopUpSettings.findFirst({
      where: eq(autoTopUpSettings.userId, req.userId!),
    });

    res.json(settings || { enabled: false });
  })
);

// POST /api/wallet/auto-topup
router.post(
  "/auto-topup",
  authMiddleware,
  validateRequest(autoTopupSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { enabled, triggerAmount, topUpAmount, paymentMethodId } =
      req.validatedData;

    const existingSettings = await db.query.autoTopUpSettings.findFirst({
      where: eq(autoTopUpSettings.userId, req.userId!),
    });

    if (existingSettings) {
      const [updated] = await db
        .update(autoTopUpSettings)
        .set({
          enabled,
          triggerAmount: triggerAmount?.toString(),
          topUpAmount: topUpAmount?.toString(),
          paymentMethodId,
        })
        .where(eq(autoTopUpSettings.userId, req.userId!))
        .returning();

      return res.json(updated);
    }

    const [created] = await db
      .insert(autoTopUpSettings)
      .values({
        userId: req.userId!,
        enabled,
        triggerAmount: triggerAmount?.toString(),
        topUpAmount: topUpAmount?.toString(),
        paymentMethodId,
      })
      .returning();

    res.status(201).json(created);
  })
);

export default router;

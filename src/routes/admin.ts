import { Router } from "express";
import { db } from "../../db";
import {
  users,
  parcels,
  routes as routesTable,
  payments,
  disputes,
  reviews,
  subscriptions,
  walletTransactions,
} from "../../db/schema";
import {
  authMiddleware,
  requireRole,
  AuthRequest,
} from "../../middleware/auth";
import {
  AppError,
  catchAsync,
} from "../../middleware/errorHandler";
import {
  updateUserSchema,
  updateParcelSchema,
  updateRouteSchema,
  updateDisputeSchema,
  autoTopupSchema,
  validateRequest,
} from "../../utils/validation";
import { eq, and, count, ilike } from "drizzle-orm";
import { Response } from "express";
import Joi from "joi";

const router = Router();

// Middleware: Admin only
router.use(authMiddleware);
router.use(requireRole("admin", "support"));

// === DASHBOARD ===

// GET /api/admin/stats
router.get(
  "/stats",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const totalUsers = await db
      .select({ count: count() })
      .from(users);

    const totalParcels = await db
      .select({ count: count() })
      .from(parcels);

    const pendingParcels = await db
      .select({ count: count() })
      .from(parcels)
      .where(eq(parcels.status, "Pending"));

    const totalRoutes = await db
      .select({ count: count() })
      .from(routesTable);

    const totalPayments = await db
      .select({ count: count() })
      .from(payments);

    const totalDisputes = await db
      .select({ count: count() })
      .from(disputes);

    const openDisputes = await db
      .select({ count: count() })
      .from(disputes)
      .where(eq(disputes.status, "open"));

    const activeSubscriptions = await db
      .select({ count: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, "active"));

    res.json({
      users: {
        total: totalUsers[0].count,
      },
      parcels: {
        total: totalParcels[0].count,
        pending: pendingParcels[0].count,
      },
      routes: {
        total: totalRoutes[0].count,
      },
      payments: {
        total: totalPayments[0].count,
      },
      disputes: {
        total: totalDisputes[0].count,
        open: openDisputes[0].count,
      },
      subscriptions: {
        active: activeSubscriptions[0].count,
      },
    });
  })
);

// === USER MANAGEMENT ===

// GET /api/admin/users
router.get(
  "/users",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const role = req.query.role as string;

    let whereClause = true;

    if (search) {
      whereClause = ilike(users.email, `%${search}%`);
    }

    if (role) {
      whereClause = and(whereClause, eq(users.role, role as any));
    }

    const allUsers = await db.query.users.findMany({
      limit,
      offset,
      where: whereClause,
    });

    const sanitized = allUsers.map((u) => {
      const { passwordHash, ...rest } = u;
      return rest;
    });

    res.json({
      users: sanitized,
      page,
      limit,
    });
  })
);

// GET /api/admin/users/:id
router.get(
  "/users/:id",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.params.id),
    });

    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    const { passwordHash, ...sanitized } = user;

    res.json(sanitized);
  })
);

// PATCH /api/admin/users/:id
router.patch(
  "/users/:id",
  requireRole("admin"),
  validateRequest(updateUserSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.params.id),
    });

    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    const [updated] = await db
      .update(users)
      .set({
        ...req.validatedData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.params.id))
      .returning();

    const { passwordHash, ...sanitized } = updated;

    res.json(sanitized);
  })
);

// DELETE /api/admin/users/:id
router.delete(
  "/users/:id",
  requireRole("admin"),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.params.id),
    });

    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    await db.delete(users).where(eq(users.id, req.params.id));

    res.status(204).send();
  })
);

// === PARCEL MANAGEMENT ===

// GET /api/admin/parcels
router.get(
  "/parcels",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let where = true;

    if (status) {
      where = eq(parcels.status, status as any);
    }

    const allParcels = await db.query.parcels.findMany({
      limit,
      offset,
      where,
    });

    res.json({
      parcels: allParcels,
      page,
      limit,
    });
  })
);

// PATCH /api/admin/parcels/:id
router.patch(
  "/parcels/:id",
  validateRequest(updateParcelSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, req.params.id),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    const [updated] = await db
      .update(parcels)
      .set({
        ...req.validatedData,
        updatedAt: new Date(),
      })
      .where(eq(parcels.id, req.params.id))
      .returning();

    res.json(updated);
  })
);

// DELETE /api/admin/parcels/:id
router.delete(
  "/parcels/:id",
  requireRole("admin"),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, req.params.id),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    await db.delete(parcels).where(eq(parcels.id, req.params.id));

    res.status(204).send();
  })
);

// === ROUTE MANAGEMENT ===

// GET /api/admin/routes
router.get(
  "/routes",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let where = true;

    if (status) {
      where = eq(routesTable.status, status as any);
    }

    const allRoutes = await db.query.routes.findMany({
      limit,
      offset,
      where,
    });

    res.json({
      routes: allRoutes,
      page,
      limit,
    });
  })
);

// PATCH /api/admin/routes/:id
router.patch(
  "/routes/:id",
  requireRole("admin"),
  validateRequest(updateRouteSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const route = await db.query.routes.findFirst({
      where: eq(routesTable.id, req.params.id),
    });

    if (!route) {
      throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
    }

    const [updated] = await db
      .update(routesTable)
      .set({
        ...req.validatedData,
        updatedAt: new Date(),
      })
      .where(eq(routesTable.id, req.params.id))
      .returning();

    res.json(updated);
  })
);

// DELETE /api/admin/routes/:id
router.delete(
  "/routes/:id",
  requireRole("admin"),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const route = await db.query.routes.findFirst({
      where: eq(routesTable.id, req.params.id),
    });

    if (!route) {
      throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
    }

    await db.delete(routesTable).where(eq(routesTable.id, req.params.id));

    res.status(204).send();
  })
);

// === PAYMENT MANAGEMENT ===

// GET /api/admin/payments
router.get(
  "/payments",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let where = true;

    if (status) {
      where = eq(payments.status, status as any);
    }

    const allPayments = await db.query.payments.findMany({
      limit,
      offset,
      where,
    });

    res.json({
      payments: allPayments,
      page,
      limit,
    });
  })
);

// POST /api/admin/payments/:id/refund
router.post(
  "/payments/:id/refund",
  requireRole("admin"),
  validateRequest(
    Joi.object({
      reason: Joi.string().required(),
    })
  ),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const payment = await db.query.payments.findFirst({
      where: eq(payments.id, req.params.id),
    });

    if (!payment) {
      throw new AppError(404, "Payment not found", "NOT_FOUND");
    }

    // Update payment status
    await db
      .update(payments)
      .set({
        status: "refunded",
      })
      .where(eq(payments.id, req.params.id));

    // Create refund transaction
    await db.insert(walletTransactions).values({
      userId: payment.senderId,
      type: "refund",
      amount: payment.amount.toString(),
      status: "completed",
      reference: payment.id,
      description: `Refund for payment ${payment.id}: ${req.validatedData.reason}`,
    });

    // Update sender's wallet
    const sender = await db.query.users.findFirst({
      where: eq(users.id, payment.senderId),
    });

    if (sender) {
      const refundAmount = parseFloat(payment.amount as any);
      const newBalance = parseFloat(sender.walletBalance as any) + refundAmount;

      await db
        .update(users)
        .set({
          walletBalance: newBalance.toString(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, payment.senderId));
    }

    res.json({
      message: "Refund processed successfully",
      paymentId: payment.id,
    });
  })
);

// === DISPUTE MANAGEMENT ===

// GET /api/admin/disputes
router.get(
  "/disputes",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let where = true;

    if (status) {
      where = eq(disputes.status, status as any);
    }

    const allDisputes = await db.query.disputes.findMany({
      limit,
      offset,
      where,
    });

    res.json({
      disputes: allDisputes,
      page,
      limit,
    });
  })
);

// PATCH /api/admin/disputes/:id
router.patch(
  "/disputes/:id",
  validateRequest(updateDisputeSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const dispute = await db.query.disputes.findFirst({
      where: eq(disputes.id, req.params.id),
    });

    if (!dispute) {
      throw new AppError(404, "Dispute not found", "DISPUTE_NOT_FOUND");
    }

    const updateData = {
      ...req.validatedData,
      adminId: req.userId!,
      resolvedAt: req.validatedData.status === "resolved" ? new Date() : null,
    };

    const [updated] = await db
      .update(disputes)
      .set(updateData)
      .where(eq(disputes.id, req.params.id))
      .returning();

    res.json(updated);
  })
);

// === SUBSCRIPTION MANAGEMENT ===

// GET /api/admin/subscriptions
router.get(
  "/subscriptions",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let where = true;

    if (status) {
      where = eq(subscriptions.status, status as any);
    }

    const allSubscriptions = await db.query.subscriptions.findMany({
      limit,
      offset,
      where,
    });

    res.json({
      subscriptions: allSubscriptions,
      page,
      limit,
    });
  })
);

// === WALLET MANAGEMENT ===

// GET /api/admin/wallets
router.get(
  "/wallets",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const transactions = await db.query.walletTransactions.findMany({
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

// POST /api/admin/wallets/adjust
router.post(
  "/wallets/adjust",
  requireRole("admin"),
  validateRequest(
    Joi.object({
      userId: Joi.string().uuid().required(),
      amount: Joi.number().required(),
      reason: Joi.string().required(),
    })
  ),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { userId, amount, reason } = req.validatedData;

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    // Create transaction
    const [transaction] = await db
      .insert(walletTransactions)
      .values({
        userId,
        type: "fee", // Using 'fee' as a general adjustment type
        amount: amount.toString(),
        status: "completed",
        description: reason,
      })
      .returning();

    // Update user balance
    const newBalance = parseFloat(user.walletBalance as any) + amount;

    await db
      .update(users)
      .set({
        walletBalance: newBalance.toString(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    res.status(201).json({
      transaction,
      newBalance,
    });
  })
);

export default router;

import { Router } from "express";
import { db } from "../../db";
import {
  reviews,
  users,
  disputes,
  disputeMessages,
  parcels,
} from "../../db/schema";
import { authMiddleware, AuthRequest } from "../../middleware/auth";
import { AppError, catchAsync } from "../../middleware/errorHandler";
import {
  createReviewSchema,
  createDisputeSchema,
  updateDisputeSchema,
  sendMessageSchema,
  validateRequest,
} from "../../utils/validation";
import { eq, and, avg } from "drizzle-orm";
import { Response } from "express";

const router = Router();

// POST /api/reviews
router.post(
  "/",
  authMiddleware,
  validateRequest(createReviewSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { parcelId, revieweeId, rating, comment } = req.validatedData;

    // Check if parcel exists and user is involved
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, parcelId),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    if (
      req.userId! !== parcel.senderId &&
      req.userId! !== parcel.transporterId
    ) {
      throw new AppError(
        403,
        "You are not involved in this parcel",
        "FORBIDDEN"
      );
    }

    if (req.userId! === revieweeId) {
      throw new AppError(400, "Cannot review yourself", "INVALID_REVIEWEE");
    }

    // Check if review already exists
    const existing = await db.query.reviews.findFirst({
      where: and(
        eq(reviews.parcelId, parcelId),
        eq(reviews.reviewerId, req.userId!),
        eq(reviews.revieweeId, revieweeId)
      ),
    });

    if (existing) {
      throw new AppError(400, "You already reviewed this user", "ALREADY_REVIEWED");
    }

    const [newReview] = await db
      .insert(reviews)
      .values({
        parcelId,
        reviewerId: req.userId!,
        revieweeId,
        rating,
        comment,
      })
      .returning();

    // Update reviewee's average rating
    const userReviews = await db
      .select({ avgRating: avg(reviews.rating) })
      .from(reviews)
      .where(eq(reviews.revieweeId, revieweeId));

    const avgRating = userReviews[0].avgRating
      ? Math.round(parseFloat(userReviews[0].avgRating as any) * 100) / 100
      : 0;

    await db
      .update(users)
      .set({ rating: avgRating.toString(), updatedAt: new Date() })
      .where(eq(users.id, revieweeId));

    res.status(201).json(newReview);
  })
);

// GET /api/reviews/:userId
router.get(
  "/:userId",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const userReviews = await db.query.reviews.findMany({
      where: eq(reviews.revieweeId, req.params.userId),
    });

    res.json(userReviews);
  })
);

// === DISPUTES ===

// GET /api/disputes
router.get(
  "/",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const userDisputes = await db.query.disputes.findMany({
      where: or(
        eq(disputes.complainantId, req.userId!),
        eq(disputes.respondentId, req.userId!)
      ),
    });

    res.json(userDisputes);
  })
);

// POST /api/disputes
router.post(
  "/",
  authMiddleware,
  validateRequest(createDisputeSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { parcelId, respondentId, subject, description } = req.validatedData;

    // Check if parcel exists
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, parcelId),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    // Check if user is involved in parcel
    if (
      req.userId! !== parcel.senderId &&
      req.userId! !== parcel.transporterId
    ) {
      throw new AppError(403, "You are not involved in this parcel", "FORBIDDEN");
    }

    const [newDispute] = await db
      .insert(disputes)
      .values({
        parcelId,
        complainantId: req.userId!,
        respondentId,
        subject,
        description,
      })
      .returning();

    res.status(201).json(newDispute);
  })
);

// GET /api/disputes/:id
router.get(
  "/:id",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const dispute = await db.query.disputes.findFirst({
      where: eq(disputes.id, req.params.id),
    });

    if (!dispute) {
      throw new AppError(404, "Dispute not found", "NOT_FOUND");
    }

    // Check if user is participant or admin
    if (
      req.userId! !== dispute.complainantId &&
      req.userId! !== dispute.respondentId &&
      req.role !== "admin" &&
      req.role !== "support"
    ) {
      throw new AppError(403, "Unauthorized", "FORBIDDEN");
    }

    const disputeMessages = await db.query.disputeMessages.findMany({
      where: eq(disputeMessages.disputeId, req.params.id),
    });

    res.json({
      dispute,
      messages: disputeMessages,
    });
  })
);

// PATCH /api/disputes/:id
router.patch(
  "/:id",
  authMiddleware,
  validateRequest(updateDisputeSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const dispute = await db.query.disputes.findFirst({
      where: eq(disputes.id, req.params.id),
    });

    if (!dispute) {
      throw new AppError(404, "Dispute not found", "NOT_FOUND");
    }

    // Only admin or support can update disputes
    if (req.role !== "admin" && req.role !== "support") {
      throw new AppError(403, "Only admins can update disputes", "FORBIDDEN");
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

// POST /api/disputes/:id/messages
router.post(
  "/:id/messages",
  authMiddleware,
  validateRequest(sendMessageSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { content } = req.validatedData;

    const dispute = await db.query.disputes.findFirst({
      where: eq(disputes.id, req.params.id),
    });

    if (!dispute) {
      throw new AppError(404, "Dispute not found", "NOT_FOUND");
    }

    // Check if user is participant or admin
    if (
      req.userId! !== dispute.complainantId &&
      req.userId! !== dispute.respondentId &&
      req.role !== "admin" &&
      req.role !== "support"
    ) {
      throw new AppError(403, "Unauthorized", "FORBIDDEN");
    }

    const [message] = await db
      .insert(disputeMessages)
      .values({
        disputeId: req.params.id,
        senderId: req.userId!,
        content,
      })
      .returning();

    res.status(201).json(message);
  })
);

function or(...conditions: any[]) {
  return conditions.reduce((acc, cond) => acc || cond);
}

export default router;

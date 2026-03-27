import { Router } from "express";
import { db } from "../../db";
import { users, reviews, parcels } from "../../db/schema";
import { authMiddleware, AuthRequest } from "../../middleware/auth";
import { AppError, catchAsync } from "../../middleware/errorHandler";
import {
  updateUserSchema,
  validateRequest,
} from "../../utils/validation";
import { eq, like, count, and } from "drizzle-orm";
import { Response } from "express";

const router = Router();

// GET /api/users/search?q=<term>
router.get(
  "/search",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const query = req.query.q as string;

    if (!query || query.length < 2) {
      return res.json({ error: "Query must be at least 2 characters", users: [] });
    }

    const results = await db.query.users.findMany({
      where: like(users.name, `%${query}%`),
      limit: 10,
    });

    const sanitized = results.map((u) => {
      const { passwordHash, ...rest } = u;
      return rest;
    });

    res.json(sanitized);
  })
);

// GET /api/users/:id
router.get(
  "/:id",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.params.id),
    });

    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    // Calculate user stats
    const sentParcelsCount = await db
      .select({ count: count() })
      .from(parcels)
      .where(eq(parcels.senderId, user.id));

    const transportedParcelsCount = await db
      .select({ count: count() })
      .from(parcels)
      .where(eq(parcels.transporterId, user.id));

    const reviewsData = await db
      .select({ count: count() })
      .from(reviews)
      .where(eq(reviews.revieweeId, user.id));

    const { passwordHash, ...sanitized } = user;

    res.json({
      ...sanitized,
      stats: {
        sentParcels: sentParcelsCount[0].count,
        transportedParcels: transportedParcelsCount[0].count,
        reviews: reviewsData[0].count,
        rating: user.rating,
      },
    });
  })
);

// PATCH /api/users/:id
router.patch(
  "/:id",
  authMiddleware,
  validateRequest(updateUserSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    // Users can only update their own profile, or admin can update anyone
    if (req.userId !== req.params.id && req.role !== "admin") {
      throw new AppError(
        403,
        "You can only update your own profile",
        "FORBIDDEN"
      );
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.params.id),
    });

    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        ...req.validatedData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.params.id))
      .returning();

    const { passwordHash, ...sanitized } = updatedUser;

    res.json(sanitized);
  })
);

// GET /api/users/:id/reviews
router.get(
  "/:id/reviews",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const userReviews = await db.query.reviews.findMany({
      where: eq(reviews.revieweeId, req.params.id),
    });

    res.json(userReviews);
  })
);

export default router;

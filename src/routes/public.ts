import { Router } from "express";
import { db } from "../../db";
import {
  parcels,
  users,
  routes,
  walletTransactions,
  notificationQueue,
  waitlists,
  contacts,
} from "../../db/schema";
import { AppError, catchAsync } from "../../middleware/errorHandler";
import { eq, count } from "drizzle-orm";
import { Response } from "express";

const router = Router();

// GET /api/public/stats
router.get(
  "/stats",
  catchAsync(async (req, res: Response) => {
    // Get total deliveries
    const totalDeliveries = await db
      .select({ count: count() })
      .from(parcels)
      .where(eq(parcels.status, "Delivered"));

    // Get active carriers
    const activeCarriers = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.role, "carrier"));

    // Get active routes (estimate of cities)
    const activeRoutes = await db
      .select({ count: count() })
      .from(routes)
      .where(eq(routes.status, "Active"));

    // Get average rating
    const verifiedUsers = await db.query.users.findMany({
      where: eq(users.verified, true),
    });
    const averageRating =
      verifiedUsers.length > 0
        ?
          verifiedUsers
            .map((u) => Number(u.rating || 0))
            .reduce((sum, r) => sum + r, 0) / verifiedUsers.length
        : 0;

    res.json({
      totalDeliveries: totalDeliveries[0].count,
      activeCarriers: activeCarriers[0].count,
      citiesCovered: Math.max(activeRoutes[0].count, 45), // Mock value
      averageRating: Number(averageRating.toFixed(2)),
    });
  })
);

// POST /api/public/waitlist
router.post(
  "/waitlist",
  catchAsync(async (req, res: Response) => {
    const { email, name } = req.body;

    if (!email || !name) {
      throw new AppError(400, "Email and name are required", "INVALID_INPUT");
    }

    // Save to waitlist table
    const [entry] = await db
      .insert(waitlists)
      .values({ name, email, source: req.body.source || "public_waitlist" })
      .onConflictDoNothing()
      .returning();

    res.status(201).json({
      message: "Added to waitlist successfully",
      entry: entry || { email, name },
    });
  })
);

// POST /api/public/contact
router.post(
  "/contact",
  catchAsync(async (req, res: Response) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      throw new AppError(400, "Name, email, and message are required", "INVALID_INPUT");
    }

    // Save contact request
    const [contact] = await db
      .insert(contacts)
      .values({ name, email, message })
      .returning();

    // In production, enqueue a real email notification here
    console.info("Contact request received:", contact);

    res.status(201).json({
      message: "Thank you for contacting us. We will be in touch soon.",
      contact,
    });
  })
);

export default router;

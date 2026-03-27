import { Router } from "express";
import { db } from "../../db";
import {
  carrierLocations,
  receiverLocations,
  parcels,
} from "../../db/schema";
import { authMiddleware, AuthRequest } from "../../middleware/auth";
import { AppError, catchAsync } from "../../middleware/errorHandler";
import { eq } from "drizzle-orm";
import { Response } from "express";

const router = Router();

// POST /api/tracking/carrier-location
router.post(
  "/carrier-location",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { parcelId, lat, lng, accuracy, heading, speed } = req.body;

    if (!parcelId || lat == null || lng == null) {
      throw new AppError(
        400,
        "parcelId, lat, and lng are required",
        "MISSING_FIELDS"
      );
    }

    // Verify parcel exists and user is the transporter
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, parcelId),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    if (parcel.transporterId !== req.userId!) {
      throw new AppError(403, "You are not assigned to this parcel", "FORBIDDEN");
    }

    const [location] = await db
      .insert(carrierLocations)
      .values({
        carrierId: req.userId!,
        parcelId,
        lat: lat.toString(),
        lng: lng.toString(),
        accuracy: accuracy?.toString(),
        heading: heading?.toString(),
        speed: speed?.toString(),
      })
      .returning();

    res.status(201).json(location);
  })
);

// GET /api/tracking/carrier-location/:parcelId
router.get(
  "/carrier-location/:parcelId",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { parcelId } = req.params;

    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, parcelId),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    // Only sender, receiver, or admin can view carrier location
    if (
      req.userId! !== parcel.senderId &&
      req.userId! !== parcel.receiverId &&
      req.role !== "admin"
    ) {
      throw new AppError(403, "Unauthorized", "FORBIDDEN");
    }

    const locations = await db.query.carrierLocations.findMany({
      where: eq(carrierLocations.parcelId, parcelId),
      limit: 1,
      orderBy: (t, desc) => desc(t.createdAt),
    });

    if (locations.length === 0) {
      throw new AppError(404, "No location found", "NOT_FOUND");
    }

    res.json(locations[0]);
  })
);

// POST /api/tracking/receiver-location
router.post(
  "/receiver-location",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { parcelId, lat, lng } = req.body;

    if (!parcelId || lat == null || lng == null) {
      throw new AppError(
        400,
        "parcelId, lat, and lng are required",
        "MISSING_FIELDS"
      );
    }

    // Verify parcel exists and user is the receiver
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, parcelId),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    if (parcel.receiverId !== req.userId! && parcel.receiverEmail !== req.user?.email) {
      throw new AppError(403, "You are not the receiver", "FORBIDDEN");
    }

    const [location] = await db
      .insert(receiverLocations)
      .values({
        receiverId: req.userId!,
        parcelId,
        lat: lat.toString(),
        lng: lng.toString(),
      })
      .returning();

    res.status(201).json(location);
  })
);

// GET /api/tracking/receiver-location/:parcelId
router.get(
  "/receiver-location/:parcelId",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { parcelId } = req.params;

    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, parcelId),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    // Only carrier or admin can view receiver location
    if (
      req.userId! !== parcel.transporterId &&
      req.role !== "admin"
    ) {
      throw new AppError(403, "Unauthorized", "FORBIDDEN");
    }

    const locations = await db.query.receiverLocations.findMany({
      where: eq(receiverLocations.parcelId, parcelId),
      limit: 1,
      orderBy: (t, desc) => desc(t.createdAt),
    });

    if (locations.length === 0) {
      throw new AppError(404, "No location found", "NOT_FOUND");
    }

    res.json(locations[0]);
  })
);

export default router;

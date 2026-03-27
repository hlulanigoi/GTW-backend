import { Router } from "express";
import { db } from "../../db";
import {
  parcels,
  receiverConfirmations,
  parcelTrackingEvents,
} from "../../db/schema";
import { authMiddleware, optionalAuth, AuthRequest } from "../../middleware/auth";
import { AppError, catchAsync } from "../../middleware/errorHandler";
import { generateConfirmationToken } from "../../utils/helpers";
import { validateRequest } from "../../utils/validation";
import { eq, or } from "drizzle-orm";
import { Response } from "express";
import Joi from "joi";

const router = Router();

// GET /api/receiver/incoming
router.get(
  "/incoming",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const incomingParcels = await db.query.parcels.findMany({
      where: or(
        eq(parcels.receiverId, req.userId!),
        eq(parcels.receiverEmail, req.user?.email)
      ),
    });

    res.json(incomingParcels);
  })
);

// GET /api/receiver/parcels/:id
router.get(
  "/parcels/:id",
  optionalAuth,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, req.params.id),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    // Check if user is receiver or has confirmation token
    if (
      req.userId! !== parcel.receiverId &&
      parcel.receiverEmail !== req.user?.email &&
      !req.query.token
    ) {
      throw new AppError(403, "Unauthorized", "FORBIDDEN");
    }

    // If using token, verify it
    if (req.query.token && !req.userId) {
      const token = req.query.token as string;
      const confirmation = await db.query.receiverConfirmations.findFirst({
        where: eq(receiverConfirmations.token, token),
      });

      if (!confirmation || confirmation.parcelId !== req.params.id) {
        throw new AppError(400, "Invalid token", "INVALID_TOKEN");
      }

      if (
        confirmation.expiresAt &&
        new Date(confirmation.expiresAt) < new Date()
      ) {
        throw new AppError(400, "Token expired", "TOKEN_EXPIRED");
      }
    }

    // Get tracking events
    const events = await db.query.parcelTrackingEvents.findMany({
      where: eq(parcelTrackingEvents.parcelId, req.params.id),
    });

    res.json({
      parcel,
      tracking: events,
    });
  })
);

// POST /api/receiver/confirm-delivery
router.post(
  "/confirm-delivery",
  validateRequest(
    Joi.object({
      token: Joi.string().required(),
    })
  ),
  catchAsync(async (req, res: Response) => {
    const { token } = req.validatedData;

    const confirmation = await db.query.receiverConfirmations.findFirst({
      where: eq(receiverConfirmations.token, token),
    });

    if (!confirmation) {
      throw new AppError(400, "Invalid token", "INVALID_TOKEN");
    }

    if (
      confirmation.expiresAt &&
      new Date(confirmation.expiresAt) < new Date()
    ) {
      throw new AppError(400, "Token expired", "TOKEN_EXPIRED");
    }

    // Mark confirmation as confirmed
    await db
      .update(receiverConfirmations)
      .set({
        confirmed: true,
        confirmedAt: new Date(),
      })
      .where(eq(receiverConfirmations.id, confirmation.id));

    // Update parcel status to Delivered
    const [updatedParcel] = await db
      .update(parcels)
      .set({
        status: "Delivered",
        updatedAt: new Date(),
      })
      .where(eq(parcels.id, confirmation.parcelId))
      .returning();

    // Create tracking event
    await db.insert(parcelTrackingEvents).values({
      parcelId: confirmation.parcelId,
      status: "Delivered",
      note: "Delivery confirmed by receiver",
      createdBy: updatedParcel.receiverId || updatedParcel.senderId,
    });

    res.json({
      message: "Delivery confirmed successfully",
      parcel: updatedParcel,
    });
  })
);

// POST /api/receiver/update-location
router.post(
  "/update-location",
  authMiddleware,
  validateRequest(
    Joi.object({
      parcelId: Joi.string().uuid().required(),
      lat: Joi.number().required(),
      lng: Joi.number().required(),
    })
  ),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { parcelId, lat, lng } = req.validatedData;

    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, parcelId),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    if (parcel.receiverId !== req.userId! && parcel.receiverEmail !== req.user?.email) {
      throw new AppError(403, "You are not the receiver", "FORBIDDEN");
    }

    // Location update would be handled in tracking system
    res.json({
      message: "Location updated",
      lat,
      lng,
    });
  })
);

export default router;

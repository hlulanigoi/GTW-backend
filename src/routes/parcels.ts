import { Router } from "express";
import { db } from "../../db";
import {
  parcels,
  users,
  routes as routesTable,
  parcelTrackingEvents,
  parcelMessages,
} from "../../db/schema";
import { authMiddleware, requireRole, AuthRequest } from "../../middleware/auth";
import { AppError, catchAsync } from "../../middleware/errorHandler";
import {
  createParcelSchema,
  updateParcelSchema,
  createTrackingEventSchema,
  sendMessageSchema,
  validateRequest,
} from "../../utils/validation";
import { geocodeAddress, calculateDistance } from "../../utils/helpers";
import { eq, and, or } from "drizzle-orm";
import { Response } from "express";

const router = Router();

// GET /api/parcels
router.get(
  "/",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const allParcels = await db.query.parcels.findMany({
      limit: 100,
    });

    res.json(allParcels);
  })
);

// GET /api/parcels/:id
router.get(
  "/:id",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, req.params.id),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    res.json(parcel);
  })
);

// POST /api/parcels
router.post(
  "/",
  authMiddleware,
  validateRequest(createParcelSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const {
      origin,
      destination,
      description,
      size,
      weight,
      compensation,
      fragile,
      pickupDate,
      receiverName,
      receiverPhone,
      receiverEmail,
      insuranceRequested,
    } = req.validatedData;

    // Geocode addresses
    const originCoords = await geocodeAddress(origin);
    const destCoords = await geocodeAddress(destination);

    if (!originCoords || !destCoords) {
      throw new AppError(400, "Unable to geocode addresses", "GEOCODING_FAILED");
    }

    // Create parcel
    const [newParcel] = await db
      .insert(parcels)
      .values({
        senderId: req.userId!,
        origin,
        originLat: originCoords.lat.toString(),
        originLng: originCoords.lng.toString(),
        destination,
        destLat: destCoords.lat.toString(),
        destLng: destCoords.lng.toString(),
        description,
        size,
        weight: weight.toString(),
        compensation: compensation.toString(),
        fragile,
        pickupDate,
        receiverName,
        receiverPhone,
        receiverEmail,
        insuranceRequested,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      })
      .returning();

    res.status(201).json(newParcel);
  })
);

// PATCH /api/parcels/:id
router.patch(
  "/:id",
  authMiddleware,
  validateRequest(updateParcelSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, req.params.id),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    // Only sender can update pending parcels
    if (parcel.senderId !== req.userId! && req.role !== "admin") {
      throw new AppError(403, "You can only update your own parcels", "FORBIDDEN");
    }

    if (parcel.status !== "Pending" && req.role !== "admin") {
      throw new AppError(
        400,
        "Can only update pending parcels",
        "PARCEL_NOT_PENDING"
      );
    }

    const [updatedParcel] = await db
      .update(parcels)
      .set({
        ...req.validatedData,
        updatedAt: new Date(),
      })
      .where(eq(parcels.id, req.params.id))
      .returning();

    res.json(updatedParcel);
  })
);

// DELETE /api/parcels/:id
router.delete(
  "/:id",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, req.params.id),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    if (parcel.senderId !== req.userId! && req.role !== "admin") {
      throw new AppError(403, "You can only delete your own parcels", "FORBIDDEN");
    }

    if (parcel.status !== "Pending") {
      throw new AppError(
        400,
        "Can only delete pending parcels",
        "PARCEL_NOT_PENDING"
      );
    }

    await db.delete(parcels).where(eq(parcels.id, req.params.id));

    res.status(204).send();
  })
);

// PATCH /api/parcels/:id/accept
router.patch(
  "/:id/accept",
  authMiddleware,
  requireRole("carrier"),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, req.params.id),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    if (parcel.status !== "Pending") {
      throw new AppError(400, "Parcel already assigned", "PARCEL_NOT_PENDING");
    }

    // Update parcel to accepted
    const [updatedParcel] = await db
      .update(parcels)
      .set({
        status: "Accepted",
        transporterId: req.userId!,
        updatedAt: new Date(),
      })
      .where(eq(parcels.id, req.params.id))
      .returning();

    res.json(updatedParcel);
  })
);

// PATCH /api/parcels/:id/status
router.patch(
  "/:id/status",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { status } = req.body;

    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, req.params.id),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    // Only transporter or admin can update status
    if (
      parcel.transporterId !== req.userId! &&
      req.role !== "admin" &&
      req.role !== "support"
    ) {
      throw new AppError(
        403,
        "Only transporter or admin can update status",
        "FORBIDDEN"
      );
    }

    const [updatedParcel] = await db
      .update(parcels)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(parcels.id, req.params.id))
      .returning();

    // Create tracking event
    await db.insert(parcelTrackingEvents).values({
      parcelId: req.params.id,
      status,
      createdBy: req.userId!,
    });

    res.json(updatedParcel);
  })
);

// GET /api/parcels/:id/matching-routes
router.get(
  "/:id/matching-routes",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, req.params.id),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    const parcelOriginLat = parseFloat(parcel.originLat as any);
    const parcelOriginLng = parseFloat(parcel.originLng as any);
    const parcelDestLat = parseFloat(parcel.destLat as any);
    const parcelDestLng = parseFloat(parcel.destLng as any);

    // Find routes that are nearby and have capacity
    const allRoutes = await db.query.routes.findMany({
      where: and(
        eq(routesTable.status, "Active"),
        and(
          eq(routesTable.availableCapacity, ">=", parcel.weight),
        )
      ),
    });

    // Filter by distance (within 100km of origin and destination)
    const matchingRoutes = allRoutes.filter((route) => {
      const originDistance = calculateDistance(
        parcelOriginLat,
        parcelOriginLng,
        parseFloat(route.originLat as any),
        parseFloat(route.originLng as any)
      );

      const destDistance = calculateDistance(
        parcelDestLat,
        parcelDestLng,
        parseFloat(route.destLat as any),
        parseFloat(route.destLng as any)
      );

      return originDistance <= 100 && destDistance <= 100;
    });

    res.json(matchingRoutes);
  })
);

// GET /api/parcels/:id/tracking
router.get(
  "/:id/tracking",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const events = await db.query.parcelTrackingEvents.findMany({
      where: eq(parcelTrackingEvents.parcelId, req.params.id),
    });

    res.json(events);
  })
);

// POST /api/parcels/:id/tracking
router.post(
  "/:id/tracking",
  authMiddleware,
  validateRequest(createTrackingEventSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { status, location, lat, lng, note } = req.validatedData;

    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, req.params.id),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    const [event] = await db
      .insert(parcelTrackingEvents)
      .values({
        parcelId: req.params.id,
        status,
        location,
        lat: lat?.toString(),
        lng: lng?.toString(),
        note,
        createdBy: req.userId!,
      })
      .returning();

    res.status(201).json(event);
  })
);

// GET /api/parcels/:id/messages
router.get(
  "/:id/messages",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const messages = await db.query.parcelMessages.findMany({
      where: eq(parcelMessages.parcelId, req.params.id),
    });

    res.json(messages);
  })
);

// POST /api/parcels/:id/messages
router.post(
  "/:id/messages",
  authMiddleware,
  validateRequest(sendMessageSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { content } = req.validatedData;

    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, req.params.id),
    });

    if (!parcel) {
      throw new AppError(404, "Parcel not found", "PARCEL_NOT_FOUND");
    }

    const [message] = await db
      .insert(parcelMessages)
      .values({
        parcelId: req.params.id,
        senderId: req.userId!,
        content,
      })
      .returning();

    res.status(201).json(message);
  })
);

export default router;

import { Router } from "express";
import { db } from "../../db";
import {
  routes as routesTable,
  parcels,
  users,
} from "../../db/schema";
import { authMiddleware, requireRole, AuthRequest } from "../../middleware/auth";
import { AppError, catchAsync } from "../../middleware/errorHandler";
import {
  createRouteSchema,
  updateRouteSchema,
  validateRequest,
} from "../../utils/validation";
import { geocodeAddress, calculateDistance } from "../../utils/helpers";
import { eq, and } from "drizzle-orm";
import { Response } from "express";

const router = Router();

// GET /api/routes
router.get(
  "/",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const allRoutes = await db.query.routes.findMany({
      limit: 100,
    });

    res.json(allRoutes);
  })
);

// GET /api/routes/:id
router.get(
  "/:id",
  catchAsync(async (req: AuthRequest, res: Response) => {
    const route = await db.query.routes.findFirst({
      where: eq(routesTable.id, req.params.id),
    });

    if (!route) {
      throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
    }

    res.json(route);
  })
);

// POST /api/routes
router.post(
  "/",
  authMiddleware,
  requireRole("carrier"),
  validateRequest(createRouteSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const {
      origin,
      destination,
      departureDate,
      frequency,
      maxCapacity,
      intermediateStops,
      notes,
    } = req.validatedData;

    // Geocode addresses
    const originCoords = await geocodeAddress(origin);
    const destCoords = await geocodeAddress(destination);

    if (!originCoords || !destCoords) {
      throw new AppError(400, "Unable to geocode addresses", "GEOCODING_FAILED");
    }

    // Create route
    const [newRoute] = await db
      .insert(routesTable)
      .values({
        carrierId: req.userId!,
        origin,
        originLat: originCoords.lat.toString(),
        originLng: originCoords.lng.toString(),
        destination,
        destLat: destCoords.lat.toString(),
        destLng: destCoords.lng.toString(),
        departureDate,
        frequency,
        maxCapacity: maxCapacity.toString(),
        availableCapacity: maxCapacity.toString(),
        intermediateStops,
        notes,
      })
      .returning();

    res.status(201).json(newRoute);
  })
);

// PATCH /api/routes/:id
router.patch(
  "/:id",
  authMiddleware,
  validateRequest(updateRouteSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const route = await db.query.routes.findFirst({
      where: eq(routesTable.id, req.params.id),
    });

    if (!route) {
      throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
    }

    // Only carrier or admin can update route
    if (route.carrierId !== req.userId! && req.role !== "admin") {
      throw new AppError(403, "You can only update your own routes", "FORBIDDEN");
    }

    const [updatedRoute] = await db
      .update(routesTable)
      .set({
        ...req.validatedData,
        updatedAt: new Date(),
      })
      .where(eq(routesTable.id, req.params.id))
      .returning();

    res.json(updatedRoute);
  })
);

// DELETE /api/routes/:id
router.delete(
  "/:id",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const route = await db.query.routes.findFirst({
      where: eq(routesTable.id, req.params.id),
    });

    if (!route) {
      throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
    }

    if (route.carrierId !== req.userId! && req.role !== "admin") {
      throw new AppError(403, "You can only delete your own routes", "FORBIDDEN");
    }

    await db.delete(routesTable).where(eq(routesTable.id, req.params.id));

    res.status(204).send();
  })
);

// GET /api/routes/:id/matching-parcels
router.get(
  "/:id/matching-parcels",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const route = await db.query.routes.findFirst({
      where: eq(routesTable.id, req.params.id),
    });

    if (!route) {
      throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
    }

    const routeOriginLat = parseFloat(route.originLat as any);
    const routeOriginLng = parseFloat(route.originLng as any);
    const routeDestLat = parseFloat(route.destLat as any);
    const routeDestLng = parseFloat(route.destLng as any);
    const routeAvailableCapacity = parseFloat(route.availableCapacity as any);

    // Find pending parcels with matching origin/destination and capacity
    const allParcels = await db.query.parcels.findMany({
      where: eq(parcels.status, "Pending"),
    });

    // Filter by distance and capacity
    const matchingParcels = allParcels.filter((parcel) => {
      const parcelOriginLat = parseFloat(parcel.originLat as any);
      const parcelOriginLng = parseFloat(parcel.originLng as any);
      const parcelDestLat = parseFloat(parcel.destLat as any);
      const parcelDestLng = parseFloat(parcel.destLng as any);
      const parcelWeight = parseFloat(parcel.weight as any);

      const originDistance = calculateDistance(
        routeOriginLat,
        routeOriginLng,
        parcelOriginLat,
        parcelOriginLng
      );

      const destDistance = calculateDistance(
        routeDestLat,
        routeDestLng,
        parcelDestLat,
        parcelDestLng
      );

      return (
        originDistance <= 100 &&
        destDistance <= 100 &&
        parcelWeight <= routeAvailableCapacity
      );
    });

    res.json(matchingParcels);
  })
);

// GET /api/routes/my
router.get(
  "/my/routes",
  authMiddleware,
  requireRole("carrier"),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const myRoutes = await db.query.routes.findMany({
      where: eq(routesTable.carrierId, req.userId!),
    });

    res.json(myRoutes);
  })
);

export default router;

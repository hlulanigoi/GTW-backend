import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import config from "./config";
import { initializeDatabase } from "./db";
import { errorHandler, logger } from "./middleware/errorHandler";
import pinoHttp from "pino-http";

// Routes
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import parcelRoutes from "./routes/parcels";
import routeRoutes from "./routes/routes";
import walletRoutes from "./routes/wallet";
import conversationRoutes from "./routes/conversations";
import reviewsRoutes from "./routes/reviews";
import trackingRoutes from "./routes/tracking";
import receiverRoutes from "./routes/receiver";
import adminRoutes from "./routes/admin";
import utilitiesRoutes from "./routes/utilities";
import publicRoutes from "./routes/public";

const app: Express = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(pinoHttp({ logger }));

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/parcels", parcelRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/disputes", reviewsRoutes); // Disputes are in reviews.ts
app.use("/api/tracking", trackingRoutes);
app.use("/api/receiver", receiverRoutes);
app.use("/api/delivery-proofs", utilitiesRoutes);
app.use("/api/connections", utilitiesRoutes);
app.use("/api/blocked-users", utilitiesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/public", publicRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not found",
    code: "NOT_FOUND",
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Initialize app
async function startServer() {
  try {
    await initializeDatabase();
    
    const server = app.listen(config.port, () => {
      logger.info(`✓ Server running on port ${config.port}`);
      logger.info(`✓ Environment: ${config.nodeEnv}`);
      logger.info(`✓ API Base URL: ${config.apiBaseUrl}`);
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      logger.info("SIGTERM received, shutting down gracefully");
      server.close(() => {
        logger.info("Server closed");
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Export app for testing
export { app };

// Start server if this is the main module
if (require.main === module) {
  startServer();
}

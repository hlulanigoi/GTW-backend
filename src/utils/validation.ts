import Joi from "joi";

// Auth validation schemas
export const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().required(),
  phone: Joi.string().optional(),
});

export const signinSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});

export const requestPasswordResetSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});

// User validation schemas
export const updateUserSchema = Joi.object({
  name: Joi.string().optional(),
  phone: Joi.string().optional(),
  bio: Joi.string().max(500).optional(),
  profilePhoto: Joi.string().uri().optional(),
});

// Parcel validation schemas
export const createParcelSchema = Joi.object({
  origin: Joi.string().required(),
  destination: Joi.string().required(),
  description: Joi.string().required(),
  size: Joi.string().valid("small", "medium", "large", "extra_large").required(),
  weight: Joi.number().positive().required(),
  compensation: Joi.number().positive().required(),
  fragile: Joi.boolean().optional(),
  pickupDate: Joi.date().iso().required(),
  pickupWindowEnd: Joi.date().iso().optional(),
  deliveryWindowStart: Joi.date().iso().optional(),
  deliveryWindowEnd: Joi.date().iso().optional(),
  receiverName: Joi.string().required(),
  receiverPhone: Joi.string().required(),
  receiverEmail: Joi.string().email().required(),
  insuranceRequested: Joi.boolean().optional(),
});

export const updateParcelSchema = Joi.object({
  status: Joi.string()
    .valid(
      "Pending",
      "Accepted",
      "PickedUp",
      "InTransit",
      "Delivered",
      "Cancelled",
      "Disputed"
    )
    .optional(),
  transporterId: Joi.string().uuid().optional(),
  compensation: Joi.number().positive().optional(),
  description: Joi.string().optional(),
});

// Route validation schemas
export const createRouteSchema = Joi.object({
  origin: Joi.string().required(),
  destination: Joi.string().required(),
  departureDate: Joi.date().iso().required(),
  frequency: Joi.string()
    .valid("one-time", "daily", "weekly", "monthly")
    .required(),
  maxCapacity: Joi.number().positive().required(),
  intermediateStops: Joi.array().items(Joi.string()).optional(),
  notes: Joi.string().optional(),
});

export const updateRouteSchema = Joi.object({
  status: Joi.string().valid("Active", "Completed", "Cancelled").optional(),
  maxCapacity: Joi.number().positive().optional(),
  availableCapacity: Joi.number().positive().optional(),
  notes: Joi.string().optional(),
});

// Wallet validation schemas
export const topupInitializeSchema = Joi.object({
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).default("ZAR"),
});

export const autoTopupSchema = Joi.object({
  enabled: Joi.boolean().required(),
  triggerAmount: Joi.number().positive().optional(),
  topUpAmount: Joi.number().positive().optional(),
  paymentMethodId: Joi.string().uuid().optional(),
});

// Messaging validation schemas
export const createConversationSchema = Joi.object({
  recipientId: Joi.string().uuid().required(),
});

export const sendMessageSchema = Joi.object({
  content: Joi.string().min(1).max(2000).required(),
});

// Review validation schemas
export const createReviewSchema = Joi.object({
  parcelId: Joi.string().uuid().required(),
  revieweeId: Joi.string().uuid().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(1000).optional(),
});

// Dispute validation schemas
export const createDisputeSchema = Joi.object({
  parcelId: Joi.string().uuid().required(),
  respondentId: Joi.string().uuid().required(),
  subject: Joi.string().required(),
  description: Joi.string().required(),
});

export const updateDisputeSchema = Joi.object({
  status: Joi.string()
    .valid("open", "under_review", "resolved", "closed")
    .optional(),
  resolution: Joi.string().optional(),
});

// Delivery proof validation schemas
export const createDeliveryProofSchema = Joi.object({
  type: Joi.string().valid("pickup", "delivery").required(),
  photoUrl: Joi.string().uri().required(),
  notes: Joi.string().optional(),
});

// Tracking event validation schemas
export const createTrackingEventSchema = Joi.object({
  status: Joi.string().required(),
  location: Joi.string().optional(),
  lat: Joi.number().optional(),
  lng: Joi.number().optional(),
  note: Joi.string().optional(),
});

// Push token validation schemas
export const registerPushTokenSchema = Joi.object({
  token: Joi.string().required(),
  platform: Joi.string().valid("ios", "android", "web").required(),
});

// Connection validation schemas
export const createConnectionSchema = Joi.object({
  connectedUserId: Joi.string().uuid().required(),
});

// Block user validation schemas
export const blockUserSchema = Joi.object({
  blockedUserId: Joi.string().uuid().required(),
});

export function validateRequest(schema: Joi.Schema) {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: error.details.map((d) => ({
          field: d.path.join("."),
          message: d.message,
        })),
      });
    }
    req.validatedData = value;
    next();
  };
}

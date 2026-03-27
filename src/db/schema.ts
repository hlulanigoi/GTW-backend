import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  boolean,
  pgEnum,
  jsonb,
  integer,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const roleEnum = pgEnum("role", [
  "user",
  "carrier",
  "support",
  "admin",
]);

export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "starter",
  "professional",
  "business",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "cancelled",
  "expired",
]);

export const parcelStatusEnum = pgEnum("parcel_status", [
  "Pending",
  "Accepted",
  "PickedUp",
  "InTransit",
  "Delivered",
  "Cancelled",
  "Disputed",
]);

export const parcelSizeEnum = pgEnum("parcel_size", [
  "small",
  "medium",
  "large",
  "extra_large",
]);

export const frequencyEnum = pgEnum("frequency", [
  "one-time",
  "daily",
  "weekly",
  "monthly",
]);

export const routeStatusEnum = pgEnum("route_status", [
  "Active",
  "Completed",
  "Cancelled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "success",
  "failed",
  "refunded",
]);

export const walletTransactionTypeEnum = pgEnum("wallet_transaction_type", [
  "topup",
  "payment",
  "earning",
  "refund",
  "fee",
]);

export const walletTransactionStatusEnum = pgEnum(
  "wallet_transaction_status",
  ["pending", "completed", "failed"]
);

export const proofTypeEnum = pgEnum("proof_type", ["pickup", "delivery"]);

export const platformEnum = pgEnum("platform", ["ios", "android", "web"]);

export const disputeStatusEnum = pgEnum("dispute_status", [
  "open",
  "under_review",
  "resolved",
  "closed",
]);

// Tables
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").default("user").notNull(),
    rating: numeric("rating", { precision: 3, scale: 2 }).default("0"),
    verified: boolean("verified").default(false),
    suspended: boolean("suspended").default(false),
    walletBalance: numeric("wallet_balance", { precision: 12, scale: 2 })
      .default("0")
      .notNull(),
    subscriptionTier: subscriptionTierEnum("subscription_tier")
      .default("starter")
      .notNull(),
    subscriptionStatus: subscriptionStatusEnum("subscription_status")
      .default("active")
      .notNull(),
    profilePhoto: text("profile_photo"),
    bio: text("bio"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    roleIdx: index("users_role_idx").on(table.role),
    verifiedIdx: index("users_verified_idx").on(table.verified),
  })
);

export const waitlists = pgTable(
  "waitlists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    source: text("source"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex("waitlists_email_idx").on(table.email),
  })
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    message: text("message").notNull(),
    handled: boolean("handled").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("contacts_email_idx").on(table.email),
  })
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    token: text("token").notNull().unique(),
    used: boolean("used").default(false),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("password_reset_tokens_user_id_idx").on(table.userId),
    tokenIdx: uniqueIndex("password_reset_tokens_token_idx").on(table.token),
  })
);

export const parcels = pgTable(
  "parcels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    transporterId: uuid("transporter_id").references(() => users.id),
    receiverId: uuid("receiver_id").references(() => users.id),
    receiverName: text("receiver_name").notNull(),
    receiverPhone: text("receiver_phone").notNull(),
    receiverEmail: text("receiver_email").notNull(),
    origin: text("origin").notNull(),
    originLat: numeric("origin_lat", { precision: 10, scale: 8 }),
    originLng: numeric("origin_lng", { precision: 11, scale: 8 }),
    destination: text("destination").notNull(),
    destLat: numeric("dest_lat", { precision: 10, scale: 8 }),
    destLng: numeric("dest_lng", { precision: 11, scale: 8 }),
    description: text("description").notNull(),
    size: parcelSizeEnum("size").notNull(),
    weight: numeric("weight", { precision: 8, scale: 2 }).notNull(),
    compensation: numeric("compensation", { precision: 12, scale: 2 }).notNull(),
    status: parcelStatusEnum("status").default("Pending").notNull(),
    fragile: boolean("fragile").default(false),
    pickupDate: timestamp("pickup_date").notNull(),
    pickupWindowEnd: timestamp("pickup_window_end"),
    deliveryWindowStart: timestamp("delivery_window_start"),
    deliveryWindowEnd: timestamp("delivery_window_end"),
    expiresAt: timestamp("expires_at"),
    insuranceRequested: boolean("insurance_requested").default(false),
    insuranceFee: numeric("insurance_fee", { precision: 10, scale: 2 }),
    platformFee: numeric("platform_fee", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    senderIdx: index("parcels_sender_id_idx").on(table.senderId),
    transporterIdx: index("parcels_transporter_id_idx").on(table.transporterId),
    statusIdx: index("parcels_status_idx").on(table.status),
  })
);

export const routes = pgTable(
  "routes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    carrierId: uuid("carrier_id")
      .notNull()
      .references(() => users.id),
    origin: text("origin").notNull(),
    originLat: numeric("origin_lat", { precision: 10, scale: 8 }).notNull(),
    originLng: numeric("origin_lng", { precision: 11, scale: 8 }).notNull(),
    destination: text("destination").notNull(),
    destLat: numeric("dest_lat", { precision: 10, scale: 8 }).notNull(),
    destLng: numeric("dest_lng", { precision: 11, scale: 8 }).notNull(),
    departureDate: timestamp("departure_date").notNull(),
    frequency: frequencyEnum("frequency").notNull(),
    maxCapacity: numeric("max_capacity", { precision: 8, scale: 2 }).notNull(),
    availableCapacity: numeric("available_capacity", { precision: 8, scale: 2 })
      .notNull(),
    status: routeStatusEnum("status").default("Active").notNull(),
    intermediateStops: jsonb("intermediate_stops"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    carrierIdx: index("routes_carrier_id_idx").on(table.carrierId),
    statusIdx: index("routes_status_idx").on(table.status),
  })
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    carrierId: uuid("carrier_id")
      .notNull()
      .references(() => users.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    platformFee: numeric("platform_fee", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("ZAR").notNull(),
    status: paymentStatusEnum("status").default("pending").notNull(),
    paystackReference: text("paystack_reference"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    parcelIdx: index("payments_parcel_id_idx").on(table.parcelId),
    senderIdx: index("payments_sender_id_idx").on(table.senderId),
    statusIdx: index("payments_status_idx").on(table.status),
  })
);

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: walletTransactionTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("ZAR").notNull(),
    status: walletTransactionStatusEnum("status").default("pending").notNull(),
    reference: text("reference"),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("wallet_transactions_user_id_idx").on(table.userId),
    statusIdx: index("wallet_transactions_status_idx").on(table.status),
  })
);

export const savedPaymentMethods = pgTable(
  "saved_payment_methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    paystackAuthCode: text("paystack_auth_code").notNull(),
    cardLast4: varchar("card_last4", { length: 4 }).notNull(),
    cardBrand: varchar("card_brand", { length: 20 }).notNull(),
    isDefault: boolean("is_default").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("saved_payment_methods_user_id_idx").on(table.userId),
  })
);

export const autoTopUpSettings = pgTable(
  "auto_top_up_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    enabled: boolean("enabled").default(false),
    triggerAmount: numeric("trigger_amount", { precision: 10, scale: 2 }),
    topUpAmount: numeric("top_up_amount", { precision: 10, scale: 2 }),
    paymentMethodId: uuid("payment_method_id").references(
      () => savedPaymentMethods.id
    ),
  }
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tier: subscriptionTierEnum("tier").notNull(),
    status: subscriptionStatusEnum("status").default("active").notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"),
    paystackSubscriptionCode: text("paystack_subscription_code"),
    monthlyParcelLimit: integer("monthly_parcel_limit"),
    platformFeePercent: numeric("platform_fee_percent", {
      precision: 5,
      scale: 2,
    }),
  },
  (table) => ({
    userIdx: index("subscriptions_user_id_idx").on(table.userId),
    statusIdx: index("subscriptions_status_idx").on(table.status),
  })
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participant1Id: uuid("participant1_id")
      .notNull()
      .references(() => users.id),
    participant2Id: uuid("participant2_id")
      .notNull()
      .references(() => users.id),
    lastMessageAt: timestamp("last_message_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    participant1Idx: index("conversations_participant1_id_idx").on(
      table.participant1Id
    ),
    participant2Idx: index("conversations_participant2_id_idx").on(
      table.participant2Id
    ),
  })
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    read: boolean("read").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index("messages_conversation_id_idx").on(
      table.conversationId
    ),
    senderIdx: index("messages_sender_id_idx").on(table.senderId),
  })
);

export const parcelMessages = pgTable(
  "parcel_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    parcelIdx: index("parcel_messages_parcel_id_idx").on(table.parcelId),
    senderIdx: index("parcel_messages_sender_id_idx").on(table.senderId),
  })
);

export const parcelTrackingEvents = pgTable(
  "parcel_tracking_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id),
    status: text("status").notNull(),
    location: text("location"),
    lat: numeric("lat", { precision: 10, scale: 8 }),
    lng: numeric("lng", { precision: 11, scale: 8 }),
    note: text("note"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    parcelIdx: index("parcel_tracking_events_parcel_id_idx").on(table.parcelId),
  })
);

export const carrierLocations = pgTable(
  "carrier_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    carrierId: uuid("carrier_id")
      .notNull()
      .references(() => users.id),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id),
    lat: numeric("lat", { precision: 10, scale: 8 }).notNull(),
    lng: numeric("lng", { precision: 11, scale: 8 }).notNull(),
    accuracy: numeric("accuracy", { precision: 8, scale: 2 }),
    heading: numeric("heading", { precision: 6, scale: 2 }),
    speed: numeric("speed", { precision: 8, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    carrierIdx: index("carrier_locations_carrier_id_idx").on(table.carrierId),
    parcelIdx: index("carrier_locations_parcel_id_idx").on(table.parcelId),
  })
);

export const receiverLocations = pgTable(
  "receiver_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiverId: uuid("receiver_id")
      .notNull()
      .references(() => users.id),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id),
    lat: numeric("lat", { precision: 10, scale: 8 }).notNull(),
    lng: numeric("lng", { precision: 11, scale: 8 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    receiverIdx: index("receiver_locations_receiver_id_idx").on(
      table.receiverId
    ),
    parcelIdx: index("receiver_locations_parcel_id_idx").on(table.parcelId),
  })
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id),
    revieweeId: uuid("reviewee_id")
      .notNull()
      .references(() => users.id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    parcelIdx: index("reviews_parcel_id_idx").on(table.parcelId),
    revieweeIdx: index("reviews_reviewee_id_idx").on(table.revieweeId),
  })
);

export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id),
    complainantId: uuid("complainant_id")
      .notNull()
      .references(() => users.id),
    respondentId: uuid("respondent_id")
      .notNull()
      .references(() => users.id),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    status: disputeStatusEnum("status").default("open").notNull(),
    resolution: text("resolution"),
    adminId: uuid("admin_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    parcelIdx: index("disputes_parcel_id_idx").on(table.parcelId),
    statusIdx: index("disputes_status_idx").on(table.status),
  })
);

export const disputeMessages = pgTable(
  "dispute_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    disputeId: uuid("dispute_id")
      .notNull()
      .references(() => disputes.id),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    disputeIdx: index("dispute_messages_dispute_id_idx").on(table.disputeId),
    senderIdx: index("dispute_messages_sender_id_idx").on(table.senderId),
  })
);

export const deliveryProofs = pgTable(
  "delivery_proofs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    type: proofTypeEnum("type").notNull(),
    photoUrl: text("photo_url").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    parcelIdx: index("delivery_proofs_parcel_id_idx").on(table.parcelId),
  })
);

export const receiverConfirmations = pgTable(
  "receiver_confirmations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id),
    token: text("token").notNull().unique(),
    confirmed: boolean("confirmed").default(false),
    confirmedAt: timestamp("confirmed_at"),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    parcelIdx: index("receiver_confirmations_parcel_id_idx").on(table.parcelId),
    tokenIdx: uniqueIndex("receiver_confirmations_token_idx").on(table.token),
  })
);

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    connectedUserId: uuid("connected_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("connections_user_id_idx").on(table.userId),
  })
);

export const blockedUsers = pgTable(
  "blocked_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    blockedUserId: uuid("blocked_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("blocked_users_user_id_idx").on(table.userId),
  })
);

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    token: text("token").notNull(),
    platform: platformEnum("platform").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("push_tokens_user_id_idx").on(table.userId),
  })
);

export const notificationQueue = pgTable(
  "notification_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data"),
    sent: boolean("sent").default(false),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("notification_queue_user_id_idx").on(table.userId),
    sentIdx: index("notification_queue_sent_idx").on(table.sent),
  })
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sentParcels: many(parcels, { relationName: "sender" }),
  transportedParcels: many(parcels, { relationName: "transporter" }),
  receivedParcels: many(parcels, { relationName: "receiver" }),
  routes: many(routes),
  messages: many(messages),
  reviews: many(reviews, { relationName: "reviewer" }),
  reviewsAbout: many(reviews, { relationName: "reviewee" }),
  walletTransactions: many(walletTransactions),
  payments: many(payments),
  subscriptions: many(subscriptions),
}));

export const parcelsRelations = relations(parcels, ({ one, many }) => ({
  sender: one(users, {
    fields: [parcels.senderId],
    references: [users.id],
    relationName: "sender",
  }),
  transporter: one(users, {
    fields: [parcels.transporterId],
    references: [users.id],
    relationName: "transporter",
  }),
  receiver: one(users, {
    fields: [parcels.receiverId],
    references: [users.id],
    relationName: "receiver",
  }),
  reviews: many(reviews),
  disputes: many(disputes),
  messages: many(parcelMessages),
  trackingEvents: many(parcelTrackingEvents),
  deliveryProofs: many(deliveryProofs),
}));

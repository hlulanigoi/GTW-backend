import { Router } from "express";
import { db } from "../../db";
import { conversations, messages, users } from "../../db/schema";
import { authMiddleware, AuthRequest } from "../../middleware/auth";
import { AppError, catchAsync } from "../../middleware/errorHandler";
import {
  createConversationSchema,
  sendMessageSchema,
  validateRequest,
} from "../../utils/validation";
import { eq, or, and } from "drizzle-orm";
import { Response } from "express";

const router = Router();

// GET /api/conversations
router.get(
  "/",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const userConversations = await db.query.conversations.findMany({
      where: or(
        eq(conversations.participant1Id, req.userId!),
        eq(conversations.participant2Id, req.userId!)
      ),
    });

    res.json(userConversations);
  })
);

// GET /api/conversations/:id
router.get(
  "/:id",
  authMiddleware,
  catchAsync(async (req: AuthRequest, res: Response) => {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, req.params.id),
    });

    if (!conversation) {
      throw new AppError(404, "Conversation not found", "NOT_FOUND");
    }

    // Check if user is a participant
    if (
      conversation.participant1Id !== req.userId! &&
      conversation.participant2Id !== req.userId!
    ) {
      throw new AppError(403, "Unauthorized", "FORBIDDEN");
    }

    const conversationMessages = await db.query.messages.findMany({
      where: eq(messages.conversationId, req.params.id),
    });

    res.json({
      conversation,
      messages: conversationMessages,
    });
  })
);

// POST /api/conversations
router.post(
  "/",
  authMiddleware,
  validateRequest(createConversationSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { recipientId } = req.validatedData;

    if (recipientId === req.userId!) {
      throw new AppError(400, "Cannot message yourself", "INVALID_RECIPIENT");
    }

    // Check if recipient exists
    const recipient = await db.query.users.findFirst({
      where: eq(users.id, recipientId),
    });

    if (!recipient) {
      throw new AppError(404, "Recipient not found", "NOT_FOUND");
    }

    // Check if conversation already exists
    const existing = await db.query.conversations.findFirst({
      where: or(
        and(
          eq(conversations.participant1Id, req.userId!),
          eq(conversations.participant2Id, recipientId)
        ),
        and(
          eq(conversations.participant1Id, recipientId),
          eq(conversations.participant2Id, req.userId!)
        )
      ),
    });

    if (existing) {
      return res.json(existing);
    }

    // Create new conversation
    const [newConversation] = await db
      .insert(conversations)
      .values({
        participant1Id: req.userId!,
        participant2Id: recipientId,
      })
      .returning();

    res.status(201).json(newConversation);
  })
);

// POST /api/conversations/:id/messages
router.post(
  "/:id/messages",
  authMiddleware,
  validateRequest(sendMessageSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const { content } = req.validatedData;

    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, req.params.id),
    });

    if (!conversation) {
      throw new AppError(404, "Conversation not found", "NOT_FOUND");
    }

    // Check if user is a participant
    if (
      conversation.participant1Id !== req.userId! &&
      conversation.participant2Id !== req.userId!
    ) {
      throw new AppError(403, "Unauthorized", "FORBIDDEN");
    }

    const [newMessage] = await db
      .insert(messages)
      .values({
        conversationId: req.params.id,
        senderId: req.userId!,
        content,
      })
      .returning();

    // Update conversation last message timestamp
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, req.params.id));

    res.status(201).json(newMessage);
  })
);

export default router;

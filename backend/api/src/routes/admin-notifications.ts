import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireOwner } from "../auth/admin-middleware.js";
import { rateLimit } from "../security/rate-limit.js";
import { type SystemNotificationAudience, type SystemNotificationCategory } from "../social/notifications.js";

export const adminNotificationsRouter = Router();

const readLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  key: req => req.ownerId ?? req.ip ?? "unknown"
});

const CATEGORIES: SystemNotificationCategory[] = [
  "ACCOUNT_UPDATES",
  "TWITOK",
  "LIVE",
  "PROMOTE_ASSISTANT",
  "SAFETY",
  "CREATOR"
];
const AUDIENCES: SystemNotificationAudience[] = ["ALL", "CREATORS", "VERIFIED", "COUNTRY", "INDIVIDUALS"];

adminNotificationsRouter.get("/", requireOwner, readLimit, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const db = await getDb();
    const rows = await db.collection("system_announcements")
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return res.json({
      notifications: rows.map(row => ({
        id: row._id.toHexString(),
        category: row.category,
        title: row.title,
        body: row.body,
        actionLabel: row.actionLabel ?? null,
        actionUrl: row.actionUrl ?? null,
        audience: row.audience,
        targetCountryCode: row.targetCountryCode ?? null,
        targetUserCount: Array.isArray(row.targetUserIds) ? row.targetUserIds.length : 0,
        priority: row.priority ?? 0,
        status: row.status,
        startsAt: row.startsAt,
        expiresAt: row.expiresAt ?? null,
        createdAt: row.createdAt
      }))
    });
  } catch {
    return res.status(500).json({ error: "Unable to load system notifications" });
  }
});

adminNotificationsRouter.post("/", requireOwner, rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  key: req => req.ownerId ?? req.ip ?? "unknown"
}), async (req, res) => {
  try {
    const body = req.body ?? {};
    const category = String(body.category ?? "").toUpperCase() as SystemNotificationCategory;
    const audience = String(body.audience ?? "ALL").toUpperCase() as SystemNotificationAudience;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.body === "string" ? body.body.trim() : "";
    const actionLabel = typeof body.actionLabel === "string" ? body.actionLabel.trim() : "";
    const actionUrl = typeof body.actionUrl === "string" ? body.actionUrl.trim() : "";
    const targetCountryCode = typeof body.targetCountryCode === "string" ? body.targetCountryCode.trim().toUpperCase() : null;
    const targetUsernames: string[] = Array.isArray(body.targetUsernames) ? body.targetUsernames.filter((value: unknown): value is string => typeof value === "string") : [];
    const priority = Math.min(100, Math.max(0, Number(body.priority ?? 0)));
    const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const publish = body.publish !== false;

    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: "Invalid notification category" });
    if (!AUDIENCES.includes(audience)) return res.status(400).json({ error: "Invalid notification audience" });
    if (title.length < 3 || title.length > 120) return res.status(400).json({ error: "Title must be 3-120 characters" });
    if (message.length < 3 || message.length > 3000) return res.status(400).json({ error: "Message must be 3-3000 characters" });
    if (actionUrl && !/^https:\/\//i.test(actionUrl) && !/^\/[a-z0-9/_?&=.#%-]*$/i.test(actionUrl)) {
      return res.status(400).json({ error: "Action URL must be HTTPS or an internal path" });
    }
    if (audience === "COUNTRY" && (!targetCountryCode || !/^[A-Z]{2}$/.test(targetCountryCode))) {
      return res.status(400).json({ error: "A two-letter target country code is required" });
    }
    if (audience === "INDIVIDUALS" && (!targetUsernames.length || targetUsernames.length > 100)) {
      return res.status(400).json({ error: "Add between 1 and 100 individual usernames" });
    }
    if (Number.isNaN(startsAt.getTime()) || (expiresAt && Number.isNaN(expiresAt.getTime()))) {
      return res.status(400).json({ error: "Invalid notification date" });
    }
    if (expiresAt && expiresAt <= startsAt) return res.status(400).json({ error: "Expiry must be after start time" });

    const ownerId = typeof req.ownerId === "string" ? req.ownerId : "";
    if (!ObjectId.isValid(ownerId)) return res.status(403).json({ error: "Invalid owner identity" });

    const db = await getDb();
    let targetUserIds: ObjectId[] = [];
    if (audience === "INDIVIDUALS") {
      const usernames = [...new Set(targetUsernames.map((value: unknown) => String(value).trim().replace(/^@/, "").toLowerCase()).filter(Boolean))];
      if (usernames.length > 100) return res.status(400).json({ error: "A maximum of 100 individuals can be targeted per announcement" });
      const users = await db.collection<{ _id: ObjectId; username: string }>("users").find({ username: { $in: usernames } }, { projection: { _id: 1, username: 1 } }).toArray();
      const found = new Set(users.map(user => String(user.username).toLowerCase()));
      const missing = usernames.filter(username => !found.has(username));
      if (missing.length) return res.status(404).json({ error: "Some usernames were not found", missingUsernames: missing });
      targetUserIds = users.map(user => user._id);
    }
    const result = await db.collection("system_announcements").insertOne({
      category,
      title,
      body: message,
      actionLabel: actionLabel || null,
      actionUrl: actionUrl || null,
      audience,
      targetCountryCode: audience === "COUNTRY" ? targetCountryCode : null,
      targetUserIds: audience === "INDIVIDUALS" ? targetUserIds : [],
      priority,
      status: publish ? "PUBLISHED" : "DRAFT",
      startsAt,
      expiresAt,
      createdBy: new ObjectId(ownerId),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await db.collection("audit_logs").insertOne({
      actorId: req.ownerId,
      actorRole: "OWNER",
      action: publish ? "SYSTEM_NOTIFICATION_PUBLISHED" : "SYSTEM_NOTIFICATION_DRAFTED",
      resourceType: "SYSTEM_ANNOUNCEMENT",
      resourceId: result.insertedId.toHexString(),
      metadata: { category, audience, title },
      createdAt: new Date()
    });

    return res.status(201).json({ id: result.insertedId.toHexString(), status: publish ? "PUBLISHED" : "DRAFT" });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to create system notification" });
  }
});

adminNotificationsRouter.post("/:id/publish", requireOwner, readLimit, async (req, res) => {
  try {
    const notificationId = String(req.params.id);
    if (!ObjectId.isValid(notificationId)) return res.status(400).json({ error: "Invalid notification id" });
    const db = await getDb();
    const result = await db.collection("system_announcements").updateOne(
      { _id: new ObjectId(notificationId), status: "DRAFT" },
      { $set: { status: "PUBLISHED", updatedAt: new Date(), startsAt: new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Draft notification not found" });
    await db.collection("audit_logs").insertOne({
      actorId: req.ownerId,
      actorRole: "OWNER",
      action: "SYSTEM_NOTIFICATION_PUBLISHED",
      resourceType: "SYSTEM_ANNOUNCEMENT",
      resourceId: notificationId,
      createdAt: new Date()
    });
    return res.json({ published: true });
  } catch {
    return res.status(500).json({ error: "Unable to publish system notification" });
  }
});

adminNotificationsRouter.post("/:id/archive", requireOwner, readLimit, async (req, res) => {
  try {
    const notificationId = typeof req.params.id === "string" ? req.params.id : "";
    if (!ObjectId.isValid(notificationId)) return res.status(400).json({ error: "Invalid notification id" });
    const db = await getDb();
    const result = await db.collection("system_announcements").updateOne(
      { _id: new ObjectId(notificationId), status: { $in: ["DRAFT", "PUBLISHED"] } },
      { $set: { status: "ARCHIVED", updatedAt: new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Notification not found" });
    await db.collection("audit_logs").insertOne({
      actorId: req.ownerId,
      actorRole: "OWNER",
      action: "SYSTEM_NOTIFICATION_ARCHIVED",
      resourceType: "SYSTEM_ANNOUNCEMENT",
      resourceId: notificationId,
      createdAt: new Date()
    });
    return res.json({ archived: true });
  } catch {
    return res.status(500).json({ error: "Unable to archive system notification" });
  }
});

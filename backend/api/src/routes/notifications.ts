import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { getUnreadNotificationCount, listNotifications, markNotificationsRead } from "../social/notifications.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireUser, async (req, res) => {
  try { res.json({ notifications: await listNotifications(await getDb(), req.userId!, Number(req.query.limit ?? 30)) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load notifications" }); }
});

notificationsRouter.get("/unread-count", requireUser, async (req, res) => {
  try { res.json({ count: await getUnreadNotificationCount(await getDb(), req.userId!) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load notification count" }); }
});

notificationsRouter.post("/read", requireUser, async (req, res) => {
  try { res.json(await markNotificationsRead(await getDb(), req.userId!, req.body?.notificationId ? String(req.body.notificationId) : undefined)); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to mark notifications read" }); }
});

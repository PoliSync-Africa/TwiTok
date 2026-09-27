import { Router } from "express";
import { getDb } from "../db/mongo.js";
import {
  createOwnerToken,
  ensureOwnerAccount,
  verifyOwner,
  verifyOwnerToken
} from "../auth/owner.js";

export const adminRouter = Router();

adminRouter.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const db = await getDb();
    await ensureOwnerAccount(db);

    const owner = await verifyOwner(db, email, password);

    if (!owner) {
      return res.status(401).json({ error: "Invalid administrator credentials" });
    }

    const token = createOwnerToken(owner);

    await db.collection("audit_logs").insertOne({
      actorId: String(owner._id),
      actorRole: "OWNER",
      action: "OWNER_LOGIN",
      resourceType: "ADMIN_SESSION",
      createdAt: new Date()
    });

    return res.json({
      token,
      administrator: {
        id: String(owner._id),
        displayName: owner.displayName,
        email: owner.email,
        role: owner.role,
        mfaRequired: owner.mfaRequired
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Administrator authentication is unavailable" });
  }
});

adminRouter.get("/auth/me", async (req, res) => {
  try {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ error: "Administrator session required" });

    const claims = verifyOwnerToken(token);
    if (claims.role !== "OWNER") return res.status(403).json({ error: "Owner access required" });

    return res.json({
      administrator: {
        id: claims.sub,
        email: claims.email,
        role: claims.role
      }
    });
  } catch {
    return res.status(401).json({ error: "Administrator session expired" });
  }
});

adminRouter.get("/overview", async (req, res) => {
  try {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Administrator session required" });

    const claims = verifyOwnerToken(token);
    if (claims.role !== "OWNER") return res.status(403).json({ error: "Owner access required" });

    const db = await getDb();

    const [users, videos, reports, live, creators] = await Promise.all([
      db.collection("users").countDocuments(),
      db.collection("videos").countDocuments({ status: "PUBLISHED" }),
      db.collection("moderation_cases").countDocuments({ status: "OPEN" }),
      db.collection("live_streams").countDocuments({ status: "LIVE" }),
      db.collection("creator_profiles").countDocuments()
    ]);

    return res.json({
      users,
      videos,
      reports,
      live,
      creators
    });
  } catch {
    return res.status(401).json({ error: "Administrator session expired" });
  }
});

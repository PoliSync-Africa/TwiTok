import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { evaluateEligibility, getEligibility } from "../monetization/programs.js";
import { requireUser } from "../auth/middleware.js";
import { requireInternalService } from "../security/internal.js";

export const monetizationRouter = Router();

monetizationRouter.post("/eligibility/evaluate", requireInternalService, async (req, res) => {
  try {
    const { userId, ...profile } = req.body ?? {};
    if (typeof userId !== "string") return res.status(400).json({ error: "userId is required" });
    const eligibility = evaluateEligibility(profile);
    const db = await getDb(), now = new Date();
    await Promise.all(Object.entries(eligibility).map(([program, eligible]) =>
      db.collection("monetization_eligibility").updateOne(
        { userId, program },
        { $set: { userId, program, eligible, evaluatedAt: now, criteria: profile } },
        { upsert: true }
      )
    ));
    return res.json({ userId, eligibility, evaluatedAt: now });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Eligibility evaluation failed" }); }
});

monetizationRouter.get("/eligibility/me", requireUser, async (req, res) => {
  try { return res.json(await getEligibility(await getDb(), req.userId!.toHexString())); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Eligibility lookup failed" }); }
});
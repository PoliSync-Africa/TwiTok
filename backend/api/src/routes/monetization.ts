import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { evaluateEligibility, getEligibility } from "../monetization/programs.js";

export const monetizationRouter = Router();

monetizationRouter.post("/eligibility/evaluate", async (req, res) => {
  try {
    const { userId, ...profile } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const eligibility = evaluateEligibility(profile);
    const db = await getDb();
    const now = new Date();
    await Promise.all(Object.entries(eligibility).map(([program, eligible]) =>
      db.collection("monetization_eligibility").updateOne(
        { userId, program },
        { $set: { userId, program, eligible, evaluatedAt: now, criteria: profile } },
        { upsert: true }
      )
    ));
    return res.json({ userId, eligibility, evaluatedAt: now });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Eligibility evaluation failed" });
  }
});

monetizationRouter.get("/eligibility/:userId", async (req, res) => {
  try { return res.json(await getEligibility(await getDb(), String(req.params.userId))); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Eligibility lookup failed" }); }
});
import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { searchTwiTok } from "../search/service.js";

export const searchRouter = Router();

searchRouter.get("/", requireUser, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    res.json(await searchTwiTok(await getDb(), req.userId!, q, Number(req.query.limit ?? 20)));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to search TwiTok" }); }
});

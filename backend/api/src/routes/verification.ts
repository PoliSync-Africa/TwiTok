import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";
import { createPresignedPlayback, createPresignedUpload, mediaConfigured } from "../media/storage.js";
import { createVerificationRequest, getVerificationStatus, VERIFICATION_TYPES } from "../verification/service.js";

export const verificationRouter = Router();

const verificationReadLimit = rateLimit({ windowMs: 60 * 1000, max: 60, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

const verificationWriteLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  key: req => req.userId?.toHexString() ?? req.ip ?? "unknown"
});

verificationRouter.get("/me", requireUser, verificationReadLimit, async (req, res) => {
  try {
    return res.json(await getVerificationStatus(await getDb(), req.userId!.toHexString()));
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load verification status" });
  }
});

verificationRouter.post("/document-upload-url", requireUser, verificationWriteLimit, async (req, res) => {
  try {
    if (!mediaConfigured()) throw new Error("Media storage is not configured");
    const mimeType = String(req.body?.mimeType ?? "").trim().toLowerCase();
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      return res.status(400).json({ error: "Verification document must be PDF, JPEG, PNG or WebP" });
    }
    const objectKey = "verification-documents/" + req.userId!.toHexString() + "/" + new ObjectId().toHexString();
    const signed = await createPresignedUpload({ objectKey, mimeType, expiresInSeconds: 900 });
    return res.json({ objectKey, uploadUrl: signed.url, expiresInSeconds: signed.expiresInSeconds });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to prepare verification document upload" });
  }
});

verificationRouter.post("/requests", requireUser, verificationWriteLimit, async (req, res) => {
  try {
    const type = String(req.body?.type ?? "").trim().toUpperCase();
    if (!(VERIFICATION_TYPES as readonly string[]).includes(type)) return res.status(400).json({ error: "Invalid verification type" });
    const result = await createVerificationRequest(await getDb(), req.userId!.toHexString(), {
      type: type as typeof VERIFICATION_TYPES[number],
      legalName: String(req.body?.legalName ?? ""),
      displayName: String(req.body?.displayName ?? ""),
      website: req.body?.website,
      identityDocumentKey: String(req.body?.identityDocumentKey ?? ""),
      supportingLinks: Array.isArray(req.body?.supportingLinks) ? req.body.supportingLinks : [],
      reason: req.body?.reason
    });
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Verification request failed" });
  }
});

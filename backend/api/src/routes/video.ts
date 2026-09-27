import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { completeUpload, createUploadSession, createVideoDraft, publishVideo } from "../video/service.js";

export const videoRouter = Router();

videoRouter.post("/uploads", requireUser, async (req, res) => {
  try {
    const result = await createUploadSession(await getDb(), req.userId!, {
      mimeType: String(req.body?.mimeType ?? ""),
      sizeBytes: Number(req.body?.sizeBytes),
      durationMs: req.body?.durationMs == null ? undefined : Number(req.body.durationMs)
    });
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create upload" });
  }
});

videoRouter.post("/uploads/:uploadId/complete", requireUser, async (req, res) => {
  try {
    res.json(await completeUpload(await getDb(), req.userId!, req.params.uploadId));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to complete upload" });
  }
});

videoRouter.post("/drafts", requireUser, async (req, res) => {
  try {
    res.status(201).json(await createVideoDraft(await getDb(), req.userId!, {
      uploadId: String(req.body?.uploadId ?? ""),
      caption: req.body?.caption,
      hashtags: req.body?.hashtags,
      visibility: req.body?.visibility,
      allowComments: req.body?.allowComments,
      allowDuet: req.body?.allowDuet,
      allowStitch: req.body?.allowStitch
    }));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create video draft" });
  }
});

videoRouter.post("/:videoId/publish", requireUser, async (req, res) => {
  try {
    const videoId = new ObjectId(req.params.videoId);
    res.json(await publishVideo(await getDb(), req.userId!, videoId));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to publish video" });
  }
});

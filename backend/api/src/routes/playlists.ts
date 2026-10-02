import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { addVideoToPlaylist, createPlaylist, getPlaylist, listMyPlaylists, removeVideoFromPlaylist } from "../social/playlists.js";

export const playlistsRouter = Router();

playlistsRouter.get("/mine", requireUser, async (req, res) => {
  try { res.json({ playlists: await listMyPlaylists(await getDb(), req.userId!) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load playlists" }); }
});

playlistsRouter.post("/", requireUser, async (req, res) => {
  try { res.status(201).json({ playlist: await createPlaylist(await getDb(), req.userId!, req.body ?? {}) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create playlist" }); }
});

playlistsRouter.get("/:playlistId", async (req, res) => {
  try {
    if (!ObjectId.isValid(String(req.params.playlistId))) return res.status(400).json({ error: "Invalid playlist id" });
    res.json({ playlist: await getPlaylist(await getDb(), new ObjectId(String(req.params.playlistId))) });
  } catch (e) { res.status(404).json({ error: e instanceof Error ? e.message : "Playlist not found" }); }
});

playlistsRouter.post("/:playlistId/videos", requireUser, async (req, res) => {
  try { res.json({ playlist: await addVideoToPlaylist(await getDb(), req.userId!, String(req.params.playlistId), String(req.body?.videoId ?? "")) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to add video" }); }
});

playlistsRouter.delete("/:playlistId/videos/:videoId", requireUser, async (req, res) => {
  try { res.json({ playlist: await removeVideoFromPlaylist(await getDb(), req.userId!, String(req.params.playlistId), String(req.params.videoId)) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to remove video" }); }
});

import { Router } from "express";
import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { addLiveComment, addLiveModerator, createLiveStream, createLiveIngestSession, getLiveGiftLeaderboard, getLivePlaybackUrl, getLiveReactionSummary, inviteLiveGuest, listLiveGuests, removeLiveGuest as leaveLiveGuest, leaveLiveViewer, respondLiveGuestInvite, revokeLiveIngestSession, refreshLiveViewer, removeLiveReaction, removeLiveBlock, removeLiveModerator, reportLiveUser, setLiveBlock, setLiveMute, setLiveStatus, setLiveReaction } from "../live/service.js";
import { sendGift } from "../money/gifts.js";
import { broadcastToUser } from "../realtime/ws.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";
import { createNotification } from "../social/notifications.js";
import { AccessToken } from "livekit-server-sdk";
import { createPresignedUpload, mediaConfigured } from "../media/storage.js";

export const liveRouter = Router();
const liveActionLimit = rateLimit({ windowMs: 60 * 1000, max: 20, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const LIVE_STUDIO_BACKGROUNDS = new Set([
  "NONE","BLUR","STUDIO","SUNSET","CITY","GOLD","KENTE","NIGHT","NEON","BEACH","FOREST","MOUNTAINS",
  "SPACE","GALAXY","AURORA","CLOUDS","CHERRY","SAKURA","TROPICAL","OCEAN","DESERT","LUXURY","CONCERT",
  "SPORTS","NEWS","OFFICE","CLASSROOM","CAFE","STAGE","FIRE","RAIN","HEARTS","PRIDE","GHANA","AFRICA","ROYAL","GOLD_COAST","ASHANTI","ADINKRA","BAOBAB","SAFARI","LAGOS","ACCRA","CAPE_COAST","KUMASI","DUBAI","PARIS","TOKYO","NEW_YORK","LONDON","RIO","SANTORINI","ICELAND","HALLOWEEN","CHRISTMAS","NEW_YEAR","BIRTHDAY","WEDDING","GRADUATION","ROMANCE","COMEDY","GAMING","PODCAST","MUSIC","BEAUTY_ROOM","TECH","CREATOR_LOFT","MINIMAL","DARK_LUXE","CUSTOM"
]);
const LIVE_STUDIO_EFFECTS = new Set([
  "NONE","BEAUTY","VIVID","WARM","COOL","MONO","CINEMATIC","VINTAGE","DREAM","FADE","SUNNY","DUSK",
  "POP","FILM","NOIR","GLOW","SHARP","SOFT","PORTRAIT","PARTY","FESTIVAL","GOLDEN","TEAL","ROSE","AMBER","ARCTIC","COFFEE","LATTE","MINT","LAVENDER","PEACH","CORAL","CRIMSON","SAPPHIRE","EMERALD","PLATINUM","CHROME","MATRIX","RETRO","POLAROID","ANIME","CANDY","TOY","SKETCH","ILLUSTRATION","HALFTONE","VHS","CYBERPUNK","SUNSET","MOONLIGHT","AFRICAN_SUN","KENTE_TONE","GOLD_DUST","ROYAL","DRAMA","THRILLER","FAIRY","MAGIC","PARTY_LIGHTS","NEON_POP","STUDIO_CLEAN"
]);
const LIVE_STUDIO_FILTER_MAX = 64;
const LIVE_STUDIO_STICKER_MAX = 32;
const LIVE_STUDIO_LAYOUTS = new Set(["SOLO", "DUO", "TRIO", "GRID", "PANEL", "PIP"]);
const LIVE_STICKER_ANIMATIONS = new Set(["NONE", "BOUNCE", "PULSE", "FLOAT"]);

async function requireLiveHost(streamId: string, userId: string) {
  const stream = await (await getDb()).collection("live_streams").findOne({ streamId }, { projection: { hostUserId: 1, status: 1 } });
  if (!stream) return { error: "LIVE stream not found", status: 404 as const };
  if (String(stream.hostUserId) !== userId) return { error: "Only the LIVE host can change studio settings", status: 403 as const };
  return { stream };
}




liveRouter.get("/streams/:streamId/studio", requireUser, liveActionLimit, async (req, res) => {
  try {
    const streamId = String(req.params.streamId);
    const host = await requireLiveHost(streamId, req.userId!.toHexString());
    if ("error" in host) return res.status(Number(host.status ?? 403)).json({ error: host.error });
    const stream = await (await getDb()).collection("live_streams").findOne({ streamId }, { projection: { studio: 1 } });
    return res.json({ studio: stream?.studio ?? {
      background: "NONE", backgroundUrl: null, effect: "NONE", filter: "NONE", stickers: [], beauty: 0, layout: "SOLO",
      guestLimit: 15, commentsFilterEnabled: true, autoCaptions: true, giftAlerts: true,
      lowLatency: true, recordingEnabled: false, screenShareEnabled: false
    }});
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load LIVE Studio settings" }); }
});

liveRouter.patch("/streams/:streamId/studio", requireUser, liveActionLimit, async (req, res) => {
  try {
    const streamId = String(req.params.streamId);
    const host = await requireLiveHost(streamId, req.userId!.toHexString());
    if ("error" in host) return res.status(Number(host.status ?? 403)).json({ error: host.error });
    const body = req.body ?? {};
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.background !== undefined) {
      const value = String(body.background).toUpperCase();
      if (!LIVE_STUDIO_BACKGROUNDS.has(value)) return res.status(400).json({ error: "Unsupported LIVE background" });
      update.background = value;
    }
    if (body.backgroundUrl !== undefined) {
      const value = body.backgroundUrl == null ? null : String(body.backgroundUrl).slice(0, 1000);
      const ownPrefix = `live-backgrounds/${req.userId!.toHexString()}/`;
      if (value && !/^https:\/\//i.test(value) && !value.startsWith(ownPrefix)) return res.status(403).json({ error: "LIVE background is not owned by this account" });
      update.backgroundUrl = value;
    }
    if (body.effect !== undefined) {
      const value = String(body.effect).toUpperCase();
      if (!LIVE_STUDIO_EFFECTS.has(value)) return res.status(400).json({ error: "Unsupported LIVE effect" });
      update.effect = value;
    }
    if (body.filter !== undefined) {
      const value = String(body.filter).toUpperCase().trim();
      if (value.length > LIVE_STUDIO_FILTER_MAX || !LIVE_STUDIO_EFFECTS.has(value)) return res.status(400).json({ error: "Unsupported LIVE filter" });
      update.filter = value;
    }
    if (body.stickers !== undefined) {
      if (!Array.isArray(body.stickers) || body.stickers.length > LIVE_STUDIO_STICKER_MAX) return res.status(400).json({ error: "LIVE stickers must be an array of up to 32 items" });
      const stickers = body.stickers.slice(0, LIVE_STUDIO_STICKER_MAX).map((item: unknown, index: number) => {
        if (typeof item === "string") {
          const emoji = item.normalize("NFKC").trim().slice(0, 16);
          return emoji ? { id: emoji + "-" + index, emoji, x: 50, y: 30 + (index % 4) * 14, scale: 1, rotation: 0, animation: "NONE" } : null;
        }
        if (!item || typeof item !== "object") return null;
        const raw = item as Record<string, unknown>;
        const emoji = String(raw.emoji ?? "").normalize("NFKC").trim().slice(0, 16);
        const id = String(raw.id ?? emoji ?? "sticker-" + index).normalize("NFKC").trim().slice(0, 64);
        if (!emoji || !id) return null;
        const x = Number(raw.x ?? 50), y = Number(raw.y ?? 35), scale = Number(raw.scale ?? 1), rotation = Number(raw.rotation ?? 0);
        const animation = String(raw.animation ?? "NONE").toUpperCase();
        if (![x, y, scale, rotation].every(Number.isFinite) || x < 0 || x > 100 || y < 0 || y > 100 || scale < 0.5 || scale > 3 || rotation < -180 || rotation > 180 || !LIVE_STICKER_ANIMATIONS.has(animation)) return null;
        return { id, emoji, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, scale: Math.round(scale * 100) / 100, rotation: Math.round(rotation), animation };
      }).filter(Boolean);
      const unique = new Map<string, unknown>();
      for (const sticker of stickers) unique.set(String((sticker as { id: string }).id), sticker);
      update.stickers = Array.from(unique.values()).slice(0, LIVE_STUDIO_STICKER_MAX);
    }
    if (body.beauty !== undefined) {
      const value = Math.min(100, Math.max(0, Number(body.beauty)));
      if (!Number.isFinite(value)) return res.status(400).json({ error: "Beauty must be 0-100" });
      update.beauty = Math.round(value);
    }
    if (body.layout !== undefined) {
      const value = String(body.layout).toUpperCase();
      if (!LIVE_STUDIO_LAYOUTS.has(value)) return res.status(400).json({ error: "Unsupported LIVE layout" });
      update.layout = value;
    }
    if (body.guestLimit !== undefined) {
      const value = Math.min(15, Math.max(1, Math.floor(Number(body.guestLimit))));
      if (!Number.isFinite(value)) return res.status(400).json({ error: "Guest limit must be 1-15" });
      update.guestLimit = value;
    }
    for (const key of ["commentsFilterEnabled","autoCaptions","giftAlerts","lowLatency","recordingEnabled","screenShareEnabled"]) {
      if (body[key] !== undefined) update[key] = body[key] === true;
    }
    const db = await getDb();
    await db.collection("live_streams").updateOne({ streamId }, { $set: { studio: update, updatedAt: new Date() } });
    const stream = await db.collection("live_streams").findOne({ streamId }, { projection: { studio: 1 } });
    return res.json({ studio: stream?.studio });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to save LIVE Studio settings" }); }
});

liveRouter.post("/streams/:streamId/studio/background-upload-url", requireUser, liveActionLimit, async (req, res) => {
  try {
    const streamId = String(req.params.streamId);
    const host = await requireLiveHost(streamId, req.userId!.toHexString());
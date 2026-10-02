import { Router } from "express";
import { rateLimit as expressRateLimit } from "express-rate-limit";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { followUser } from "../social/follows.js";

export const discoveryRouter = Router();

const routeRateLimit = expressRateLimit({ windowMs: 60 * 1000, max: 90, standardHeaders: true, legacyHeaders: false });
discoveryRouter.use(routeRateLimit);

export async function ensureDiscoveryIndexes(db: Awaited<ReturnType<typeof getDb>>) {
  await Promise.all([
    db.collection("social_oauth_states").createIndex({ state: 1 }, { unique: true }),
    db.collection("social_oauth_states").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("social_connections").createIndex({ userId: 1, provider: 1 }, { unique: true }),
    db.collection("social_connections").createIndex({ provider: 1, providerUserId: 1 }, { unique: true, sparse: true }),
    db.collection("social_connections").createIndex({ userId: 1, updatedAt: -1 })
  ]);
}

async function publicProfile(db: Awaited<ReturnType<typeof getDb>>, user: any, reason?: string, mutualCount = 0) {
  return {
    id: user._id.toHexString(),
    username: user.username,
    nickname: user.nickname ?? user.username,
    countryCode: user.countryCode ?? null,
    profilePhotoUrl: user.profilePhotoKey ? (await (await import("../media/storage.js")).createPresignedPlayback(user.profilePhotoKey, 900)).url : null,
    isVerified: user.isVerified === true,
    isPrivate: user.isPrivate === true,
    reason: reason ?? null,
    mutualCount
  };
}

function socialEncryptionKey() {
  const raw = process.env.TWITOK_SOCIAL_ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error("TWITOK_SOCIAL_ENCRYPTION_KEY must be a 32-byte hex key");
  return Buffer.from(raw, "hex");
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", socialEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), ciphertext.toString("hex")].join(":");
}

function decryptToken(payload: string) {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid encrypted social token");
  const decipher = createDecipheriv("aes-256-gcm", socialEncryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

function facebookConfig() {
  const appId = process.env.FACEBOOK_APP_ID ?? "";
  const appSecret = process.env.FACEBOOK_APP_SECRET ?? "";
  const publicApi = (process.env.TWITOK_PUBLIC_API_URL ?? process.env.API_BASE_URL ?? "").replace(/\/$/, "");
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI ?? (publicApi ? `${publicApi}/api/v1/discover/facebook/callback` : "");
  if (!appId || !appSecret || !redirectUri) throw new Error("Facebook discovery is not configured");
  return { appId, appSecret, redirectUri };
}

async function facebookGraph(path: string, accessToken: string, appSecret: string) {
  const proof = createHmac("sha256", appSecret).update(accessToken).digest("hex");
  const url = new URL(`https://graph.facebook.com${path}`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("appsecret_proof", proof);
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error?.message ?? "Facebook request failed");
  return data;
}

function appRedirect(status: string) {
  return `twitok://find-friends?facebook=${encodeURIComponent(status)}`;
}

discoveryRouter.get("/suggestions", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 40);
    const me = await db.collection("users").findOne(
      { _id: req.userId!, status: "ACTIVE" },
      { projection: { countryCode: 1 } }
    );
    const following = await db.collection("follows").find({ followerId: req.userId! }, { projection: { followingId: 1 } }).limit(5000).toArray();
    const followingIds = following.map(x => x.followingId).filter(Boolean);
    const blocked = await db.collection("blocks").find(
      { $or: [{ blockerId: req.userId! }, { blockedId: req.userId! }] },
      { projection: { blockerId: 1, blockedId: 1 } }
    ).limit(5000).toArray();
    const blockedIds = blocked.flatMap(x => [x.blockerId, x.blockedId]).filter(id => id && !id.equals(req.userId!));
    const excluded = [req.userId!, ...followingIds, ...blockedIds];

    const candidates = await db.collection("users").find(
      { _id: { $nin: excluded }, status: "ACTIVE", profileSetupComplete: true },
      { projection: { username: 1, nickname: 1, countryCode: 1, profilePhotoKey: 1, isVerified: 1, isPrivate: 1 } }
    ).sort({ updatedAt: -1 }).limit(160).toArray();

    if (!candidates.length) return res.json({ suggestions: [] });

    const candidateIds = candidates.map(x => x._id);
    const mutualRows = followingIds.length
      ? await db.collection("follows").aggregate([
          { $match: { followerId: { $in: followingIds }, followingId: { $in: candidateIds } } },
          { $group: { _id: "$followingId", count: { $sum: 1 } } }
        ]).toArray()
      : [];
    const mutuals = new Map(mutualRows.map(x => [x._id.toHexString(), Number(x.count ?? 0)]));

    const suggestions = candidates.map(user => {
      const mutualCount = mutuals.get(user._id.toHexString()) ?? 0;
      const sameCountry = Boolean(me?.countryCode && user.countryCode && me.countryCode === user.countryCode);
      const score = mutualCount * 10 + (sameCountry ? 3 : 0);
      const reason = mutualCount > 0 ? `${mutualCount} mutual follower${mutualCount === 1 ? "" : "s"}` : sameCountry ? `People in ${user.countryCode}` : "Suggested for you";
      return { user, mutualCount, score, reason };
    }).sort((a, b) => b.score - a.score || Number(b.user.isVerified) - Number(a.user.isVerified)).slice(0, limit);

    res.json({ suggestions: await Promise.all(suggestions.map((x: { user: any; reason: string; mutualCount: number }) => publicProfile(db, x.user, x.reason, x.mutualCount))) });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load suggestions" });
  }
});

discoveryRouter.post("/contacts/match", requireUser, async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.hashes) ? req.body.hashes : [];
    const hashes = [...new Set(raw.filter((x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{64}$/i.test(x)).map(x => x.toLowerCase()))].slice(0, 2000);
    if (!hashes.length) return res.json({ matches: [] });

    const db = await getDb();
    await db.collection("users").updateOne({ _id: req.userId! }, { $set: { contactSyncEnabled: true, lastContactSyncAt: new Date() } });
    const followingIds = await db.collection("follows").distinct("followingId", { followerId: req.userId! });
    const blocked = await db.collection("blocks").find(
      { $or: [{ blockerId: req.userId! }, { blockedId: req.userId! }] },
      { projection: { blockerId: 1, blockedId: 1 } }
    ).limit(5000).toArray();
    const blockedIds = blocked.flatMap(x => [x.blockerId, x.blockedId]).filter(id => id && !id.equals(req.userId!));

    const users = await db.collection("users").find({
      _id: { $nin: [req.userId!, ...followingIds, ...blockedIds] },
      status: "ACTIVE",
      profileSetupComplete: true,
      $or: [{ phoneHash: { $in: hashes } }, { phoneSuffixHash: { $in: hashes } }]
    }, {
      projection: { username: 1, nickname: 1, countryCode: 1, profilePhotoKey: 1, isVerified: 1, isPrivate: 1 }
    }).limit(200).toArray();

    res.json({ matches: await Promise.all(users.map(user => publicProfile(db, user, "In your contacts"))) });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to match contacts" });
  }
});

discoveryRouter.get("/facebook/start", requireUser, async (req, res) => {
  try {
    const { appId, redirectUri } = facebookConfig();
    const db = await getDb();
    const state = randomBytes(32).toString("hex");
    await db.collection("social_oauth_states").insertOne({
      state,
      userId: req.userId!,
      provider: "facebook",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: new Date()
    });
    const url = new URL("https://www.facebook.com/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "user_friends");
    res.json({ authorizationUrl: url.toString() });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Facebook discovery is unavailable" });
  }
});

discoveryRouter.get("/facebook/callback", async (req, res) => {
  const fail = (reason: string) => res.redirect(appRedirect(`error:${reason.slice(0, 80)}`));
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !state) return fail("missing_parameters");
    const config = facebookConfig();
    const db = await getDb();
    const oauthState = await db.collection("social_oauth_states").findOneAndDelete({ state, provider: "facebook" });
    if (!oauthState?.userId || !oauthState.expiresAt || new Date(oauthState.expiresAt).getTime() < Date.now()) return fail("invalid_or_expired_state");

    const tokenUrl = new URL("https://graph.facebook.com/oauth/access_token");
    tokenUrl.searchParams.set("client_id", config.appId);
    tokenUrl.searchParams.set("client_secret", config.appSecret);
    tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
    tokenUrl.searchParams.set("code", code);
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) return fail("token_exchange_failed");

    const me = await facebookGraph("/me?fields=id,name", tokenData.access_token, config.appSecret);
    await db.collection("social_connections").updateOne(
      { userId: oauthState.userId, provider: "facebook" },
      { $set: {
        userId: oauthState.userId,
        provider: "facebook",
        providerUserId: String(me.id),
        displayName: typeof me.name === "string" ? me.name : null,
        accessToken: encryptToken(String(tokenData.access_token)),
        updatedAt: new Date()
      } },
      { upsert: true }
    );
    res.redirect(appRedirect("connected"));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "facebook_error");
  }
});

discoveryRouter.get("/facebook/matches", requireUser, async (req, res) => {
  try {
    const config = facebookConfig();
    const db = await getDb();
    const connection = await db.collection("social_connections").findOne({ userId: req.userId!, provider: "facebook" });
    if (!connection?.accessToken) return res.status(404).json({ error: "Connect Facebook first" });

    const friends = await facebookGraph("/me/friends?fields=id,name&limit=5000", decryptToken(connection.accessToken), config.appSecret);
    const providerIds = (friends?.data ?? []).map((friend: any) => String(friend.id)).filter(Boolean).slice(0, 5000);
    if (!providerIds.length) return res.json({ matches: [] });

    const matchedConnections = await db.collection("social_connections").find(
      { provider: "facebook", providerUserId: { $in: providerIds }, userId: { $ne: req.userId! } },
      { projection: { userId: 1 } }
    ).limit(200).toArray();
    const ids = matchedConnections.map(x => x.userId).filter(Boolean);
    const users = await db.collection("users").find(
      { _id: { $in: ids }, status: "ACTIVE", profileSetupComplete: true },
      { projection: { username: 1, nickname: 1, countryCode: 1, profilePhotoKey: 1, isVerified: 1, isPrivate: 1 } }
    ).toArray();
    res.json({ matches: await Promise.all(users.map(user => publicProfile(db, user, "From Facebook"))) });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load Facebook matches" });
  }
});

discoveryRouter.delete("/facebook", requireUser, async (req, res) => {
  try {
    await (await getDb()).collection("social_connections").deleteOne({ userId: req.userId!, provider: "facebook" });
    res.json({ connected: false });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to disconnect Facebook" });
  }
});

discoveryRouter.delete("/contacts", requireUser, async (req, res) => {
  try {
    await (await getDb()).collection("users").updateOne(
      { _id: req.userId! },
      { $set: { contactSyncEnabled: false }, $unset: { lastContactSyncAt: "" } }
    );
    res.json({ contactSyncEnabled: false });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to disable contact discovery" });
  }
});

discoveryRouter.get("/status", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const [user, facebook] = await Promise.all([
      db.collection("users").findOne({ _id: req.userId! }, { projection: { contactSyncEnabled: 1, lastContactSyncAt: 1 } }),
      db.collection("social_connections").findOne({ userId: req.userId!, provider: "facebook" }, { projection: { _id: 1, updatedAt: 1 } })
    ]);
    res.json({
      contactSyncEnabled: user?.contactSyncEnabled === true,
      lastContactSyncAt: user?.lastContactSyncAt ?? null,
      facebookConnected: Boolean(facebook)
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load discovery status" });
  }
});

discoveryRouter.post("/follow", requireUser, async (req, res) => {
  try {
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9._]{3,24}$/.test(username)) return res.status(400).json({ error: "Invalid username" });
    const target = await (await getDb()).collection("users").findOne({ username, status: "ACTIVE" }, { projection: { _id: 1 } });
    if (!target) return res.status(404).json({ error: "User not found" });
    res.json(await followUser(await getDb(), req.userId!, target._id));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to follow user" });
  }
});

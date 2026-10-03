import type { Db } from "mongodb";

export type LiveGuestStatus = "INVITED" | "ACCEPTED" | "DECLINED" | "REMOVED";

export async function initializeLiveIndexes(db: Db) {
  await Promise.all([
    db.collection("live_streams").createIndex({ streamId: 1 }, { unique: true }),
    db.collection("live_streams").createIndex({ hostUserId: 1, createdAt: -1 }),
    db.collection("live_streams").createIndex({ status: 1, startedAt: -1 }),
    db.collection("live_events").createIndex({ streamId: 1, createdAt: -1 }),
    db.collection("live_moderators").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_guests").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_guests").createIndex({ userId: 1, status: 1, updatedAt: -1 })
  ]);
}

export async function createLiveStream(
  db: Db,
  input: { streamId:string; hostUserId:string; title:string; category?:string; coverUrl?:string }
) {
  const now = new Date();
  const stream = {
    ...input,
    status: "SCHEDULED",
    viewerCount: 0,
    guestLimit: 15,
    giftsUsd: 0,
    createdAt: now,
    updatedAt: now
  };
  await db.collection("live_streams").insertOne(stream);
  return stream;
}

export async function setLiveStatus(db: Db, streamId: string, status: "LIVE"|"ENDED"|"SUSPENDED") {
  const now = new Date();
  const update: Record<string, unknown> = { status, updatedAt: now };
  if (status === "LIVE") update.startedAt = now;
  if (status === "ENDED") update.endedAt = now;
  await db.collection("live_streams").updateOne({ streamId }, { $set: update });
  return db.collection("live_streams").findOne({ streamId });
}

export async function inviteLiveGuest(
  db: Db,
  input: { streamId: string; hostUserId: string; guestUserId: string }
) {
  const stream = await db.collection("live_streams").findOne({ streamId: input.streamId });
  if (!stream) throw new Error("LIVE stream not found");
  if (String(stream.hostUserId) !== input.hostUserId) throw new Error("Only the host can invite guests");
  if (stream.status === "ENDED") throw new Error("LIVE stream has ended");
  if (input.guestUserId === input.hostUserId) throw new Error("Host cannot invite themselves");

  const active = await db.collection("live_guests").countDocuments({
    streamId: input.streamId,
    status: { $in: ["INVITED", "ACCEPTED"] }
  });
  if (active >= Number(stream.guestLimit ?? 15)) throw new Error("LIVE guest limit reached");

  const now = new Date();
  await db.collection("live_guests").updateOne(
    { streamId: input.streamId, userId: input.guestUserId },
    { $set: { hostUserId: input.hostUserId, status: "INVITED", updatedAt: now }, $setOnInsert: { streamId: input.streamId, userId: input.guestUserId, createdAt: now } },
    { upsert: true }
  );
  return db.collection("live_guests").findOne({ streamId: input.streamId, userId: input.guestUserId });
}

export async function respondToLiveGuestInvite(
  db: Db,
  input: { streamId: string; userId: string; accept: boolean }
) {
  const guest = await db.collection("live_guests").findOne({ streamId: input.streamId, userId: input.userId });
  if (!guest) throw new Error("LIVE guest invitation not found");
  if (guest.status !== "INVITED") throw new Error("LIVE guest invitation is no longer pending");
  const status: LiveGuestStatus = input.accept ? "ACCEPTED" : "DECLINED";
  await db.collection("live_guests").updateOne(
    { streamId: input.streamId, userId: input.userId },
    { $set: { status, updatedAt: new Date() } }
  );
  return db.collection("live_guests").findOne({ streamId: input.streamId, userId: input.userId });
}

export async function removeLiveGuest(db: Db, input: { streamId: string; hostUserId: string; guestUserId: string }) {
  const stream = await db.collection("live_streams").findOne({ streamId: input.streamId }, { projection: { hostUserId: 1 } });
  if (!stream) throw new Error("LIVE stream not found");
  if (String(stream.hostUserId) !== input.hostUserId) throw new Error("Only the host can remove guests");
  await db.collection("live_guests").updateOne(
    { streamId: input.streamId, userId: input.guestUserId },
    { $set: { status: "REMOVED", updatedAt: new Date() } }
  );
  return db.collection("live_guests").findOne({ streamId: input.streamId, userId: input.guestUserId });
}
